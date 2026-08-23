import { getRebirthBonus } from '../config/rebirthConfig.js';

/**
 * bonusCalculator.js
 * Utilitário centralizado de cálculo de bônus, atributos e estatísticas para o WhatsApp Automation Bot.
 * 
 * Integra:
 * 1. Progressão de Classe RPG (Tiers 1 a 4 por Nível)
 * 2. Buffs Ativos por Nível de Aura
 * 3. Habilidades Passivas de Pets
 * 4. Bônus de Prestígio (+10% por nível)
 * 5. Bônus de Evento Ativo (+15%)
 */

// 1. Tiers e Evolução de Classes RPG
export const RPG_CLASS_TIERS = {
  guerreiro: [
    { tier: 1, minLevel: 1, name: '⚔️ Recruta de Aço', hp: 200, atk: 35, bonusCoinPct: 15 },
    { tier: 2, minLevel: 15, name: '⚔️ Guerreiro de Aço', hp: 350, atk: 70, bonusCoinPct: 25 },
    { tier: 3, minLevel: 35, name: '⚔️ Cavaleiro Lendário', hp: 600, atk: 130, bonusCoinPct: 40 },
    { tier: 4, minLevel: 60, name: '⚔️ Senhor da Guerra', hp: 1000, atk: 220, bonusCoinPct: 60 }
  ],
  mago: [
    { tier: 1, minLevel: 1, name: '🔮 Aprendiz Arcano', hp: 130, atk: 55, bonusXpPct: 20 },
    { tier: 2, minLevel: 15, name: '🔮 Mago Arcano', hp: 240, atk: 105, bonusXpPct: 35 },
    { tier: 3, minLevel: 35, name: '🔮 Arquimago Supremo', hp: 420, atk: 190, bonusXpPct: 55 },
    { tier: 4, minLevel: 60, name: '🔮 Sábio da Eternidade', hp: 750, atk: 310, bonusXpPct: 80 }
  ],
  arqueiro: [
    { tier: 1, minLevel: 1, name: '🏹 Caçador de Bosque', hp: 150, atk: 45, bonusGamePct: 15 },
    { tier: 2, minLevel: 15, name: '🏹 Arqueiro Elfo', hp: 280, atk: 88, bonusGamePct: 25 },
    { tier: 3, minLevel: 35, name: '🏹 Atirador de Elite', hp: 490, atk: 160, bonusGamePct: 40 },
    { tier: 4, minLevel: 60, name: '🏹 Lorde das Flechas', hp: 850, atk: 260, bonusGamePct: 60 }
  ]
};

export function getClassData(className = 'guerreiro', userLevel = 1) {
  const normalized = (className || 'guerreiro').toLowerCase();
  const classList = RPG_CLASS_TIERS[normalized] || RPG_CLASS_TIERS.guerreiro;
  
  let currentTier = classList[0];
  for (const t of classList) {
    if (userLevel >= t.minLevel) {
      currentTier = t;
    }
  }
  return { classKey: normalized, ...currentTier };
}

// 2. Buffs por Nível de Aura
export function getAuraBuffs(auraPoints = 0) {
  if (auraPoints >= 1000000) return { title: '👑 Aura Divina Cósmica Suprema', xpCoinBonus: 5.00, bonusHp: 12000, bonusAtk: 3000 };
  if (auraPoints >= 500000) return { title: '🐲 Aura Dracônica Absoluta', xpCoinBonus: 3.00, bonusHp: 6000, bonusAtk: 1500 };
  if (auraPoints >= 350000) return { title: '🌌 Aura Multiversal', xpCoinBonus: 2.20, bonusHp: 4200, bonusAtk: 1050 };
  if (auraPoints >= 200000) return { title: '🌟 Aura Astral Imortal', xpCoinBonus: 1.70, bonusHp: 3000, bonusAtk: 750 };
  if (auraPoints >= 120000) return { title: '🛐 Aura Omnipotente', xpCoinBonus: 1.30, bonusHp: 2200, bonusAtk: 550 };
  if (auraPoints >= 85000) return { title: '💥 Aura Transcendente', xpCoinBonus: 1.00, bonusHp: 1600, bonusAtk: 380 };
  if (auraPoints >= 55000) return { title: '♾️ Aura Primordial', xpCoinBonus: 0.80, bonusHp: 1100, bonusAtk: 260 };
  if (auraPoints >= 35000) return { title: '🌌 Aura Cósmica', xpCoinBonus: 0.60, bonusHp: 750, bonusAtk: 180 };
  if (auraPoints >= 20000) return { title: '👑 Aura Divina', xpCoinBonus: 0.45, bonusHp: 500, bonusAtk: 120 };
  if (auraPoints >= 12000) return { title: '🌀 Aura Suprema', xpCoinBonus: 0.30, bonusHp: 300, bonusAtk: 75 };
  if (auraPoints >= 7000) return { title: '💎 Aura Celestial', xpCoinBonus: 0.20, bonusHp: 180, bonusAtk: 45 };
  if (auraPoints >= 3500) return { title: '🔥 Aura Flamejante', xpCoinBonus: 0.15, bonusHp: 100, bonusAtk: 25 };
  if (auraPoints >= 1500) return { title: '⚡ Aura Mística', xpCoinBonus: 0.10, bonusHp: 50, bonusAtk: 10 };
  if (auraPoints >= 500) return { title: '🌟 Aura Iluminada', xpCoinBonus: 0.05, bonusHp: 20, bonusAtk: 0 };
  return { title: '🌫️ Aura Comum', xpCoinBonus: 0, bonusHp: 0, bonusAtk: 0 };
}

