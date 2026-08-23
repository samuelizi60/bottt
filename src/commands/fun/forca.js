// Módulo de Jogo da Forca com Geração Dinâmica de Palavras via IA
import { askAi } from '../../utils/aiService.js';

const fallbackWords = [
  { word: 'WHATSAPP', hint: 'Aplicativo de mensagens' },
  { word: 'TECNOLOGIA', hint: 'Ciência dos recursos computacionais' },
  { word: 'PROGRAMACAO', hint: 'Arte de escrever código' },
  { word: 'AUTOMATIONBOT', hint: 'Nome do seu bot preferido' },
  { word: 'DESENVOLVIMENTO', hint: 'Processo de criação de software' },
  { word: 'BATERIA', hint: 'Fonte de energia do celular' },
  { word: 'ALGORITMO', hint: 'Sequência lógica de instruções' },
  { word: 'COMPUTADOR', hint: 'Máquina eletrônica de processamento de dados' },
  { word: 'INTERNET', hint: 'Rede mundial de computadores' },
  { word: 'ASTRONAUTA', hint: 'Viajante do espaço sideral' },
  { word: 'GIRASSOL', hint: 'Planta que segue a luz do sol' },
  { word: 'DINOSSAURO', hint: 'Réptil gigante pré-histórico' },
  { word: 'ARQUITETURA', hint: 'Arte e técnica de projetar edificações' },
  { word: 'VULCAO', hint: 'Montanha que expele lava e cinzas' },
  { word: 'CACHOEIRA', hint: 'Queda d’água em um rio' },
  { word: 'ESCORPIAO', hint: 'Aracnídeo venenoso com ferrão' },
  { word: 'BIBLIOTECA', hint: 'Lugar repleto de livros' },
  { word: 'TELESCOPIO', hint: 'Instrumento para observar as estrelas' },
  { word: 'GALAXIA', hint: 'Grande sistema de estrelas e poeira' },
  { word: 'PINGUIM', hint: 'Ave marinha que não voa e vive no frio' },
  { word: 'HAMBURGUER', hint: 'Lanche popular com carne e pão' },
  { word: 'MICROSCOPIO', hint: 'Aparelho para ver coisas minúsculas' },
  { word: 'HELICOPTERO', hint: 'Aeronave que voa com hélices superiores' },
  { word: 'CAMALEAO', hint: 'Réptil famoso por mudar de cor' },
  { word: 'PIRATA', hint: 'Navegador fora-da-lei dos mares' },
  { word: 'ESTRELA', hint: 'Corpo celeste reluzente no céu' },
  { word: 'ORQUESTRA', hint: 'Conjunto de músicos com vários instrumentos' },
  { word: 'LABIRINTO', hint: 'Conjunto de caminhos cruzados difícil de sair' },
  { word: 'VAMPIRO', hint: 'Ser mitológico que se alimenta de sangue' },
  { word: 'SUBMARINO', hint: 'Embarcação que navega debaixo da água' }
];

// Conjunto para evitar repetições recentes de palavras
const usedWords = new Set();

// Armazena os jogos ativos por chat: { [chatJid]: { word, hint, guessedLetters: [], wrongAttempts, maxAttempts } }
export const activeForcaGames = new Map();

