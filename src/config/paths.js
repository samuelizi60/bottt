import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
// src/config/paths.js -> raiz do projeto = dois níveis acima
export const PROJECT_ROOT = path.resolve(path.dirname(__filename), '../..');

// Diretório persistente de dados. No Railway, crie um Volume montado em
// /data e defina a variável DATA_DIR=/data. Localmente (sem a variável),
// usa a raiz do projeto e nada muda.
function resolveDataDir() {
  const env = (process.env.DATA_DIR || '').trim();
  if (!env) return PROJECT_ROOT;
  return path.isAbsolute(env) ? path.normalize(env) : path.resolve(PROJECT_ROOT, env);
}

export const DATA_DIR = resolveDataDir();
export const IS_PERSISTENT = DATA_DIR !== PROJECT_ROOT;

const DATA_FILES = ['bot_data.sqlite', 'bot_data.json', 'database.json', 'user_facts.json', 'cookies.txt'];
const DATA_DIRS = ['session', 'backups'];

export function dataPath(name) {
  return path.join(DATA_DIR, name);
}

export const DB_PATH = dataPath('bot_data.sqlite');
export const LEGACY_JSON_PATH = dataPath('database.json');
export const BOT_DATA_JSON_PATH = dataPath('bot_data.json');
export const FACTS_PATH = dataPath('user_facts.json');
export const COOKIES_PATH = dataPath('cookies.txt');
export const SESSION_DIR = dataPath('session');
export const BACKUPS_DIR = dataPath('backups');

// Garante o diretório de dados e migra arquivos existentes do deploy
// anterior (primeira subida com volume começa com o disco vazio).
export function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const d of DATA_DIRS) {
      fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });
    }
    if (!IS_PERSISTENT) return;

    for (const f of DATA_FILES) {
      const dest = path.join(DATA_DIR, f);
      const src = path.join(PROJECT_ROOT, f);
      if (src !== dest && !fs.existsSync(dest) && fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, dest);
          console.log(`[dados] 📦 Migrado ${f} para o volume persistente.`);
        } catch (err) {
          console.warn(`[dados] ⚠️ Falha ao migrar ${f}: ${err.message}`);
        }
      }
    }

    for (const d of DATA_DIRS) {
      const dest = path.join(DATA_DIR, d);
      const src = path.join(PROJECT_ROOT, d);
      const marker = path.join(dest, '.migrated');
      if (src !== dest && fs.existsSync(src) && !fs.existsSync(marker)) {
        try {
          if (fs.readdirSync(dest).filter((e) => e !== '.migrated').length === 0) {
            for (const entry of fs.readdirSync(src)) {
              fs.cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
            }
            console.log(`[dados] 📦 Migrada pasta ${d}/ para o volume persistente.`);
          }
          fs.writeFileSync(marker, '1');
        } catch (err) {
          console.warn(`[dados] ⚠️ Falha ao migrar pasta ${d}/: ${err.message}`);
        }
      }
    }

    console.log(`[dados] 💾 Diretório persistente ativo: ${DATA_DIR}`);
  } catch (err) {
    console.warn(`[dados] ⚠️ Não foi possível preparar ${DATA_DIR}, usando raiz do projeto: ${err.message}`);
  }
}
