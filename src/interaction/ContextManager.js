/**
 * ContextManager.js
 * Coleta o contexto completo da conversa (grupo, usuário, data/hora, memória contínua)
 * e gerencia o aprendizado e persistência de fatos sobre os usuários no banco de dados.
 */

import fs from 'fs';
import path from 'path';
import { conversationMemory } from './ConversationMemory.js';
import { getUser, updateUser } from '../database/sqlite.js';
import { FACTS_PATH } from '../config/paths.js';

const FACTS_FILE = FACTS_PATH;

// Memória local em arquivo JSON para persistência de fatos rápidos
let userFactsStore = {};

function loadUserFacts() {
  try {
    if (fs.existsSync(FACTS_FILE)) {
      const data = fs.readFileSync(FACTS_FILE, 'utf-8');
      userFactsStore = JSON.parse(data);
    }
  } catch (err) {
    console.error('Erro ao carregar fatos de usuários:', err.message);
  }
}

function saveUserFacts() {
  try {
    fs.writeFileSync(FACTS_FILE, JSON.stringify(userFactsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar fatos de usuários:', err.message);
  }
}

loadUserFacts();

export class ContextManager {
  /**
   * Obtém os fatos e memórias de longo prazo registrados sobre o usuário
   * @param {string} userJid JID do usuário
   * @returns {Array<string>} Lista de fatos conhecidos
   */
  static getUserFacts(userJid) {
    if (!userJid) return [];

    const fileFacts = userFactsStore[userJid] || [];

    // Busca memórias salvas no perfil do banco de dados (SQLite/Supabase)
    let dbMemories = [];
    try {
      const u = getUser(userJid);
      if (u) {
        const extra = typeof u.extra_data === 'string' ? JSON.parse(u.extra_data || '{}') : (u.extra_data || {});
        if (Array.isArray(extra.ai_memory)) {
          dbMemories = extra.ai_memory;
        }
      }
    } catch (_) {}

    return [...new Set([...dbMemories, ...fileFacts])];
  }

  /**
   * Adiciona um novo fato sobre um usuário no banco e no store
   * @param {string} userJid JID do usuário
   * @param {string} fact Fato a ser guardado
   */
  static addUserFact(userJid, fact) {
    if (!userJid || !fact || !fact.trim()) return;

    const cleanedFact = fact.trim();
    if (!userFactsStore[userJid]) {
      userFactsStore[userJid] = [];
    }

    if (!userFactsStore[userJid].includes(cleanedFact)) {
      userFactsStore[userJid].push(cleanedFact);
      if (userFactsStore[userJid].length > 15) {
        userFactsStore[userJid].shift();
      }
      saveUserFacts();
    }

    // Persiste também no SQLite / Supabase do usuário
    try {
      const u = getUser(userJid);
      if (u) {
        const extra = typeof u.extra_data === 'string' ? JSON.parse(u.extra_data || '{}') : (u.extra_data || {});
        if (!extra.ai_memory) extra.ai_memory = [];
        if (!extra.ai_memory.includes(cleanedFact)) {
          extra.ai_memory.push(cleanedFact);
          if (extra.ai_memory.length > 20) extra.ai_memory.shift();
          updateUser(userJid, { extra_data: JSON.stringify(extra) });
        }
      }
    } catch (err) {
      console.error('Erro ao persistir memória no banco:', err.message);
    }
  }

  /**
   * Tenta detectar aprendizado automático a partir do texto do usuário
   * @param {string} userJid JID do usuário
   * @param {string} text Texto da mensagem
   */
  static detectAndLearnFact(userJid, text) {
    if (!text || text.length < 5) return;

    const lower = text.toLowerCase();

    // Padrões de fatos pessoais comuns
    const patterns = [
      { regex: /meu anivers[aá]rio [eé]\s+(dia\s+)?([^\.\,\n]+)/i, template: (m) => `Aniversário: ${m[2].trim()}` },
      { regex: /(fa[cç]o|fa[cç]a)\s+anivers[aá]rio\s+(dia\s+)?([^\.\,\n]+)/i, template: (m) => `Aniversário: ${m[3].trim()}` },
      { regex: /meu nome [eé]\s+([^\.\,\n]+)/i, template: (m) => `Nome: ${m[1].trim()}` },
      { regex: /me chamo\s+([^\.\,\n]+)/i, template: (m) => `Nome: ${m[1].trim()}` },
      { regex: /moro em\s+([^\.\,\n]+)/i, template: (m) => `Mora em: ${m[1].trim()}` },
      { regex: /sou de\s+([^\.\,\n]+)/i, template: (m) => `Origem: ${m[1].trim()}` },
      { regex: /gosto de\s+([^\.\,\n]+)/i, template: (m) => `Gosta de: ${m[1].trim()}` },
      { regex: /meu prato favorito [eé]\s+([^\.\,\n]+)/i, template: (m) => `Comida favorita: ${m[1].trim()}` },
      { regex: /minha comida favorita [eé]\s+([^\.\,\n]+)/i, template: (m) => `Comida favorita: ${m[1].trim()}` },
      { regex: /meu time [eé]\s+(o\s+)?([^\.\,\n]+)/i, template: (m) => `Time do coração: ${m[2].trim()}` },
      { regex: /(amanh[aã]|hoje|semana que vem)\s+tenho\s+([^\.\,\n]+)/i, template: (m) => `Compromisso/Evento: ${m[1]} tem ${m[2].trim()}` }
    ];

    for (const p of patterns) {
      const match = lower.match(p.regex);
      if (match) {
        const fact = p.template(match);
        this.addUserFact(userJid, fact);
        break;
      }
    }
  }

  /**
   * Constrói o contexto completo do ambiente e histórico
   * @param {Object} sock Instância do Baileys
   * @param {Object} msg Objeto da mensagem Baileys
   * @param {string} groupName Nome do grupo (opcional)
   * @returns {Object} Dados completos de contexto
   */
  static async buildContext(sock, msg, groupName = null) {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || msg.key.remoteJid;
    const userName = msg.pushName || sender.split('@')[0];

    let finalGroupName = groupName;
    if (isGroup && !finalGroupName) {
      try {
        const metadata = await sock.groupMetadata(from).catch(() => null);
        finalGroupName = metadata?.subject || 'Grupo do WhatsApp';
      } catch (_) {
        finalGroupName = 'Grupo do WhatsApp';
      }
    } else if (!isGroup) {
      finalGroupName = 'Conversa Privada (PV)';
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const timeContext = `${formattedDate} às ${formattedTime}`;
    const formattedHistory = conversationMemory.getFormattedHistory(from);
    const userFacts = this.getUserFacts(sender);

    // Obtém personagem ativa configurada pelo usuário (padrão: 'nino')
    let activeQuintuplet = 'nino';
    try {
      const u = getUser(sender);
      if (u) {
        const extra = typeof u.extra_data === 'string' ? JSON.parse(u.extra_data || '{}') : (u.extra_data || {});
        if (extra.quintuplet) activeQuintuplet = extra.quintuplet;
      }
    } catch (_) {}

    return {
      chatJid: from,
      isGroup,
      sender,
      userName,
      groupName: finalGroupName,
      timeContext,
      history: formattedHistory,
      userFacts,
      activeQuintuplet
    };
  }
}
