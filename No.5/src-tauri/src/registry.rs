use winreg::enums::*;
use winreg::RegKey;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APP_VALUE_NAME: &str = "Desk";

/// Enable or disable auto-start with Windows.
#[tauri::command]
pub fn set_autostart_state(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
        .map_err(|e| format!("Failed to open Run key: {}", e))?;

    if enabled {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_str = exe_path.to_string_lossy().to_string();
        run_key
            .set_value(APP_VALUE_NAME, &exe_str)
            .map_err(|e| format!("Failed to set Run value: {}", e))?;
    } else {
        // Delete the value if it exists (ignore error if not found)
        let _ = run_key.delete_value(APP_VALUE_NAME);
    }

    Ok(())
}

/// Check if auto-start with Windows is enabled.
#[tauri::command]
pub fn get_autostart_state() -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_READ)
        .map_err(|e| format!("Failed to open Run key: {}", e))?;

    let result: Result<String, _> = run_key.get_value(APP_VALUE_NAME);
    Ok(result.is_ok())
}
