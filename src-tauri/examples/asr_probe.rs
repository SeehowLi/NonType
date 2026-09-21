//! Explicit live diagnostic. Uses the project's vault; never prints credentials.
//! `--resource ID` probes that resource without changing saved settings.
//! `--pcm-stdin` streams synthetic PCM16LE/16kHz/mono from stdin, max 60 seconds.
use opentypeless_lib::credentials::{
    CredentialSecretReader, CredentialVault, SystemCredentialVault,
};
use opentypeless_lib::stt::{
    volcengine::VolcengineDoubaoProvider, SttConfig, SttProvider, TranscriptEvent,
};
use std::io::Read;
use std::time::{Duration, Instant};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(category) = run().await {
        println!("{}", serde_json::json!({"ok":false,"error":category}));
        std::process::exit(1);
    }
}

async fn run() -> Result<(), &'static str> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|s| s == "--capture-check") {
        let start = Instant::now();
        let (mut capture, mut frames) =
            opentypeless_lib::audio::AudioCaptureHandle::start(Default::default())
                .map_err(|_| "capture_start_failed")?;
        let ready = tokio::time::timeout(Duration::from_secs(5), capture.wait_until_ready())
            .await
            .map_err(|_| "capture_start_timeout")?
            .map_err(|_| "capture_device_failed")?;
        let mut byte_count = 0;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(1);
        while let Ok(Some(frame)) = tokio::time::timeout_at(deadline, frames.recv()).await {
            byte_count += frame.len();
        }
        capture.stop();
        println!(
            "{}",
            serde_json::json!({"ok":byte_count>0,"probe":"microphone_capture_only",
            "ready_ms":ready.monotonic.saturating_duration_since(start).as_millis(),
            "pcm_bytes":byte_count,"pcm_ms":byte_count/32,"audio_uploaded":false,"audio_saved":false})
        );
        return if byte_count > 0 {
            Ok(())
        } else {
            Err("no_audio_frames")
        };
    }
    let appdata = std::env::var_os("APPDATA").ok_or("missing_appdata")?;
    let saved: serde_json::Value = serde_json::from_slice(
        &std::fs::read(
            std::path::PathBuf::from(appdata).join("local.opentypeless.mvp/settings.json"),
        )
        .map_err(|_| "settings_unreadable")?,
    )
    .map_err(|_| "settings_invalid")?;
    let resource = args
        .windows(2)
        .find(|pair| pair[0] == "--resource")
        .map(|pair| pair[1].as_str())
        .or_else(|| saved["app_config"]["stt_volcengine_resource_id"].as_str())
        .ok_or("resource_missing")?;
    opentypeless_lib::stt::volcengine::validate_resource_id(resource)
        .map_err(|_| "invalid_resource_id")?;
    let secret = if args.iter().any(|arg| arg == "--env-key") {
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env.local"))
            .map_err(|_| "env_unreadable")?
            .lines()
            .find_map(|line| line.strip_prefix("VOLCENGINE_STREAMING_API_KEY="))
            .filter(|key| !key.trim().is_empty())
            .ok_or("env_key_missing")?
            .trim()
            .to_string()
    } else {
        SystemCredentialVault
            .get_secret("stt", "volcengine-doubao")
            .map_err(|_| "vault_unavailable")?
            .filter(|s| !s.is_empty())
            .ok_or("credential_missing")?
    };
    let config = SttConfig {
        api_key: secret,
        resource_id: Some(resource.to_string()),
        ..Default::default()
    };
    let mut pcm = Vec::new();
    if args.iter().any(|s| s == "--pcm-stdin") {
        std::io::stdin()
            .take(1_920_001)
            .read_to_end(&mut pcm)
            .map_err(|_| "pcm_unreadable")?;
        if pcm.is_empty() || pcm.len() > 1_920_000 || pcm.len() % 2 != 0 {
            return Err("invalid_pcm_length");
        }
    }
    let mut provider = VolcengineDoubaoProvider::new();
    if args.iter().any(|arg| arg == "--test-hotwords") {
        provider.set_hotwords(vec!["OpenFHE".into(), "CKKS".into(), "语音输入".into()]);
    }
    let started = Instant::now();
    match tokio::time::timeout(Duration::from_secs(12), provider.connect(&config)).await {
        Ok(Ok(())) => {}
        result => {
            let code = match result {
                Ok(Err(e)) => e.to_user_error().code,
                _ => "probe_timeout".to_string(),
            };
            println!(
                "{}",
                serde_json::json!({"resource":resource,"ok":false,"stage":"connect","error_code":code,"elapsed_ms":started.elapsed().as_millis()})
            );
            return Err("connect_failed");
        }
    }
    let connected_ms = started.elapsed().as_millis();
    let mut partial_count = 0;
    let mut first_partial_ms = None;
    let mut offset = 0;
    let mut ticker = tokio::time::interval(Duration::from_millis(20));
    while offset < pcm.len() {
        tokio::select! {
            _ = ticker.tick() => {
                let end = (offset + 640).min(pcm.len());
                tokio::time::timeout(Duration::from_secs(5), provider.send_audio(&pcm[offset..end])).await
                    .map_err(|_| "send_timeout")?.map_err(|_| "send_failed")?;
                offset = end;
            }
            event = provider.recv_transcript() => {
                match event.map_err(|_| "receive_failed")? {
                    Some(TranscriptEvent::Partial {..}) => { partial_count += 1; first_partial_ms.get_or_insert(started.elapsed().as_millis()); }
                    Some(TranscriptEvent::Error {..}) => return Err("asr_error"),
                    _ => {}
                }
            }
        }
    }
    let released = Instant::now();
    let final_text = tokio::time::timeout(Duration::from_secs(10), provider.disconnect())
        .await
        .map_err(|_| "finalize_timeout")?
        .map_err(|_| "finalize_failed")?;
    if args.iter().any(|arg| arg == "--save-config") {
        if final_text
            .as_deref()
            .is_none_or(|text| text.trim().is_empty())
        {
            return Err("refuse_save_without_transcript");
        }
        let path = std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or("missing_appdata")?)
            .join("local.opentypeless.mvp/settings.json");
        let mut current: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).map_err(|_| "settings_unreadable")?)
                .map_err(|_| "settings_invalid")?;
        SystemCredentialVault
            .set_secret("stt", "volcengine-doubao", &config.api_key)
            .map_err(|_| "vault_write_failed")?;
        current["app_config"]["stt_volcengine_resource_id"] = resource.into();
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&current).map_err(|_| "settings_invalid")?,
        )
        .map_err(|_| "settings_write_failed")?;
    }
    println!(
        "{}",
        serde_json::json!({"ok":true,"resource":resource,"audio_ms":pcm.len()/32,
        "connect_ms":connected_ms,"partial_count":partial_count,"first_partial_ms":first_partial_ms,
        "finalize_ms":released.elapsed().as_millis(),"transcript":final_text})
    );
    Ok(())
}
