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
            moveSpeed: 100,
            physDef: 5,
            magicRes: 15
        },
        basicAttack: {
            attackType: ATTACK_TYPE.RANGED,
            damageType: DAMAGE_TYPE.MAGIC,
            damage: 20,
            cooldown: 2.0,
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
            moveSpeed: 110,
            physDef: 20,
            magicRes: 5
        },
        basicAttack: {
            attackType: ATTACK_TYPE.MELEE,
            damageType: DAMAGE_TYPE.PHYSICAL,
            damage: 28,
            cooldown: 1.2,
            maxRange: 60,
            swingAngle: 75 // 揮擊扇形角度
        },
        skillSlots: ['HEAVY_CLEAVE', 'SHIELD_CHARGE', 'IRON_FORTRESS']
    }
});

/**
 * 流變資料庫 (數值天賦，針對基礎屬性或全域數值增益)
 */
export const FLUX_TALENTS = Object.freeze({
    FLUX_HP_BOOST: {
        id: 'FLUX_HP_BOOST',
        name: '生命塑形',
        targetPath: 'stats.hpMax',
        operator: MODIFIER_OPERATOR.ADD,
        value: 50
    },
    FLUX_SWIFT_FOOT: {
        id: 'FLUX_SWIFT_FOOT',
        name: '流光步法',
        targetPath: 'stats.moveSpeed',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: 0.15 // +15%
    },
    FLUX_AETHER_FLOW: {
        id: 'FLUX_AETHER_FLOW',
        name: '乙太湧動',
        targetPath: 'basicAttack.cooldown',
        operator: MODIFIER_OPERATOR.MULTIPLY,
        value: -0.20 // 減少 20% 冷卻
    }
});

/**
 * 狂想資料庫 (機制重構，直接覆蓋或注入技能屬性與邏輯)
 */
export const RHAPSODIES = Object.freeze({
    RHAP_TRIPLE_BOLT: {
        id: 'RHAP_TRIPLE_BOLT',
        name: '狂想：三重星軌',
        targetSkillId: 'STAR_BOLT',
        description: '星軌彈不再發射單發，而是以扇形散射 3 發彈道，但每發傷害降低 30%。',
        mutation: (skill) => {
            skill.projectileCount = 3;
            skill.spreadAngle = 30; // 散射角度
            skill.baseDamage *= 0.7;
        }
    },
    RHAP_COLOSSAL_CLEAVE: {
        id: 'RHAP_COLOSSAL_CLEAVE',
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
