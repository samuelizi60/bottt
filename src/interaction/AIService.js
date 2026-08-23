/**
 * AIService.js
 * Módulo de interação com a Inteligência Artificial para o WhatsApp Automation Bot.
 * Suporta diálogo multi-turn contínuo e personalidades das 5 irmãs Nakano.
 */

import { askAiChat } from '../utils/aiService.js';
import { PersonalityManager, QUINTUPLETS } from './PersonalityManager.js';
import { conversationMemory } from './ConversationMemory.js';

export class AIService {
  /**
   * Gera uma resposta contextualizada e inteligente para a conversa com memória real
   * @param {Object} context Objeto retornado pelo ContextManager.buildContext
   * @param {string} userPrompt Mensagem enviada pelo usuário
   * @returns {Promise<string>} Resposta gerada pela IA
   */
  static async generateReply(context, userPrompt) {
    try {
      // 1. Identificar qual das irmãs deve responder
      // Prioridade: Menção explícita no texto > Personagem ativa do usuário > 'nino'
      const detectedQuintuplet = PersonalityManager.detectMentionedQuintuplet(userPrompt);
      const activeCharId = detectedQuintuplet || context.activeQuintuplet || 'nino';
      const charInfo = QUINTUPLETS[activeCharId] || QUINTUPLETS.nino;

      // 2. Monta instrução de sistema rica com memórias de longo prazo
      const systemInstruction = PersonalityManager.getSystemInstruction({
        quintupletId: activeCharId,
        groupName: context.groupName,
        userName: context.userName,
        userFacts: context.userFacts
      });

      // 3. Monta histórico estruturado multi-turn para a LLM (memória de curto prazo)
      const messages = conversationMemory.getMultiTurnMessages(
        context.chatJid,
        systemInstruction,
        userPrompt,
        14 // Últimas 14 interações
      );

      // 4. Executa chamada de inferência
      const response = await askAiChat(messages, { temperature: 0.75 });

      if (!response) {
        return `${charInfo.nickname}: Tive um pequeno lapso aqui... O que você estava dizendo?`;
      }

      // 5. Limpa possíveis prefixos robóticos
      let cleaned = response
        .replace(new RegExp(`^${charInfo.nickname}:\\s*`, 'i'), '')
        .replace(new RegExp(`^\\[${charInfo.nickname}\\]:\\s*`, 'i'), '')
        .replace(/^WhatsApp Automation Bot:\s*/i, '')
        .replace(/^\[WhatsApp Automation Bot\]:\s*/i, '')
        .replace(/^Quintuplets Bot:\s*/i, '')
        .replace(/^\[Quintuplets Bot\]:\s*/i, '')
        .replace(/^Bot:\s*/i, '')
        .trim();

      return cleaned;
    } catch (err) {
      console.error('Erro ao gerar resposta na IA de interação:', err.message);
      return null;
    }
  }
}