// Cálculo Unificado de Nível e Verificação de Level Up
export function calculateLevelFromXp(xp = 0) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp || 0)) / 50)) + 1;
}

export function checkAndApplyLevelUp(user, addedXp = 0) {
  const currentXp = Number(user?.xp || 0) + Number(addedXp || 0);
  const currentLevel = Number(user?.level || 1);
  const newLevel = calculateLevelFromXp(currentXp);
  const finalLevel = Math.max(currentLevel, newLevel);
  const leveledUp = finalLevel > currentLevel;
  return {
    newXp: currentXp,
    newLevel: finalLevel,
    leveledUp,
    levelUpMsg: leveledUp ? `\n🎉 *LEVEL UP!* Você evoluiu para o *Nível ${finalLevel}*! 🏆` : ''
  };
}

// 3. Pets e Habilidades Passivas
export const EXTENDED_PETS = {
  cachorro: { id: 'cachorro', name: '🐶 Cachorro Fiel', price: 5000, desc: '+25% de resistência contra assaltos/roubos e +10% de moedas no daily' },
  gato: { id: 'gato', name: '🐱 Gato Místico', price: 8000, desc: '+15% de bônus permanente de XP em todas as atividades' },
  papagaio: { id: 'papagaio', name: '🦜 Papagaio Fofoqueiro', price: 12000, desc: '+20% de bônus de XP no chat e daily' },
  raposa: { id: 'raposa', name: '🦊 Raposa Astuta', price: 15000, desc: '+30% de moedas roubadas no comando /roubar' },
  dragao: { id: 'dragao', name: '🐉 Dragão Elemental', price: 50000, desc: 'Bônus supremo de +20% em TUDO (Moedas, XP, +50 ATK, +200 HP)' },
  fenix: { id: 'fenix', name: '🦅 Fênix Imortal', price: 80000, desc: 'Ressuscita 1x por batalha em Raids com 100% HP e dá +25% XP' }
};

export function getPetData(petKey) {
  if (!petKey) return null;
  const key = typeof petKey === 'string' ? petKey.toLowerCase() : petKey.type || petKey.id;
  return EXTENDED_PETS[key] || null;
}

