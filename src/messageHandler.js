import path from 'path';
import fs from 'fs';
import { jidNormalizedUser, USyncQuery, USyncUser } from '@whiskeysockets/baileys';
import { handleSocialCommands } from './commands/social.js';
import { handleAdminCommands } from './commands/admin.js';
import { handleMediaCommands } from './commands/media.js';
import { getDatabase } from './database.js';
import { getUser, updateUser, getGroupConfig } from './database/sqlite.js';
import { formatUptime } from './utils/helpers.js';
import { calculateBonusRewards } from './utils/bonusCalculator.js';
import dotenv from 'dotenv';

// Importação dos Novos Módulos de Comandos
import { handleIaCommand } from './commands/ai/ia.js';
import { handleTraduzirCommand } from './commands/ai/traduzir.js';
import { handleResumirCommand } from './commands/ai/resumir.js';
import { handleExplicarCommand } from './commands/ai/explicar.js';

import { handleKickCommand } from './commands/admin_extra/kick.js';
import { handlePromoteCommand } from './commands/admin_extra/promote.js';
import { handleDemoteCommand } from './commands/admin_extra/demote.js';
import { handleTagallCommand } from './commands/admin_extra/tagall.js';
import { handleMuteCommand } from './commands/admin_extra/mute.js';
import { handleUnmuteCommand } from './commands/admin_extra/unmute.js';
import { handleAntilinkCommand } from './commands/admin_extra/antilink.js';
import { handleAntispamCommand } from './commands/admin_extra/antispam.js';
import { handleBoasvindasCommand } from './commands/admin_extra/boasvindas.js';
import { handleRegrasCommand } from './commands/admin_extra/regras.js';
import { handleWarnCommand } from './commands/admin_extra/warn.js';
import { handleWarningsCommand } from './commands/admin_extra/warnings.js';

import { handleBirthdayCommands, handleAniversariantesCommand } from './commands/birthday.js';
import { handleRebirthCommand, handleTopRebirthCommand } from './commands/rebirth.js';

import { handleShipCommand } from './commands/fun/ship.js';
import { handleEightBallCommand } from './commands/fun/eightball.js';
import { handleDadoCommand } from './commands/fun/dado.js';
import { handleCaraOuCoroaCommand } from './commands/fun/caraoucoroa.js';
import { handlePptCommand } from './commands/fun/ppt.js';
import { handleRoletaCommand } from './commands/fun/roleta.js';
import { handleQuizCommand, activeQuizGames, processQuizAnswer } from './commands/fun/quiz.js';
import { handleForcaCommand, activeForcaGames, processForcaGuess } from './commands/fun/forca.js';
import { handleTaroCommand } from './commands/fun/taro.js';

import { handleDailyCommand } from './commands/economy/daily.js';
import { handleSaldoCommand } from './commands/economy/saldo.js';
import { handleTrabalharCommand } from './commands/economy/trabalhar.js';
import { handleTransferirCommand } from './commands/economy/transferir.js';
import { handleLojaCommand, handleLojaRpgCommand } from './commands/economy/loja.js';
import { handleComprarCommand } from './commands/economy/comprar.js';
import { handleInventarioCommand } from './commands/economy/inventario.js';
import { handleRankingCommand } from './commands/economy/ranking.js';
import { handleAuraCommand, handleFarmarAuraCommand } from './commands/economy/aura.js';

import { handleLevelCommand } from './commands/xp/level.js';
import { handleRankCommand } from './commands/xp/rank.js';
import { handleTopCommand } from './commands/xp/top.js';

import { handleCepCommand } from './commands/utils_extra/cep.js';
import { handleClimaCommand } from './commands/utils_extra/clima.js';
import { handleCalculadoraCommand } from './commands/utils_extra/calculadora.js';
import { handleLembreteCommand } from './commands/utils_extra/lembrete.js';
import { handleQrcodeCommand } from './commands/utils_extra/qrcode.js';
import { handleReadqrCommand } from './commands/utils_extra/readqr.js';
import { handleTtsCommand } from './commands/utils_extra/tts.js';
import { handleOcrCommand } from './commands/utils_extra/ocr.js';

import { handlePingCommand } from './commands/info/ping.js';
import { handleUptimeCommand } from './commands/info/uptime.js';
import { handleInfoCommand } from './commands/info/info.js';
import { handleBotinfoCommand } from './commands/info/botinfo.js';
import { handleGrupoCommand } from './commands/info/grupo.js';

import { handleOwnerEconomyCommands, activeResetConfirmations } from './commands/owner_economy.js';

import { handleAiExtraCommands } from './commands/ai_extra.js';
import { handleBankMarketCommands } from './commands/bank_market.js';
import { handleKingdomCommands } from './commands/kingdom_system.js';
import { handleMinigamesCommands } from './commands/minigames.js';
import { handleRpgSystemCommands } from './commands/rpg_system.js';
import { handleGroupReputationCommands } from './commands/group_reputation.js';
import { handleMediaExtraCommands } from './commands/media_extra.js';
import { handleAiImageCommands } from './commands/ai_image.js';
import { handleVoiceSystemCommands } from './commands/voice_system.js';
import { handleProfilePrestigeCommands } from './commands/profile_prestige.js';
import { handleEventsSystemCommands } from './commands/events_system.js';
import { handleVipShopCommands } from './commands/vip_shop.js';
import { handleTradeCommands } from './commands/trade_system.js';

import queueManager from './queue/QueueManager.js';
import { handleQueueStatsCommand } from './commands/admin_extra/queueStats.js';

// Módulos do Sistema de Interação Inteligente
import { AutoReply } from './interaction/AutoReply.js';
import { conversationMemory } from './interaction/ConversationMemory.js';

