import { handleIaCommand } from './commands/ia.js';
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

// Importação dos Módulos de Comandos Ativos
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

import { handleShipCommand } from './commands/fun/ship.js';
import { handleEightBallCommand } from './commands/fun/eightball.js';
import { handleDadoCommand } from './commands/fun/dado.js';
import { handleCaraOuCoroaCommand } from './commands/fun/caraoucoroa.js';
import { handlePptCommand } from './commands/fun/ppt.js';
import { handleRoletaCommand } from './commands/fun/roleta.js';
import { handleQuizCommand, activeQuizGames, processQuizAnswer } from './commands/fun/quiz.js';
import { handleForcaCommand, activeForcaGames, processForcaGuess } from './commands/fun/forca.js';
import { handleTaroCommand } from './commands/fun/taro.js';

import { handleCepCommand } from './commands/utils_extra/cep.js';
import { handleQrcodeCommand } from './commands/utils_extra/qrcode.js';
import { handleReadqrCommand } from './commands/utils_extra/readqr.js';

import { handlePingCommand } from './commands/info/ping.js';
import { handleUptimeCommand } from './commands/info/uptime.js';
import { handleInfoCommand } from './commands/info/info.js';
import { handleBotinfoCommand } from './commands/info/botinfo.js';
import { handleGrupoCommand } from './commands/info/grupo.js';

