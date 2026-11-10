import fs from 'fs';
import path from 'path';
import { SCHEMA_SQL, ConversationRecord, MessageRecord } from './schema';

const DB_PATH = path.resolve(process.cwd(), 'agent.db');

interface IDatabaseDriver {
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<void>;
  close(): void;
}

class BetterSqliteDriver implements IDatabaseDriver {
  private db: any;

  constructor(dbPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
  }

  async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return (row as T) || null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

class SqlJsDriver implements IDatabaseDriver {
  private db: any;
  private dbPath: string;

  constructor(SQL: any, dbPath: string) {
    this.dbPath = dbPath;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    this.db.run(SCHEMA_SQL);
    this.persist();
  }

  private persist() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('[DB] Failed to persist SQLite database to disk:', err);
    }
  }

  async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.queryAll<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    this.db.run(sql, params);
    this.persist();
  }

  close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
    }
  }
}

let driverPromise: Promise<IDatabaseDriver> | null = null;

export async function getDbDriver(): Promise<IDatabaseDriver> {
  if (driverPromise) return driverPromise;

  driverPromise = (async () => {
    // 1. Try better-sqlite3 first
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('better-sqlite3');
      const driver = new BetterSqliteDriver(DB_PATH);
      return driver;
    } catch {
      // 2. Fall back to pure WASM SQLite (sql.js)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();
        const driver = new SqlJsDriver(SQL, DB_PATH);
        return driver;
      } catch (wasmError) {
        console.error('[DB] Failed to initialize SQLite WASM fallback:', wasmError);
        throw wasmError;
      }
    }
  })();

  return driverPromise;
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const db = await getDbDriver();
  const row = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages');
  return !row || Number(row.count) === 0;
}

export async function getConversation(conversationId: string): Promise<ConversationRecord | null> {
  const db = await getDbDriver();
  return db.queryOne<ConversationRecord>('SELECT * FROM conversations WHERE id = ?', [conversationId]);
}

export async function createConversation(id: string, title: string): Promise<void> {
  const db = await getDbDriver();
  await db.execute(
    'INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, datetime(\'now\'), datetime(\'now\'))',
    [id, title]
  );
}

export async function getMessagesByConversation(conversationId: string): Promise<MessageRecord[]> {
  const db = await getDbDriver();
  return db.queryAll<MessageRecord>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );
}

export async function saveMessage(params: {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  search_queries?: string[];
  search_sources?: Array<{ title: string; url: string; snippet?: string }>;
  extracted_entities?: string[];
}): Promise<void> {
  const db = await getDbDriver();

  // Ensure conversation exists
  const existingConv = await getConversation(params.conversation_id);
  if (!existingConv) {
    const title = params.role === 'user' ? params.content.slice(0, 40) + '...' : 'Conversation';
    await createConversation(params.conversation_id, title);
  }

  await db.execute(
    `INSERT INTO messages (
      id, conversation_id, role, content, created_at, search_queries, search_sources, extracted_entities
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.conversation_id,
      params.role,
      params.content,
      params.created_at,
      params.search_queries ? JSON.stringify(params.search_queries) : null,
      params.search_sources ? JSON.stringify(params.search_sources) : null,
      params.extracted_entities ? JSON.stringify(params.extracted_entities) : null,
    ]
  );
}

export async function findMessagesByDateRange(startDate: string, endDate: string): Promise<MessageRecord[]> {
  const db = await getDbDriver();
  return db.queryAll<MessageRecord>(
    'SELECT * FROM messages WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC',
    [startDate, endDate]
  );
}

export async function searchMessagesByKeywords(keywords: string[]): Promise<MessageRecord[]> {
  if (keywords.length === 0) return [];
  const db = await getDbDriver();
  
  // Construct a safe OR clause for keyword matching
  const conditions = keywords.map(() => '(content LIKE ? OR extracted_entities LIKE ?)').join(' OR ');
  const params: string[] = [];
  for (const kw of keywords) {
    params.push(`%${kw}%`, `%${kw}%`);
  }

  return db.queryAll<MessageRecord>(
    `SELECT * FROM messages WHERE ${conditions} ORDER BY created_at DESC LIMIT 10`,
    params
  );
}

export async function getAllConversations(): Promise<ConversationRecord[]> {
  const db = await getDbDriver();
  return db.queryAll<ConversationRecord>('SELECT * FROM conversations ORDER BY updated_at DESC');
}

export async function clearAllData(): Promise<void> {
  const db = await getDbDriver();
  await db.execute('DELETE FROM messages');
  await db.execute('DELETE FROM conversations');
}

