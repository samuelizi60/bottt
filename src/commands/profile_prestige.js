import { getUser, updateUser } from '../database/sqlite.js';

export async function handleProfilePrestigeCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);
  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {}

  switch (command) {
    case 'ascensao':
    case 'ascensão':
    case 'prestigio':
    case 'prestige': {
      if (user.level < 100) {
        return reply(`⚠️ *SISTEMA DE ASCENSÃO / PRESTÍGIO* ⚠️\n\n` +
                     `Você precisa alcançar o **Nível 100** para realizar a Ascensão Espiritual!\n` +
                     `🌟 *Seu Nível Atual:* ${user.level}/100\n\n` +
                     `💡 _Continue enviando mensagens e realizando tarefas para evoluir seu nível!_`);
      }

      const currentPrestige = extraData.prestige || 0;
      const newPrestige = currentPrestige + 1;
      extraData.prestige = newPrestige;

      // Reseta para nível 1
      updateUser(sender, {
        level: 1,
        xp: 0,
        extra_data: JSON.stringify(extraData)
      });

      const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      const prestigeSymbol = romanNumerals[newPrestige - 1] || newPrestige;

      return reply(`🌌 *ASCENSÃO CONQUISTADA — PODER DIVINO!* 🌌\n\n` +
                   `🎉 Parabéns @${sender.split('@')[0]}! Você transcendeu o nível 100 e atingiu:\n\n` +
                   `⭐ *PRESTÍGIO / ASCENSÃO ${prestigeSymbol}*\n\n` +
                   `✨ *BUFFS PERMANENTES ATIVADOS:*\n` +
                   `• 💰/✨ *Ganhos:* +${newPrestige * 15}% em Moedas e XP\n` +
                   `• ❤️ *Atributo Vital:* +${newPrestige * 50} HP Máximo em Combates/Raids\n` +
                   `• ⚔️ *Força Mística:* +${newPrestige * 20} ATK Bônus Permanente!`, [sender]);
    }

    case 'conquistas':
    case 'medalhas': {
      const achievements = [
        { name: '🐣 Primeiro Passo', desc: 'Registrou-se no WhatsApp Automation Bot', unlocked: true },
        { name: '💼 Trabalhador Honrado', desc: 'Realizou 10 turnos em /trabalhar', unlocked: (user.wallet + user.bank) > 5000 },
        { name: '🏰 Proprietário de Luxo', desc: 'Comprou seu primeiro imóvel em /casas', unlocked: (extraData.houses?.length || 0) > 0 },
        { name: '🐾 Amigo dos Animais', desc: 'Adotou um pet em /pets', unlocked: !!extraData.pet },
        { name: '👑 Lenda de Prestígio', desc: 'Alcançou Prestígio I', unlocked: (extraData.prestige || 0) > 0 }
      ];

      let listStr = achievements.map(a => `${a.unlocked ? '🏅' : '🔒'} *${a.name}* — ${a.desc} ${a.unlocked ? '✅ *(Desbloqueada)*' : ''}`).join('\n\n');

      return reply(`🎖️ *PAINEL DE CONQUISTAS & MEDALHAS* 🎖️\n\n${listStr}`);
    }

    case 'avatar': {
      return reply(`🖼️ *AVATAR DE PERFIL*\n\n` +
                   `Seu avatar do WhatsApp é utilizado automaticamente nos cartões de status e rankings!`);
    }
  }
}
