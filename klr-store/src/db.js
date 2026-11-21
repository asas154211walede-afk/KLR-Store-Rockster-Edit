const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dbPath = process.env.DB_PATH || './data/klr.sqlite';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), {recursive:true});
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_code TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
 service_id TEXT NOT NULL, service_name TEXT NOT NULL, price_kwd REAL NOT NULL, details TEXT NOT NULL,
 contact_method TEXT NOT NULL, contact_value TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'جديد',
 receipt_path TEXT, admin_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (
 id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, payload TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, details TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
const defaults = {
 sar_per_kwd: process.env.SAR_PER_KWD || '12.20', payment_enabled: process.env.PAYMENT_ENABLED || 'false',
 payment_method_label: process.env.PAYMENT_METHOD_LABEL || '', payment_bank_name: process.env.PAYMENT_BANK_NAME || '',
 payment_account_holder: process.env.PAYMENT_ACCOUNT_HOLDER || '', payment_iban: process.env.PAYMENT_IBAN || '',
 payment_phone: process.env.PAYMENT_PHONE || '', payment_instructions: process.env.PAYMENT_INSTRUCTIONS || 'يرجى انتظار تعليمات الإدارة.'
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
for (const [k,v] of Object.entries(defaults)) insertSetting.run(k,String(v));
module.exports = db;
