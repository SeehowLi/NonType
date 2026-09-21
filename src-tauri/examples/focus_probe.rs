//! Read-only diagnostic: inspect focused control capability, never its text.
#[tokio::main(flavor = "current_thread")]
async fn main() {
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    let start = std::time::Instant::now();
    let editable = opentypeless_lib::output::focused_input::is_editable().await;
    println!(
        "editable={editable} elapsed_ms={}",
        start.elapsed().as_millis()
    );
}