// 4. Cálculo Geral de Recompensas
export function calculateBonusRewards(user, baseCoins = 0, baseXp = 0, contextType = 'general') {
  if (!user) {
    return { finalCoins: baseCoins, finalXp: baseXp, bonusCoinsApplied: 0, bonusXpApplied: 0 };
  }

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  const rpgClassKey = extraData.rpg_class || 'guerreiro';
  const userLevel = Number(user.level || 1);
  const classInfo = getClassData(rpgClassKey, userLevel);
  const auraBuff = getAuraBuffs(user.aura || 0);
  const petInfo = getPetData(extraData.pet);
  const petLevel = Number(extraData.pet?.level || 1);
  const prestige = Number(user.prestige || extraData.prestige || 0);
  const rebirths = Number(user.rebirths || extraData.rebirths || 0);
  const rebirthBonus = getRebirthBonus(rebirths);

  let coinMultiplier = 1.0;
  let xpMultiplier = 1.0;

  // Bônus Permanente de Rebirth
  if (rebirthBonus) {
    coinMultiplier += rebirthBonus.coinBonusPct;
    xpMultiplier += rebirthBonus.xpBonusPct;
  }

  // Evento Ativo (+15% em tudo)
  coinMultiplier += 0.15;
  xpMultiplier += 0.15;

  // Aura Buff (+% em tudo)
  coinMultiplier += auraBuff.xpCoinBonus;
  xpMultiplier += auraBuff.xpCoinBonus;

  // Prestígio / Ascensão (+15%/nível de ascensão)
  if (prestige > 0) {
    coinMultiplier += prestige * 0.15;
    xpMultiplier += prestige * 0.15;
  }

  // Pet Buffs
  if (petInfo) {
    // Bônus de nível do pet (+5% moedas/XP por nível de pet)
    const petLvlBonus = (petLevel - 1) * 0.05;
    coinMultiplier += petLvlBonus;
    xpMultiplier += petLvlBonus;

    if (petInfo.id === 'gato') xpMultiplier += 0.15;
    if (petInfo.id === 'papagaio' && ['chat', 'daily'].includes(contextType)) xpMultiplier += 0.20;
    if (petInfo.id === 'raposa' && contextType === 'steal') coinMultiplier += 0.30;
    if (petInfo.id === 'cachorro' && ['daily', 'work'].includes(contextType)) coinMultiplier += 0.10;
    if (petInfo.id === 'dragao') {
      coinMultiplier += 0.20;
      xpMultiplier += 0.20;
    }
    if (petInfo.id === 'fenix') xpMultiplier += 0.25;
  }

  // Class Tier Buffs
  if (classInfo.classKey === 'mago') {
    xpMultiplier += (classInfo.bonusXpPct || 20) / 100;
  } else if (classInfo.classKey === 'guerreiro') {
    if (['combat', 'duel', 'steal', 'raid', 'quest', 'work'].includes(contextType)) {
      coinMultiplier += (classInfo.bonusCoinPct || 15) / 100;
    }
  } else if (classInfo.classKey === 'arqueiro') {
    if (['minigame', 'fishing', 'slots', 'poker', 'blackjack'].includes(contextType)) {
      coinMultiplier += (classInfo.bonusGamePct || 15) / 100;
    }
  }

  const finalCoins = Math.round(baseCoins * coinMultiplier);
  const finalXp = Math.round(baseXp * xpMultiplier);

  return {
    finalCoins,
    finalXp,
    bonusCoinsApplied: Math.max(0, finalCoins - baseCoins),
    bonusXpApplied: Math.max(0, finalXp - baseXp),
    coinMultiplier,
    xpMultiplier,
    classInfo,
    auraBuff,
    petInfo
  };
}

// 5. Cálculo Dinâmico de Atributos Totais do Jogador (HP Máximo e ATK Total)
export function getUserStats(user) {
  if (!user) return { maxHp: 200, currentHp: 200, totalAtk: 35, weaponName: 'Nenhuma', armorName: 'Nenhuma' };

  let extraData = {};
  try {
    extraData = typeof user.extra_data === 'string' ? JSON.parse(user.extra_data || '{}') : (user.extra_data || {});
  } catch (_) {
    extraData = {};
  }

  const userLevel = Number(user.level || 1);
  const classInfo = getClassData(extraData.rpg_class || 'guerreiro', userLevel);
  const auraBuff = getAuraBuffs(user.aura || 0);
  const petInfo = getPetData(extraData.pet);
  const petLevel = Number(extraData.pet?.level || 1);
  const prestige = Number(user.prestige || extraData.prestige || 0);

  const equippedWeapon = extraData.equipped_weapon || { name: 'Mãos Nua', atk: 0 };
  const equippedArmor = extraData.equipped_armor || { name: 'Roupas Comuns', hp: 0 };

  let petHp = (petLevel - 1) * 15;
  let petAtk = (petLevel - 1) * 8;
  if (petInfo && petInfo.id === 'dragao') {
    petHp += 200;
    petAtk += 50;
  }
  if (petInfo && petInfo.id === 'fenix') {
    petHp += 100;
  }

  // Bônus de Ascensão / Prestígio (+50 HP e +20 ATK por Nível de Prestígio)
  const prestigeHp = prestige * 50;
  const prestigeAtk = prestige * 20;

  const maxHp = classInfo.hp + (equippedArmor.hp || 0) + auraBuff.bonusHp + petHp + prestigeHp;
  const totalAtk = classInfo.atk + (equippedWeapon.atk || 0) + auraBuff.bonusAtk + petAtk + prestigeAtk;
  
  let currentHp = extraData.current_hp;
  if (currentHp === undefined || currentHp === null) {
    currentHp = maxHp;
  } else {
    currentHp = Math.min(maxHp, Math.max(0, Number(currentHp)));
  }

  return {
    classInfo,
    auraBuff,
    petInfo,
    equippedWeapon,
    equippedArmor,
    maxHp,
    currentHp,
    totalAtk,
    prestige,
    isKnockedOut: currentHp <= 0
  };
}