// Remove acentos e caracteres especiais para comparação do jogo
function normalizeString(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

// Gera palavra e dica inédita usando Inteligência Artificial (Groq / OpenAI / OpenRouter)
async function generateAiForcaWord() {
  const categories = ['animais', 'tecnologia', 'comidas', 'profissões', 'natureza', 'filmes e séries', 'objetos do dia a dia', 'geografia', 'ciência', 'esportes'];
  const category = categories[Math.floor(Math.random() * categories.length)];

  const systemInstruction = 'Você é um gerador de Palavras para o Jogo da Forca em um bot de WhatsApp. Sua tarefa é criar 1 palavra inédita, única e criativa em português do Brasil (apenas uma única palavra simples ou composta sem espaços nem hífen, entre 4 e 13 letras) acompanhada de uma dica direta e clara. Responda EXCLUSIVAMENTE em formato JSON estrito com as chaves: "palavra" (string maiúscula sem acentos) e "dica" (string). Não inclua marcas de markdown nem qualquer texto além do JSON.';
  
  const prompt = `Gere 1 palavra inédita em português do Brasil para o jogo da forca sobre o tema: ${category}.`;

  try {
    const rawAnswer = await askAi(prompt, systemInstruction);
    const cleanJson = rawAnswer.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (parsed.palavra && parsed.dica) {
      let cleanWord = normalizeString(parsed.palavra.trim().split(/\s+/)[0]).replace(/[^A-Z]/g, '');
      if (cleanWord.length >= 3 && cleanWord.length <= 15 && !usedWords.has(cleanWord)) {
        usedWords.add(cleanWord);
        if (usedWords.size > 100) usedWords.clear();
        return {
          word: cleanWord,
          hint: parsed.dica.trim()
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ Falha ao gerar palavra da forca com IA, utilizando banco fallback:', err.message);
  }

  // Fallback se a IA falhar ou expirar
  const available = fallbackWords.filter(w => !usedWords.has(w.word));
  const pool = available.length > 0 ? available : fallbackWords;
  const randomObj = pool[Math.floor(Math.random() * pool.length)];
  const cleanWord = normalizeString(randomObj.word).replace(/[^A-Z]/g, '');
  
  usedWords.add(cleanWord);
  if (usedWords.size > 100) usedWords.clear();

  return {
    word: cleanWord,
    hint: randomObj.hint
  };
}

// Gera barra visual de vidas
function renderHangingStatus(wrongAttempts, maxAttempts) {
  const remaining = maxAttempts - wrongAttempts;
  return '❤️'.repeat(remaining) + '🖤'.repeat(wrongAttempts);
}

// Formata o texto exibido da palavra
function renderMaskedWord(word, guessedLetters) {
  return word
    .split('')
    .map(letter => (guessedLetters.includes(letter) ? letter : '_'))
    .join(' ');
}

// Handler principal do comando /forca
export async function handleForcaCommand(sock, msg, args, sender) {
  const from = msg.key.remoteJid;
  const inputArg = args.join(' ').trim();
  const normalizedArg = normalizeString(inputArg);

  // Se passou 'reset' ou 'novo', encerra o jogo atual se houver e inicia um novo
  if (['RESET', 'NOVO', 'REINICIAR', 'CANCELAR'].includes(normalizedArg)) {
    activeForcaGames.delete(from);
    return startNewForcaGame(sock, msg, from);
  }

  // Se já houver um jogo ativo
  let game = activeForcaGames.get(from);

  if (!game) {
    return startNewForcaGame(sock, msg, from);
  }

  // Se o usuário passou um palpite junto com o comando (ex: /forca A ou /forca TECNOLOGIA)
  if (normalizedArg.length > 0) {
    return processForcaGuess(sock, msg, from, normalizedArg, sender);
  }

  // Se não passou argumentos e já há jogo ativo, exibe o estado atual
  const masked = renderMaskedWord(game.word, game.guessedLetters);
  const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);

  const text = `🎯 *JOGO DA FORCA EM ANDAMENTO*\n\n` +
               `💡 *Dica:* ${game.hint}\n` +
               `🔤 *Palavra:* \`${masked}\`\n\n` +
               `❤️ *Vidas:* ${lives} (${game.maxAttempts - game.wrongAttempts}/${game.maxAttempts})\n` +
               `📝 *Letras já tentadas:* ${game.guessedLetters.length > 0 ? game.guessedLetters.join(', ') : 'Nenhuma'}\n\n` +
               `👉 *Como jogar:* Envie uma letra ou a palavra inteira no chat (ex: \`A\` ou \`/forca A\`)!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}

// Inicia um novo jogo com IA
export async function startNewForcaGame(sock, msg, from) {
  await sock.sendMessage(from, { text: '🎯 *Gerando nova palavra secreta com IA, aguarde...*' }, { quoted: msg });

  const gameData = await generateAiForcaWord();

  const game = {
    word: gameData.word,
    hint: gameData.hint,
    guessedLetters: [],
    wrongAttempts: 0,
    maxAttempts: 6
  };

  activeForcaGames.set(from, game);

  const masked = renderMaskedWord(game.word, game.guessedLetters);
  const lives = renderHangingStatus(0, game.maxAttempts);

  const text = `🎯 *NOVO JOGO DA FORCA DE IA INICIADO!*\n\n` +
               `💡 *Dica:* ${game.hint}\n` +
               `🔤 *Palavra:* \`${masked}\` (${game.word.length} letras)\n\n` +
               `❤️ *Vidas:* ${lives}\n\n` +
               `💬 *Como jogar:* Envie qualquer letra ou palpite diretamente no chat!`;

  return sock.sendMessage(from, { text }, { quoted: msg });
}

// Processa o chute do usuário no chat
export async function processForcaGuess(sock, msg, from, guess, sender) {
  const game = activeForcaGames.get(from);
  if (!game) return false;

  const cleanGuess = normalizeString(guess).replace(/[^A-Z]/g, '');
  if (!cleanGuess || guess.startsWith('/')) return false;

  // Se for apenas uma letra
  if (cleanGuess.length === 1) {
    if (game.guessedLetters.includes(cleanGuess)) {
      await sock.sendMessage(from, { text: `⚠️ A letra *${cleanGuess}* já foi tentada anteriormente!` }, { quoted: msg });
      return true;
    }

    game.guessedLetters.push(cleanGuess);

    // Letra correta
    if (game.word.includes(cleanGuess)) {
      const masked = renderMaskedWord(game.word, game.guessedLetters);
      
      // Verificar vitória
      if (!masked.includes('_')) {
        activeForcaGames.delete(from);
        const text = `🎉 *PARABÉNS!* @${sender.split('@')[0]} acertou a última letra e venceu a Forca!\n\n` +
                     `🔤 *Palavra completa:* *${game.word}* 🏆`;
        await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
        return true;
      }

      const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);
      const text = `✅ Boa! A letra *${cleanGuess}* existe na palavra!\n\n` +
                   `🔤 *Palavra:* \`${masked}\`\n` +
                   `❤️ *Vidas:* ${lives}\n` +
                   `📝 *Tentativas:* ${game.guessedLetters.join(', ')}`;
      await sock.sendMessage(from, { text }, { quoted: msg });
      return true;
    } 
    // Letra incorreta
    else {
      game.wrongAttempts += 1;
      const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);

      // Verificar derrota
      if (game.wrongAttempts >= game.maxAttempts) {
        activeForcaGames.delete(from);
        const text = `☠️ *GAME OVER!* As vidas acabaram e a forca foi armada!\n\n` +
                     `❌ *A palavra secreta era:* *${game.word}*`;
        await sock.sendMessage(from, { text }, { quoted: msg });
        return true;
      }

      const masked = renderMaskedWord(game.word, game.guessedLetters);
      const text = `❌ A letra *${cleanGuess}* NÃO existe na palavra!\n\n` +
                   `🔤 *Palavra:* \`${masked}\`\n` +
                   `❤️ *Vidas:* ${lives} (${game.maxAttempts - game.wrongAttempts}/${game.maxAttempts})\n` +
                   `📝 *Tentativas:* ${game.guessedLetters.join(', ')}`;
      await sock.sendMessage(from, { text }, { quoted: msg });
      return true;
    }
  } 
  // Se for tentativa de adivinhar a palavra inteira
  else {
    if (cleanGuess === game.word) {
      activeForcaGames.delete(from);
      const text = `🎉 *INCRÍVEL!* @${sender.split('@')[0]} adivinhou a palavra inteira e venceu a Forca!\n\n` +
                   `🔤 *Palavra:* *${game.word}* 🏆`;
      await sock.sendMessage(from, { text, mentions: [sender] }, { quoted: msg });
      return true;
    } else {
      game.wrongAttempts += 1;
      const lives = renderHangingStatus(game.wrongAttempts, game.maxAttempts);

      if (game.wrongAttempts >= game.maxAttempts) {
        activeForcaGames.delete(from);
        const text = `☠️ *GAME OVER!* A palavra *${cleanGuess}* estava errada e suas vidas acabaram!\n\n` +
                     `❌ *A palavra secreta era:* *${game.word}*`;
        await sock.sendMessage(from, { text }, { quoted: msg });
        return true;
      }

      const masked = renderMaskedWord(game.word, game.guessedLetters);
      const text = `❌ A palavra *${cleanGuess}* está errada!\n\n` +
                   `🔤 *Palavra:* \`${masked}\`\n` +
                   `❤️ *Vidas:* ${lives}`;
      await sock.sendMessage(from, { text }, { quoted: msg });
      return true;
    }
  }
}
