//! Read-only focus detection. Unknown/unsupported targets use the copy preview.
//! Never read the contents of a focused field, especially passwords.
#[cfg(target_os = "windows")]
pub async fn is_editable() -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    static BUSY: AtomicBool = AtomicBool::new(false);
    if BUSY.swap(true, Ordering::SeqCst) {
        return false;
    }
    let job = tokio::task::spawn_blocking(|| {
        struct Release;
        impl Drop for Release {
            fn drop(&mut self) {
                BUSY.store(false, Ordering::SeqCst);
            }
        }
        let _release = Release;
        unsafe { windows_editable().unwrap_or(false) }
    });
    // A broken accessibility provider cannot delay output indefinitely. BUSY also
    // prevents a stalled COM call from accumulating a new worker every session.
    tokio::time::timeout(std::time::Duration::from_millis(250), job)
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
unsafe fn windows_editable() -> windows::core::Result<bool> {
    use windows::Win32::{System::Com::*, UI::Accessibility::*};
    CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe { CoUninitialize() }
        }
    }
    let _com = Com;
    let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
    let element = automation.GetFocusedElement()?;
    if !element.CurrentHasKeyboardFocus()?.as_bool()
        || !element.CurrentIsEnabled()?.as_bool()
        || element.CurrentIsPassword()?.as_bool()
        || element.CurrentProcessId()? as u32 == std::process::id()
    {
        return Ok(false);
    }
    if let Ok(value) = element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
    {
        return Ok(!value.CurrentIsReadOnly()?.as_bool());
    }
    // Rich editors (Word, Chromium contenteditable) may expose TextPattern2
    // instead of ValuePattern. Require a live caret and explicitly writable text.
    if let Ok(text) = element.GetCurrentPatternAs::<IUIAutomationTextPattern2>(UIA_TextPattern2Id) {
        let mut active = windows::core::BOOL(0);
        let range = text.GetCaretRange(&mut active)?;
        let readonly = range.GetAttributeValue(UIA_IsReadOnlyAttributeId)?;
        return Ok(active.as_bool() && bool::try_from(&readonly).is_ok_and(|value| !value));
    }
    Ok(false)
}

#[cfg(not(target_os = "windows"))]
pub async fn is_editable() -> bool {
    // Platform-specific AX/AT-SPI detection must be validated before auto-paste.
    false
}
