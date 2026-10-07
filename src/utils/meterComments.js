import { askAi } from './aiService.js';

/**
 * Fallbacks variados e divertidos caso a IA demore ou falhe na requisição
 */
const FALLBACKS = {
  gay: [
    (p) => p < 25 ? 'Puro suco de hétero topzeira.' : p < 60 ? 'Tem um pezinho no arco-íris, não disfarça.' : p < 85 ? 'Já decorou todas as músicas da Lady Gaga.' : 'Brilha no escuro de tão assumido! 🏳️‍🌈✨',
    (p) => p < 25 ? 'Heterossexualidade intacta... por enquanto.' : p < 60 ? 'Olhou meio torto pro coleguinha do lado ali hein.' : p < 85 ? 'Comprovado cientificamente pelo selo glitter de qualidade.' : 'Gay lendário, nível diva pop no auge! 💅',
    (p) => p < 25 ? 'Mais reto que poste de iluminação.' : p < 60 ? 'Na dúvida, curtiu o stories com segundas intenções.' : p < 85 ? 'A bandeira tá tremulando forte aqui.' : 'O armário virou portal e ele já atravessou faz tempo! 🌈'
  ],
  corno: [
    (p) => p < 25 ? 'Coração blindado e lealdade comprovada.' : p < 60 ? 'Dá uma checada no WhatsApp da sua cara metade por precaução...' : p < 85 ? 'O chifre já tá raspando nos cabos de alta tensão.' : 'O dono da fazenda! Precisa entrar de lado em qualquer cômodo! 🐂',
    (p) => p < 25 ? 'Fiel como cachorro de interior.' : p < 60 ? 'Aquela pessoa dizendo que é "só um amigo"... sei.' : p < 85 ? 'Dói na cabeça quando o tempo fecha, né?' : 'Sócio majoritário da Associação dos Bois Bravos! 🐮👑',
    (p) => p < 25 ? 'Zero vestígios de galha detectados.' : p < 60 ? 'Suspeito... o celular dela vive virado pra baixo.' : p < 85 ? 'Se passar perto do teto vai furar o gesso.' : 'Rei supremo do gado! A boiada chora de inveja!'
  ],
  feio: [
    (p) => p < 25 ? 'Padrãozinho de capa de revista, tá com tudo.' : p < 60 ? 'Não assusta na luz apagada, dá pra encarar.' : p < 85 ? 'O espelho pede socorro toda vez que você passa.' : 'Nível Shrek no pântano! Nem o Photoshop salva! 🧌',
    (p) => p < 25 ? 'O charme em pessoa, beleza pura.' : p < 60 ? 'Bonito de longe, mas de perto parece que tá de longe.' : p < 85 ? 'Se a beleza fosse crime, você seria um cidadão exemplar.' : 'A mãe jura que é bonito por pura compaixão.',
    (p) => p < 25 ? 'Digno de propaganda de perfume caro.' : p < 60 ? 'Dá pro gasto se usar filtro do Instagram.' : p < 85 ? 'A beleza passou correndo e te esqueceu na calçada.' : 'Feiura nível lendário, o reflexo racha de susto!'
  ],
  gostoso: [
    (p) => p < 25 ? 'Tá precisando renovar a skin urgente.' : p < 60 ? 'Um nota 6 honesto, tem quem queira.' : p < 85 ? 'De parar o trânsito e causar acidente na avenida!' : 'Simplesmente um monumento! Uma obra de arte dos deuses! 🔥💎',
    (p) => p < 25 ? 'A academia tá com a mensalidade atrasada.' : p < 60 ? 'Charme de gente boa, dá um caldo.' : p < 85 ? 'Chamem os bombeiros porque a temperatura subiu aqui.' : 'Perfeição escandalosa! Atropela corações sem pedir licença! 🥵',
    (p) => p < 25 ? 'Skin padrão sem melhorias.' : p < 60 ? 'Arrume o cabelo e o ângulo que melhora.' : p < 85 ? 'Cheiro de perigo e beijo bom.' : 'Nível elite mundial! Não tem concorrência à altura!'
  ],
  bebado: [
    (p) => p < 25 ? '100% lúcido, bebeu suco de maçã.' : p < 60 ? 'Já tá rindo sozinho e falando mais alto que o som.' : p < 85 ? 'Tropeçou no vento e tá ligando pro ex com choro.' : 'Em coma etílico! Abraçando a privada e conversando com a parede! 🍻🥴',
    (p) => p < 25 ? 'Sobriedade intacta, motorista da rodada.' : p < 60 ? 'O grau tá batendo e a língua já tá enrolando.' : p < 85 ? 'Pedindo saideira pela 14ª vez consecutiva.' : 'Perdeu a dignidade, o sapato e a noção do tempo! 🍾'
  ],
  chato: [
    (p) => p < 25 ? 'Paz e amor, boa companhia pra qualquer rolê.' : p < 60 ? 'Às vezes dá aquela alfinetada desnecessária, mas passa.' : p < 85 ? '5 minutos de conversa e já dá vontade de fingir demência.' : 'Insuportável galáctico! Nem a própria sombra tem paciência! 🙄❌',
    (p) => p < 25 ? 'Gente finíssima, alma da festa.' : p < 60 ? 'Meio ranzinza quando acorda, normal.' : p < 85 ? 'Fiscal de conversa alheia, socorro.' : 'Nível supremo de chatice! O grupo inteiro no mudo por sua causa!'
  ],
  sortudo: [
    (p) => p < 25 ? 'Se chover sopa, você tá com um garfo na mão.' : p < 60 ? 'Na média, acha moeda de 1 real no sofá.' : p < 85 ? 'Abençoado! Pede um PIX que cai na conta.' : 'Malandro abençoado! Ganha na mega-sena até sem jogar! 🎰🍀',
    (p) => p < 25 ? 'Pisa no cocô até descalço dentro de casa.' : p < 60 ? 'Sorte padrão de quem acorda cedo.' : p < 85 ? 'O destino claramente tem seus favoritos.' : 'Aura dourada! A vida tá jogando no modo fácil pra você!'
  ],
  romance: [
    (p) => p < 25 ? 'Mais frio que o Titanic no iceberg. Melhor nem tentar.' : p < 60 ? 'Clima de amizade colorida no máximo.' : p < 85 ? 'Tá rolando um fogo escondido aí que todo mundo já percebeu! 😏' : 'Casamento marcado, padrinhos convidados e filhos no caminho! 💍💖',
    (p) => p < 25 ? 'Água e óleo. Dá match nem com reza braba.' : p < 60 ? 'Um date despretensioso pode ser divertido.' : p < 85 ? 'A química é forte, só falta um tomar vergonha na cara e admitir.' : 'Almas gêmeas de outras vidas! O cupido fez hora extra aqui! 💕'
  ]
};

