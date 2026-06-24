//! Mouse hook: double middle-click toggles desktop icons + frames.
//! Only fires when the click target is the desktop, not other apps.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use crossbeam_channel::Sender;

#[allow(dead_code)]
#[derive(Debug, Clone)]
enum MouseEvent { DoubleMiddleClick }

#[allow(dead_code)]
static EVENT_TX: OnceLock<Sender<MouseEvent>> = OnceLock::new();
static DCLICK_DETECTED: AtomicBool = AtomicBool::new(false);
static LAST_MCLICK_MS: AtomicU64 = AtomicU64::new(0);
static HOOK_RUNNING: AtomicBool = AtomicBool::new(false);

extern "system" {
    fn GetDoubleClickTime() -> u32;
    fn GetTickCount() -> u32;
    fn CallNextHookEx(hhk: isize, nCode: i32, wParam: usize, lParam: isize) -> isize;
    fn SetWindowsHookExW(idHook: i32, lpfn: HOOKPROC, hmod: isize, dwThreadId: u32) -> isize;
    fn UnhookWindowsHookEx(hhk: isize) -> i32;
    fn PeekMessageW(lpMsg: *mut MSG, hWnd: isize, wMsgFilterMin: u32, wMsgFilterMax: u32, wRemoveMsg: u32) -> i32;
    fn TranslateMessage(lpMsg: *const MSG) -> i32;
    fn DispatchMessageW(lpMsg: *const MSG) -> isize;
    fn MsgWaitForMultipleObjects(nCount: u32, pHandles: *const isize, fWaitAll: i32, dwMilliseconds: u32, dwWakeMask: u32) -> u32;
    fn WindowFromPoint(x: i32, y: i32) -> isize;
    fn GetClassNameW(hWnd: isize, lpClassName: *mut u16, nMaxCount: i32) -> i32;
    fn GetAncestor(hWnd: isize, gaFlags: u32) -> isize;
}

type HOOKPROC = Option<unsafe extern "system" fn(code: i32, wparam: usize, lparam: isize) -> isize>;

#[repr(C)]
struct MSG { hwnd: isize, message: u32, w_param: usize, l_param: isize, time: u32, pt_x: i32, pt_y: i32 }
#[allow(dead_code)]
#[repr(C)]
struct MSLLHOOKSTRUCT { pt_x: i32, pt_y: i32, mouse_data: u32, flags: u32, time: u32, dw_extra_info: usize }

const WH_MOUSE_LL: i32 = 14;
const WM_MBUTTONDOWN: u32 = 0x0207;
const PM_REMOVE: u32 = 1;
const QS_ALLINPUT: u32 = 0x04FF;
const GA_ROOT: u32 = 2;

pub fn start(app_handle: tauri::AppHandle) {
    let (tx, rx) = crossbeam_channel::bounded::<MouseEvent>(16);
    EVENT_TX.set(tx).ok();
    std::thread::spawn(move || run_hook_loop(app_handle, rx));
}

fn run_hook_loop(_app_handle: tauri::AppHandle, _rx: crossbeam_channel::Receiver<MouseEvent>) {
    unsafe {
        let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), 0, 0);
        if hook == 0 { eprintln!("[Desk] Hook failed"); return; }
        HOOK_RUNNING.store(true, Ordering::Relaxed);
        eprintln!("[Desk] Hook installed (desktop-only double-middle-click)");

        while HOOK_RUNNING.load(Ordering::Relaxed) {
            if DCLICK_DETECTED.swap(false, Ordering::Acquire) {
                let _ = crate::desktop_icons::toggle();
            }
            MsgWaitForMultipleObjects(0, std::ptr::null(), 0, 100, QS_ALLINPUT);
            let mut msg: MSG = std::mem::zeroed();
            while PeekMessageW(&mut msg, 0, 0, 0, PM_REMOVE) != 0 {
                TranslateMessage(&msg); DispatchMessageW(&msg);
            }
        }
        UnhookWindowsHookEx(hook);
    }
}

/// Check if an HWND is part of the desktop (Progman or WorkerW with SysListView32).
unsafe fn is_desktop_window(hwnd: isize) -> bool {
    if hwnd == 0 { return false; }
    let mut buf = [0u16; 32];
    let root = GetAncestor(hwnd, GA_ROOT);
    let len = GetClassNameW(root, buf.as_mut_ptr(), 32);
    let cls = String::from_utf16_lossy(&buf[..len as usize]);
    // Progman hosts the desktop; WorkerW is used when wallpaper changes
    if cls == "Progman" || cls == "WorkerW" { return true; }
    // Also check the direct window
    let len2 = GetClassNameW(hwnd, buf.as_mut_ptr(), 32);
    let cls2 = String::from_utf16_lossy(&buf[..len2 as usize]);
    cls2 == "Progman" || cls2 == "WorkerW" || cls2 == "SysListView32"
}

unsafe extern "system" fn hook_proc(code: i32, wparam: usize, lparam: isize) -> isize {
    if code >= 0 && wparam == WM_MBUTTONDOWN as usize {
        let info = &*(lparam as *const MSLLHOOKSTRUCT);
        let hwnd = WindowFromPoint(info.pt_x, info.pt_y);
        if is_desktop_window(hwnd) {
            let now = GetTickCount() as u64;
            let prev = LAST_MCLICK_MS.swap(now, Ordering::Relaxed);
            let dc = GetDoubleClickTime() as u64;
            if prev > 0 && now.wrapping_sub(prev) <= dc {
                DCLICK_DETECTED.store(true, Ordering::Release);
                LAST_MCLICK_MS.store(0, Ordering::Relaxed);
            }
        }
    }
    CallNextHookEx(0, code, wparam, lparam)
}

pub fn stop() { HOOK_RUNNING.store(false, Ordering::Relaxed); }
