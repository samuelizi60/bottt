import { getDatabase, updateDatabase } from '../database.js';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import dotenv from 'dotenv';
dotenv.config();

// Normaliza um JID para comparação (minúsculo, sem sufixo de dispositivo)
function normJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  try {
    return jidNormalizedUser(jid).toLowerCase();
  } catch (_) {
    return jid.split(':')[0].toLowerCase();
  }
}

// Heurística numérica só faz sentido entre JIDs de telefone.
// LIDs (@lid) são IDs opacos — comparar dígitos deles com telefones erra.
export function isPhoneJid(jid) {
  return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'));
}

function phoneDigits(jid) {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

// Verifica se o JID é o dono do bot
export function checkIfOwner(sender, msg = null) {
  if (msg?.key?.fromMe) return true;
  if (!sender) return false;

  const ownerEnv = process.env.OWNER_NUMBER || '';
  const ownerList = ownerEnv.split(/[,;\s]+/).map(num => num.replace(/\D/g, '')).filter(Boolean);
  
  // Limpa o JID removendo sufixo de dispositivo (:1, :10) e domínio (@s.whatsapp.net, @lid)
  const cleanSender = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!cleanSender) return false;

  // LIDs não são números de telefone: sem heurística numérica aqui
  if (!isPhoneJid(sender)) return false;

  // Se não houver lista no .env, permite APENAS se a mensagem for enviada do próprio número do bot
  if (ownerList.length === 0) {
    return msg?.key?.fromMe === true;
  }

  const sender8 = cleanSender.slice(-8);

  return ownerList.some(owner => {
    if (cleanSender === owner) return true;
    const owner8 = owner.slice(-8);
    return owner8.length >= 8 && owner8 === sender8;
  });
}

// Encontra o participant exato nos metadados, funcionando em grupos
// com endereçamento PN (@s.whatsapp.net) ou LID (@lid).
export function findParticipant(participants, jid) {
  if (!participants || !jid) return null;
  const norm = normJid(jid);
  if (!norm) return null;

  const exact = participants.find((p) => {
    if (!p) return false;
    if (normJid(p.id) === norm) return true;
    if (p.jid && normJid(p.jid) === norm) return true;
    if (p.lid && normJid(p.lid) === norm) return true;
    return false;
  });
  if (exact) return exact;

  // Fallback numérico SOMENTE entre JIDs de telefone
  if (isPhoneJid(jid)) {
    const d = phoneDigits(jid);
    if (!d) return null;
    return participants.find((p) => {
      if (!p) return false;
      return [p.id, p.jid].filter(isPhoneJid).some((c) => {
        const cd = phoneDigits(c);
        return cd && (cd === d || (cd.length >= 8 && d.endsWith(cd.slice(-8))) || (d.length >= 8 && cd.endsWith(d.slice(-8))));
      });
    }) || null;
  }
  return null;
}

// Verifica se um participante é admin (lê p.admin e também os flags
// isAdmin/isSuperAdmin conforme a versão do Baileys)
export function isAdmin(participants, jid) {
  const p = findParticipant(participants, jid);
  if (!p) return false;
  return p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true;
}

// Todos os JIDs candidatos do próprio bot (forma PN + forma LID).
// Em grupos LID, sock.user.id em formato PN nunca aparece na lista de
// participantes — por isso a checagem antiga sempre dizia que o bot
// "não era admin".
export function getBotJids(sock) {
  const out = [];
  const id = sock?.user?.id;
  const lid = sock?.user?.lid;
  if (id) {
    out.push(normJid(id));
    const base = String(id).split(':')[0].split('@')[0];
    if (base && /^\d+$/.test(base)) out.push(`${base}@s.whatsapp.net`);
  }
  if (lid) out.push(normJid(lid));
  return [...new Set(out.filter(Boolean))];
}

export function isBotAdmin(participants, sock) {
  return getBotJids(sock).some((j) => isAdmin(participants, j));
}

export function isBotJid(sock, jid) {
  if (!jid) return false;
  const norm = normJid(jid);
  return getBotJids(sock).includes(norm);
}

// JID correto para groupParticipantsUpdate conforme o endereçamento do grupo:
// grupo LID exige o LID; grupo PN aceita o JID de telefone.
export function participantActionJid(groupMetadata, participant) {
  if (!participant) return null;
  if (groupMetadata?.addressingMode === 'lid') {
    return participant.lid || participant.id;
  }
  return participant.jid || participant.id;
}

// Resolve um JID mencionado/citado para o participant exato dos metadados
// e já retorna o JID certo para usar na ação (remove/promote/demote).
export function resolveActionTarget(groupMetadata, jid) {
  const participants = groupMetadata?.participants;
  const participant = findParticipant(participants, jid);
  if (!participant) return null;
  return { participant, actionJid: participantActionJid(groupMetadata, participant) };
}

