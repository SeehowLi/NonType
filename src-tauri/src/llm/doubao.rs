use async_trait::async_trait;
use futures_util::StreamExt;
use std::time::{Duration, Instant};

use super::{ChunkCallback, LlmConfig, LlmProvider, PolishRequest, PolishResponse};
use crate::error::AppError;

pub const MODEL: &str = "doubao-seed-2-1-turbo-260628";
pub const BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/v3";
const SYSTEM_PROMPT: &str = include_str!("../../../prompts/ai_input.txt");
const DEFAULT_PERSONAL_PROMPT: &str = include_str!("../../../prompts/personalization.txt");
const DEADLINE: Duration = Duration::from_secs(12);

pub struct DoubaoProvider {
    client: reqwest::Client,
    deadline: Duration,
}

impl DoubaoProvider {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            deadline: DEADLINE,
        }
    }

    async fn request(
        &self,
        config: &LlmConfig,
        req: &PolishRequest,
        callback: Option<&ChunkCallback>,
    ) -> Result<PolishResponse, AppError> {
        let endpoint =
            super::protocol::chat_endpoint("doubao", &config.base_url).map_err(AppError::Config)?;
        let url = reqwest::Url::parse(&endpoint)
            .map_err(|_| AppError::Config("Invalid Ark URL".into()))?;
        if url.scheme() != "https" && !(cfg!(test) && url.host_str() == Some("127.0.0.1")) {
            return Err(AppError::Config("Ark requires HTTPS".into()));
        }
        let mut authorization =
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", config.api_key.trim()))
                .map_err(|_| AppError::Config("Invalid Ark credential format".into()))?;
        authorization.set_sensitive(true);
        let started = Instant::now();
        let response = self
            .client
            .post(url)
            .header(reqwest::header::AUTHORIZATION, authorization)
            .json(&request_body(config, req))
            .send()
            .await
            .map_err(|_| AppError::Network("Ark request failed".into()))?;
        if !response.status().is_success() {
            return Err(AppError::Api {
                status: response.status().as_u16(),
                body: "Ark rejected the cleanup request".into(),
            });
        }
        let mut stream = response.bytes_stream();
        let mut decoder = Decoder::default();
        let mut first_token = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| AppError::Network("Ark stream interrupted".into()))?;
            for text in decoder.push(&chunk)? {
                if !first_token {
                    tracing::info!(
                        ttft_ms = started.elapsed().as_millis() as u64,
                        "Doubao first content token"
                    );
                    first_token = true;
                }
                if let Some(callback) = callback {
                    callback(&text);
                }
            }
            if decoder.done {
                break;
            }
        }
        let polished_text = decoder.finish()?;
        tracing::info!(
            total_ms = started.elapsed().as_millis() as u64,
            "Doubao cleanup complete"
        );
        Ok(PolishResponse { polished_text })
    }
}

fn request_body(config: &LlmConfig, req: &PolishRequest) -> serde_json::Value {
    let custom = req.polish_custom_prompt.trim();
    let preferences = if custom.is_empty() {
        DEFAULT_PERSONAL_PROMPT
    } else {
        custom
    };
    let system = format!("{SYSTEM_PROMPT}\n\nUser-selected cleanup preferences (preserve meaning and return only cleaned text):\n{preferences}");
    let normalized = req.raw_text.to_lowercase();
    let glossary: Vec<_> = req
        .dictionary
        .iter()
        .filter(|word| !word.trim().is_empty() && normalized.contains(&word.to_lowercase()))
        .take(30)
        .map(|word| word.chars().take(120).collect::<String>())
        .collect();
    serde_json::json!({
        "model":config.model, "thinking":{"type":"disabled"}, "stream":true,
        "max_tokens":config.max_tokens, "temperature":0.2,
        "messages":[{"role":"system","content":system},
            {"role":"user","content":serde_json::json!({"transcription":req.raw_text,"relevant_terminology":glossary}).to_string()}]
    })
}

#[derive(Default)]
struct Decoder {
    pending: Vec<u8>,
    text: String,
    done: bool,
}

impl Decoder {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>, AppError> {
        self.pending.extend_from_slice(bytes);
        if self.pending.len() > 1_048_576 {
            return Err(AppError::Config("Ark SSE frame too large".into()));
        }
        let mut chunks = Vec::new();
        while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
            let line: Vec<_> = self.pending.drain(..=end).collect();
            let line = std::str::from_utf8(&line)
                .map_err(|_| AppError::Config("Invalid Ark UTF-8".into()))?
                .trim();
            let Some(data) = line.strip_prefix("data:").map(str::trim) else {
                continue;
            };
            if data == "[DONE]" {
                self.done = true;
                break;
            }
            let value: serde_json::Value = serde_json::from_str(data)
                .map_err(|_| AppError::Config("Invalid Ark SSE JSON".into()))?;
            if value.get("error").is_some() {
                return Err(AppError::Config("Ark stream error".into()));
            }
            if let Some(reason) = value["choices"][0]["finish_reason"].as_str() {
                if reason != "stop" {
                    return Err(AppError::Config(
                        "Ark output did not complete normally".into(),
                    ));
                }
                self.done = true;
            }
            if let Some(text) = value["choices"][0]["delta"]["content"]
                .as_str()
                .filter(|s| !s.is_empty())
            {
                self.text.push_str(text);
                if self.text.len() > 1_048_576 {
                    return Err(AppError::Config("Ark output too large".into()));
                }
                chunks.push(text.to_string());
            }
        }
        Ok(chunks)
    }

    fn finish(self) -> Result<String, AppError> {
        if !self.done || self.text.trim().is_empty() {
            return Err(AppError::Config(
                "Ark returned empty or incomplete output".into(),
            ));
        }
        Ok(self.text.trim().to_string())
    }
}

