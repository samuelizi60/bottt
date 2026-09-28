import 'dotenv/config';
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { ECONOMIC_LIMITS, sanitizeMoney, sanitizeXP, sanitizeAura, checkEconomicLimit } from '../utils/economicValidation.js';

const DB_PATH = path.resolve('bot_data.sqlite');
const LEGACY_JSON_PATH = path.resolve('database.json');
const BOT_DATA_JSON_PATH = path.resolve('bot_data.json');
const BACKUPS_DIR = path.resolve('backups');

const KNOWN_USER_KEYS = [
  'jid', 'wallet', 'bank', 'xp', 'level', 'aura',
  'last_daily', 'last_work', 'last_aura_farm', 'last_pescar', 'daily_streak',
  'inventory', 'extra_data', 'created_at', 'updated_at',
  'rebirths', 'highest_level', 'highest_wallet', 'highest_bank', 'highest_aura',
  'total_xp_earned', 'total_money_earned', 'title'
];

const CURRENT_SCHEMA_VERSION = 2;

class DatabaseManager {
  constructor() {
    this.dbInstance = null;
    this.pgClient = null;
    this.isPg = false;
    this.memoryStore = {
      users: {},
      warns: {},
      group_configs: {},
      configGrupos: {},
      reminders: [],
      casamentos: {},
      pedidosCasamento: {},
      autorizadosVer: [],
      birthdays: {}
    };
    this.isInitialized = false;
  }

  // --- LOGGING HELPER ---
  log(msg) {
    console.log(`[DATABASE] ${msg}`);
  }

  logErr(msg, err) {
    console.error(`[DATABASE ERROR] ${msg}`, err || '');
  }

