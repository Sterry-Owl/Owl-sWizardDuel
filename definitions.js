/**
 * 遊戲列舉常數定義
 */
export const DAMAGE_TYPE = Object.freeze({
    PHYSICAL: 'PHYSICAL',
    MAGIC: 'MAGIC'
});

export const ATTACK_TYPE = Object.freeze({
    RANGED: 'RANGED',
    MELEE: 'MELEE'
});

export const MODIFIER_OPERATOR = Object.freeze({
    ADD: 'ADD',             // 平加數值
    MULTIPLY: 'MULTIPLY'    // 百分比乘算
});

/**
 * 技能資料庫 (神秘術原型)
 */
export const SKILL_DEFINITIONS = Object.freeze({
    // 核心 1：星軌編織者之技能
    STAR_BOLT: {
        id: 'STAR_BOLT',
        name: '星軌彈',
        damageType: DAMAGE_TYPE.MAGIC,
        baseDamage: 40,
        cooldown: 3.0,
        maxRange: 450,
        projectileSpeed: 280,
        radius: 10,
        mechanic: 'PROJECTILE_STRAIGHT'
    },
    ASTRAL_BARRIER: {
        id: 'ASTRAL_BARRIER',
        name: '星界護盾',
        damageType: DAMAGE_TYPE.MAGIC,
        baseDamage: 0,
        cooldown: 8.0,
        maxRange: 0, // 自身釋放
        duration: 2.5,
        shieldValue: 80,
        mechanic: 'SELF_BUFF'
    },
    SUPERNOVA: {
        id: 'SUPERNOVA',
        name: '超新星爆擊',
        damageType: DAMAGE_TYPE.MAGIC,
        baseDamage: 100,
        cooldown: 12.0,
        maxRange: 350,
        radius: 60,
        delay: 0.6,
        mechanic: 'GROUND_AOE'
    },

    // 核心 2：鋼鐵誓約之技能
    HEAVY_CLEAVE: {
        id: 'HEAVY_CLEAVE',
        name: '重壓順劈',
        damageType: DAMAGE_TYPE.PHYSICAL,
        baseDamage: 55,
        cooldown: 4.0,
        maxRange: 120,
        arcAngle: 90, // 扇形角度
        mechanic: 'MELEE_SWEEP'
    },
    SHIELD_CHARGE: {
        id: 'SHIELD_CHARGE',
        name: '衝鋒破陣',
        damageType: DAMAGE_TYPE.PHYSICAL,
        baseDamage: 30,
        cooldown: 7.0,
        maxRange: 300,
        dashSpeed: 600,
        mechanic: 'DASH_COLLIDE'
    },
    IRON_FORTRESS: {
        id: 'IRON_FORTRESS',
        name: '鋼鐵壁壘',
        damageType: DAMAGE_TYPE.PHYSICAL,
        baseDamage: 0,
        cooldown: 15.0,
        maxRange: 0,
        duration: 3.0,
        damageReduction: 0.5,
        mechanic: 'SELF_BUFF'
    }
});

/**
 * 核心記憶資料庫 (角色核心)
 */
export const CORE_MEMORIES = Object.freeze({
    STAR_WEAVER: {
        id: 'STAR_WEAVER',
        name: '星軌編織者',
        description: '遠程魔法型核心，擅長保持距離進行彈道壓制。',
        baseStats: {
            hpMax: 200,
            moveSpeed: 125,
            physDef: 5,
            magicRes: 15
        },
        basicAttack: {
            attackType: ATTACK_TYPE.RANGED,
            damageType: DAMAGE_TYPE.MAGIC,
            damage: 20,
            cooldown: 1.5,
            maxRange: 400,
            speed: 216,
            radius: 8
        },
        skillSlots: ['STAR_BOLT', 'ASTRAL_BARRIER', 'SUPERNOVA']
    },
    IRON_OATH: {
        id: 'IRON_OATH',
        name: '鋼鐵誓約',
        description: '近戰物理型核心，具備高防禦與近身威脅。',
        baseStats: {
            hpMax: 320,
            moveSpeed: 137.5,
            physDef: 20,
            magicRes: 5
        },
        basicAttack: {
            attackType: ATTACK_TYPE.MELEE,
            damageType: DAMAGE_TYPE.PHYSICAL,
            damage: 28,
            cooldown: 1.5,
            maxRange: 60,
            swingAngle: 75
        },
        skillSlots: ['HEAVY_CLEAVE', 'SHIELD_CHARGE', 'IRON_FORTRESS']
    }
});