#[async_trait]
impl LlmProvider for DoubaoProvider {
    async fn polish(
        &self,
        config: &LlmConfig,
        req: &PolishRequest,
        callback: Option<&ChunkCallback>,
    ) -> Result<PolishResponse, AppError> {
        tokio::time::timeout(self.deadline, self.request(config, req, callback))
            .await
            .map_err(|_| AppError::Timeout(self.deadline))?
    }
    fn name(&self) -> &str {
        "Doubao Ark cleanup"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PolishRequest {
        let raw = "Please preserve config.yaml and 3000 milliseconds.";
        PolishRequest {
            raw_text: raw.into(),
            context: crate::app_detector::types::ContextProfile::general_native().summary(),
            dictionary: vec![],
            correction_rules: vec![],
            polish_style: "clean".into(),
            mapped_scene_prompt: String::new(),
            active_scene_prompt: String::new(),
            polish_custom_prompt: String::new(),
            translate_enabled: false,
            target_lang: String::new(),
            selected_text: None,
            operation_id: None,
            voice_intent: crate::voice_intent::VoiceIntentRouter::route(
                crate::voice_intent::VoiceRouteRequest {
                    mode: crate::voice_intent::VoiceMode::Dictate,
                    utterance: raw,
                    has_selected_text: false,
                    speech_language: crate::voice_intent::SpeechLanguageMode::Automatic,
                    flags: Default::default(),
                },
            ),
        }
    }

    fn server(status: u16, body: String, delay: Duration) -> (String, std::thread::JoinHandle<()>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut bytes = [0u8; 8192];
            let _ = stream.read(&mut bytes);
            std::thread::sleep(delay);
            let response=format!("HTTP/1.1 {status} Test\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
            let _ = stream.write_all(response.as_bytes());
        });
        (url, handle)
    }

    #[test]
    fn prompt_requests_cleanup_without_thinking_or_tools() {
        let config = LlmConfig {
            model: MODEL.into(),
            ..Default::default()
        };
        let body = request_body(&config, &fixture());
        assert_eq!(body["thinking"]["type"], "disabled");
        assert_eq!(body["stream"], true);
        assert!(body["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("Do not answer"));
        assert!(body.get("tools").is_none());
    }

    #[tokio::test]
    async fn mock_http_success_error_and_incomplete_stream() {
        for (status,body,success) in [
            (200,"data: {\"choices\":[{\"delta\":{\"content\":\"config.yaml 3000\"}}]}\ndata: [DONE]\n",true),
            (500,"error",false),
            (200,"data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n",false),
        ] {
            let (url,worker)=server(status,body.into(),Duration::ZERO);
            let provider=DoubaoProvider::new(reqwest::Client::builder().no_proxy().build().unwrap());
            let config=LlmConfig {provider:"doubao".into(),api_key:"test-only".into(),base_url:url,..Default::default()};
            let result=provider.polish(&config,&fixture(),None).await;
            assert_eq!(result.is_ok(),success);
            if success { assert_eq!(result.unwrap().polished_text,"config.yaml 3000"); }
            worker.join().unwrap();
        }
    }

    #[test]
    fn personalization_is_prepended_as_system_preferences_and_empty_uses_default() {
        let mut request = fixture();
        let baseline = request_body(&LlmConfig::default(), &request);
        assert!(baseline["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("请将我的语音转写"));
        request.polish_custom_prompt = "用简洁的项目符号分段，保留英文术语。".into();
        let body = request_body(&LlmConfig::default(), &request);
        let system = body["messages"][0]["content"].as_str().unwrap();
        assert!(system.contains(&request.polish_custom_prompt));
        assert!(system.contains("Do not answer"));
        assert!(!system.contains(&request.raw_text));
    }

    #[tokio::test]
    async fn total_deadline_cancels_a_slow_http_request() {
        let (url, worker) = server(200, "data: [DONE]\n".into(), Duration::from_millis(150));
        let mut provider =
            DoubaoProvider::new(reqwest::Client::builder().no_proxy().build().unwrap());
        provider.deadline = Duration::from_millis(50);
        let config = LlmConfig {
            provider: "doubao".into(),
            api_key: "test-only".into(),
            base_url: url,
            ..Default::default()
        };
        assert!(matches!(
            provider.polish(&config, &fixture(), None).await,
            Err(AppError::Timeout(_))
        ));
        worker.join().unwrap();
    }
    #[test]
    fn decodes_chinese_split_at_every_byte() {
        let input =
            "data: {\"choices\":[{\"delta\":{\"content\":\"你好 OpenFHE\"}}]}\n\ndata: [DONE]\n\n";
        let mut decoder = Decoder::default();
        for byte in input.as_bytes() {
            decoder.push(&[*byte]).unwrap();
        }
        assert_eq!(decoder.finish().unwrap(), "你好 OpenFHE");
    }
    #[test]
    fn rejects_partial_and_reasoning_only_output() {
        let mut partial = Decoder::default();
        partial
            .push(b"data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n")
            .unwrap();
        assert!(partial.finish().is_err());
        let mut reasoning = Decoder::default();
        reasoning.push(b"data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"secret reasoning\"}}]}\ndata: [DONE]\n").unwrap();
        assert!(reasoning.finish().is_err());
    }
    #[test]
    fn rejects_token_limit_truncation() {
        assert!(Decoder::default()
            .push(b"data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n")
            .is_err());
    }
}