export async function handleAdminCommands(sock, msg, command, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const isSenderOwner = checkIfOwner(sender, msg);

  switch (command) {
    case 'ban': {
      if (!isGroup) {
        return reply('⚠️ Este comando só pode ser utilizado em grupos.');
      }

      // Obter metadados do grupo
      let groupMetadata;
      try {
        groupMetadata = await sock.groupMetadata(from);
      } catch (err) {
        return reply('⚠️ Não foi possível obter os metadados do grupo.');
      }

      const participants = groupMetadata.participants;

      // Verificar se o solicitante é admin ou dono
      const senderAdmin = isAdmin(participants, sender);
      if (!senderAdmin && !isSenderOwner) {
        return reply('⚠️ Apenas administradores do grupo ou o dono do bot podem utilizar este comando.');
      }

      // Verificar se o bot é admin (checagem compatível com grupos LID e PN)
      if (!isBotAdmin(participants, sock)) {
        return reply('⚠️ Eu preciso ser administrador do grupo para poder banir participantes.');
      }

      // Determinar o alvo (mencionado ou citado)
      let target = mentioned[0];
      if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
        target = msg.message.extendedTextMessage.contextInfo.participant;
      }

      if (!target) {
        return reply('⚠️ Marque alguém ou responda a mensagem da pessoa que deseja banir.');
      }

      const resolved = resolveActionTarget(groupMetadata, target);
      if (!resolved) {
        return reply('⚠️ Não encontrei essa pessoa na lista de participantes do grupo.');
      }
      const actionJid = resolved.actionJid;

      if (isBotJid(sock, target)) {
        return reply('⚠️ Eu não posso me banir!');
      }

      if (isPhoneJid(target) && checkIfOwner(target)) {
        return reply('⚠️ Eu não posso banir o meu dono!');
      }

      // Banir o participante
      try {
        if (isAdmin(participants, target)) {
          await sock.groupParticipantsUpdate(from, [actionJid], 'demote');
        }
        await sock.groupParticipantsUpdate(from, [actionJid], 'remove');
        return reply(`🔨 @${actionJid.split('@')[0]} foi banido com sucesso.`, [actionJid]);
      } catch (error) {
        console.error('Erro ao banir participante:', error);
        return reply('⚠️ Erro ao tentar remover o participante. Talvez ele seja o criador do grupo ou eu não tenha permissão.');
      }
    }

    case 'adm': {
      if (!isSenderOwner) {
        return reply('⚠️ Apenas o dono do bot pode utilizar este comando.');
      }

      let target = mentioned[0];
      if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
        target = msg.message.extendedTextMessage.contextInfo.participant;
      }

      if (!target) {
        return reply('⚠️ Marque ou responda à pessoa que deseja autorizar.');
      }

      let jaAutorizado = false;
      updateDatabase((db) => {
        if (!db.autorizadosVer.includes(target)) {
          db.autorizadosVer.push(target);
        } else {
          jaAutorizado = true;
        }
      });

      if (jaAutorizado) {
        return reply(`⚠️ @${target.split('@')[0]} já está na lista de autorizados para usar /ver.`, [target]);
      }

      return reply(`🔑 @${target.split('@')[0]} foi autorizado com sucesso para usar /ver.`, [target]);
    }

    case 'remover': {
      if (!isSenderOwner) {
        return reply('⚠️ Apenas o dono do bot pode utilizar este comando.');
      }

      let target = mentioned[0];
      if (!target && msg.message?.extendedTextMessage?.contextInfo?.participant) {
        target = msg.message.extendedTextMessage.contextInfo.participant;
      }

      if (!target) {
        return reply('⚠️ Marque ou responda à pessoa que deseja remover a autorização.');
      }

      let removido = false;
      updateDatabase((db) => {
        const index = db.autorizadosVer.indexOf(target);
        if (index !== -1) {
          db.autorizadosVer.splice(index, 1);
          removido = true;
        }
      });

      if (!removido) {
        return reply(`⚠️ @${target.split('@')[0]} não estava na lista de autorizados.`, [target]);
      }

      return reply(`🚫 @${target.split('@')[0]} teve sua autorização para usar /ver removida.`, [target]);
    }

    case 'antidel': {
      if (!isGroup) {
        return reply('⚠️ Este comando só pode ser utilizado em grupos.');
      }

      if (!isSenderOwner) {
        return reply('⚠️ Apenas o dono do bot pode ativar/desativar o anti-delete.');
      }

      const param = args[0]?.toLowerCase();
      if (param !== 'on' && param !== 'off') {
        return reply('⚠️ Uso incorreto. Use: /antidel on ou /antidel off');
      }

      const active = param === 'on';

      updateDatabase((db) => {
        if (!db.configGrupos[from]) {
          db.configGrupos[from] = {};
        }
        db.configGrupos[from].antiDelete = active;
      });

      return reply(`🗑️ Anti-delete foi ${active ? '*ATIVADO*' : '*DESATIVADO*'} para este grupo.`);
    }

    default:
      break;
  }
}
