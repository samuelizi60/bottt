import { checkIfOwner, isAdmin, isBotAdmin, isBotJid, isPhoneJid, resolveActionTarget } from '../admin.js';

export async function handleKickCommand(sock, msg, args, sender, mentioned) {
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
    return sock.sendMessage(from, { text: '⚠️ Eu preciso ser administrador do grupo para remover participantes.' }, { quoted: msg });
  }

  let target = mentioned[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (!target) {
    return sock.sendMessage(from, { text: '⚠️ Marque alguém ou responda à mensagem da pessoa que deseja expulsar.' }, { quoted: msg });
  }

  const resolved = resolveActionTarget(groupMetadata, target);
  if (!resolved) {
    return sock.sendMessage(from, { text: '⚠️ Não encontrei essa pessoa na lista de participantes do grupo.' }, { quoted: msg });
  }
  const actionJid = resolved.actionJid;

  if (isBotJid(sock, target)) {
    return sock.sendMessage(from, { text: '⚠️ Eu não posso me expulsar!' }, { quoted: msg });
  }

  if (isPhoneJid(target) && checkIfOwner(target)) {
    return sock.sendMessage(from, { text: '⚠️ Não posso expulsar o meu dono!' }, { quoted: msg });
  }

  try {
    if (isAdmin(participants, target)) {
      await sock.groupParticipantsUpdate(from, [actionJid], 'demote');
    }
    await sock.groupParticipantsUpdate(from, [actionJid], 'remove');
    return sock.sendMessage(from, { text: `🚪 @${actionJid.split('@')[0]} foi expulso do grupo.`, mentions: [actionJid] }, { quoted: msg });
  } catch (err) {
    return sock.sendMessage(from, { text: '⚠️ Não foi possível remover o participante.' }, { quoted: msg });
  }
}