/**
 * 流變資料庫 (數值天賦，針對基礎屬性或全域數值增益)
 */
export const FLUX_TALENTS = Object.freeze({
    // ==========================================
    // 星軌編織者天賦樹 (核心 ID: STAR_WEAVER)
    // ==========================================
    // 分支一：乙太強攻
    SW_A1: {
        id: 'SW_A1',
        coreId: 'STAR_WEAVER',
        branch: '乙太強攻',
        name: '乙太微粒',
        description: '普攻基礎傷害提升 4 點。',
        requires: [],
        targetPath: 'basicAttack.damage',
        operator: MODIFIER_OPERATOR.ADD,
        value: 4
    },
    SW_A2: {
        id: 'SW_A2',
        coreId: 'STAR_WEAVER',
        branch: '乙太強攻',
        name: '乙太湧動',
        description: '普攻冷卻時間減少 15%。',
        requires: ['SW_A1'],
        targetPath: 'basicAttack.cooldown',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: -0.15
    },
    SW_A3: {
        id: 'SW_A3',
        coreId: 'STAR_WEAVER',
        branch: '乙太強攻',
        name: '虛空貫注',
        description: '普攻基礎傷害再提升 8 點。',
        requires: ['SW_A2'],
        targetPath: 'basicAttack.damage',
        operator: MODIFIER_OPERATOR.ADD,
        value: 8
    },

    // 分支二：星體屏障
    SW_B1: {
        id: 'SW_B1',
        coreId: 'STAR_WEAVER',
        branch: '星體屏障',
        name: '星界防禦',
        description: '物理防禦提升 8 點。',
        requires: [],
        targetPath: 'stats.physDef',
        operator: MODIFIER_OPERATOR.ADD,
        value: 8
    },
    SW_B2: {
        id: 'SW_B2',
        coreId: 'STAR_WEAVER',
        branch: '星體屏障',
        name: '物質塑形',
        description: '最大生命值提升 35 點。',
        requires: ['SW_B1'],
        targetPath: 'stats.hpMax',
        operator: MODIFIER_OPERATOR.ADD,
        value: 35
    },
    SW_B3: {
        id: 'SW_B3',
        coreId: 'STAR_WEAVER',
        branch: '星體屏障',
        name: '折射力場',
        description: '魔法抗性提升 15 點。',
        requires: ['SW_B2'],
        targetPath: 'stats.magicRes',
        operator: MODIFIER_OPERATOR.ADD,
        value: 15
    },

    // 分支三：流光步態
    SW_C1: {
        id: 'SW_C1',
        coreId: 'STAR_WEAVER',
        branch: '流光步態',
        name: '輕盈浮步',
        description: '移動速度提升 10%。',
        requires: [],
        targetPath: 'stats.moveSpeed',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: 0.10
    },
    SW_C2: {
        id: 'SW_C2',
        coreId: 'STAR_WEAVER',
        branch: '流光步態',
        name: '光錐奔流',
        description: '移動速度再提升 15%。',
        requires: ['SW_C1'],
        targetPath: 'stats.moveSpeed',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: 0.15
    },

    // ==========================================
    // 鋼鐵誓約天賦樹 (核心 ID: IRON_OATH)
    // ==========================================
    // 分支一：鐵壁防禦
    IO_A1: {
        id: 'IO_A1',
        coreId: 'IRON_OATH',
        branch: '鐵壁防禦',
        name: '重裝甲片',
        description: '物理防禦基礎值提升 12 點。',
        requires: [],
        targetPath: 'stats.physDef',
        operator: MODIFIER_OPERATOR.ADD,
        value: 12
    },
    IO_A2: {
        id: 'IO_A2',
        coreId: 'IRON_OATH',
        branch: '鐵壁防禦',
        name: '鍛爐體魄',
        description: '最大生命值提升 50 點。',
        requires: ['IO_A1'],
        targetPath: 'stats.hpMax',
        operator: MODIFIER_OPERATOR.ADD,
        value: 50
    },
    IO_A3: {
        id: 'IO_A3',
        coreId: 'IRON_OATH',
        branch: '鐵壁防禦',
        name: '不倒壁壘',
        description: '物理防禦基礎值再提升 20 點。',
        requires: ['IO_A2'],
        targetPath: 'stats.physDef',
        operator: MODIFIER_OPERATOR.ADD,
        value: 20
    },

    // 分支二：重擊斬切
    IO_B1: {
        id: 'IO_B1',
        coreId: 'IRON_OATH',
        branch: '重擊斬切',
        name: '開刃打磨',
        description: '普攻基礎傷害提升 6 點。',
        requires: [],
        targetPath: 'basicAttack.damage',
        operator: MODIFIER_OPERATOR.ADD,
        value: 6
    },
    IO_B2: {
        id: 'IO_B2',
        coreId: 'IRON_OATH',
        branch: '重擊斬切',
        name: '迅猛揮舞',
        description: '普攻冷卻時間減少 15%。',
        requires: ['IO_B1'],
        targetPath: 'basicAttack.cooldown',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: -0.15
    },
    IO_B3: {
        id: 'IO_B3',
        coreId: 'IRON_OATH',
        branch: '重擊斬切',
        name: '裂地巨力',
        description: '普攻基礎傷害再提升 12 點。',
        requires: ['IO_B2'],
        targetPath: 'basicAttack.damage',
        operator: MODIFIER_OPERATOR.ADD,
        value: 12
    },

    // 分支三：戰場突進
    IO_C1: {
        id: 'IO_C1',
        coreId: 'IRON_OATH',
        branch: '戰場突進',
        name: '行軍步伐',
        description: '移動速度提升 10%。',
        requires: [],
        targetPath: 'stats.moveSpeed',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: 0.10
    },
    IO_C2: {
        id: 'IO_C2',
        coreId: 'IRON_OATH',
        branch: '戰場突進',
        name: '破陣突襲',
        description: '移動速度再提升 15%。',
        requires: ['IO_C1'],
        targetPath: 'stats.moveSpeed',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: 0.15
    }
});
export const RHAPSODIES = Object.freeze({
    RHAP_TRIPLE_BOLT: {
        id: 'RHAP_TRIPLE_BOLT',
        coreId: 'STAR_WEAVER',
        name: '狂想：三重星軌',
        targetSkillId: 'STAR_BOLT',
        description: '星軌彈不再發射單發，而是以扇形散射 3 發彈道，但每發傷害降低 30%。',
        mutation: (skill) => {
            skill.projectileCount = 3;
            skill.spreadAngle = 30;
            skill.baseDamage *= 0.7;
        }
    },

    RHAP_COLOSSAL_CLEAVE: {
        id: 'RHAP_COLOSSAL_CLEAVE',
        coreId: 'IRON_OATH',
        name: '狂想：碎裂巨劈',
        targetSkillId: 'HEAVY_CLEAVE',
        description: '重壓順劈的攻擊範圍擴大 50%，並附帶擊退效果。',
        mutation: (skill) => {
            skill.maxRange *= 1.5;
            skill.arcAngle = 120;
            skill.knockbackForce = 150;
        }
    }
});
