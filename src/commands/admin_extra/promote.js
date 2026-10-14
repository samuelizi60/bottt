import { checkIfOwner, isAdmin, isBotAdmin, resolveActionTarget } from '../admin.js';

export async function handlePromoteCommand(sock, msg, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, { text: '⚠️ Este comando só pode ser utilizado em grupos.' }, { quoted: msg });
  }

  const groupMetadata = await sock.groupMetadata(from);
  const participants = groupMetadata.participants;

  if (!isAdmin(participants, sender) && !checkIfOwner(sender)) {
    return sock.sendMessage(from, { text: '⚠️ Apenas administradores do grupo ou o dono do bot podem utilizar este comando.' }, { quoted: msg });
  }

  if (!isBotAdmin(participants, sock)) {
    return sock.sendMessage(from, { text: '⚠️ Eu preciso ser administrador do grupo para promover membros.' }, { quoted: msg });
  }

  let target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (!target) {
    return sock.sendMessage(from, { text: '⚠️ Marque alguém ou responda à mensagem da pessoa para promover.' }, { quoted: msg });
  }

  const resolved = resolveActionTarget(groupMetadata, target);
  if (!resolved) {
    return sock.sendMessage(from, { text: '⚠️ Não encontrei essa pessoa na lista de participantes do grupo.' }, { quoted: msg });
  }

  try {
    await sock.groupParticipantsUpdate(from, [resolved.actionJid], 'promote');
    return sock.sendMessage(from, { text: `👑 @${resolved.actionJid.split('@')[0]} agora é um Administrador do grupo!`, mentions: [resolved.actionJid] }, { quoted: msg });
  } catch (err) {
    return sock.sendMessage(from, { text: '⚠️ Erro ao tentar promover o participante.' }, { quoted: msg });
  }
}
