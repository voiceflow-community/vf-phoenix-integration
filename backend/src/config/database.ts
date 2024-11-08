import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

let db: DatabaseType;

try {
  // Use a consistent path for the database file
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'spans.db');

  db = new Database(dbPath, {
    verbose: console.log // This will help with debugging
  });

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
} catch (error) {
  console.error('Failed to initialize database:', error);
  throw error; // Re-throw to fail fast if DB can't be initialized
}

export default db;
