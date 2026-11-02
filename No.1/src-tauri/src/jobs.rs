use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
#[derive(Clone, Serialize)]
pub struct Progress {
    pub completed: u64,
    pub total: u64,
    pub label: String,
}
pub struct Job {
    pub id: String,
    cancelled: Arc<AtomicBool>,
}
impl Job {
    pub fn begin(id: String) -> Result<Self, String> {
        if id.is_empty()
            || id.len() > 80
            || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err("任务编号无效。".into());
        }
        let mut jobs = JOBS
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "任务状态不可用")?;
        if jobs.contains_key(&id) {
            return Err("任务正在运行。".into());
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        jobs.insert(id.clone(), cancelled.clone());
        Ok(Self { id, cancelled })
    }
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Relaxed) {
            Err("操作已取消。".into())
        } else {
            Ok(())
        }
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        if let Ok(mut jobs) = JOBS.get_or_init(Default::default).lock() {
            jobs.remove(&self.id);
        }
    }
}
#[tauri::command]
pub fn cancel_job(id: String) -> Result<(), String> {
    if let Some(cancel) = JOBS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "任务状态不可用")?
        .get(&id)
    {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}
