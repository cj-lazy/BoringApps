use tauri::{
    AppHandle,
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use crate::{desktop_icons, registry};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle_icons = MenuItemBuilder::with_id("toggle_icons", "Toggle Desktop Icons")
        .build(app)?;
    let autostart = CheckMenuItemBuilder::with_id("autostart", "Start with Windows")
        .checked(registry::get_autostart_state().unwrap_or(false))
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Desk")
        .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_icons)
        .separator()
        .item(&autostart)
        .separator()
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Desk")
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "toggle_icons" => { let _ = desktop_icons::toggle(); }
                "autostart" => {
                    // Toggle: read current state, flip it, write back
                    let current = registry::get_autostart_state().unwrap_or(false);
                    let new = !current;
                    let _ = registry::set_autostart_state(new);
                    // Refresh the tray to update checkmark — we just toggle
                    // For simplicity, we recreate the tray
                    let _ = create_tray(app);
                }
                "quit" => {
                    crate::single_instance::release_lock();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
                let _ = desktop_icons::toggle();
            }
        })
        .build(app)?;

    Ok(())
}
