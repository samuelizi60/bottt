/**
 * AutoReply.js
 * Gerencia a lógica de respostas automáticas, menções, respostas a mensagens do bot
 * e diálogos diretos com as 5 irmãs Nakano no privado e grupos.
 * 
 * NOTA: Respostas espontâneas/intromissivas (ex: risadas aleatórias "kkk perdi tudo")
 * foram 100% removidas para evitar poluição e incômodo nos grupos.
 */

import { conversationMemory } from './ConversationMemory.js';
import { ContextManager } from './ContextManager.js';
import { AIService } from './AIService.js';
import { PersonalityManager, QUINTUPLETS } from './PersonalityManager.js';

export class AutoReply {
  /**
   * Processa uma mensagem não-comando e decide se o bot deve responder.
   * @param {Object} sock Instância do Baileys
   * @param {Object} msg Objeto da mensagem Baileys
   * @param {string} text Texto limpo da mensagem
   * @returns {Promise<boolean>} True se respondeu, false caso contrário
   */
  static async processMessage(sock, msg, text) {
    if (!text || !text.trim()) return false;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || msg.key.remoteJid;
    const userName = msg.pushName || sender.split('@')[0];

    // Registra a mensagem no aprendizado de fatos
    ContextManager.detectAndLearnFact(sender, text);

    // Registra no histórico do grupo/chat para contexto quando for chamado
    conversationMemory.addMessage(from, {
      id: msg.key.id,
      sender,
      senderName: userName,
      text,
      timestamp: msg.messageTimestamp,
      isBot: false
    });

    // Identificar JID do Bot
    const rawBotId = sock.user?.id || '';
    const botNum = rawBotId.split(':')[0].split('@')[0];
    const botJid = botNum ? `${botNum}@s.whatsapp.net` : '';

    // Contexto de citação/menção
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                        msg.message?.imageMessage?.contextInfo ||
                        msg.message?.videoMessage?.contextInfo;

    const mentionedJids = contextInfo?.mentionedJid || [];
    const quotedParticipant = contextInfo?.participant || '';

    // 1. Verificação de Menção ao Bot ou a uma das 5 Irmãs Nakano
    const isMentionedByName = /@(whatsappautomationbot|automationbot|quintupletsbot)/i.test(text);
    const isMentionedByJid = botJid && mentionedJids.includes(botJid);
    const isQuintupletMentioned = !!PersonalityManager.detectMentionedQuintuplet(text);
    const isMentioned = isMentionedByName || isMentionedByJid || (isGroup && isQuintupletMentioned);

    // 2. Verificação se estão respondendo (citando) uma mensagem do Bot
    const isReplyingToBot = quotedParticipant && botJid && (
      quotedParticipant === botJid ||
      quotedParticipant.split('@')[0] === botNum
    );

    // O bot NÃO responderá automaticamente no privado (PV) a mensagens comuns como "oi" ou qualquer outro texto.
    // Responderá apenas em grupos quando for mencionado ou citado diretamente.
    if (isGroup && (isMentioned || isReplyingToBot)) {
      // Remove a tag do bot do prompt para não poluir
      const cleanPrompt = text.replace(/@(whatsappautomationbot|automationbot|quintupletsbot)/gi, '').trim() || 'Olá!';

      await sock.sendPresenceUpdate?.('composing', from).catch(() => {});

      const context = await ContextManager.buildContext(sock, msg);
      const replyText = await AIService.generateReply(context, cleanPrompt);

      if (replyText) {
        const sentMsg = await sock.sendMessage(from, { text: replyText }, { quoted: msg });

        const detectedChar = PersonalityManager.detectMentionedQuintuplet(text) || context.activeQuintuplet || 'nino';
        const charName = QUINTUPLETS[detectedChar]?.name || 'Nino Nakano';

        // Salva a resposta do bot na memória da conversa com o nome da respectiva irmã
        if (sentMsg) {
          conversationMemory.addMessage(from, {
            id: sentMsg.key.id,
            sender: botJid,
            senderName: charName,
            text: replyText,
            timestamp: Math.floor(Date.now() / 1000),
            isBot: true
          });
        }
        return true;
      }
    }

    // Não responde mensagens aleatórias de PV ou de grupo
    return false;
  }
}