import { handleMinigamesCommands } from './commands/minigames.js';
import { handleRpgSystemCommands } from './commands/rpg_system.js';
import { handleGroupReputationCommands } from './commands/group_reputation.js';

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
    if (['menu', 'help', 'ajuda', 'perfil', 'ping'].includes(firstWord)) {
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

  if (!body.startsWith(prefix)) {
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

  try {
    if (['menu', 'help', 'bot'].includes(command)) {
      const uptimeSeconds = (Date.now() - (global.botStartTime || Date.now())) / 1000;
      const uptimeStr = formatUptime(uptimeSeconds);
      
      const timestamp = msg.messageTimestamp;
      const latency = ((Date.now() - (timestamp * 1000)) / 1000).toFixed(3);
      const velocityStr = latency < 0 ? '0.002' : latency;

      const userNumber = sender.split('@')[0];

      // Saudação baseada no horário de Brasília (UTC-3)
      const date = new Date(Date.now() - 3 * 3600 * 1000);
      const hour = date.getUTCHours();
      let greeting = '🌙 Boa noite';
      if (hour >= 5 && hour < 12) greeting = '🌅 Bom dia';
      else if (hour >= 12 && hour < 18) greeting = '☀️ Boa tarde';

      const menuText = 
`╭───「 *SERIE BOT* ⚡ 」───
│ 
│ ${greeting}, *@${userNumber}*!
│
│ 👑 *Prefixo:* [ ${prefix} ]
│ ⚡ *Velocidade:* ${velocityStr}s
│ 🕒 *Uptime:* ${uptimeStr}
│ 🧠 *IA:* Qwen 3.8 27B (Groq)
│
╰─────────────────────

╭───「 📥 *MÍDIA & DOWNLOADS* 」
│ ◈ ${prefix}play <nome/link> — Baixar música
│ ◈ ${prefix}video <nome/link> — Baixar vídeo
│ ◈ ${prefix}ig <link> — Baixar Reels / Instagram
│ ◈ ${prefix}tiktok <link> — Baixar TikTok sem marca
│ ◈ ${prefix}sticker — Criar figurinha de imagem/vídeo
│ ◈ ${prefix}unsticker — Converter figurinha em imagem
│ ◈ ${prefix}ver — Revelar mídia de visualização única
╰─────────────────────

╭───「 🔎 *INTELIGÊNCIA ARTIFICIAL* 」
│ ◈ ${prefix}ia <pergunta> — Pesquisar na internet e responder com fontes
╰─────────────────────

╭───「 ⚔️ *SISTEMA RPG & BATALHAS* 」
│ ◈ ${prefix}classe <guerreiro|mago|arqueiro> — Escolher classe
│ ◈ ${prefix}missao — Ver ou iniciar missões diárias
│ ◈ ${prefix}raid — Participar da Raid contra o Chefe
│ ◈ ${prefix}curar — Restaurar vida com poção ou descanso
│ ◈ ${prefix}perfil — Ver status de batalha, nível e moedas
╰─────────────────────

╭───「 🎰 *CASSINO & MINIGAMES* 」
│ ◈ ${prefix}blackjack <aposta> — Jogo 21 contra a banca
│ ◈ ${prefix}poker <aposta> — Partida rápida de Poker
│ ◈ ${prefix}slots <aposta> — Caça-níqueis animado
│ ◈ ${prefix}pescar — Pescar peixes e itens raros
╰─────────────────────

╭───「 💍 *CASAMENTO & SOCIAL* 」
│ ◈ ${prefix}casar @user — Fazer pedido de casamento
│ ◈ ${prefix}aceitar — Aceitar pedido pendente
│ ◈ ${prefix}recusar — Recusar pedido de casamento
│ ◈ ${prefix}divorcio — Finalizar relacionamento
│ ◈ ${prefix}perfil — Ver informações e cônjuge
│ ◈ ${prefix}rep @user — Dar ponto de reputação (+1)
│ ◈ ${prefix}beijo @user — Enviar um beijo animado
│ ◈ ${prefix}tapa @user — Dar um tapa em alguém
│ ◈ ${prefix}mamada @user — Brincadeira interativa
│ ◈ ${prefix}gozar — Expressar pura emoção
╰─────────────────────

╭───「 🎮 *DIVERSÃO & JOGOS* 」
│ ◈ ${prefix}ship @user1 @user2 — Calcular afinidade de casal
│ ◈ ${prefix}8ball <pergunta> — Bola 8 mística com IA
│ ◈ ${prefix}taro — Tiragem de cartas de Tarô com IA
│ ◈ ${prefix}quiz — Pergunta de conhecimentos gerais
│ ◈ ${prefix}forca — Desafio do jogo da forca
│ ◈ ${prefix}roleta — Roleta russa em grupo
│ ◈ ${prefix}ppt <pedra|papel|tesoura> — Jogo clássico
│ ◈ ${prefix}dado — Rolar dado de 6 lados
│ ◈ ${prefix}caraoucoroa <cara|coroa> — Teste sua sorte
│ ◈ ${prefix}gay / ${prefix}corno / ${prefix}feio — Medidores zueira
│ ◈ ${prefix}gostoso / ${prefix}bebado / ${prefix}sortudo
╰─────────────────────

╭───「 🛡️ *ADMINISTRAÇÃO DO GRUPO* 」
│ ◈ ${prefix}ban @user — Banir membro do grupo
│ ◈ ${prefix}kick @user — Remover membro do grupo
│ ◈ ${prefix}promote @user — Promover a administrador
│ ◈ ${prefix}demote @user — Rebaixar administrador
│ ◈ ${prefix}tagall <aviso> — Marcar todos os membros
│ ◈ ${prefix}mute / ${prefix}unmute — Fechar/abrir grupo
│ ◈ ${prefix}antilink <on|off> — Filtro anti-links
│ ◈ ${prefix}antispam <on|off> — Bloqueador de spam
│ ◈ ${prefix}boasvindas <on|off> — Mensagem de boas-vindas
│ ◈ ${prefix}regras — Visualizar ou definir regras
│ ◈ ${prefix}warn @user — Aplicar advertência
│ ◈ ${prefix}warnings @user — Consultar advertências
│ ◈ ${prefix}enquete <título|op1|op2> — Criar enquete votável
│ ◈ ${prefix}ticket — Abrir chamado de suporte
│ ◈ ${prefix}antidel <on|off> — Anti-delete de mensagens (dono)
│ ◈ ${prefix}adm @user — Autorizar uso do /ver (dono)
╰─────────────────────

╭───「 ⚙️ *UTILIDADES & INFORMAÇÕES* 」
│ ◈ ${prefix}qrcode <texto> — Gerar imagem de QR Code
│ ◈ ${prefix}readqr — Ler QR Code de imagem enviada
│ ◈ ${prefix}cep <número> — Buscar endereço por CEP
│ ◈ ${prefix}fila — Status da fila de processamento
│ ◈ ${prefix}ping — Tempo de resposta e latência
│ ◈ ${prefix}uptime — Tempo que o bot está ligado
│ ◈ ${prefix}info / ${prefix}botinfo — Informações técnicas
│ ◈ ${prefix}grupo — Detalhes do grupo atual
╰─────────────────────

💡 *Dica:* Digite o comando sem argumentos para ver exemplos de uso!
✨ _Desenvolvido para máxima velocidade e diversão._`;

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
              mentions: [sender],
              gifPlayback: true,
              mimetype: 'video/mp4'
            }, { quoted: msg });
          } catch (vidErr) {
            console.warn('⚠️ Falha ao enviar vídeo no menu, enviando como texto:', vidErr.message);
            try {
              return await sock.sendMessage(from, { text: menuText, mentions: [sender] }, { quoted: msg });
            } catch (_) {
              return await sock.sendMessage(from, { text: menuText, mentions: [sender] });
            }
          }
        } else {
          try {
            return await sock.sendMessage(from, { text: menuText, mentions: [sender] }, { quoted: msg });
          } catch (_) {
            return await sock.sendMessage(from, { text: menuText, mentions: [sender] });
          }
        }
    }    else if (command === 'ia') {
      await handleIaCommand(sock, msg, args);
    }

    // Comandos Sociais
    else if (['casar', 'aceitar', 'recusar', 'divorcio', 'gay', 'romance', 'corno', 'feio', 'gostoso', 'bebado', 'chato', 'sortudo', 'beijo', 'tapa', 'mamada', 'gozar', 'perfil'].includes(command)) {
      await handleSocialCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Administração Legados
    else if (['ban', 'adm', 'remover', 'antidel'].includes(command)) {
      await handleAdminCommands(sock, msg, command, args, sender, mentioned);
    } 
    // Comandos de Mídia (Downloads/Stickers)
    else if (['sticker', 'unsticker', 'ver', 'play', 'video', 'tiktok', 'ttvideo', 'tiktokaudio', 'ttplay', 'ig', 'insta', 'igvideo', 'igaudio', 'instavideo', 'instaaudio', 'igplay'].includes(command)) {
      await queueManager.enqueueHeavyCommand(from, command, () => handleMediaCommands(sock, msg, command, args, sender));
    }
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
    // 🛠 Utilidades
    else if (command === 'cep') await handleCepCommand(sock, msg, args);
    else if (command === 'qrcode') await handleQrcodeCommand(sock, msg, args);
    else if (command === 'readqr') await handleReadqrCommand(sock, msg);
    // 📊 Status da Fila
    else if (['queue', 'filas', 'fila'].includes(command)) await handleQueueStatsCommand(sock, msg);
    // 🎰 Minigames & Cassino
    else if (['blackjack', '21', 'poker', 'cacaniquel', 'slots', 'pescar', 'pesca'].includes(command)) {
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
