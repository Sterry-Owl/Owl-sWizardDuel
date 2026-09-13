import { 
    CORE_MEMORIES, 
    SKILL_DEFINITIONS, 
    FLUX_TALENTS, 
    RHAPSODIES, 
    MODIFIER_OPERATOR 
} from './definitions.js';

/**
 * 安全深度拷貝
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 依路徑修改巢狀物件屬性
 */
function applyPathValue(target, path, operator, value) {
    const parts = path.split('.');
    let curr = target;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!curr[parts[i]]) return;
        curr = curr[parts[i]];
    }
    const finalKey = parts[parts.length - 1];
    
    if (typeof curr[finalKey] !== 'number') return;

    if (operator === MODIFIER_OPERATOR.ADD) {
        curr[finalKey] += value;
    } else if (operator === MODIFIER_OPERATOR.MULTIPLY) {
        curr[finalKey] = curr[finalKey] * (1 + value);
    }
}

/**
 * 實體建構工廠
 * @param {string} coreId 核心記憶 ID
 * @param {string[]} selectedFluxIds 選定的流變 ID 陣列
 * @param {string[]} selectedRhapsodyIds 選定的狂想 ID 陣列
 * @returns {object} 最終可用於戰鬥的實體設定物件
 */
export function buildCombatLoadout(coreId, selectedFluxIds = [], selectedRhapsodyIds = []) {
    const coreBlueprint = CORE_MEMORIES[coreId];
    if (!coreBlueprint) {
        throw new Error(`Invalid Core ID: ${coreId}`);
    }

    // 1. 初始化基礎屬性與普攻
    const result = {
        coreId: coreBlueprint.id,
        name: coreBlueprint.name,
        stats: deepClone(coreBlueprint.baseStats),
        basicAttack: deepClone(coreBlueprint.basicAttack),
        skills: []
    };

    // 2. 組裝 3 個神秘術的原始資料
    result.skills = coreBlueprint.skillSlots.map(skillId => {
        const baseSkill = SKILL_DEFINITIONS[skillId];
        if (!baseSkill) {
            throw new Error(`Invalid Skill ID: ${skillId}`);
        }
        return deepClone(baseSkill);
    });

    // 3. 套用流變 (數值修飾器)
    for (const fluxId of selectedFluxIds) {
        const flux = FLUX_TALENTS[fluxId];
        if (!flux) continue;
        applyPathValue(result, flux.targetPath, flux.operator, flux.value);
    }

    // 4. 套用狂想 (技能機制重構器)
    for (const rhapId of selectedRhapsodyIds) {
        const rhapsody = RHAPSODIES[rhapId];
        if (!rhapsody) continue;

        const targetSkill = result.skills.find(s => s.id === rhapsody.targetSkillId);
        if (targetSkill && typeof rhapsody.mutation === 'function') {
            rhapsody.mutation(targetSkill);
        }
    }

    return Object.freeze(result);
}
