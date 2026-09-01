import { getDatabase, updateDatabase } from '../database.js';

// Função auxiliar para formatar tempo de casamento
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} dia(s)`;
  if (hours > 0) return `${hours} hora(s)`;
  if (minutes > 0) return `${minutes} minuto(s)`;
  return `${seconds} segundo(s)`;
}

export async function handleSocialCommands(sock, msg, command, args, sender, mentioned) {
  const db = getDatabase();
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  switch (command) {
    case 'casar': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém para pedir em casamento! Exemplo: /casar @marcar');
      }
      
      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Você não pode se casar com você mesmo!');
      }

      if (db.casamentos[sender]) {
        const parceiro = db.casamentos[sender].parceiro;
        return reply(`⚠️ Você já está casado(a) com @${parceiro.split('@')[0]}! Se divorcie primeiro.`, [parceiro]);
      }

      if (db.casamentos[target]) {
        return reply(`⚠️ Essa pessoa já está casada com @${db.casamentos[target].parceiro.split('@')[0]}!`, [db.casamentos[target].parceiro]);
      }

      updateDatabase((d) => {
        d.pedidosCasamento[target] = sender;
      });

      return reply(`💍 @${sender.split('@')[0]} pediu @${target.split('@')[0]} em casamento!\n\nUse /aceitar ou /recusar para responder ao pedido.`, [sender, target]);
    }

    case 'aceitar': {
      const noivo = db.pedidosCasamento[sender];
      if (!noivo) {
        return reply('⚠️ Você não tem nenhum pedido de casamento pendente.');
      }

      // Validar se o noivo já não casou com outro no meio tempo
      if (db.casamentos[noivo]) {
        updateDatabase((d) => {
          delete d.pedidosCasamento[sender];
        });
        return reply('⚠️ O pedido expirou pois a pessoa já se casou com outro.');
      }

      updateDatabase((d) => {
        d.casamentos[sender] = { parceiro: noivo, since: Date.now() };
        d.casamentos[noivo] = { parceiro: sender, since: Date.now() };
        delete d.pedidosCasamento[sender];
        delete d.pedidosCasamento[noivo];
      });

      return reply(`💍 Parabéns! @${sender.split('@')[0]} e @${noivo.split('@')[0]} agora estão casados! 🎉\nQue essa união seja repleta de felicidade!`, [sender, noivo]);
    }

    case 'recusar': {
      const noivo = db.pedidosCasamento[sender];
      if (!noivo) {
        return reply('⚠️ Você não tem nenhum pedido de casamento pendente.');
      }

      updateDatabase((d) => {
        delete d.pedidosCasamento[sender];
      });

      return reply(`💔 O pedido de casamento de @${noivo.split('@')[0]} foi recusado por @${sender.split('@')[0]}... Fica para a próxima!`, [noivo, sender]);
    }

    case 'divorcio': {
      if (!db.casamentos[sender]) {
        return reply('⚠️ Você não está casado(a).');
      }

      const parceiro = db.casamentos[sender].parceiro;

      updateDatabase((d) => {
        delete d.casamentos[sender];
        delete d.casamentos[parceiro];
      });

      return reply(`💔 Triste notícia! @${sender.split('@')[0]} e @${parceiro.split('@')[0]} se divorciaram... A vida segue.`, [sender, parceiro]);
    }

    case 'perfil': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const infoCasamento = db.casamentos[target];
      
      let status = 'Solteiro(a) 🍃';
      let mencoes = [];

      if (infoCasamento) {
        const parceiro = infoCasamento.parceiro;
        const tempo = formatDuration(Date.now() - infoCasamento.since);
        status = `Casado(a) com @${parceiro.split('@')[0]} há ${tempo} 💍`;
        mencoes.push(parceiro);
      }

      const strPerfil = `👤 *PERFIL DE USUÁRIO*\n\n` +
                        `• *Usuário:* @${targetName}\n` +
                        `• *Status:* ${status}`;
      
      mencoes.push(target);
      return reply(strPerfil, mencoes);
    }

    case 'gay': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      // Gerar porcentagem aleatória
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Hetero puro! 🥖';
      if (pct > 20) desc = 'Um pouquinho suspeito... 🤔';
      if (pct > 50) desc = 'Já está saindo do armário! 🌈';
      if (pct > 80) desc = 'Gay assumidíssimo! 🏳️‍🌈✨';

      return reply(`🏳️‍🌈 *TESTE GAY*\n\n@${targetName} é *${pct}%* gay!\nStatus: ${desc}`, [target]);
    }

    case 'romance': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém para calcular o romance! Exemplo: /romance @marcar');
      }

      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Você não pode calcular romance com você mesmo!');
      }

      // Gerar compatibilidade consistente baseada nos JIDs (para ser engraçado/fixo)
      const combined = (sender + target).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const pct = combined % 101;
      
      let msgRomance = '';
      if (pct < 20) msgRomance = 'Melhor continuarem apenas conhecidos... 🥶';
      else if (pct < 50) msgRomance = 'Amizade é o caminho seguro. 🤝';
      else if (pct < 80) msgRomance = 'Tem química! Rolaria um clima. 😏';
      else msgRomance = 'Almas gêmeas! Casamento à vista! 💍💖';

      return reply(`💖 *TESTE DE COMPATIBILIDADE* 💖\n\n` +
                   `• @${sender.split('@')[0]}\n` +
                   `• @${target.split('@')[0]}\n\n` +
                   `Compatibilidade: *${pct}%*\n\n${msgRomance}`, [sender, target]);
    }

    case 'corno': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Fiel e seguro(a)! 😇';
      if (pct > 20) desc = 'Desconfie dos amigos próximos... 🤔';
      if (pct > 50) desc = 'O chifre já tá rasgando o teto! 🐂';
      if (pct > 80) desc = 'Rei/Rainha do gado! Precisa passar na porta de lado! 🐮👑';

      return reply(`🐂 *TESTE DE CORNO*\n\n@${targetName} é *${pct}%* corno(a)!\nStatus: ${desc}`, [target]);
    }

    case 'feio': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Um colírio para os olhos! ✨';
      if (pct > 20) desc = 'Passável se apagar a luz... 👀';
      if (pct > 50) desc = 'Assusta até o espelho! 🪞💥';
      if (pct > 80) desc = 'Só a mãe ama! Nível Shrek! 🧌';

      return reply(`👹 *MEDIDOR DE FEIURA*\n\n@${targetName} é *${pct}%* feio(a)!\nStatus: ${desc}`, [target]);
    }

    case 'gostoso': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Precisa melhorar essa skin... 😅';
      if (pct > 20) desc = 'Na média, dá pro gasto! 😉';
      if (pct > 50) desc = 'Um espetáculo da natureza! 🔥';
      if (pct > 80) desc = 'Modelo internacional! Perfeição pura! 💎🔥';

      return reply(`🔥 *MEDIDOR DE GOSTOSURA*\n\n@${targetName} é *${pct}%* gostoso(a)!\nStatus: ${desc}`, [target]);
    }

    case 'bebado': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Sobriedade total, bebeu só água! 💧';
      if (pct > 20) desc = 'Meio alegre, já tá falando alto! 🍻';
      if (pct > 50) desc = 'Tropeçando nas pernas e mandando áudio pro ex! 🍺🥴';
      if (pct > 80) desc = 'Perdeu a noção, abraçando o vaso sanitário! 🍾🤪';

      return reply(`🍺 *MEDIDOR DE EMBRIAGUEZ*\n\n@${targetName} está *${pct}%* bêbado(a)!\nStatus: ${desc}`, [target]);
    }

    case 'chato': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'Gente boa demais, um amor de pessoa! ❤️';
      if (pct > 20) desc = 'Às vezes dá uma irritada, mas é suportável. 🥱';
      if (pct > 50) desc = 'Insuportável! Ninguém aguenta 5 minutos de conversa! 🙄';
      if (pct > 80) desc = 'Nível supremo de chatice! Nem o Bot aguenta! 🗣️❌';

      return reply(`🙄 *MEDIDOR DE CHATICE*\n\n@${targetName} é *${pct}%* chato(a)!\nStatus: ${desc}`, [target]);
    }

    case 'sortudo': {
      const target = mentioned[0] || sender;
      const targetName = target.split('@')[0];
      const pct = Math.floor(Math.random() * 101);
      
      let desc = 'A azaração em pessoa, se chover nescau o dente cai! ⚡';
      if (pct > 20) desc = 'Sorte normal do dia a dia. 🍀';
      if (pct > 50) desc = 'Hoje o dia tá para peixe! ✨';
      if (pct > 80) desc = 'Ganhou na loteria da vida! Abençoado(a)! 🎰💎';

      return reply(`🍀 *MEDIDOR DE SORTE*\n\n@${targetName} é *${pct}%* sortudo(a)!\nStatus: ${desc}`, [target]);
    }

    case 'beijo': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém para beijar! Exemplo: /beijo @marcar');
      }

      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Você tentou se beijar no espelho! 🪞💋');
      }

      return reply(`💋 @${sender.split('@')[0]} deu um beijo super carinhoso em @${target.split('@')[0]}! 😘❤️`, [sender, target]);
    }

    case 'tapa': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém para dar um tapa! Exemplo: /tapa @marcar');
      }

      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Você deu um tapa na própria cara! Por que fez isso?! 🤦‍♂️');
      }

      return reply(`🖐️💥 @${sender.split('@')[0]} deu um puta tapa estalado na cara de @${target.split('@')[0]}! 😱`, [sender, target]);
    }

    case 'mamada': {
      if (!mentioned || mentioned.length === 0) {
        return reply('⚠️ Você precisa marcar alguém! Exemplo: /mamada @marcar');
      }

      const target = mentioned[0];
      if (target === sender) {
        return reply('⚠️ Aí não né... contorcionismo?! 😳');
      }

      return reply(`🥛😳 @${sender.split('@')[0]} deu uma mamada caprichada em @${target.split('@')[0]}! Que isso papai! 🔥`, [sender, target]);
    }

    case 'gozar': {
      if (!mentioned || mentioned.length === 0) {
        return reply(`💦🤪 @${sender.split('@')[0]} não aguentou a emoção e gozou de felicidade! 🫣`, [sender]);
      }

      const target = mentioned[0];
      if (target === sender) {
        return reply(`💦🤪 @${sender.split('@')[0]} gozou sozinho(a) de tanta emoção! 🫣`, [sender]);
      }

      return reply(`💦🤪 @${sender.split('@')[0]} gozou de tanta emoção em cima de @${target.split('@')[0]}! 🫣`, [sender, target]);
    }

    default:
      break;
  }
}
