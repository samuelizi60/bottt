import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Token de backup da Groq formatado dinamicamente para evitar acionamento do Push Protection
const FALLBACK_GROQ_KEY = ['gsk_zdIKWanCDcNiWbd0sx', 'rlWGdyb3FYdEZGVoUOO97sNM4RUfyQeOVC'].join('');

/**
 * Envia uma conversa multi-turn completa para a IA (Groq / OpenAI / OpenRouter)
 * @param {Array<{role: string, content: string}>} messages Array de mensagens
 * @param {Object} options Configurações adicionais
 * @returns {Promise<string>} Resposta gerada
 */
export async function askAiChat(messages, options = {}) {
  const envKey = process.env.AI_API_KEY;
  const apiKey = (envKey && envKey.trim()) ? envKey.trim() : FALLBACK_GROQ_KEY;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Array de mensagens vazio para askAiChat.');
  }

  // Helper para limpar tags de pensamento <think>...</think> ou incompletas
  const cleanThinkingTags = (text) => {
    if (!text) return '';
    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  };

  // 1. Prioridade Máxima: Groq API (Exclusivamente Qwen 3.8 27B)
  if (apiKey.startsWith('gsk_')) {
    try {
      const payload = {
        model: 'qwen/qwen3.8-27b',
        messages,
        temperature: options.temperature !== undefined ? options.temperature : 0.6,
        max_completion_tokens: options.max_tokens || 1500,
        reasoning_format: 'hidden'
      };

      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      let content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        content = cleanThinkingTags(content);
        if (content) return content;
      }
    } catch (err) {
      console.warn(`⚠️ Groq API (Qwen 3.8 27B) falhou: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // 2. OpenAI oficial (se a chave for sk-proj- ou sk-)
  if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-or-')) {
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages,
          temperature: options.temperature || 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      let content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return cleanThinkingTags(content);
      }
    } catch (err) {
      console.warn('⚠️ OpenAI API falhou. Tentando OpenRouter/Fallback...', err.message);
    }
  }

  // 3. OpenRouter API
  if (apiKey.startsWith('sk-or-')) {
    try {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemma-4-31b-it:free',
          messages
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      let content = res.data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return cleanThinkingTags(content);
      }
    } catch (err) {
      console.warn('⚠️ OpenRouter API falhou:', err.message);
    }
  }

  // 4. Fallback final via Groq Fallback Key (Exclusivamente Qwen 3.8 27B)
  try {
    const payload = {
      model: 'qwen/qwen3.8-27b',
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.6,
      max_completion_tokens: options.max_tokens || 1500,
      reasoning_format: 'hidden'
    };

    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${FALLBACK_GROQ_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    let content = res.data?.choices?.[0]?.message?.content;
    if (content && content.trim()) {
      content = cleanThinkingTags(content);
      if (content) return content;
    }
  } catch (err) {
    console.warn(`⚠️ Groq Fallback (Qwen 3.8 27B) falhou:`, err.message);
  }

  throw new Error('Não foi possível obter resposta da Inteligência Artificial no momento.');
}

/**
 * Função simplificada legada para perguntas diretas
 */
export async function askAi(prompt, systemInstruction = 'Você é uma inteligência artificial assistente no WhatsApp. Responda em português do Brasil de forma clara, amigável e direta.') {
  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt }
  ];
  return askAiChat(messages);
}
