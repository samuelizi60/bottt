/**
 * ConversationMemory.js
 * Gerencia a memória de conversas em segundo plano por grupo/chat.
 */

class ConversationMemory {
  constructor(limit = 30) {
    this.limit = limit;
    // Estrutura: { [chatJid]: Array<MessageEntry> }
    this.memory = new Map();
  }

  /**
   * Adiciona uma mensagem ao histórico do chat
   * @param {string} chatJid JID do grupo/chat
   * @param {Object} msgData Dados simplificados da mensagem
   */
  addMessage(chatJid, { id, sender, senderName, text, timestamp, isBot = false }) {
    if (!chatJid || !text || !text.trim()) return;

    if (!this.memory.has(chatJid)) {
      this.memory.set(chatJid, []);
    }

    const history = this.memory.get(chatJid);

    // Evita duplicatas pelo ID da mensagem
    if (id && history.some(m => m.id === id)) return;

    const timeString = new Date(timestamp ? timestamp * 1000 : Date.now()).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    history.push({
      id: id || Date.now().toString(),
      sender: sender || 'desconhecido',
      senderName: senderName || (isBot ? 'WhatsApp Automation Bot' : 'Membro'),
      text: text.trim(),
      timeString,
      isBot
    });

    // Mantém o tamanho do histórico dentro do limite
    if (history.length > this.limit) {
      history.shift();
    }
  }

  /**
   * Obtém o histórico no formato multi-turn ideal para APIs de LLM
   * [ { role: 'system', content: ... }, { role: 'user', content: ... }, { role: 'assistant', content: ... }, ... ]
   * @param {string} chatJid JID da conversa
   * @param {string} systemInstruction Instrução de sistema
   * @param {string} currentPrompt Prompt da mensagem atual
   * @param {number} maxTurns Máximo de mensagens anteriores
   * @returns {Array<{role: string, content: string}>}
   */
  getMultiTurnMessages(chatJid, systemInstruction, currentPrompt, maxTurns = 12) {
    const rawHistory = this.memory.get(chatJid) || [];
    const recent = rawHistory.slice(-maxTurns);

    const messages = [
      { role: 'system', content: systemInstruction }
    ];

    for (const msg of recent) {
      if (msg.isBot) {
        messages.push({
          role: 'assistant',
          content: msg.text
        });
      } else {
        // Se for grupo, inclui o nome de quem falou
        const prefix = chatJid.endsWith('@g.us') ? `[${msg.senderName}]: ` : '';
        messages.push({
          role: 'user',
          content: `${prefix}${msg.text}`
        });
      }
    }

    // Adiciona a mensagem atual se não for repetida
    if (currentPrompt && (messages.length === 1 || messages[messages.length - 1].content !== currentPrompt)) {
      messages.push({
        role: 'user',
        content: currentPrompt
      });
    }

    return messages;
  }

  /**
   * Obtém o histórico recente formatado como string para a IA
   * @param {string} chatJid JID do grupo/chat
   * @returns {string} Histórico formatado
   */
  getFormattedHistory(chatJid) {
    const history = this.memory.get(chatJid) || [];
    if (history.length === 0) return 'Nenhuma mensagem recente no histórico.';

    return history
      .map(m => `[${m.timeString}] ${m.senderName}: ${m.text}`)
      .join('\n');
  }

  /**
   * Obtém os objetos brutos do histórico recente
   * @param {string} chatJid JID do grupo/chat
   * @returns {Array} Mensagens recentes
   */
  getRawHistory(chatJid) {
    return this.memory.get(chatJid) || [];
  }

  /**
   * Limpa o histórico de um grupo específico
   * @param {string} chatJid JID do chat
   */
  clearHistory(chatJid) {
    this.memory.delete(chatJid);
  }
}

export const conversationMemory = new ConversationMemory();
