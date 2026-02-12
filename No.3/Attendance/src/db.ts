import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";

let dbInstance: Database | null = null;

async function getDB() {
  if (dbInstance) return dbInstance;
  const dbPath = await invoke<string>("get_db_path");
  dbInstance = await Database.load(dbPath);
  return dbInstance;
}

export async function initDB() {
  const db = await getDB();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      extra_data TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      UNIQUE(emp_id, date_str)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export async function getCustomFields(): Promise<string[]> {
  const db = await getDB();
  const result: any[] = await db.select("SELECT value FROM settings WHERE key = 'custom_fields'");
  return result.length > 0 ? JSON.parse(result[0].value) : [];
}

export async function saveCustomFields(fields: string[]) {
  const db = await getDB();
  await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", ["custom_fields", JSON.stringify(fields)]);
}

export async function addEmployee(name: string, extraData: Record<string, string>) {
  const db = await getDB();
  await db.execute("INSERT INTO employees (name, extra_data) VALUES ($1, $2)", [name, JSON.stringify(extraData)]);
  return true;
}

// [新增] 更新员工信息
export async function updateEmployee(id: number, name: string, extraData: Record<string, string>) {
  const db = await getDB();
  await db.execute(
    "UPDATE employees SET name = $1, extra_data = $2 WHERE id = $3", 
    [name, JSON.stringify(extraData), id]
  );
  return true;
}

export async function deleteEmployee(id: number) {
  const db = await getDB();
  await db.execute("DELETE FROM employees WHERE id = $1", [id]);
  await db.execute("DELETE FROM records WHERE emp_id = $1", [id]);
}

export async function getEmployees() {
  const db = await getDB();
  const rows: any[] = await db.select("SELECT * FROM employees ORDER BY id DESC");
  return rows.map(row => ({
    ...row,
    extra_data: JSON.parse(row.extra_data || '{}')
  }));
}

export async function getEmployeesWithStatus() {
  const db = await getDB();
  const today = dayjs().format("YYYY-MM-DD");
  
  const rows: any[] = await db.select(`
    SELECT e.*, r.timestamp as punch_time
    FROM employees e
    LEFT JOIN records r ON e.id = r.emp_id AND r.date_str = $1
    ORDER BY e.id DESC
  `, [today]);

  return rows.map(row => ({
    ...row,
    extra_data: JSON.parse(row.extra_data || '{}'),
    is_punched: !!row.punch_time
  }));
}

export async function togglePunch(empId: number) {
  const db = await getDB();
  const today = dayjs().format("YYYY-MM-DD");
  
  const existing = await db.select<any[]>("SELECT id FROM records WHERE emp_id = $1 AND date_str = $2", [empId, today]);
  
  if (existing.length > 0) {
    await db.execute("DELETE FROM records WHERE emp_id = $1 AND date_str = $2", [empId, today]);
  } else {
    await db.execute("INSERT INTO records (emp_id, date_str, timestamp) VALUES ($1, $2, $3)", [empId, today, dayjs().unix()]);
  }
}

export async function punchSpecificDate(empId: number, dateStr: string) {
  const db = await getDB();
  await db.execute(
    "INSERT OR IGNORE INTO records (emp_id, date_str, timestamp) VALUES ($1, $2, $3)", 
    [empId, dateStr, dayjs(dateStr).hour(9).minute(0).unix()]
  );
}

export async function punchAllEmployees() {
  const db = await getDB();
  const today = dayjs().format("YYYY-MM-DD");
  const now = dayjs().unix();
  
  const emps = await db.select<any[]>("SELECT id FROM employees");
  
  for (const emp of emps) {
    await db.execute(
      "INSERT OR IGNORE INTO records (emp_id, date_str, timestamp) VALUES ($1, $2, $3)",
      [emp.id, today, now]
    );
  }
}

export async function getRawRecords(start: string, end: string) {
  const db = await getDB();
  return await db.select<any[]>(`
    SELECT emp_id, date_str 
    FROM records 
    WHERE date_str BETWEEN $1 AND $2
  `, [start, end]);
}