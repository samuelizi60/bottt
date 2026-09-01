import { getUser, updateUser, deductBalance, addBalance, addXP } from '../database/sqlite.js';
import { askAi } from '../utils/aiService.js';
import { calculateBonusRewards } from '../utils/bonusCalculator.js';
import { validateEconomicValue, sanitizeMoney, sanitizeXP } from '../utils/economicValidation.js';

async function getAiCommentary(prompt, sysInstruction) {
  try {
    const res = await askAi(prompt, sysInstruction);
    if (res) return res.trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return null;
}

export async function handleMinigamesCommands(sock, msg, command, args, sender, mentioned) {
  const from = msg.key.remoteJid;
  const reply = async (text, mentions = []) => {
    await sock.sendMessage(from, { text, mentions }, { quoted: msg });
  };

  const user = getUser(sender);

  switch (command) {
    case 'blackjack':
    case '21': {
      const rawBet = sanitizeMoney(args[0], 500);
      if (!validateEconomicValue(args[0]) || rawBet <= 0) {
        return reply('⚠️ Informe uma aposta válida maior que zero.\nExemplo: `/blackjack 1000`');
      }

      // Tenta deduzir a aposta atómicamente ANTES do resultado
      const deducted = await deductBalance(sender, rawBet);
      if (!deducted) {
        return reply(`⚠️ Você não possui **$${rawBet.toLocaleString('pt-BR')}** na carteira para apostar.`);
      }

      const pCard1 = Math.floor(Math.random() * 10) + 1;
      const pCard2 = Math.floor(Math.random() * 10) + 1;
      const dCard1 = Math.floor(Math.random() * 10) + 1;
      const dCard2 = Math.floor(Math.random() * 10) + 1;

      const playerTotal = pCard1 + pCard2;
      const dealerTotal = dCard1 + dCard2;

      let won = false;
      let draw = false;

      if (playerTotal > 21) {
        won = false;
      } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
        won = true;
      } else if (playerTotal === dealerTotal) {
        draw = true;
      }

      let netProfit = 0;
      let xpEarned = 0;

      if (won) {
        const { finalCoins, finalXp } = calculateBonusRewards(user, rawBet, 20, 'blackjack');
        netProfit = sanitizeMoney(finalCoins);
        xpEarned = sanitizeXP(finalXp);
        // Devolve a aposta + o lucro atómicamente
        await addBalance(sender, rawBet + netProfit);
        if (xpEarned > 0) await addXP(sender, xpEarned);
      } else if (draw) {
        // Devolve a aposta atómicamente em caso de empate
        await addBalance(sender, rawBet);
      }

      const sys = 'Você é um crupiê elegante e sarcástico de cassino em Las Vegas num bot de WhatsApp. Escreva 1 comentário narrativo dinâmico de 15 palavras sobre o resultado da rodada de Blackjack. Sem aspas.';
      const prompt = `O jogador tirou ${pCard1} e ${pCard2} (total ${playerTotal}). O crupiê tirou ${dCard1} e ${dCard2} (total ${dealerTotal}). Resultado: ${won ? 'Jogador Venceu' : draw ? 'Empate' : 'Jogador Perdeu'}.`;
      const aiStory = await getAiCommentary(prompt, sys) || (won ? 'As cartas sorriram para você na mesa!' : draw ? 'Cartas idênticas! Ninguém ganha, ninguém perde.' : 'A casa sempre vence!');

      const text = `🃏 *BLACKJACK (21) CASSINO IA* 🃏\n\n` +
                   `🎴 *Suas Cartas:* [${pCard1}] [${pCard2}] ➔ *Total: ${playerTotal}*\n` +
                   `🎰 *Mesa do Crupiê:* [${dCard1}] [${dCard2}] ➔ *Total: ${dealerTotal}*\n\n` +
                   `${won ? `🎉 *VOCÊ VENCEU!* (+$${netProfit.toLocaleString('pt-BR')} moedas | +${xpEarned} XP)` : draw ? '⚖️ *EMPATE!* Sua aposta foi devolvida.' : `💥 *VOCÊ PERDEU!* (-$${rawBet.toLocaleString('pt-BR')})`}\n\n` +
                   `💬 *Comentário do Crupiê (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'poker': {
      const rawBet = sanitizeMoney(args[0], 500);
      if (!validateEconomicValue(args[0]) || rawBet <= 0) {
        return reply('⚠️ Informe uma aposta válida maior que zero.\nExemplo: `/poker 1000`');
      }

      // Deduz a aposta atómicamente ANTES de jogar
      const deducted = await deductBalance(sender, rawBet);
      if (!deducted) {
        return reply(`⚠️ Você precisa de **$${rawBet.toLocaleString('pt-BR')}** na carteira para jogar Poker.`);
      }

      const hands = ['Mão Alta', 'Um Par', 'Dois Pares', 'Trinca', 'Sequência', 'Flush', 'Full House', 'Quadra', 'Royal Flush'];
      const playerHandIdx = Math.floor(Math.random() * hands.length);
      const botHandIdx = Math.floor(Math.random() * hands.length);

      const won = playerHandIdx > botHandIdx;
      const draw = playerHandIdx === botHandIdx;

      let gain = 0;
      let xpEarned = 0;

      if (won) {
        const rawGain = Math.floor(rawBet * (1.5 + (playerHandIdx * 0.3)));
        const { finalCoins, finalXp } = calculateBonusRewards(user, rawGain, 25, 'poker');
        gain = sanitizeMoney(finalCoins);
        xpEarned = sanitizeXP(finalXp);
        await addBalance(sender, rawBet + gain);
        if (xpEarned > 0) await addXP(sender, xpEarned);
      } else if (draw) {
        await addBalance(sender, rawBet);
      }

      const sys = 'Você é um narrador profissional do World Series of Poker no WhatsApp. Escreva 1 comentário dinâmico e empolgante de 15 palavras sobre o showdown final. Sem aspas.';
      const prompt = `Showdown! Jogador revelou ${hands[playerHandIdx]} contra a mesa com ${hands[botHandIdx]}. Resultado: ${won ? 'Vitória' : draw ? 'Empate' : 'Derrota'}.`;
      const aiStory = await getAiCommentary(prompt, sys) || (won ? 'Que jogada espetacular na mesa de apostas!' : draw ? 'Empate perfeito na mesa!' : 'Seu blefe não funcionou desta vez.');

      const text = `♠️ *MESA DE POKER HIGH ROLLER IA* ♠️\n\n` +
                   `🎴 *Sua Mão:* **${hands[playerHandIdx]}**\n` +
                   `🤖 *Mão da Banca:* **${hands[botHandIdx]}**\n\n` +
                   `${won ? `🏆 *VITÓRIA NO POKER!* (+$${gain.toLocaleString('pt-BR')} moedas | +${xpEarned} XP)` : draw ? '⚖️ *EMPATE!* Aposta devolvida.' : `💸 *PERDEU A MÃO!* (-$${rawBet.toLocaleString('pt-BR')})`}\n\n` +
                   `🎙️ *Narrador de Poker (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'cacaniquel':
    case 'slots': {
      const rawBet = sanitizeMoney(args[0], 500);
      if (!validateEconomicValue(args[0]) || rawBet <= 0) {
        return reply('⚠️ Informe uma aposta válida maior que zero.\nExemplo: `/slots 500`');
      }

      // Deduz a aposta atómicamente ANTES de girar
      const deducted = await deductBalance(sender, rawBet);
      if (!deducted) {
        return reply(`⚠️ Saldo insuficiente na carteira para o Caça-Níquel.`);
      }

      const symbols = ['💎', '7️⃣', '🔔', '🍋', '🍒', '🌟'];
      const s1 = symbols[Math.floor(Math.random() * symbols.length)];
      const s2 = symbols[Math.floor(Math.random() * symbols.length)];
      const s3 = symbols[Math.floor(Math.random() * symbols.length)];

      let multiplier = 0;
      if (s1 === s2 && s2 === s3) {
        multiplier = s1 === '7️⃣' ? 10 : s1 === '💎' ? 7 : 5;
      } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        multiplier = 2;
      }

      let profit = 0;
      let xpEarned = 0;

      if (multiplier > 0) {
        const rawProfit = rawBet * multiplier;
        const { finalCoins, finalXp } = calculateBonusRewards(user, rawProfit, 15, 'slots');
        profit = sanitizeMoney(finalCoins);
        xpEarned = sanitizeXP(finalXp);
        await addBalance(sender, rawBet + profit);
        if (xpEarned > 0) await addXP(sender, xpEarned);
      }

      const sys = 'Você é uma maquina Caça-Níquel animada e misteriosa de Las Vegas. Escreva 1 frase mágica ou sarcástica de 12 palavras sobre o giro das roletas. Sem aspas.';
      const prompt = `Resultado das roletas: [${s1}] [${s2}] [${s3}]. Multiplicador: ${multiplier}x.`;
      const aiStory = await getAiCommentary(prompt, sys) || 'A roleta girou e o destino foi selado!';

      const text = `🎰 *CAÇA-NÍQUEL CASSINO IA* 🎰\n\n` +
                   `╔═════════════╗\n` +
                   `  [ ${s1} | ${s2} | ${s3} ]  \n` +
                   `╚═════════════╝\n\n` +
                   `${multiplier > 0 ? `🎉 *JACKPOT!* Ganhou **${multiplier}x** (+$${profit.toLocaleString('pt-BR')} moedas | +${xpEarned} XP)` : `💔 *NÃO FOI DESSA VEZ!* (-$${rawBet.toLocaleString('pt-BR')})`}\n\n` +
                   `✨ *Voz da Roleta (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    case 'pescar':
    case 'pesca': {
      const now = Date.now();
      const COOLDOWN = 5 * 60 * 1000; // 5 minutos de cooldown persistente

      const lastPesca = Number(user.last_pescar) || 0;
      if (now - lastPesca < COOLDOWN) {
        const remaining = COOLDOWN - (now - lastPesca);
        const minutes = Math.floor(remaining / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        return reply(`⏳ *SUA VARA DE PESCA ESTÁ RECOLHIDA!*\n\nVocê precisa esperar os peixes voltarem a nadar.\n⏱️ *Aguarde:* *${minutes}m ${seconds}s* para pescar novamente.`);
      }

      const catches = [
        { name: '🐟 Tainha Fresca', val: 300 },
        { name: '🐠 Peixe Palhaço', val: 600 },
        { name: '🐙 Polvo Gigante', val: 1500 },
        { name: '🦈 Tubarão Martelo', val: 4000 },
        { name: '👑 Peixe Dourado Místico', val: 10000 },
        { name: '👟 Bota Velha Furada', val: 10 }
      ];

      const item = catches[Math.floor(Math.random() * catches.length)];
      const { finalCoins, finalXp, bonusCoinsApplied, bonusXpApplied } = calculateBonusRewards(user, item.val, 15, 'fishing');

      const safeCoins = sanitizeMoney(finalCoins);
      const safeXp = sanitizeXP(finalXp);

      await addBalance(sender, safeCoins);
      if (safeXp > 0) await addXP(sender, safeXp);
      await updateUser(sender, { last_pescar: now });

      const updatedUser = getUser(sender);
      const levelUpMsg = (updatedUser.level > user.level) ? `\n🎉 *LEVEL UP!* Você subiu para o *Nível ${updatedUser.level}*!` : '';

      const sys = 'Você é um velho pescador lendário e contador de histórias à beira do rio. Escreva 1 frase pitoresca de 15 palavras sobre o momento da fisgada. Sem aspas.';
      const prompt = `O pescador jogou a linha e fisgou um(a): ${item.name} valendo ${item.val} moedas.`;
      const aiStory = await getAiCommentary(prompt, sys) || 'A vara curvou forte e a água espumou!';

      const bonusCoinsStr = bonusCoinsApplied > 0 ? ` *(+$${bonusCoinsApplied.toLocaleString('pt-BR')} bônus)*` : '';
      const bonusXpStr = bonusXpApplied > 0 ? ` *(+${bonusXpApplied} XP bônus)*` : '';

      const text = `🎣 *EXPEDIÇÃO DE PESCA IA* 🎣\n\n` +
                   `🌊 Você jogou o anzol no lago e fisgou:\n` +
                   `👉 **${item.name}**!\n` +
                   `💰 *Valor de Venda:* +$${safeCoins.toLocaleString('pt-BR')} moedas${bonusCoinsStr}\n` +
                   `✨ *XP da Pesca:* +${safeXp} XP${bonusXpStr}${levelUpMsg}\n\n` +
                   `📜 *Relato do Velho Pescador (IA):*\n_"${aiStory}"_`;

      return reply(text);
    }

    default:
      break;
  }
}