  // --- BACKUP AUTOMÁTICO ---
  createBackup() {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');

      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, `backup-${timestamp}.sqlite`));
      }
      if (fs.existsSync(LEGACY_JSON_PATH)) {
        fs.copyFileSync(LEGACY_JSON_PATH, path.join(BACKUPS_DIR, `backup-${timestamp}-database.json`));
      }
      if (fs.existsSync(BOT_DATA_JSON_PATH)) {
        fs.copyFileSync(BOT_DATA_JSON_PATH, path.join(BACKUPS_DIR, `backup-${timestamp}-bot_data.json`));
      }

      this.log('Backup concluído.');
      return true;
    } catch (err) {
      this.logErr('Falha ao criar backup:', err);
      return false;
    }
  }

  // --- INICIALIZAÇÃO ---
  async initialize() {
    if (this.isInitialized) return;

    // 1. Backup antes de qualquer migração/carregamento
    this.createBackup();

    const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (pgUrl) {
      try {
        this.log('⏳ Conectando ao Supabase PostgreSQL...');
        const pg = await import('pg');
        const Client = pg.default ? pg.default.Client : pg.Client;
        this.pgClient = new Client({
          connectionString: pgUrl,
          ssl: process.env.PG_NO_SSL ? false : { rejectUnauthorized: false },
          connectionTimeoutMillis: 10000
        });
        await this.pgClient.connect();
        this.isPg = true;
        this.log('Backend: PostgreSQL (Supabase)');
      } catch (err) {
        this.logErr(`⚠️ Erro ao conectar ao Supabase: ${err.message}`);
        this.log('🔄 Alternando automaticamente para SQLite local no volume persistente...');
        this.isPg = false;
      }
    }

    if (!this.isPg) {
      this.log('⚠️ Operando com SQLite local.');
      this.log('Backend: SQLite');
      try {
        const SQL = await initSqlJs();
        if (fs.existsSync(DB_PATH)) {
          const filebuffer = fs.readFileSync(DB_PATH);
          this.dbInstance = new SQL.Database(filebuffer);
        } else {
          this.dbInstance = new SQL.Database();
        }
      } catch (err) {
        this.logErr('Erro ao inicializar sql.js WebAssembly, utilizando em-memória pura.', err);
        const SQL = await initSqlJs();
        this.dbInstance = new SQL.Database();
      }
    }

    // 2. Criação das Tabelas
    await this.createTables();

    // 3. Execução de migrações de schema
    await this.runSchemaMigrations();

    // 4. Hidratação e migração legada
    await this.migrateAndHydrate();

    const userCount = Object.keys(this.memoryStore.users).length;
    this.log(`Dados carregados: ${userCount} usuários.`);
    this.log('Persistência pronta.');

    this.isInitialized = true;
  }

  persistSqliteFile() {
    if (this.dbInstance && !this.isPg) {
      try {
        const data = this.dbInstance.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
      } catch (err) {
        this.logErr('Erro ao gravar arquivo SQLite:', err);
      }
    }
  }

  async createTables() {
    const isPg = this.isPg;

    const queries = isPg
      ? [
          `CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT
          );`,

          `CREATE TABLE IF NOT EXISTS users (
            jid TEXT PRIMARY KEY,
            wallet BIGINT DEFAULT 0,
            bank BIGINT DEFAULT 0,
            xp BIGINT DEFAULT 0,
            level INTEGER DEFAULT 1,
            aura BIGINT DEFAULT 0,
            last_daily BIGINT DEFAULT 0,
            last_work BIGINT DEFAULT 0,
            last_aura_farm BIGINT DEFAULT 0,
            last_pescar BIGINT DEFAULT 0,
            daily_streak INTEGER DEFAULT 0,
            inventory TEXT DEFAULT '[]',
            extra_data TEXT DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );`,

          `CREATE TABLE IF NOT EXISTS warns (
            group_jid TEXT,
            user_jid TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (group_jid, user_jid)
          );`,

          `CREATE TABLE IF NOT EXISTS group_configs (
            group_jid TEXT PRIMARY KEY,
            antilink INTEGER DEFAULT 0,
            antispam INTEGER DEFAULT 0,
            welcome INTEGER DEFAULT 0,
            rules TEXT DEFAULT '',
            anti_delete INTEGER DEFAULT 0
          );`,

          `CREATE TABLE IF NOT EXISTS reminders (
            id BIGINT PRIMARY KEY,
            user_jid TEXT,
            chat_jid TEXT,
            target_time BIGINT,
            message TEXT
          );`,

          `CREATE TABLE IF NOT EXISTS casamentos (
            user_jid TEXT PRIMARY KEY,
            parceiro_jid TEXT,
            since BIGINT
          );`,

          `CREATE TABLE IF NOT EXISTS pedidos_casamento (
            target_jid TEXT PRIMARY KEY,
            sender_jid TEXT
          );`,

          `CREATE TABLE IF NOT EXISTS autorizados_ver (
            user_jid TEXT PRIMARY KEY
          );`,

          `CREATE TABLE IF NOT EXISTS birthdays (
            user_jid TEXT PRIMARY KEY,
            birthday_date TEXT NOT NULL,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            notification_year INTEGER DEFAULT 0,
            chat_jid TEXT DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );`,

          `CREATE TABLE IF NOT EXISTS user_missions (
            id BIGSERIAL PRIMARY KEY,
            user_jid TEXT NOT NULL,
            mission_id TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            title TEXT NOT NULL,
            reward_money BIGINT DEFAULT 0,
            reward_xp BIGINT DEFAULT 0,
            status TEXT DEFAULT 'active',
            reward_claimed INTEGER DEFAULT 0,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE
          );`,

          `CREATE TABLE IF NOT EXISTS rebirth_history (
            id BIGSERIAL PRIMARY KEY,
            user_jid TEXT NOT NULL,
            rebirth_level INTEGER NOT NULL,
            sacrificed_wallet BIGINT DEFAULT 0,
            sacrificed_bank BIGINT DEFAULT 0,
            sacrificed_xp BIGINT DEFAULT 0,
            sacrificed_aura BIGINT DEFAULT 0,
            sacrificed_level INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );`
        ]
      : [
          `CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT
          );`,

          `CREATE TABLE IF NOT EXISTS users (
            jid TEXT PRIMARY KEY,
            wallet INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            aura INTEGER DEFAULT 0,
            last_daily INTEGER DEFAULT 0,
            last_work INTEGER DEFAULT 0,
            last_aura_farm INTEGER DEFAULT 0,
            last_pescar INTEGER DEFAULT 0,
            daily_streak INTEGER DEFAULT 0,
            inventory TEXT DEFAULT '[]',
            extra_data TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );`,

          `CREATE TABLE IF NOT EXISTS warns (
            group_jid TEXT,
            user_jid TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (group_jid, user_jid)
          );`,

          `CREATE TABLE IF NOT EXISTS group_configs (
            group_jid TEXT PRIMARY KEY,
            antilink INTEGER DEFAULT 0,
            antispam INTEGER DEFAULT 0,
            welcome INTEGER DEFAULT 0,
            rules TEXT DEFAULT '',
            anti_delete INTEGER DEFAULT 0
          );`,

          `CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY,
            user_jid TEXT,
            chat_jid TEXT,
            target_time INTEGER,
            message TEXT
          );`,

          `CREATE TABLE IF NOT EXISTS casamentos (
            user_jid TEXT PRIMARY KEY,
            parceiro_jid TEXT,
            since INTEGER
          );`,

          `CREATE TABLE IF NOT EXISTS pedidos_casamento (
            target_jid TEXT PRIMARY KEY,
            sender_jid TEXT
          );`,

          `CREATE TABLE IF NOT EXISTS autorizados_ver (
            user_jid TEXT PRIMARY KEY
          );`,

          `CREATE TABLE IF NOT EXISTS birthdays (
            user_jid TEXT PRIMARY KEY,
            birthday_date TEXT NOT NULL,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            notification_year INTEGER DEFAULT 0,
            chat_jid TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );`,

          `CREATE TABLE IF NOT EXISTS user_missions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_jid TEXT NOT NULL,
            mission_id TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            title TEXT NOT NULL,
            reward_money INTEGER DEFAULT 0,
            reward_xp INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            reward_claimed INTEGER DEFAULT 0,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
          );`,

          `CREATE TABLE IF NOT EXISTS rebirth_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_jid TEXT NOT NULL,
            rebirth_level INTEGER NOT NULL,
            sacrificed_wallet INTEGER DEFAULT 0,
            sacrificed_bank INTEGER DEFAULT 0,
            sacrificed_xp INTEGER DEFAULT 0,
            sacrificed_aura INTEGER DEFAULT 0,
            sacrificed_level INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );`
        ];

    for (const q of queries) {
      try {
        if (this.isPg) {
          await this.pgClient.query(q);
        } else {
          this.dbInstance.run(q);
        }
      } catch (err) {
        this.logErr('Erro ao criar tabela:', err);
      }
    }

    if (this.isPg) {
      const pgAlters = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_pescar BIGINT DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS rebirths INTEGER DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_level INTEGER DEFAULT 1;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_wallet BIGINT DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_bank BIGINT DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_aura BIGINT DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp_earned BIGINT DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS total_money_earned BIGINT DEFAULT 0;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT DEFAULT \'\';'
      ];
      for (const alt of pgAlters) {
        try { await this.pgClient.query(alt); } catch (_) {}
      }
    } else if (this.dbInstance) {
      const alters = [
        'ALTER TABLE users ADD COLUMN aura INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN last_aura_farm INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN last_pescar INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN daily_streak INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN extra_data TEXT DEFAULT "{}"',
        'ALTER TABLE users ADD COLUMN rebirths INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN highest_level INTEGER DEFAULT 1',
        'ALTER TABLE users ADD COLUMN highest_wallet INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN highest_bank INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN highest_aura INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN total_xp_earned INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN total_money_earned INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN title TEXT DEFAULT ""',
        'ALTER TABLE group_configs ADD COLUMN anti_delete INTEGER DEFAULT 0'
      ];
      for (const alt of alters) {
        try { this.dbInstance.run(alt); } catch (_) {}
      }
    }
  }

  // --- MIGRAÇÕES DE SCHEMA VERSIONADAS ---
  async getSchemaMetaValue(key) {
    try {
      if (this.isPg) {
        const res = await this.pgClient.query('SELECT value FROM schema_meta WHERE key = $1', [key]);
        return res.rows.length > 0 ? res.rows[0].value : null;
      } else if (this.dbInstance) {
        const res = this.dbInstance.exec(`SELECT value FROM schema_meta WHERE key = '${key}'`);
        if (res.length > 0 && res[0].values.length > 0) {
          return res[0].values[0][0];
        }
      }
    } catch (_) {}
    return null;
  }

  async setSchemaMetaValue(key, value) {
    try {
      if (this.isPg) {
        await this.pgClient.query(
          'INSERT INTO schema_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [key, String(value)]
        );
      } else if (this.dbInstance) {
        this.dbInstance.run(
          'INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)',
          [key, String(value)]
        );
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao salvar meta '${key}':`, err);
    }
  }

  async runSchemaMigrations() {
    const rawVersion = await this.getSchemaMetaValue('schema_version');
    const currentVersion = rawVersion ? parseInt(rawVersion, 10) : 0;
    let needed = false;

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      needed = true;
      this.log(`Schema versão ${currentVersion}.`);
      this.log('Migração necessária: sim.');

      if (currentVersion < 2) {
        // Migração para converter colunas int32 para BIGINT no PostgreSQL
        if (this.isPg) {
          const pgAlters = [
            'ALTER TABLE users ALTER COLUMN last_daily TYPE BIGINT;',
            'ALTER TABLE users ALTER COLUMN last_work TYPE BIGINT;',
            'ALTER TABLE users ALTER COLUMN last_aura_farm TYPE BIGINT;',
            'ALTER TABLE reminders ALTER COLUMN id TYPE BIGINT;',
            'ALTER TABLE reminders ALTER COLUMN target_time TYPE BIGINT;',
            'ALTER TABLE casamentos ALTER COLUMN since TYPE BIGINT;'
          ];
          for (const sql of pgAlters) {
            try {
              await this.pgClient.query(sql);
            } catch (e) {
              this.logErr(`Erro ao aplicar migração PG: ${sql}`, e);
            }
          }
        }
      }

      await this.setSchemaMetaValue('schema_version', CURRENT_SCHEMA_VERSION);
      this.log(`Schema versão ${CURRENT_SCHEMA_VERSION}.`);
    } else {
      this.log(`Schema versão ${CURRENT_SCHEMA_VERSION}.`);
      this.log('Migração necessária: não.');
    }

    return needed;
  }

  // --- MIGRAÇÃO E CARREGAMENTO DE DADOS ---
  async migrateAndHydrate() {
    await this.loadFromDb();

    const migrationCompleted = await this.getSchemaMetaValue('legacy_migration_completed');

    if (migrationCompleted !== 'true') {
      let importedAny = false;

      if (fs.existsSync(LEGACY_JSON_PATH)) {
        try {
          const raw = fs.readFileSync(LEGACY_JSON_PATH, 'utf-8');
          const legacyData = JSON.parse(raw);
          await this.mergeLegacyData(legacyData);
          importedAny = true;
        } catch (e) {
          this.logErr('Erro ao ler database.json legado:', e);
        }
      }

      if (fs.existsSync(BOT_DATA_JSON_PATH)) {
        try {
          const raw = fs.readFileSync(BOT_DATA_JSON_PATH, 'utf-8');
          const legacyData = JSON.parse(raw);
          await this.mergeLegacyData(legacyData);
          importedAny = true;
        } catch (e) {
          this.logErr('Erro ao ler bot_data.json legado:', e);
        }
      }

      if (importedAny) {
        await this.saveDatabase();
        this.log('Migração legada de arquivos JSON concluída com sucesso.');
      }

      await this.setSchemaMetaValue('legacy_migration_completed', 'true');
    }
  }

  async loadFromDb() {
    if (this.isPg) {
      try {
        const resUsers = await this.pgClient.query('SELECT * FROM users');
        resUsers.rows.forEach(u => {
          const extra = this.parseExtraData(u.extra_data);
          this.memoryStore.users[u.jid] = { ...u, ...extra, extra_data: JSON.stringify(extra) };
        });

        const resWarns = await this.pgClient.query('SELECT * FROM warns');
        resWarns.rows.forEach(w => {
          this.memoryStore.warns[`${w.group_jid}_${w.user_jid}`] = w.count;
        });

        const resGroups = await this.pgClient.query('SELECT * FROM group_configs');
        resGroups.rows.forEach(g => {
          this.memoryStore.group_configs[g.group_jid] = g;
          this.memoryStore.configGrupos[g.group_jid] = { antiDelete: Boolean(g.anti_delete) };
        });

        const resReminders = await this.pgClient.query('SELECT * FROM reminders');
        this.memoryStore.reminders = resReminders.rows.map(r => ({
          ...r,
          id: Number(r.id),
          target_time: Number(r.target_time)
        }));

        const resCasamentos = await this.pgClient.query('SELECT * FROM casamentos');
        resCasamentos.rows.forEach(c => {
          this.memoryStore.casamentos[c.user_jid] = { parceiro: c.parceiro_jid, since: Number(c.since) };
        });

        const resPedidos = await this.pgClient.query('SELECT * FROM pedidos_casamento');
        resPedidos.rows.forEach(p => {
          this.memoryStore.pedidosCasamento[p.target_jid] = p.sender_jid;
        });

        const resAutorizados = await this.pgClient.query('SELECT * FROM autorizados_ver');
        this.memoryStore.autorizadosVer = resAutorizados.rows.map(a => a.user_jid);

        try {
          const resBirthdays = await this.pgClient.query('SELECT * FROM birthdays');
          resBirthdays.rows.forEach(b => {
            this.memoryStore.birthdays[b.user_jid] = {
              ...b,
              day: Number(b.day),
              month: Number(b.month),
              year: Number(b.year),
              notification_year: Number(b.notification_year || 0)
            };
          });
        } catch (_) {}
      } catch (err) {
        this.logErr('Erro ao carregar dados do PostgreSQL:', err);
      }

    } else if (this.dbInstance) {
      try {
        const resUsers = this.dbInstance.exec('SELECT * FROM users');
        if (resUsers.length > 0) {
          const cols = resUsers[0].columns;
          resUsers[0].values.forEach(row => {
            const u = {};
            cols.forEach((col, idx) => u[col] = row[idx]);
            if (u.jid) {
              const extra = this.parseExtraData(u.extra_data);
              this.memoryStore.users[u.jid] = { ...u, ...extra, extra_data: JSON.stringify(extra) };
            }
          });
        }
      } catch (err) {
        this.logErr('Erro ao carregar usuários do SQLite:', err);
      }

      try {
        const resWarns = this.dbInstance.exec('SELECT * FROM warns');
        if (resWarns.length > 0) {
          const cols = resWarns[0].columns;
          resWarns[0].values.forEach(row => {
            const w = {};
            cols.forEach((col, idx) => w[col] = row[idx]);
            if (w.group_jid && w.user_jid) {
              this.memoryStore.warns[`${w.group_jid}_${w.user_jid}`] = w.count;
            }
          });
        }
      } catch (_) {}

      try {
        const resGroups = this.dbInstance.exec('SELECT * FROM group_configs');
        if (resGroups.length > 0) {
          const cols = resGroups[0].columns;
          resGroups[0].values.forEach(row => {
            const g = {};
            cols.forEach((col, idx) => g[col] = row[idx]);
            if (g.group_jid) {
              this.memoryStore.group_configs[g.group_jid] = g;
              this.memoryStore.configGrupos[g.group_jid] = { antiDelete: Boolean(g.anti_delete) };
            }
          });
        }
      } catch (_) {}

      try {
        const resReminders = this.dbInstance.exec('SELECT * FROM reminders');
        if (resReminders.length > 0) {
          const cols = resReminders[0].columns;
          this.memoryStore.reminders = resReminders[0].values.map(row => {
            const r = {};
            cols.forEach((col, idx) => r[col] = row[idx]);
            return {
              ...r,
              id: Number(r.id),
              target_time: Number(r.target_time)
            };
          });
        }
      } catch (_) {}

      try {
        const resCasamentos = this.dbInstance.exec('SELECT * FROM casamentos');
        if (resCasamentos.length > 0) {
          const cols = resCasamentos[0].columns;
          resCasamentos[0].values.forEach(row => {
            const c = {};
            cols.forEach((col, idx) => c[col] = row[idx]);
            if (c.user_jid) {
              this.memoryStore.casamentos[c.user_jid] = { parceiro: c.parceiro_jid, since: Number(c.since) };
            }
          });
        }
      } catch (_) {}

      try {
        const resPedidos = this.dbInstance.exec('SELECT * FROM pedidos_casamento');
        if (resPedidos.length > 0) {
          const cols = resPedidos[0].columns;
          resPedidos[0].values.forEach(row => {
            const p = {};
            cols.forEach((col, idx) => p[col] = row[idx]);
            if (p.target_jid) {
              this.memoryStore.pedidosCasamento[p.target_jid] = p.sender_jid;
            }
          });
        }
      } catch (_) {}

      try {
        const resAutorizados = this.dbInstance.exec('SELECT * FROM autorizados_ver');
        if (resAutorizados.length > 0) {
          const cols = resAutorizados[0].columns;
          this.memoryStore.autorizadosVer = resAutorizados[0].values.map(row => row[cols.indexOf('user_jid')]);
        }
      } catch (_) {}

      try {
        const resBirthdays = this.dbInstance.exec('SELECT * FROM birthdays');
        if (resBirthdays.length > 0) {
          const cols = resBirthdays[0].columns;
          resBirthdays[0].values.forEach(row => {
            const b = {};
            cols.forEach((col, idx) => b[col] = row[idx]);
            if (b.user_jid) {
              this.memoryStore.birthdays[b.user_jid] = {
                ...b,
                day: Number(b.day),
                month: Number(b.month),
                year: Number(b.year),
                notification_year: Number(b.notification_year || 0)
              };
            }
          });
        }
      } catch (_) {}
    }
  }

  parseExtraData(val) {
    if (!val) return {};
    if (typeof val === 'object') return val;
    if (typeof val === 'string' && val.trim() !== '') {
      try {
        return JSON.parse(val);
      } catch (_) {}
    }
    return {};
  }

  async mergeLegacyData(legacyData) {
    if (!legacyData || typeof legacyData !== 'object') return;

    if (legacyData.users) {
      for (const [jid, u] of Object.entries(legacyData.users)) {
        if (!this.memoryStore.users[jid]) {
          const extra = this.parseExtraData(u.extra_data);
          this.memoryStore.users[jid] = { jid, ...u, ...extra, extra_data: JSON.stringify(extra) };
        } else {
          const existing = this.memoryStore.users[jid];
          const extra = { ...this.parseExtraData(u.extra_data), ...this.parseExtraData(existing.extra_data) };
          this.memoryStore.users[jid] = {
            ...u,
            ...existing,
            ...extra,
            extra_data: JSON.stringify(extra)
          };
        }
      }
    }

    if (legacyData.warns) {
      for (const [k, v] of Object.entries(legacyData.warns)) {
        if (!this.memoryStore.warns[k]) {
          this.memoryStore.warns[k] = v;
        }
      }
    }

    if (legacyData.group_configs) {
      for (const [gJid, cfg] of Object.entries(legacyData.group_configs)) {
        if (!this.memoryStore.group_configs[gJid]) {
          this.memoryStore.group_configs[gJid] = cfg;
        }
      }
    }

    if (legacyData.configGrupos) {
      for (const [gJid, cfg] of Object.entries(legacyData.configGrupos)) {
        if (!this.memoryStore.configGrupos[gJid]) {
          this.memoryStore.configGrupos[gJid] = cfg;
        }
      }
    }

    if (Array.isArray(legacyData.reminders)) {
      for (const r of legacyData.reminders) {
        if (!this.memoryStore.reminders.some(existing => Number(existing.id) === Number(r.id))) {
          this.memoryStore.reminders.push(r);
        }
      }
    }

    if (legacyData.casamentos) {
      for (const [uJid, cInfo] of Object.entries(legacyData.casamentos)) {
        if (!this.memoryStore.casamentos[uJid]) {
          this.memoryStore.casamentos[uJid] = cInfo;
        }
      }
    }

    if (legacyData.pedidosCasamento) {
      for (const [tJid, sJid] of Object.entries(legacyData.pedidosCasamento)) {
        if (!this.memoryStore.pedidosCasamento[tJid]) {
          this.memoryStore.pedidosCasamento[tJid] = sJid;
        }
      }
    }

    if (Array.isArray(legacyData.autorizadosVer)) {
      for (const jid of legacyData.autorizadosVer) {
        if (!this.memoryStore.autorizadosVer.includes(jid)) {
          this.memoryStore.autorizadosVer.push(jid);
        }
      }
    }
  }

  // --- PERSISTÊNCIA TOTAL / SALVAMENTO ---
  async saveDatabase() {
    try {
      // 1. Salva Usuários
      for (const [jid, user] of Object.entries(this.memoryStore.users)) {
        if (user && user.jid) {
          await this.persistUser(user);
        }
      }

      // 2. Salva Warns
      for (const [key, count] of Object.entries(this.memoryStore.warns)) {
        const parts = key.split('_');
        if (parts.length >= 2) {
          const group_jid = parts[0];
          const user_jid = parts.slice(1).join('_');
          if (this.isPg) {
            await this.pgClient.query(
              'INSERT INTO warns (group_jid, user_jid, count) VALUES ($1, $2, $3) ON CONFLICT (group_jid, user_jid) DO UPDATE SET count = $3',
              [group_jid, user_jid, count]
            );
          } else if (this.dbInstance) {
            this.dbInstance.run(
              'INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)',
              [group_jid, user_jid, count]
            );
          }
        }
      }

      // 3. Salva Configurações de Grupos
      for (const [gJid, cfg] of Object.entries(this.memoryStore.group_configs)) {
        const antiDel = this.memoryStore.configGrupos[gJid]?.antiDelete ? 1 : 0;
        if (this.isPg) {
          await this.pgClient.query(
            'INSERT INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (group_jid) DO UPDATE SET antilink = $2, antispam = $3, welcome = $4, rules = $5, anti_delete = $6',
            [gJid, cfg.antilink || 0, cfg.antispam || 0, cfg.welcome || 0, cfg.rules || '', antiDel]
          );
        } else if (this.dbInstance) {
          this.dbInstance.run(
            'INSERT OR REPLACE INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES (?, ?, ?, ?, ?, ?)',
            [gJid, cfg.antilink || 0, cfg.antispam || 0, cfg.welcome || 0, cfg.rules || '', antiDel]
          );
        }
      }

      // 4. Salva Casamentos (Com Sincronização de Remoções)
      if (this.isPg) {
        await this.pgClient.query('DELETE FROM casamentos');
      } else if (this.dbInstance) {
        this.dbInstance.run('DELETE FROM casamentos');
      }
      for (const [uJid, cInfo] of Object.entries(this.memoryStore.casamentos)) {
        if (cInfo && cInfo.parceiro) {
          if (this.isPg) {
            await this.pgClient.query(
              'INSERT INTO casamentos (user_jid, parceiro_jid, since) VALUES ($1, $2, $3)',
              [uJid, cInfo.parceiro, Number(cInfo.since) || Date.now()]
            );
          } else if (this.dbInstance) {
            this.dbInstance.run(
              'INSERT INTO casamentos (user_jid, parceiro_jid, since) VALUES (?, ?, ?)',
              [uJid, cInfo.parceiro, Number(cInfo.since) || Date.now()]
            );
          }
        }
      }

      // 5. Salva Pedidos de Casamento (Com Sincronização de Remoções)
      if (this.isPg) {
        await this.pgClient.query('DELETE FROM pedidos_casamento');
      } else if (this.dbInstance) {
        this.dbInstance.run('DELETE FROM pedidos_casamento');
      }
      for (const [tJid, sJid] of Object.entries(this.memoryStore.pedidosCasamento)) {
        if (sJid) {
          if (this.isPg) {
            await this.pgClient.query(
              'INSERT INTO pedidos_casamento (target_jid, sender_jid) VALUES ($1, $2)',
              [tJid, sJid]
            );
          } else if (this.dbInstance) {
            this.dbInstance.run(
              'INSERT INTO pedidos_casamento (target_jid, sender_jid) VALUES (?, ?)',
              [tJid, sJid]
            );
          }
        }
      }

      // 6. Salva Autorizados Ver (Com Sincronização de Remoções)
      if (this.isPg) {
        await this.pgClient.query('DELETE FROM autorizados_ver');
      } else if (this.dbInstance) {
        this.dbInstance.run('DELETE FROM autorizados_ver');
      }
      for (const jid of this.memoryStore.autorizadosVer) {
        if (jid) {
          if (this.isPg) {
            await this.pgClient.query(
              'INSERT INTO autorizados_ver (user_jid) VALUES ($1)',
              [jid]
            );
          } else if (this.dbInstance) {
            this.dbInstance.run(
              'INSERT INTO autorizados_ver (user_jid) VALUES (?)',
              [jid]
            );
          }
        }
      }

      this.persistSqliteFile();
    } catch (err) {
      this.logErr('Erro ao salvar banco de dados completo:', err);
    }
  }

  async persistUser(user) {
    if (!user || !user.jid) return;

    try {
      const jid = user.jid;
      const wallet = sanitizeMoney(user.wallet);
      const bank = sanitizeMoney(user.bank);
      const xp = sanitizeXP(user.xp);
      const level = Math.max(1, sanitizeMoney(user.level, 1));
      const aura = sanitizeAura(user.aura);
      const last_daily = Number(user.last_daily) || 0;
      const last_work = Number(user.last_work) || 0;
      const last_aura_farm = Number(user.last_aura_farm) || 0;
      const last_pescar = Number(user.last_pescar) || 0;
      const daily_streak = Number(user.daily_streak) || 0;
      const inventory = typeof user.inventory === 'string' ? user.inventory : JSON.stringify(user.inventory || []);

      // Consolidação de extra_data
      const baseExtra = this.parseExtraData(user.extra_data);
      const dynamicExtra = {};
      for (const [k, v] of Object.entries(user)) {
        if (!KNOWN_USER_KEYS.includes(k) && v !== undefined) {
          dynamicExtra[k] = v;
        }
      }

      let consolidatedExtra = { ...baseExtra, ...dynamicExtra };

      // Proteção: Nunca substituir extra_data válido por {}
      if (Object.keys(consolidatedExtra).length === 0) {
        const memUser = this.memoryStore.users[jid];
        if (memUser) {
          const prevExtra = this.parseExtraData(memUser.extra_data);
          if (Object.keys(prevExtra).length > 0) {
            consolidatedExtra = prevExtra;
          }
        }
      }

      const extra_data_str = JSON.stringify(consolidatedExtra);

      // Atualiza estado em memória
      user.wallet = wallet;
      user.bank = bank;
      user.xp = xp;
      user.level = level;
      user.aura = aura;
      user.last_pescar = last_pescar;
      user.extra_data = extra_data_str;
      Object.assign(user, consolidatedExtra);
      this.memoryStore.users[jid] = user;

      if (this.isPg) {
        await this.pgClient.query(
          `INSERT INTO users (jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, last_pescar, daily_streak, inventory, extra_data, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
           ON CONFLICT (jid) DO UPDATE SET
           wallet = $2, bank = $3, xp = $4, level = $5, aura = $6, last_daily = $7, last_work = $8, last_aura_farm = $9, last_pescar = $10, daily_streak = $11, inventory = $12, extra_data = $13, updated_at = NOW()`,
          [jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, last_pescar, daily_streak, inventory, extra_data_str]
        );
      } else if (this.dbInstance) {
        this.dbInstance.run(
          `INSERT OR REPLACE INTO users (jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, last_pescar, daily_streak, inventory, extra_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [jid, wallet, bank, xp, level, aura, last_daily, last_work, last_aura_farm, last_pescar, daily_streak, inventory, extra_data_str]
        );
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao persistir usuário ${user?.jid}:`, err);
    }
  }

  // --- API DE COMANDOS / USUÁRIO ---

  getUser(jid) {
    if (!jid) return null;

    if (!this.memoryStore.users[jid]) {
      this.memoryStore.users[jid] = {
        jid,
        wallet: 0,
        bank: 0,
        xp: 0,
        level: 1,
        aura: 0,
        last_daily: 0,
        last_work: 0,
        last_aura_farm: 0,
        last_pescar: 0,
        daily_streak: 0,
        inventory: '[]',
        extra_data: '{}'
      };
      this.persistUser(this.memoryStore.users[jid]).catch(err => {
        this.logErr(`Erro ao salvar novo usuário ${jid}:`, err);
      });
    }

    const u = this.memoryStore.users[jid];
    u.wallet = sanitizeMoney(u.wallet);
    u.bank = sanitizeMoney(u.bank);
    u.xp = sanitizeXP(u.xp);
    u.level = Math.max(1, sanitizeMoney(u.level, 1));
    u.aura = sanitizeAura(u.aura);
    u.last_daily = Number(u.last_daily) || 0;
    u.last_work = Number(u.last_work) || 0;
    u.last_aura_farm = Number(u.last_aura_farm) || 0;
    u.last_pescar = Number(u.last_pescar) || 0;
    u.daily_streak = Number(u.daily_streak) || 0;
    u.inventory = u.inventory || '[]';
    u.rebirths = Number(u.rebirths) || 0;
    u.highest_level = Number(u.highest_level) || Math.max(1, u.level);
    u.highest_wallet = Number(u.highest_wallet) || Math.max(0, u.wallet);
    u.highest_bank = Number(u.highest_bank) || Math.max(0, u.bank);
    u.highest_aura = Number(u.highest_aura) || Math.max(0, u.aura);
    u.total_xp_earned = Number(u.total_xp_earned) || Math.max(0, u.xp);
    u.total_money_earned = Number(u.total_money_earned) || Math.max(0, u.wallet + u.bank);
    u.title = u.title || '';

    // Garante propriedades do extra_data no objeto principal
    const extra = this.parseExtraData(u.extra_data);
    Object.assign(u, extra);

    return u;
  }

  async updateUser(jid, updates) {
    const user = this.getUser(jid);
    if (!user) return;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'extra_data') {
        const parsed = this.parseExtraData(val);
        user.extra_data = JSON.stringify(parsed);
        Object.assign(user, parsed);
      } else if (key === 'wallet' || key === 'bank') {
        user[key] = sanitizeMoney(val);
      } else if (key === 'xp') {
        user.xp = sanitizeXP(val);
      } else if (key === 'aura') {
        user.aura = sanitizeAura(val);
      } else {
        user[key] = typeof val === 'object' ? JSON.stringify(val) : val;
      }
    }

    // Auto-cálculo e sincronização universal de nível ao modificar XP
    if (updates.xp !== undefined && updates.level === undefined) {
      const calculatedLevel = Math.floor(Math.sqrt(Number(user.xp || 0) / 50)) + 1;
      user.level = Math.max(Number(user.level || 1), calculatedLevel);
    }

    await this.persistUser(user);
  }

  getTopUsersByWallet(limit = 10) {
    const list = Object.values(this.memoryStore.users);
    list.sort((a, b) => (Number(b.wallet || 0) + Number(b.bank || 0)) - (Number(a.wallet || 0) + Number(a.bank || 0)));
    return list.slice(0, limit);
  }

  getTopUsersByXP(limit = 10) {
    const list = Object.values(this.memoryStore.users);
    list.sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0));
    return list.slice(0, limit);
  }

  // --- WARNS ---
  getWarns(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    return this.memoryStore.warns[key] || 0;
  }

  async addWarn(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    const current = this.memoryStore.warns[key] || 0;
    const next = current + 1;
    this.memoryStore.warns[key] = next;

    try {
      if (this.isPg) {
        await this.pgClient.query(
          'INSERT INTO warns (group_jid, user_jid, count) VALUES ($1, $2, $3) ON CONFLICT (group_jid, user_jid) DO UPDATE SET count = $3',
          [groupJid, userJid, next]
        );
      } else if (this.dbInstance) {
        this.dbInstance.run(
          'INSERT OR REPLACE INTO warns (group_jid, user_jid, count) VALUES (?, ?, ?)',
          [groupJid, userJid, next]
        );
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao adicionar warn para ${userJid}:`, err);
    }

    return next;
  }

  async resetWarns(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    delete this.memoryStore.warns[key];

    try {
      if (this.isPg) {
        await this.pgClient.query('DELETE FROM warns WHERE group_jid = $1 AND user_jid = $2', [groupJid, userJid]);
      } else if (this.dbInstance) {
        this.dbInstance.run('DELETE FROM warns WHERE group_jid = ? AND user_jid = ?', [groupJid, userJid]);
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao resetar warns para ${userJid}:`, err);
    }
  }

  // --- CONFIGURAÇÕES DE GRUPO ---
  getGroupConfig(groupJid) {
    if (!this.memoryStore.group_configs[groupJid]) {
      this.memoryStore.group_configs[groupJid] = {
        group_jid: groupJid,
        antilink: 0,
        antispam: 0,
        welcome: 0,
        rules: ''
      };
      this.memoryStore.configGrupos[groupJid] = { antiDelete: false };
      this.updateGroupConfig(groupJid, {}).catch(err => {
        this.logErr(`Erro ao salvar nova config do grupo ${groupJid}:`, err);
      });
    }
    return this.memoryStore.group_configs[groupJid];
  }

  async updateGroupConfig(groupJid, updates) {
    const config = this.getGroupConfig(groupJid);
    Object.assign(config, updates);

    const antiDel = this.memoryStore.configGrupos[groupJid]?.antiDelete ? 1 : 0;

    try {
      if (this.isPg) {
        await this.pgClient.query(
          'INSERT INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (group_jid) DO UPDATE SET antilink = $2, antispam = $3, welcome = $4, rules = $5, anti_delete = $6',
          [groupJid, config.antilink || 0, config.antispam || 0, config.welcome || 0, config.rules || '', antiDel]
        );
      } else if (this.dbInstance) {
        this.dbInstance.run(
          'INSERT OR REPLACE INTO group_configs (group_jid, antilink, antispam, welcome, rules, anti_delete) VALUES (?, ?, ?, ?, ?, ?)',
          [groupJid, config.antilink || 0, config.antispam || 0, config.welcome || 0, config.rules || '', antiDel]
        );
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao atualizar config do grupo ${groupJid}:`, err);
    }
  }

  // --- LEMBRETES ---
  async addReminder(userJid, chatJid, targetTime, message) {
    const reminder = {
      id: Date.now(),
      user_jid: userJid,
      chat_jid: chatJid,
      target_time: Number(targetTime),
      message
    };
    this.memoryStore.reminders.push(reminder);

    try {
      if (this.isPg) {
        await this.pgClient.query(
          'INSERT INTO reminders (id, user_jid, chat_jid, target_time, message) VALUES ($1, $2, $3, $4, $5)',
          [reminder.id, userJid, chatJid, reminder.target_time, message]
        );
      } else if (this.dbInstance) {
        this.dbInstance.run(
          'INSERT INTO reminders (id, user_jid, chat_jid, target_time, message) VALUES (?, ?, ?, ?, ?)',
          [reminder.id, userJid, chatJid, reminder.target_time, message]
        );
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao salvar lembrete ${reminder.id}:`, err);
    }

    return reminder;
  }

  getPendingReminders() {
    const now = Date.now();
    return this.memoryStore.reminders.filter(r => r.target_time <= now);
  }

  async deleteReminder(id) {
    const numId = Number(id);
    this.memoryStore.reminders = this.memoryStore.reminders.filter(r => Number(r.id) !== numId);

    try {
      if (this.isPg) {
        await this.pgClient.query('DELETE FROM reminders WHERE id = $1', [numId]);
      } else if (this.dbInstance) {
        this.dbInstance.run('DELETE FROM reminders WHERE id = ?', [numId]);
        this.persistSqliteFile();
      }
    } catch (err) {
      this.logErr(`Erro ao deletar lembrete ${id}:`, err);
    }
  }

  // --- OPERAÇÕES ATÔMICAS DE ECONOMIA ---
  async deductWalletAtomic(jid, amount) {
    const numAmount = sanitizeMoney(amount);
    if (!jid || numAmount <= 0) return false;

    const user = this.getUser(jid);
    if (!user || user.wallet < numAmount) return false;

    if (this.isPg) {
      try {
        const res = await this.pgClient.query(
          'UPDATE users SET wallet = wallet - $1, updated_at = NOW() WHERE jid = $2 AND wallet >= $1 RETURNING wallet',
          [numAmount, jid]
        );
        if (res.rowCount === 0) return false;
        user.wallet = Number(res.rows[0].wallet);
        return true;
      } catch (err) {
        this.logErr(`Erro no deductWalletAtomic (PG) para ${jid}:`, err);
        return false;
      }
    } else if (this.dbInstance) {
      try {
        this.dbInstance.run('BEGIN TRANSACTION');
        const checkRes = this.dbInstance.exec(`SELECT wallet FROM users WHERE jid = '${jid}'`);
        const currentW = (checkRes.length > 0 && checkRes[0].values.length > 0) ? Number(checkRes[0].values[0][0]) : 0;
        if (currentW < numAmount) {
          this.dbInstance.run('ROLLBACK');
          return false;
        }
        const newW = currentW - numAmount;
        this.dbInstance.run(`UPDATE users SET wallet = ${newW} WHERE jid = '${jid}'`);
        this.dbInstance.run('COMMIT');
        user.wallet = newW;
        this.persistSqliteFile();
        return true;
      } catch (err) {
        try { this.dbInstance.run('ROLLBACK'); } catch (_) {}
        this.logErr(`Erro no deductWalletAtomic (SQLite) para ${jid}:`, err);
        return false;
      }
    } else {
      if (user.wallet < numAmount) return false;
      user.wallet -= numAmount;
      return true;
    }
  }

  async addWalletAtomic(jid, amount) {
    const numAmount = sanitizeMoney(amount);
    if (!jid || numAmount <= 0) return this.getUser(jid);

    const user = this.getUser(jid);
    if (!user) return null;

    const limitCheck = checkEconomicLimit(user.wallet, numAmount, ECONOMIC_LIMITS.MAX_WALLET, jid, 'wallet');
    if (!limitCheck.allowed || limitCheck.maxAddable <= 0) {
      return user;
    }

    const addVal = limitCheck.maxAddable;
    if (this.isPg) {
      try {
        const res = await this.pgClient.query(
          'UPDATE users SET wallet = LEAST(wallet + $1, $3::bigint), updated_at = NOW() WHERE jid = $2 RETURNING wallet',
          [addVal, jid, ECONOMIC_LIMITS.MAX_WALLET]
        );
        if (res.rows.length > 0) {
          user.wallet = Number(res.rows[0].wallet);
        }
      } catch (err) {
        this.logErr(`Erro no addWalletAtomic (PG) para ${jid}:`, err);
        user.wallet += addVal;
      }
    } else if (this.dbInstance) {
      try {
        const newW = Math.min(ECONOMIC_LIMITS.MAX_WALLET, (Number(user.wallet) || 0) + addVal);
        this.dbInstance.run(`UPDATE users SET wallet = ${newW} WHERE jid = '${jid}'`);
        user.wallet = newW;
        this.persistSqliteFile();
      } catch (err) {
        this.logErr(`Erro no addWalletAtomic (SQLite) para ${jid}:`, err);
        user.wallet += addVal;
      }
    } else {
      user.wallet = Math.min(ECONOMIC_LIMITS.MAX_WALLET, (Number(user.wallet) || 0) + addVal);
    }
    return user;
  }

  async addXPAtomic(jid, amount) {
    const numAmount = sanitizeXP(amount);
    if (!jid || numAmount <= 0) return this.getUser(jid);

    const user = this.getUser(jid);
    if (!user) return null;

    const limitCheck = checkEconomicLimit(user.xp, numAmount, ECONOMIC_LIMITS.MAX_XP, jid, 'xp');
    if (!limitCheck.allowed || limitCheck.maxAddable <= 0) {
      return user;
    }

    const addVal = limitCheck.maxAddable;
    const newXP = (Number(user.xp) || 0) + addVal;
    const newLevel = Math.floor(Math.sqrt(newXP / 50)) + 1;

    user.xp = newXP;
    user.level = Math.max(Number(user.level || 1), newLevel);

    await this.persistUser(user);
    return user;
  }

  async addAuraAtomic(jid, amount) {
    const numAmount = sanitizeAura(amount);
    if (!jid || numAmount <= 0) return this.getUser(jid);

    const user = this.getUser(jid);
    if (!user) return null;

    const limitCheck = checkEconomicLimit(user.aura, numAmount, ECONOMIC_LIMITS.MAX_AURA, jid, 'aura');
    if (!limitCheck.allowed || limitCheck.maxAddable <= 0) {
      return user;
    }

    const addVal = limitCheck.maxAddable;
    user.aura = (Number(user.aura) || 0) + addVal;

    await this.persistUser(user);
    return user;
  }

  // --- TRANSAÇÕES FINANCEIRAS ATÔMICAS ---
  async transferMoney(senderJid, targetJid, amount) {
    const numAmount = sanitizeMoney(amount);
    if (!senderJid || !targetJid || numAmount <= 0) {
      throw new Error('Parâmetros de transferência inválidos.');
    }
    if (senderJid === targetJid) {
      throw new Error('Não é possível transferir para si mesmo.');
    }

    const senderUser = this.getUser(senderJid);
    const targetUser = this.getUser(targetJid);

    if (!senderUser || (senderUser.wallet || 0) < numAmount) {
      throw new Error('Saldo insuficiente.');
    }

    const limitCheck = checkEconomicLimit(targetUser.wallet, numAmount, ECONOMIC_LIMITS.MAX_WALLET, targetJid, 'wallet (transferência)');
    if (!limitCheck.allowed || limitCheck.maxAddable <= 0) {
      throw new Error('O destinatário já atingiu o limite máximo de moedas.');
    }

    const actualTransfer = limitCheck.maxAddable;
    const newSenderWallet = senderUser.wallet - numAmount;
    const newTargetWallet = targetUser.wallet + actualTransfer;

    if (this.isPg) {
      try {
        await this.pgClient.query('BEGIN');
        const resSender = await this.pgClient.query(
          'UPDATE users SET wallet = wallet - $1, updated_at = NOW() WHERE jid = $2 AND wallet >= $1 RETURNING wallet',
          [numAmount, senderJid]
        );
        if (resSender.rowCount === 0) {
          await this.pgClient.query('ROLLBACK');
          throw new Error('Saldo insuficiente na operação atômica.');
        }
        await this.pgClient.query(
          'UPDATE users SET wallet = LEAST(wallet + $1, $3::bigint), updated_at = NOW() WHERE jid = $2',
          [actualTransfer, targetJid, ECONOMIC_LIMITS.MAX_WALLET]
        );
        await this.pgClient.query('COMMIT');

        senderUser.wallet = Number(resSender.rows[0].wallet);
        targetUser.wallet = newTargetWallet;
        return true;
      } catch (err) {
        await this.pgClient.query('ROLLBACK').catch(() => {});
        this.logErr('Erro na transação de transferência (PostgreSQL):', err);
        throw err;
      }
    } else if (this.dbInstance) {
      try {
        this.dbInstance.run('BEGIN TRANSACTION');
        this.dbInstance.run('UPDATE users SET wallet = wallet - ? WHERE jid = ?', [numAmount, senderJid]);
        this.dbInstance.run('UPDATE users SET wallet = wallet + ? WHERE jid = ?', [actualTransfer, targetJid]);
        this.dbInstance.run('COMMIT');

        senderUser.wallet = newSenderWallet;
        targetUser.wallet = newTargetWallet;
        this.persistSqliteFile();
        return true;
      } catch (err) {
        try { this.dbInstance.run('ROLLBACK'); } catch (_) {}
        this.logErr('Erro na transação de transferência (SQLite):', err);
        throw err;
      }
    } else {
      senderUser.wallet = newSenderWallet;
      targetUser.wallet = newTargetWallet;
      return true;
    }
  }

  async persistBirthday(b) {
    if (!b || !b.user_jid) return;
    if (this.isPg) {
      try {
        await this.pgClient.query(
          `INSERT INTO birthdays (user_jid, birthday_date, day, month, year, notification_year, chat_jid, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (user_jid) DO UPDATE SET
             birthday_date = $2, day = $3, month = $4, year = $5, notification_year = $6, chat_jid = $7, updated_at = NOW()`,
          [b.user_jid, b.birthday_date, b.day, b.month, b.year, b.notification_year || 0, b.chat_jid || '']
        );
      } catch (err) {
        this.logErr(`Erro ao persistir aniversário de ${b.user_jid} no PG:`, err);
      }
    } else if (this.dbInstance) {
      try {
        this.dbInstance.run(
          `INSERT OR REPLACE INTO birthdays (user_jid, birthday_date, day, month, year, notification_year, chat_jid, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [b.user_jid, b.birthday_date, b.day, b.month, b.year, b.notification_year || 0, b.chat_jid || '']
        );
        this.persistSqliteFile();
      } catch (err) {
        this.logErr(`Erro ao persistir aniversário de ${b.user_jid} no SQLite:`, err);
      }
    }
  }

  // --- BANCO COMPATÍVEL / GETTER DA INSTÂNCIA ---
  getDatabase() {
    return this.memoryStore;
  }
}

export const databaseManager = new DatabaseManager();
export default databaseManager;
