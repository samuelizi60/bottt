export async function handleEventsSystemCommands(sock, msg, command, args) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12

  let activeEvent = '🎉 *EVENTO DE BOAS-VINDAS WHATSAPP AUTOMATION BOT*';
  let eventDesc = 'Todos os ganhos de XP e moedas estão com bônus de +15%!';

  if (month === 12) {
    activeEvent = '🎄 *EVENTO DE NATAL & ANO NOVO* 🎅';
    eventDesc = 'Presentes duplos no /daily e itens festivos na loja!';
  } else if (month === 10) {
    activeEvent = '🎃 *EVENTO DE HALLOWEEN SANGRENTOS* 👻';
    eventDesc = 'Doces ou travessuras valendo poções e moedas em dobro!';
  } else if (month === 4) {
    activeEvent = '🐰 *EVENTO DE PÁSCOA ILUMINADA* 🍫';
    eventDesc = 'Caça aos Ovos de Páscoa nos minijogos!';
  }

  return reply(`${activeEvent}\n\n` +
               `📌 *Status:* ATIVO AGORA!\n` +
               `🎁 *Benefício:* ${eventDesc}\n\n` +
               `💡 _Aproveite os bônus ativos nos comandos de /daily, /trabalhar e /minigames!_`);
}
