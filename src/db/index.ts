import fs from 'fs';
import path from 'path';
import { SCHEMA_SQL, ConversationRecord, MessageRecord } from './schema';

const DB_PATH = path.resolve(process.cwd(), 'agent.db');
const JSON_BACKUP_PATH = path.resolve(process.cwd(), 'agent-storage.json');

export interface IDatabaseDriver {
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<void>;
  close(): void;
}

// Helper to get Node.js native require outside Webpack
function getNativeRequire(): NodeRequire {
  // @ts-ignore
  if (typeof __non_webpack_require__ !== 'undefined') {
    // @ts-ignore
    return __non_webpack_require__;
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return eval('require');
}

/**
 * Driver 1: Native better-sqlite3 (High Performance)
 */
class BetterSqliteDriver implements IDatabaseDriver {
  private db: any;

  constructor(dbPath: string, nativeRequire: NodeRequire) {
    const Database = nativeRequire('better-sqlite3');
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

/**
 * Driver 2: sql.js WebAssembly SQLite
 */
class SqlJsDriver implements IDatabaseDriver {
  private db: any;
  private dbPath: string;

  constructor(SQL: any, dbPath: string) {
    this.dbPath = dbPath;
    if (fs.existsSync(dbPath)) {
      try {
        const buffer = fs.readFileSync(dbPath);
        this.db = new SQL.Database(buffer);
      } catch {
        this.db = new SQL.Database();
      }
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

/**
 * Driver 3: Pure TypeScript Fail-Safe File Storage Engine
 * Guarantees zero crashing in Next.js Server Components / Webpack bundler environments.
 */
class FailSafeFileDriver implements IDatabaseDriver {
  private conversations: Map<string, ConversationRecord> = new Map();
  private messages: Map<string, MessageRecord> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadFromDisk();
  }

  private loadFromDisk() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.conversations)) {
          for (const c of data.conversations) this.conversations.set(c.id, c);
        }
        if (Array.isArray(data.messages)) {
          for (const m of data.messages) this.messages.set(m.id, m);
        }
      } catch (err) {
        console.warn('[DB/FailSafe] Could not read existing JSON storage, starting fresh:', err);
      }
    }
  }

  private persist() {
    try {
      const payload = {
        conversations: Array.from(this.conversations.values()),
        messages: Array.from(this.messages.values()),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB/FailSafe] Failed to write JSON storage to disk:', err);
    }
  }

  async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const s = sql.toLowerCase().trim();

    // 1. SELECT COUNT(*) as count FROM messages
    if (s.includes('count(*)') && s.includes('messages')) {
      return [{ count: this.messages.size }] as any;
    }

    // 2. SELECT * FROM conversations WHERE id = ?
    if (s.startsWith('select * from conversations where id = ?')) {
      const id = params[0];
      const conv = this.conversations.get(id);
      return conv ? ([conv] as any) : [];
    }

    // 3. SELECT * FROM conversations ORDER BY updated_at DESC
    if (s.includes('from conversations')) {
      const list = Array.from(this.conversations.values()).sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at)
      );
      return list as any;
    }

    // 4. SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
    if (s.includes('where conversation_id = ?')) {
      const convId = params[0];
      const list = Array.from(this.messages.values())
        .filter((m) => m.conversation_id === convId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return list as any;
    }

    // 5. Date range search: SELECT * FROM messages WHERE created_at >= ? AND created_at <= ?
    if (s.includes('created_at >= ? and created_at <= ?')) {
      const start = params[0];
      const end = params[1];
      const list = Array.from(this.messages.values())
        .filter((m) => m.created_at >= start && m.created_at <= end)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return list as any;
    }

    // 6. Keyword search
    if (s.includes('where') && s.includes('like')) {
      const terms: string[] = [];
      for (const p of params) {
        if (typeof p === 'string' && p.startsWith('%') && p.endsWith('%')) {
          terms.push(p.slice(1, -1).toLowerCase());
        }
      }
      const list = Array.from(this.messages.values())
        .filter((m) => {
          const content = (m.content || '').toLowerCase();
          const entities = (m.extracted_entities || '').toLowerCase();
          return terms.some((t) => content.includes(t) || entities.includes(t));
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10);
      return list as any;
    }

    return Array.from(this.messages.values()) as any;
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const list = await this.queryAll<T>(sql, params);
    return list.length > 0 ? list[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    const s = sql.toLowerCase().trim();

    // 1. DELETE FROM messages
    if (s.startsWith('delete from messages')) {
      this.messages.clear();
      this.persist();
      return;
    }

    // 2. DELETE FROM conversations
    if (s.startsWith('delete from conversations')) {
      this.conversations.clear();
      this.persist();
      return;
    }

    // 3. Schema DDL
    if (s.startsWith('create table') || s.startsWith('create index')) {
      return;
    }

    // 4. INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))
    if (s.includes('into conversations')) {
      const [id, title] = params;
      const now = new Date().toISOString();
      const existing = this.conversations.get(id);
      this.conversations.set(id, {
        id,
        title,
        created_at: existing ? existing.created_at : now,
        updated_at: now,
      });
      this.persist();
      return;
    }

    // 5. INSERT INTO messages
    if (s.includes('into messages')) {
      const [
        id,
        conversation_id,
        role,
        content,
        created_at,
        search_queries,
        search_sources,
        extracted_entities,
      ] = params;
      this.messages.set(id, {
        id,
        conversation_id,
        role,
        content,
        created_at,
        search_queries: search_queries || null,
        search_sources: search_sources || null,
        extracted_entities: extracted_entities || null,
      });
      this.persist();
      return;
    }
  }

  close(): void {
    this.persist();
  }
}

let driverPromise: Promise<IDatabaseDriver> | null = null;

export async function getDbDriver(): Promise<IDatabaseDriver> {
  if (driverPromise) return driverPromise;

  driverPromise = (async () => {
    const nativeRequire = getNativeRequire();

    // 1. Try native better-sqlite3 first
    try {
      nativeRequire('better-sqlite3');
      const driver = new BetterSqliteDriver(DB_PATH, nativeRequire);
      return driver;
    } catch {
      // 2. Try WebAssembly SQLite (sql.js)
      try {
        const initSqlJs = nativeRequire('sql.js');
        const SQL = await initSqlJs();
        const driver = new SqlJsDriver(SQL, DB_PATH);
        return driver;
      } catch {
        // 3. Fail-Safe Pure TypeScript Storage Engine (Never crashes on Next.js / Webpack / Vercel)
        const driver = new FailSafeFileDriver(JSON_BACKUP_PATH);
        return driver;
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