function getRandomFallback(tipo, pct) {
  const list = FALLBACKS[tipo];
  if (!list || list.length === 0) return 'Resultado definitivo.';
  const fn = list[Math.floor(Math.random() * list.length)];
  return fn(pct);
}

/**
 * Gera um comentário dinâmico e engraçado via IA ou Fallback
 * @param {string} tipo Nome do medidor (gay, corno, feio, gostoso, bebado, chato, sortudo, romance)
 * @param {number} pct Porcentagem de 0 a 100
 * @param {string} nome Alvo da zoeira
 * @param {string|null} nome2 Segundo nome se for romance
 * @returns {Promise<string>}
 */
export async function generateMeterComment(tipo, pct, nome, nome2 = null) {
  const targetDesc = nome2 ? `entre @${nome} e @${nome2}` : `@${nome}`;
  
  const systemInstruction = `Você é o narrador espirituoso e engraçado de um bot brasileiro de WhatsApp de zoeira entre amigos.
Sua tarefa é fazer UM ÚNICO comentário curto (1 ou no máximo 2 frases), espontâneo, criativo, sarcástico e divertido sobre o resultado de um medidor/teste de porcentagem.
Regras:
1. NUNCA mencione que você é uma IA ou inteligência artificial.
2. Seja bem brasileiro, use gírias leves e naturais de grupo de amigos/WhatsApp sem exageros.
3. Não use aspas na resposta.
4. Não repita a porcentagem no texto, apenas faça o comentário/zoeira sobre o número.`;

  const prompt = nome2
    ? `Teste: Compatibilidade Amorosa / Romance\nAlvos: ${targetDesc}\nResultado: ${pct}%\nFaça um veredito curto e cômico sobre esse casal:`
    : `Teste: Medidor de ${tipo.toUpperCase()}\nAlvo: ${targetDesc}\nResultado: ${pct}%\nFaça um comentário curto e cômico sobre esse resultado:`;

  // Timeout de 3.5 segundos para resposta super rápida
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout IA zoeira')), 3500)
  );

  try {
    const aiPromise = askAi(prompt, systemInstruction);
    let comment = await Promise.race([aiPromise, timeoutPromise]);
    if (comment && comment.trim()) {
      // Limpeza de pontuações ou aspas excedentes
      comment = comment.replace(/^["']|["']$/g, '').trim();
      return comment;
    }
  } catch (err) {
    // Silencioso para fallback rápido
  }

  return getRandomFallback(tipo, pct);
}
