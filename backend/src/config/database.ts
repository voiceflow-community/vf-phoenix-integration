import Database from 'better-sqlite3';

const db = new Database('spans.db');

// Create spans table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS spans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    span_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    is_current BOOLEAN DEFAULT false
  );
`);

export default db;