dotenv.config();
const prefix = process.env.PREFIX || '/';

// Cache de mensagens em memória para Anti-Delete
const messageCache = {};
const CACHE_LIMIT = 500;

function cacheMessage(from, msg) {
  if (!from || !msg.key?.id || msg.key.fromMe) return;
  
  if (!messageCache[from]) {
    messageCache[from] = [];
  }

  if (msg.message) {
    messageCache[from].push({
      id: msg.key.id,
      sender: msg.key.participant || msg.key.remoteJid,
      message: JSON.parse(JSON.stringify(msg.message)),
      pushName: msg.pushName || 'Usuário',
      timestamp: msg.messageTimestamp
    });

    if (messageCache[from].length > CACHE_LIMIT) {
      messageCache[from].shift();
    }
  }
}

export async function handleMessages(rawSock, msg) {
  const rawFrom = msg.key?.remoteJid;
  if (!rawFrom || rawFrom === 'status@broadcast') return;

  const isGroup = rawFrom.endsWith('@g.us');
  let from = rawFrom;
  let sender = isGroup ? (msg.key.participant || rawFrom) : rawFrom;

  // Extrair JID de telefone real para WhatsApp Business / PV (@s.whatsapp.net ou @c.us)
  if (!isGroup) {
    const candidates = [
      rawFrom,
      msg.key?.participant,
      msg.key?.remoteJidAlt,
      msg.key?.participantAlt,
      msg.message?.extendedTextMessage?.contextInfo?.participant,
      msg.message?.extendedTextMessage?.contextInfo?.remoteJid
    ];
    let foundReal = null;
    for (const cand of candidates) {
      if (cand && typeof cand === 'string' && (cand.endsWith('@s.whatsapp.net') || cand.endsWith('@c.us'))) {
        foundReal = jidNormalizedUser(cand);
        break;
      }
    }
    if (foundReal) {
      from = foundReal;
      sender = foundReal;
    } else if (rawFrom.endsWith('@lid') && rawSock.executeUSyncQuery) {
      try {
        const usync = new USyncQuery()
          .withContactProtocol()
          .withUser(new USyncUser().withId(rawFrom));
        const res = await rawSock.executeUSyncQuery(usync);
        if (res?.list && res.list.length > 0) {
          const item = res.list[0];
          if (item?.id && (item.id.endsWith('@s.whatsapp.net') || item.id.endsWith('@c.us'))) {
            from = jidNormalizedUser(item.id);
            sender = from;
          } else if (item?.phone) {
            const cleanPhone = String(item.phone).replace(/[^0-9]/g, '');
            if (cleanPhone) {
              from = `${cleanPhone}@s.whatsapp.net`;
              sender = from;
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Falha ao resolver LID via USync:', err.message);
      }
    }

    if (!from || from.endsWith('@lid')) {
      from = jidNormalizedUser(rawFrom);
      sender = jidNormalizedUser(sender);
    }
  } else {
    sender = jidNormalizedUser(sender);
  }

  const sock = queueManager.wrapSocket(rawSock);

  // 1. Processar Anti-Delete Legado
  const protocolMsg = msg.message?.protocolMessage;
  if (protocolMsg && protocolMsg.type === 0) {
    const deletedId = protocolMsg.key.id;
    const db = getDatabase();
    
    const isAntiDelActive = isGroup && db.configGrupos[from]?.antiDelete === true;

    if (isAntiDelActive) {
      const cached = messageCache[from]?.find(m => m.id === deletedId);
      if (cached) {
        const senderName = cached.pushName;
        const senderJid = cached.sender;
        
        let textContent = '';
        let hasMedia = false;

        if (cached.message.conversation) {
          textContent = cached.message.conversation;
        } else if (cached.message.extendedTextMessage) {
          textContent = cached.message.extendedTextMessage.text;
        } else if (cached.message.imageMessage?.caption) {
          textContent = cached.message.imageMessage.caption;
          hasMedia = true;
        } else if (cached.message.videoMessage?.caption) {
          textContent = cached.message.videoMessage.caption;
          hasMedia = true;
        } else {
          hasMedia = true;
        }

        const header = `🗑️ *ANTI-DELETE DETECTADO* 🗑️\n\n` +
                       `• *Usuário:* @${senderJid.split('@')[0]} (${senderName})\n` +
                       `• *Horário:* ${new Date(cached.timestamp * 1000).toLocaleTimeString('pt-BR')}\n`;

        if (!hasMedia) {
          await sock.sendMessage(from, { 
            text: `${header}• *Mensagem deletada:* ${textContent}`,
            mentions: [senderJid]
          });
        } else {
          await sock.sendMessage(from, { 
            text: `${header}• *Mídia deletada abaixo:* ${textContent ? `"${textContent}"` : '(sem legenda)'}`,
            mentions: [senderJid]
          });
          
          try {
            await sock.sendMessage(from, { 
              forward: { 
                key: { remoteJid: from, id: cached.id, participant: senderJid }, 
                message: cached.message 
              } 
            });
          } catch (err) {
            console.error('Erro ao encaminhar mídia deletada:', err);
          }
        }
      }
    }
    return;
  }

  cacheMessage(from, msg);

  // Extrair texto da mensagem desempacotando todos os wrappers do Baileys e WhatsApp Business
  let messageObj = msg.message;
  while (messageObj) {
    if (messageObj.ephemeralMessage?.message) messageObj = messageObj.ephemeralMessage.message;
    else if (messageObj.viewOnceMessage?.message) messageObj = messageObj.viewOnceMessage.message;
    else if (messageObj.viewOnceMessageV2?.message) messageObj = messageObj.viewOnceMessageV2.message;
    else if (messageObj.viewOnceMessageV2Extension?.message) messageObj = messageObj.viewOnceMessageV2Extension.message;
    else if (messageObj.documentWithCaptionMessage?.message) messageObj = messageObj.documentWithCaptionMessage.message;
    else if (messageObj.deviceSentMessage?.message) messageObj = messageObj.deviceSentMessage.message;
    else if (messageObj.businessMessage?.message) messageObj = messageObj.businessMessage.message;
    else if (messageObj.botInvokeMessage?.message) messageObj = messageObj.botInvokeMessage.message;
    else if (messageObj.editedMessage?.message?.protocolMessage?.editedMessage) messageObj = messageObj.editedMessage.message.protocolMessage.editedMessage;
    else break;
  }

  let body = '';
  if (messageObj?.conversation) {
    body = messageObj.conversation;
  } else if (messageObj?.extendedTextMessage?.text) {
    body = messageObj.extendedTextMessage.text;
  } else if (messageObj?.imageMessage?.caption) {
    body = messageObj.imageMessage.caption;
  } else if (messageObj?.videoMessage?.caption) {
    body = messageObj.videoMessage.caption;
  } else if (messageObj?.documentMessage?.caption) {
    body = messageObj.documentMessage.caption;
  } else if (messageObj?.buttonsResponseMessage?.selectedButtonId) {
    body = messageObj.buttonsResponseMessage.selectedButtonId;
  } else if (messageObj?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    body = messageObj.listResponseMessage.singleSelectReply.selectedRowId;
  } else if (messageObj?.templateButtonReplyMessage?.selectedId) {
    body = messageObj.templateButtonReplyMessage.selectedId;
  } else if (messageObj?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const params = JSON.parse(messageObj.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      body = params.id || params.reference_id || '';
    } catch (_) {}
  } else if (messageObj?.interactiveMessage?.body?.text) {
    body = messageObj.interactiveMessage.body.text;
  }

  if (!isGroup) {
    console.log(`📩 [PV RECEBIDO] De: ${sender} | Texto: "${body}"`);
  }

  // Permitir comandos populares no privado mesmo se digitados sem a barra "/"
  if (!isGroup && body && !body.startsWith(prefix)) {
    const firstWord = body.toLowerCase().trim().split(/\s+/)[0];
    if (['menu', 'help', 'ajuda', 'loja', 'perfil', 'rank', 'level', 'saldo', 'reino', 'reinos', 'guerra', 'pets', 'pet'].includes(firstWord)) {
      body = prefix + body.trim();
    }
  }

  // Ignorar mensagens enviadas pelo próprio bot, a menos que sejam comandos iniciados pelo prefixo
  if (msg.key.fromMe && !body.startsWith(prefix)) return;

  // 1.5. Processar palpites dos jogos interativos (Forca e Quiz)
  if (body && !msg.key.fromMe) {
    const isMenu = body.toLowerCase().startsWith(prefix + 'menu');
    if (!isMenu) {
      if (activeForcaGames.has(from)) {
        const isForcaCmd = body.toLowerCase().startsWith(prefix + 'forca');
        const guess = isForcaCmd ? body.slice((prefix + 'forca').length).trim() : body.trim();
        if (guess) {
          const handled = await processForcaGuess(sock, msg, from, guess, sender);
          if (handled && !isForcaCmd) return;
        }
      }

      if (activeQuizGames.has(from)) {
        const isQuizCmd = body.toLowerCase().startsWith(prefix + 'quiz');
        const answer = isQuizCmd ? body.slice((prefix + 'quiz').length).trim() : body.trim();
        if (answer) {
          const handled = await processQuizAnswer(sock, msg, from, answer, sender);
          if (handled && !isQuizCmd) return;
        }
      }
    }
  }

  // 2. Anti-link Automático
  if (isGroup && body) {
    const groupCfg = getGroupConfig(from);
    if (groupCfg.antilink) {
      const hasLink = /(chat\.whatsapp\.com\/[A-Za-z0-9]|https?:\/\/[^\s]+)/i.test(body);
      if (hasLink) {
        try {
          const groupMetadata = await sock.groupMetadata(from);
          const isUserAdmin = groupMetadata.participants.find(p => p.id === sender)?.admin;
          if (!isUserAdmin) {
            await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
            await sock.sendMessage(from, { 
              text: `🚫 @${sender.split('@')[0]}, links não são permitidos neste grupo!`, 
              mentions: [sender] 
            });
            return;
          }
        } catch (_) {}
      }
    }
  }

  // 3. Sistema de XP Automático para mensagens que não são comandos
  if (sender && !body.startsWith(prefix)) {
    const xpCooldowns = global.xpCooldowns || (global.xpCooldowns = new Map());
    const lastXpTime = xpCooldowns.get(sender) || 0;
    if (Date.now() - lastXpTime > 60000) { // Cooldown de 1 minuto
      xpCooldowns.set(sender, Date.now());
      const userObj = getUser(sender);
      const baseEarnedXp = Math.floor(Math.random() * 15) + 10;
      const { finalXp: earnedXp } = calculateBonusRewards(userObj, 0, baseEarnedXp, 'chat');

      const newXp = userObj.xp + earnedXp;
      const nextLevelXp = Math.pow(userObj.level, 2) * 50;
      let newLevel = userObj.level;

      if (newXp >= nextLevelXp) {
        newLevel += 1;
        await sock.sendMessage(from, { 
          text: `🎉 Parabéns @${sender.split('@')[0]}! Você alcançou o *Nível ${newLevel}*! 🏆`,
          mentions: [sender]
        }).catch(() => {});
      }

      updateUser(sender, { xp: newXp, level: newLevel });
    }
  }

  if (!body.startsWith(prefix)) {
    const isSim = ['sim', 'confirmar', 'confirm', 'yes'].includes(body.toLowerCase().trim());
    if (isSim) {
      for (const [key, info] of activeResetConfirmations.entries()) {
        if (key.startsWith(`${from}_${sender}_`)) {
          await handleOwnerEconomyCommands(sock, msg, 'resetuser', [info.target, 'sim'], sender, [info.target]);
          return;
        }
      }
    }

    // Processar resposta automática/menção/saudação espontânea e memória
    await AutoReply.processMessage(sock, msg, body);
    return;
  }

  // Se for um comando, registra também na memória de conversa
  conversationMemory.addMessage(from, {
    id: msg.key.id,
    sender,
    senderName: msg.pushName || sender.split('@')[0],
    text: body,
    timestamp: msg.messageTimestamp,
    isBot: false
  });

  const args = body.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  let mentioned = [];
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentioned = msg.message.extendedTextMessage.contextInfo.mentionedJid;
  }

  console.log(`[COMANDO] ${command} executado por ${sender} no chat ${from}`);

  try {    if (['menu', 'help', 'bot'].includes(command)) {
      const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
      const uptimeStr = formatUptime(uptimeSeconds);
      
      const timestamp = msg.messageTimestamp;
      const latency = ((Date.now() - (timestamp * 1000)) / 1000).toFixed(3);
      const velocityStr = latency < 0 ? '0.002' : latency;

      const menuText = `╔═══════════════════════════╗\n` +
                       ` ✨ WHATSAPP AUTOMATION BOT ✨ \n` +
                       `╚═══════════════════════════╝\n` +
                       `─── Comandos Originais ───\n` +
                       `「 🎵 」/play — baixar música (YouTube / TikTok / Instagram)\n` +
                       `「 🎥 」/video — Baixar vídeo (YouTube / TikTok / Instagram)\n` +
                       `「 🖼️ 」/sticker — Figurinha\n` +
                       `「 🖼️ 」/unsticker — transforma sticker em imagem\n` +
                       `「 💍 」/casar - pedir casamento\n` +
                       `「 ✅ 」/aceitar - aceitar pedido\n` +
                       `「 ❌ 」/recusar - recusar pedido\n` +
                       `「 💔 」/divorcio - se divorciar\n` +
                       `「 👤 」/perfil - ver status de casamento\n` +
                       `「 🏳️‍🌈 」/gay - procentagem\n` +
                       `「 💖 」/romance - Compatibilidade\n` +
                       `「 🐂 」/corno - teste de corno\n` +
                       `「 👹 」/feio - medidor de feiura\n` +
                       `「 🔥 」/gostoso - medidor de gostosura\n` +
                       `「 🍺 」/bebado - nível de embriaguez\n` +
                       `「 🙄 」/chato - medidor de chatice\n` +
                       `「 🍀 」/sortudo - medidor de sorte\n` +
                       `「 💋 」/beijo - dar um beijo em alguém\n` +
                       `「 🖐️ 」/tapa - dar um tapa em alguém\n` +
                       `「 🥛 」/mamada - mamada em alguém\n` +
                       `「 💦 」/gozar - expressar pura emoção\n` +
                       `「 🤙 」/67 - medidor do meme Sixen Seven (67)\n` +
                       `「 📉 」/betinha - medidor de nível Betinha\n` +
                       `「 🗿 」/mogar - duelo de Mogging para roubar Aura do oponente\n` +
                       `「 🔨 」/ban - remover alguém do grupo (admin)\n` +
                       `「 👁️ 」/ver - revelar mídia de visualização única\n` +
                       `「 🔑 」/adm - autorizar alguém a usar /ver (dono)\n` +
                       `「 🚫 」/remover - remover autorização do /ver (dono)\n` +
                       `「 🗑️ 」/antidel on/off - ativar/desativar anti-delete (dono)\n\n` +
                       `🎰 *MINIGAMES & CASSINO*\n` +
                       `「 🃏 」/blackjack (ou /21) — 21 contra a banca\n` +
                       `「 ♠️ 」/poker — rodada de poker com apostas\n` +
                       `「 🎰 」/cacaniquel (ou /slots) — caça-níqueis animado\n` +
                       `「 🎣 」/pescar — pescar peixes e tesouros lendários\n` +
                       `「 🥷 」/roubar — tentar roubar moedas de outro usuário\n\n` +
                       `🏦 *BANCO, IMÓVEIS & PETS*\n` +
                       `「 📥 」/depositar — guardar dinheiro no banco com rendimento\n` +
                       `「 📤 」/sacar — retirar moedas do banco\n` +
                       `「 🏠 」/imoveis (ou /casas) — comprar e gerenciar imóveis\n` +
                       `「 🐶 」/pet (ou /pets) — adotar e cuidar do seu mascote\n\n` +
                       `👑 *SISTEMA COMPLETO DE REINOS & GUERRAS*\n` +
                       `「 🏰 」/reino comprar <nome> — fundar seu reino próprio\n` +
                       `「 📊 」/reino — painel imperial e status do reino\n` +
                       `「 🏗️ 」/reino construir — evoluir centro, casas, fazendas, minas, muralhas\n` +
                       `「 👥 」/reino recrutar <qtd> — aumentar população por recrutamento\n` +
                       `「 🧑‍🌾 」/reino trabalhadores — alocar agricultores, mineradores, comerciantes\n` +
                       `「 🌾 」/reino coletar — colheita de comida, recursos e ouro com eventos\n` +
                       `「 📜 」/reino imposto <1-100> — definir impostos e satisfação da população\n` +
                       `「 💰 」/reino sacar <valor> — retirar dinheiro do tesouro para carteira\n` +
                       `「 🎖️ 」/reino especializar — escolher via estratégica (Militar, Comercial...)\n` +
                       `「 ⚔️ 」/reino treinar <qtd> — treinar soldados do exército\n` +
                       `「 🗡️ 」/reino equipamentos — evoluir armamentos e armaduras\n` +
                       `「 🪖 」/reino general — contratar generais com bônus militares\n` +
                       `「 ⚔️ 」/guerra @rei — declarar guerra e conquistar reinos inimigos\n` +
                       `「 🚩 」/reino conquistados — ver impérios e domínios anexados\n` +
                       `「 🤝 」/alianca @rei — firmar pacto diplomático e suporte defensivo\n` +
                       `「 💍 」/casamentoreal @rei — casamento real com bônus de impostos\n` +
                       `「 🏆 」/reinorank — ranking global dos maiores impérios\n\n` +
                       `🤝 *SISTEMA DE TROCAS & COMÉRCIO*\n` +
                       `「 🤝 」/trocar @user — propor troca de recursos, itens ou moedas\n` +
                       `「 ✅ 」/trocar aceitar — aceitar proposta de troca recebida\n` +
                       `「 📦 」/trocar adicionar <item/recurso> <qtd> — ofertar bens na bancada\n` +
                       `「 📊 」/trocar ver — visualizar bancada de negociação\n` +
                       `「 🔒 」/trocar confirmar — confirmar e finalizar a troca mútua\n\n` +
                       `🌸 *QUINTUPLETS & INTELIGÊNCIA ARTIFICIAL*\n` +
                       `「 🌸 」/ia irmas — ver e escolher entre as 5 irmãs Nakano\n` +
                       `「 🦋 」/nino — ativar Nino Nakano (Tsundere & Culinária)\n` +
                       `「 🎧 」/miku — ativar Miku Nakano (Tímida & Sengoku)\n` +
                       `「 🎭 」/ichika — ativar Ichika Nakano (Onee-san & Atriz)\n` +
                       `「 🍀 」/yotsuba — ativar Yotsuba Nakano (Genki & Esportista)\n` +
                       `「 ⭐ 」/itsuki — ativar Itsuki Nakano (Comilona & Estudiosa)\n` +
                       `「 🧠 」/ia lembra <fato> — gravar memória pessoal na IA\n` +
                       `「 📜 」/ia memorias — ver memórias salvas sobre você\n` +
                       `「 🎨 」/imagem — gerar artes e imagens incríveis por IA\n` +
                       `「 🎙️ 」/voz (ou /clonarvoz) — sintetizar e clonar voz\n` +
                       `「 🌐 」/traduzir — traduzir textos/mensagens\n` +
                       `「 📝 」/resumir — resumir textos longos\n` +
                       `「 💡 」/explicar — explicações detalhadas de assuntos\n\n` +
                       `👥 *ADMINISTRAÇÃO*\n` +
                       `「 🚪 」/kick - expulsar membro do grupo\n` +
                       `「 👑 」/promote - promover membro a admin\n` +
                       `「 🛡️ 」/demote - rebaixar admin a membro\n` +
                       `「 📢 」/tagall - marcar todos os membros\n` +
                       `「 🔒 」/mute - fechar o grupo para admins\n` +
                       `「 🔓 」/unmute - abrir o grupo para todos\n` +
                       `「 🔗 」/antilink - ativar/desativar anti-link\n` +
                       `「 🚫 」/antispam - ativar/desativar anti-spam\n` +
                       `「 👋 」/boasvindas - ativar/desativar boas-vindas\n` +
                       `「 📜 」/regras - ver ou definir regras do grupo\n` +
                       `「 ⚠️ 」/warn - dar advertência a um membro\n` +
                       `「 📋 」/warnings - ver advertências do membro\n` +
                       `「 📊 」/enquete (ou /poll) — criar enquetes votáveis\n` +
                       `「 🎫 」/ticket — abrir chamado de atendimento\n\n` +
                       `🎮 *DIVERSÃO & SOCIAL*\n` +
                       `「 👩‍❤️‍👨 」/ship - medir afinidade de casal\n` +
                       `「 🎱 」/8ball - bola 8 mágica de perguntas (IA)\n` +
                       `「 🎲 」/dado - rolar dado (1 a 6)\n` +
                       `「 🪙 」/caraoucoroa - cara ou coroa\n` +
                       `「 🎮 」/ppt - pedra, papel e tesoura\n` +
                       `「 💥 」/roleta - roleta russa animada\n` +
                       `「 🧠 」/quiz - quiz de conhecimentos gerais (IA)\n` +
                       `「 🎯 」/forca - jogo da forca\n` +
                       `「 🃏 」/tarô - leitura mística de Tarô com IA\n` +
                       `「 👍 」/rep — dar ponto de reputação a um membro\n\n` +
                       `💰 *ECONOMIA & OSTENTAÇÃO*\n` +
                       `「 🎁 」/daily - recompensa diária com combo + Biscoito da Sorte (IA)\n` +
                       `「 💵 」/saldo - extrato de carteira, banco e status ostentação\n` +
                       `「 💼 」/trabalhar - turnos de trabalho dinâmicos com IA (+Moedas & XP)\n` +
                       `「 💸 」/transferir - enviar Pix para outro membro com comprovante\n` +
                       `「 🏪 」/loja - catálogo de itens RPG e carros de luxo\n` +
                       `「 🛒 」/comprar - adquirir itens para sua coleção\n` +
                       `「 🎒 」/inventario - itens comprados + avaliação de colecionador (IA)\n` +
                       `「 🏆 」/ranking - top membros mais ricos (Forbes Bot)\n` +
                       `「 ✨ 」/aura - ver seu status espiritual e card de Aura\n` +
                       `「 🧘 」/farmar aura - canalizar e cultivar pontos de Aura (cooldown 15m)\n\n` +
                       `⭐ *PERFIL, XP & PRESTÍGIO*\n` +
                       `「 🎖️ 」/level - nível atual, XP e barra de progresso com Patente RPG\n` +
                       `「 📇 」/rank - cartão completo de perfil RPG + lema do guerreiro (IA)\n` +
                       `「 🌟 」/top - hall da fama das maiores lendas do grupo\n` +
                       `「 🥇 」/prestigio — subir nível de prestígio supremo\n` +
                       `「 🏅 」/conquistas — conquistas desbloqueadas\n` +
                       `「 🖼️ 」/avatar — personalizar avatar de perfil\n\n` +
                        `💎 *LOJA VIP & EVENTOS*\n` +
                        `「 👑 」/vip (ou /lojavip) — loja de benefícios VIP\n` +
                        `「 🎉 」/evento — eventos sazonais ativos no bot\n` +
                        `「 ⏳ 」/fila — estatísticas de processamento do bot\n\n` +
                        `♻️ *SISTEMA REBIRTH ENDGAME*\n` +
                        `「 ♻️ 」/rebirth — renascer com reset parcial, bônus permanentes (+5%/nível) e conquistas de elite\n` +
                        `「 🏆 」/toprebirth — hall da fama dos maiores renascidos do bot\n\n` +
                        `🎂 *SISTEMA DE ANIVERSÁRIOS*\n` +
                        `「 🎂 」/aniversario [DD/MM/AAAA] — cadastrar, consultar ou alterar data de aniversário\n` +
                        `「 🎉 」/aniversariantes — listar aniversariantes de hoje e dos próximos dias\n\n` +
                       `👑 *ADMINISTRAÇÃO DA ECONOMIA (DONO)*\n` +
                       `「 💵 」/givesaldo - dar saldo ao usuário\n` +
                       `「 💸 」/removesaldo - remover saldo do usuário\n` +
                       `「 ✨ 」/givexp - dar XP ao usuário\n` +
                       `「 🌟 」/removexp - remover XP do usuário\n` +
                       `「 🏆 」/givelevel - dar nível ao usuário\n` +
                       `「 📉 」/removelevel - remover nível do usuário\n` +
                       `「 🔮 」/giveaura - dar aura ao usuário\n` +
                       `「 🧘 」/removeaura - remover aura do usuário\n` +
                       `「 🔄 」/resetuser - resetar dados do usuário\n` +
                       `「 📊 」/userinfo - ver todos os dados do usuário\n\n` +
                       `🛠 *UTILIDADES*\n` +
                       `「 🌤️ 」/clima - previsão do tempo por cidade\n` +
                       `「 🔢 」/calculadora - calcular expressões matemáticas\n` +
                       `「 ⏰ 」/lembrete - agendar alertas e lembretes\n` +
                       `「 🏁 」/qrcode - gerar imagem de QR Code\n` +
                       `「 🔍 」/readqr - ler QR Code de imagem\n` +
                       `「 🗣️ 」/tts - texto em áudio (com várias vozes)\n` +
                       `「 📝 」/ocr - extrair texto de fotos\n` +
                       `══════════════════\n` +
                       `🤖 Bot: WHATSAPP AUTOMATION BOT\n` +
                       `⚡ Velocidade: ${velocityStr}s\n` +
                       `🌙 Uptime: ${uptimeStr}\n` +
                       `══════════════════`;
        const assetsDir = path.resolve('assets');
        let videoFiles = [];

        if (fs.existsSync(assetsDir)) {
          const filesInAssets = fs.readdirSync(assetsDir)
            .filter(file => /\.(mp4|gif|webm)$/i.test(file))
            .map(file => path.join(assetsDir, file));
          videoFiles.push(...filesInAssets);
        }

        const rootDir = path.resolve('.');
        const filesInRoot = fs.readdirSync(rootDir)
          .filter(file => /\.(mp4|gif|webm)$/i.test(file) && (file.startsWith('WhatsApp Video') || file.startsWith('menu')))
          .map(file => path.join(rootDir, file));
        videoFiles.push(...filesInRoot);

        videoFiles = [...new Set(videoFiles)];

        if (videoFiles.length > 0) {
          const randomVideoPath = videoFiles[Math.floor(Math.random() * videoFiles.length)];
          try {
            return await sock.sendMessage(from, {
              video: fs.readFileSync(randomVideoPath),
              caption: menuText,
              gifPlayback: true,
              mimetype: 'video/mp4'
            }, { quoted: msg });
          } catch (vidErr) {
            console.warn('⚠️ Falha ao enviar vídeo no menu, enviando como texto:', vidErr.message);
            try {
              return await sock.sendMessage(from, { text: menuText }, { quoted: msg });
            } catch (_) {
              return await sock.sendMessage(from, { text: menuText });
            }
          }
        } else {
          try {
            return await sock.sendMessage(from, { text: menuText }, { quoted: msg });
          } catch (_) {
            return await sock.sendMessage(from, { text: menuText });
          }
        }
    }
    // 👑 Administração da Economia (Dono)
    else if (['givesaldo', 'removesaldo', 'givexp', 'removexp', 'givelevel', 'removelevel', 'giveaura', 'removeaura', 'resetuser', 'userinfo'].includes(command)) {
      await handleOwnerEconomyCommands(sock, msg, command, args, sender, mentioned);
    }
    // Comandos Sociais Legados
    else if (['casar', 'aceitar', 'recusar', 'divorcio', 'gay', 'romance', 'corno', 'feio', 'gostoso', 'bebado', 'chato', 'sortudo', 'beijo', 'tapa', 'mamada', 'gozar', '67', 'six7', 'sixenseven', 'sixseven', 'betinha', 'beta', 'mogar', 'mogado', 'mog'].includes(command)) {
      await handleSocialCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Administração Legados
    else if (['ban', 'adm', 'remover', 'antidel'].includes(command)) {
      await handleAdminCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Mídia Legados (Downloads/Stickers)
    else if (['sticker', 'unsticker', 'ver', 'play', 'video', 'tiktok', 'ttvideo', 'tiktokaudio', 'ttplay', 'ig', 'insta', 'igvideo', 'igaudio', 'instavideo', 'instaaudio', 'igplay'].includes(command)) {
      await queueManager.enqueueHeavyCommand(from, command, () => handleMediaCommands(sock, msg, command, args, sender));
    }
    // 🤖 IA
    else if (command === 'ia') await queueManager.enqueueHeavyCommand(from, command, () => handleIaCommand(sock, msg, args));
    else if (command === 'traduzir') await queueManager.enqueueHeavyCommand(from, command, () => handleTraduzirCommand(sock, msg, args));
    else if (command === 'resumir') await queueManager.enqueueHeavyCommand(from, command, () => handleResumirCommand(sock, msg, args));
    else if (command === 'explicar') await queueManager.enqueueHeavyCommand(from, command, () => handleExplicarCommand(sock, msg, args));
    // 👥 Administração Adicional
    else if (command === 'kick') await handleKickCommand(sock, msg, args, sender, mentioned);
    else if (command === 'promote') await handlePromoteCommand(sock, msg, args, sender, mentioned);
    else if (command === 'demote') await handleDemoteCommand(sock, msg, args, sender, mentioned);
    else if (command === 'tagall') await handleTagallCommand(sock, msg, args, sender);
    else if (command === 'mute') await handleMuteCommand(sock, msg, args, sender);
    else if (command === 'unmute') await handleUnmuteCommand(sock, msg, args, sender);
    else if (command === 'antilink') await handleAntilinkCommand(sock, msg, args, sender);
    else if (command === 'antispam') await handleAntispamCommand(sock, msg, args, sender);
    else if (command === 'boasvindas') await handleBoasvindasCommand(sock, msg, args, sender);
    else if (command === 'regras') await handleRegrasCommand(sock, msg, args, sender);
    else if (command === 'warn') await handleWarnCommand(sock, msg, args, sender, mentioned);
    else if (command === 'warnings') await handleWarningsCommand(sock, msg, args, sender, mentioned);
    // 🎮 Diversão
    else if (command === 'ship') await handleShipCommand(sock, msg, args, sender, mentioned);
    else if (['8ball', 'eightball'].includes(command)) await handleEightBallCommand(sock, msg, args);
    else if (command === 'dado') await handleDadoCommand(sock, msg);
    else if (command === 'caraoucoroa') await handleCaraOuCoroaCommand(sock, msg, args);
    else if (command === 'ppt') await handlePptCommand(sock, msg, args);
    else if (command === 'roleta') await handleRoletaCommand(sock, msg, sender);
    else if (command === 'quiz') await handleQuizCommand(sock, msg, args, sender);
    else if (command === 'forca') await handleForcaCommand(sock, msg, args, sender);
    else if (['taro', 'tarot', 'tarô'].includes(command)) await handleTaroCommand(sock, msg, args);
    // 💰 Economia
    else if (command === 'daily') await handleDailyCommand(sock, msg, sender);
    else if (command === 'saldo') await handleSaldoCommand(sock, msg, sender, mentioned);
    else if (command === 'trabalhar') await handleTrabalharCommand(sock, msg, sender);
    else if (command === 'transferir') await handleTransferirCommand(sock, msg, args, sender, mentioned);
    else if (command === 'loja') await handleLojaCommand(sock, msg);
    else if (['lojarpg', 'armas', 'armaduras'].includes(command)) await handleLojaRpgCommand(sock, msg);
    else if (command === 'comprar') await handleComprarCommand(sock, msg, args, sender);
    else if (command === 'inventario') await handleInventarioCommand(sock, msg, sender, mentioned);
    else if (command === 'ranking') await handleRankingCommand(sock, msg, args);
    else if (command === 'aura') await handleAuraCommand(sock, msg, args, sender, mentioned);
    else if (command === 'farmar') await handleFarmarAuraCommand(sock, msg, sender);
    // ⭐ Sistema de XP & Perfil Unificado
    else if (command === 'level') await handleLevelCommand(sock, msg, sender, mentioned);
    else if (['rank', 'perfil', 'ficha', 'status', 'userinfo'].includes(command)) await handleRankCommand(sock, msg, sender, mentioned);
    else if (command === 'top') await handleTopCommand(sock, msg);
    // 🛠 Utilidades
    else if (command === 'cep') await handleCepCommand(sock, msg, args);
    else if (command === 'clima') await handleClimaCommand(sock, msg, args);
    else if (command === 'calculadora') await handleCalculadoraCommand(sock, msg, args);
    else if (command === 'lembrete') await handleLembreteCommand(sock, msg, args, sender);
    else if (command === 'qrcode') await handleQrcodeCommand(sock, msg, args);
    else if (command === 'readqr') await handleReadqrCommand(sock, msg);
    // 🎂 Sistema de Aniversários
    else if (['aniversario', 'aniver', 'niver', 'meuaniversario'].includes(command)) {
      await handleBirthdayCommands(sock, msg, command, args, sender);
    }
    else if (['aniversariantes', 'aniversarios', 'proximosaniversarios'].includes(command)) {
      await handleAniversariantesCommand(sock, msg);
    }
    // ♻️ Sistema Rebirth Endgame
    else if (['rebirth', 'renascer', 'renascimento'].includes(command)) {
      await handleRebirthCommand(sock, msg, command, args, sender);
    }
    else if (['toprebirth', 'toprebirths', 'rankingrebirth'].includes(command)) {
      await handleTopRebirthCommand(sock, msg);
    }
    else if (command === 'tts') await queueManager.enqueueHeavyCommand(from, command, () => handleTtsCommand(sock, msg, args));
    else if (command === 'ocr') await queueManager.enqueueHeavyCommand(from, command, () => handleOcrCommand(sock, msg));
    // 📊 Status da Fila
    else if (['queue', 'filas', 'fila'].includes(command)) await handleQueueStatsCommand(sock, msg);
    // 🧠 IA Avançada (Personalidades das 5 Nakano & Memória Contínua)
    else if (['nino', 'miku', 'ichika', 'yotsuba', 'itsuki'].includes(command) ||
             (command === 'ia' && args.length > 0 && ['nino', 'miku', 'ichika', 'yotsuba', 'itsuki', 'irmas', 'irmãs', 'quintuplets', 'personagens', 'modo', 'personality', 'estilo', 'lembra', 'lembrar', 'memorizar', 'memoria', 'memorias', 'esquecer', 'limparmemoria'].includes(args[0]?.toLowerCase()))) {
      await handleAiExtraCommands(sock, msg, command, args, sender);
    }
    // 🏦 Banco & Imóveis & Pets
    else if (['depositar', 'sacar', 'imoveis', 'casas', 'pet', 'pets'].includes(command)) {
      await handleBankMarketCommands(sock, msg, command, args, sender);
    }
    // 👑 Sistema de Monarquia, Reinos, Guerras & Alianças
    else if (['reino', 'reinos', 'guerra', 'guerras', 'lojareino', 'reinoloja', 'alianca', 'aliança', 'reinorank', 'rankingreino', 'casamentoreal'].includes(command)) {
      await handleKingdomCommands(sock, msg, command, args, sender);
    }
    // 🤝 Sistema de Trocas & Comércio (Trade)
    else if (['trocar', 'troca', 'trade', 'negociar'].includes(command)) {
      await handleTradeCommands(sock, msg, command, args, sender, mentioned);
    }
    // 🎰 Minigames & Cassino com IA
    else if (['blackjack', '21', 'poker', 'cacaniquel', 'slots', 'pescar', 'pesca', 'roubar'].includes(command)) {
      await handleMinigamesCommands(sock, msg, command, args, sender, mentioned);
    }
    // 🛡️ Sistema RPG & Raids
    else if (['guerreiro', 'mago', 'arqueiro', 'classe', 'missao', 'missoes', 'raid', 'chefe', 'curar', 'heal'].includes(command)) {
      await handleRpgSystemCommands(sock, msg, command, args, sender);
    }
    // 👥 Reputação & Enquetes & Tickets
    else if (['rep', 'unrep', 'enquete', 'poll', 'ticket'].includes(command)) {
      await handleGroupReputationCommands(sock, msg, command, args, sender, mentioned);
    }
    // 📱 Downloader Multi-plataforma
    else if (['pinterest', 'facebook', 'threads', 'spotify', 'twitter', 'download'].includes(command)) {
      await handleMediaExtraCommands(sock, msg, command, args);
    }
    // 🎨 Imagens por IA & Edição
    else if (['imagem', 'gerarimagem', 'img', 'removerfundo', 'removebg', 'melhorar', 'hd', 'colorir'].includes(command)) {
      await handleAiImageCommands(sock, msg, command, args);
    }
    // 🎙️ Clonagem de Voz
    else if (['voz', 'clonarvoz'].includes(command)) {
      await handleVoiceSystemCommands(sock, msg, command, args, sender);
    }
    // ⭐ Perfil & Prestígio
    else if (['prestigio', 'prestige', 'ascensao', 'ascensão', 'conquistas', 'medalhas', 'avatar'].includes(command)) {
      await handleProfilePrestigeCommands(sock, msg, command, args, sender);
    }
    // 🔥 Eventos Sazonais
    else if (['evento', 'eventos', 'natal', 'halloween', 'pascoa', 'aniversario'].includes(command)) {
      await handleEventsSystemCommands(sock, msg, command, args);
    }
    // 📦 Loja VIP
    else if (['lojavip', 'vip'].includes(command)) {
      await handleVipShopCommands(sock, msg, command, args, sender);
    }
    // ℹ Informações
    else if (command === 'ping') await handlePingCommand(sock, msg);
    else if (command === 'uptime') await handleUptimeCommand(sock, msg);
    else if (command === 'info') await handleInfoCommand(sock, msg);
    else if (command === 'botinfo') await handleBotinfoCommand(sock, msg);
    else if (command === 'grupo') await handleGrupoCommand(sock, msg);

  } catch (error) {
    console.error(`Erro ao executar o comando /${command}:`, error);
    try {
      await sock.sendMessage(from, { text: `⚠️ Ocorreu um erro interno ao processar o comando /${command}.` }, { quoted: msg });
    } catch (_) {
      await sock.sendMessage(from, { text: `⚠️ Ocorreu um erro interno ao processar o comando /${command}.` }).catch(() => {});
    }
  }
}
