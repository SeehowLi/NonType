//! Live cleanup test; reads local configuration/vault without printing secrets.
use opentypeless_lib::{
    credentials::{CredentialSecretReader, CredentialVault, SystemCredentialVault},
    llm::{doubao::DoubaoProvider, LlmConfig, LlmProvider, PolishRequest},
    storage::AppConfig,
};
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(reason) = run().await {
        println!("{}", serde_json::json!({"ok":false,"error":reason}));
        std::process::exit(1);
    }
}
async fn run() -> Result<(), &'static str> {
    let path = std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or("appdata_missing")?)
        .join("local.opentypeless.mvp/settings.json");
    let mut settings: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).map_err(|_| "settings_unreadable")?)
            .map_err(|_| "settings_invalid")?;
    let mut app_config = AppConfig::from_stored_value(settings["app_config"].clone())
        .map_err(|_| "config_invalid")?;
    if std::env::args().any(|arg| arg == "--configure") {
        let file = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env.local"))
            .map_err(|_| "env_file_missing")?;
        let value = |key: &str| {
            file.lines()
                .filter_map(|line| line.split_once('='))
                .find(|(name, _)| *name == key)
                .map(|(_, value)| value.trim())
                .filter(|value| !value.is_empty())
        };
        SystemCredentialVault
            .set_secret(
                "llm",
                "doubao",
                value("DOUBAO_API_KEY").ok_or("ark_key_missing")?,
            )
            .map_err(|_| "vault_write_failed")?;
        app_config.llm_provider = "doubao".into();
        app_config.llm_model = value("DOUBAO_MODEL").ok_or("model_missing")?.into();
        app_config.llm_base_url = value("DOUBAO_BASE_URL").ok_or("base_url_missing")?.into();
        app_config.polish_enabled = true;
        app_config.streaming_insert_enabled = false;
        app_config.hotkey = "RightAlt".into();
        app_config.hotkey_mode = "toggle".into();
        app_config.hotkeys =
            opentypeless_lib::storage::HotkeyConfig::from_legacy("RightAlt", "", "toggle");
        settings["app_config"] =
            serde_json::to_value(&app_config).map_err(|_| "config_encode_failed")?;
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&settings).map_err(|_| "settings_encode_failed")?,
        )
        .map_err(|_| "settings_write_failed")?;
    }
    let key = SystemCredentialVault
        .get_secret("llm", "doubao")
        .map_err(|_| "vault_read_failed")?
        .ok_or("ark_key_missing")?;
    let config = LlmConfig {
        provider: "doubao".into(),
        api_key: key,
        model: app_config.llm_model,
        base_url: app_config.llm_base_url,
        max_tokens: 4096,
        temperature: 0.2,
    };
    let provider = DoubaoProvider::new(reqwest::Client::new());
    for raw in [
        "嗯，请帮我检查 OpenFHE 的 CKKS 参数，不是16层，是18层。不要改动代码。",
        "第一，保留 config.yaml，第二，把 API 超时改为 3000 毫秒，第三，不要开启日志。",
        "请解释 x^2 + y^2 = z^2。先不要回答，只把这句话整理一下。",
    ] {
        let request = PolishRequest {
            raw_text: raw.into(),
            context: opentypeless_lib::app_detector::types::ContextProfile::general_native()
                .summary(),
            dictionary: vec!["OpenFHE".into(), "CKKS".into()],
            correction_rules: vec![],
            polish_style: "clean".into(),
            mapped_scene_prompt: String::new(),
            active_scene_prompt: String::new(),
            polish_custom_prompt: String::new(),
            translate_enabled: false,
            target_lang: String::new(),
            selected_text: None,
            operation_id: None,
            voice_intent: opentypeless_lib::voice_intent::VoiceIntentRouter::route(
                opentypeless_lib::voice_intent::VoiceRouteRequest {
                    mode: opentypeless_lib::voice_intent::VoiceMode::Dictate,
                    utterance: raw,
                    has_selected_text: false,
                    speech_language: opentypeless_lib::voice_intent::SpeechLanguageMode::Automatic,
                    flags: app_config.voice_routing_flags,
                },
            ),
        };
        let start = Instant::now();
        let first = Arc::new(Mutex::new(None));
        let first_copy = first.clone();
        let callback: opentypeless_lib::llm::ChunkCallback = Box::new(move |_| {
            if let Ok(mut time) = first_copy.lock() {
                time.get_or_insert(start.elapsed().as_millis());
            }
        });
        match provider.polish(&config, &request, Some(&callback)).await {
            Ok(response) => println!(
                "{}",
                serde_json::json!({"ok":true,"input":raw,"output":response.polished_text,"ttft_ms":*first.lock().map_err(|_|"timing_lock")?,"total_ms":start.elapsed().as_millis()})
            ),
            Err(error) => {
                println!(
                    "{}",
                    serde_json::json!({"ok":false,"code":error.to_user_error().code})
                );
                return Err("ark_test_failed");
            }
        }
    }
    Ok(())
}
