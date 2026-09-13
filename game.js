import { ATTACK_TYPE, DAMAGE_TYPE, CORE_MEMORIES, FLUX_TALENTS, RHAPSODIES } from './definitions.js';
import { buildCombatLoadout } from './builder.js';
import { NetworkManager } from './network.js';

/**
 * 引擎設定常數
 */
const ENGINE_CONFIG = {
    CANVAS: { WIDTH: 960, HEIGHT: 540, GRID_SIZE: 40, BG_COLOR: '#0e1117', GRID_COLOR: '#181f2e' },
    SYNC_RATE: 1 / 30,
    LERP_FACTOR: 18 // 快照平滑追蹤速率
};

const GAME_STATE = Object.freeze({
    LOBBY: 'LOBBY',
    LOADOUT: 'LOADOUT',
    IN_GAME: 'IN_GAME'
});

/**
 * DOM 快取
 */
const DOM = {
    lobbyPanel: document.getElementById('lobby-panel'),
    battleContainer: document.getElementById('battle-container'),
    btnPracticeMode: document.getElementById('btn-practice-mode'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    inputRoomId: document.getElementById('input-room-id'),
    roomIdDisplay: document.getElementById('room-id-display'),
    connectionStatus: document.getElementById('connection-status'),
    loadoutSelection: document.getElementById('loadout-selection'),
    coresContainer: document.getElementById('dynamic-cores-container'),
    fluxContainer: document.getElementById('dynamic-flux-container'),
    rhapsodyContainer: document.getElementById('dynamic-rhapsody-container'),
    btnReady: document.getElementById('btn-ready'),
    readyStatus: document.getElementById('ready-status'),
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    p1Name: document.getElementById('p1-name'),
    p2Name: document.getElementById('p2-name'),
    p1HpFill: document.getElementById('p1-hp-fill'),
    p2HpFill: document.getElementById('p2-hp-fill'),
    p1HpText: document.getElementById('p1-hp-text'),
    p2HpText: document.getElementById('p2-hp-text'),
    cdAttack: document.getElementById('cd-attack'),
    cdSkills: [
        document.getElementById('cd-skill-1'),
        document.getElementById('cd-skill-2'),
        document.getElementById('cd-skill-3')
    ],
    nameSkills: [
        document.getElementById('name-skill-1'),
        document.getElementById('name-skill-2'),
        document.getElementById('name-skill-3')
    ]
};

/**
 * 輸入監聽模組
 */
const Input = {
    keys: {},
    mouse: { x: 0, y: 0, isDown: false },
    triggers: { attack: false, skill1: false, skill2: false, skill3: false },

    init(targetCanvas) {
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            this.keys[k] = true;
            if (k === 'q' || k === '1') this.triggers.skill1 = true;
            if (k === 'w' || k === '2') this.triggers.skill2 = true;
            if (k === 'e' || k === '3') this.triggers.skill3 = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        targetCanvas.addEventListener('mousemove', (e) => {
            const rect = targetCanvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        targetCanvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.mouse.isDown = true;
                this.triggers.attack = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.isDown = false;
        });
    },

    getMovementVector() {
        let dx = 0;
        let dy = 0;
        if (this.keys['w']) dy -= 1;
        if (this.keys['s']) dy += 1;
        if (this.keys['a']) dx -= 1;
        if (this.keys['d']) dx += 1;

        if (dx !== 0 && dy !== 0) {
            dx *= 0.70710678;
            dy *= 0.70710678;
        }
        return { x: dx, y: dy };
    },

    consumeTriggers() {
        const copy = { ...this.triggers };
        this.triggers.attack = false;
        this.triggers.skill1 = false;
        this.triggers.skill2 = false;
        this.triggers.skill3 = false;
        return copy;
    }
};

/**
 * 傷害計算器
 */
const DamageCalculator = {
    calculate(attackerDamage, damageType, defenderStats) {
        let reduction = 0;
        if (damageType === DAMAGE_TYPE.PHYSICAL) {
            reduction = defenderStats.physDef / (100 + defenderStats.physDef);
        } else if (damageType === DAMAGE_TYPE.MAGIC) {
            reduction = defenderStats.magicRes / (100 + defenderStats.magicRes);
        }
        return Math.max(1, Math.round(attackerDamage * (1 - reduction)));
    }
};

/**
 * 浮動戰鬥文字 (Floating Damage Numbers)
 */
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x + (Math.random() - 0.5) * 16;
        this.y = y - 10;
        this.text = text;
        this.color = color;
        this.life = 0.8;
        this.vy = -50;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / 0.8);
        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

/**
 * 粒子與視覺特效系統
 */
class VFXSystem {
    constructor() {
        this.particles = [];
        this.floatingTexts = [];
    }

    spawnHit(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 220 + 60;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 2.5 + 1.5,
                color,
                life: 0.4,
                maxLife: 0.4
            });
        }
    }

    spawnDamageText(x, y, amount, damageType) {
        const color = damageType === DAMAGE_TYPE.PHYSICAL ? '#fbbf24' : '#60a5fa';
        this.floatingTexts.push(new FloatingText(x, y, `-${amount}`, color));
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.update(dt);
            if (t.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        for (const t of this.floatingTexts) {
            t.draw(ctx);
        }
    }
}

/**
 * 實體類別：彈道
 */
class Projectile {
    constructor(ownerId, x, y, angle, speed, radius, maxRange, damage, damageType, color) {
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = radius;
        this.damage = damage;
        this.damageType = damageType;
        this.color = color;
        this.remainingDist = maxRange;
        this.isAlive = true;
    }

    update(dt) {
        const step = Math.hypot(this.vx * dt, this.vy * dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.remainingDist -= step;

        if (this.remainingDist <= 0 || 
            this.x < 0 || this.x > ENGINE_CONFIG.CANVAS.WIDTH || 
            this.y < 0 || this.y > ENGINE_CONFIG.CANVAS.HEIGHT) {
            this.isAlive = false;
        }
    }

    draw(ctx) {
        ctx.save();
        // 光暈核
        const grad = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, this.radius * 1.6);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, this.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 實體類別：近戰揮擊視覺
 */
class MeleeSweepVisual {
    constructor(x, y, angle, range, arcAngle, color) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.range = range;
        this.arcAngle = (arcAngle * Math.PI) / 180;
        this.color = color;
        this.life = 0.16;
    }

    update(dt) {
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        const alpha = Math.max(0, this.life / 0.16);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, this.range, this.angle - this.arcAngle / 2, this.angle + this.arcAngle / 2);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.2;
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 實體類別：地面延時 AOE
 */
class GroundAoeVisual {
    constructor(ownerId, x, y, radius, delay, damage, damageType, onExplode) {
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.delay = delay;
        this.totalDelay = delay;
        this.damage = damage;
        this.damageType = damageType;
        this.onExplode = onExplode;
        this.isAlive = true;
    }

    update(dt) {
        this.delay -= dt;
        if (this.delay <= 0) {
            this.isAlive = false;
            if (this.onExplode) this.onExplode(this);
        }
    }

    draw(ctx) {
        ctx.save();
        const progress = 1 - Math.max(0, this.delay / this.totalDelay);
        // 符文預警邊緣
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // 內部填充增長光環
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 玩家實體類別 (整合預測與插值)
 */
class ArenaPlayer {
    constructor(id, x, y, baseColor) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.targetX = x; // 插值目標
        this.targetY = y;
        this.radius = 18;
        this.color = baseColor;
        this.loadout = null;

        this.hp = 100;
        this.shield = 0;
        this.attackCooldown = 0;
        this.skillCooldowns = [0, 0, 0];
        this.aimAngle = 0;
        this.dashState = null;
    }

    applyLoadout(loadout) {
        this.loadout = loadout;
        this.hp = loadout.stats.hpMax;
        this.shield = 0;
        this.attackCooldown = 0;
        this.skillCooldowns = [0, 0, 0];
    }

    update(dt, inputVector, mousePos, triggers, opponent, gameContext) {
        if (!this.loadout) return;

        this.aimAngle = Math.atan2(mousePos.y - this.y, mousePos.x - this.x);

        // 衝鋒狀態
        if (this.dashState) {
            this.dashState.timeRemaining -= dt;
            this.x += this.dashState.vx * dt;
            this.y += this.dashState.vy * dt;

            const dist = Math.hypot(this.x - opponent.x, this.y - opponent.y);
            if (dist < this.radius + opponent.radius) {
                opponent.takeDamage(this.dashState.damage, this.dashState.damageType, gameContext);
                this.dashState = null;
            } else if (this.dashState.timeRemaining <= 0) {
                this.dashState = null;
            }
        } else {
            this.x += inputVector.x * this.loadout.stats.moveSpeed * dt;
            this.y += inputVector.y * this.loadout.stats.moveSpeed * dt;
        }

        // 邊界防禦
        this.x = Math.max(this.radius, Math.min(ENGINE_CONFIG.CANVAS.WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(ENGINE_CONFIG.CANVAS.HEIGHT - this.radius, this.y));

        // 冷卻時間遞減
        if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        for (let i = 0; i < 3; i++) {
            if (this.skillCooldowns[i] > 0) this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
        }

        // 技能發動
        if (triggers.attack) this.executeBasicAttack(gameContext);
        if (triggers.skill1) this.executeSkill(0, mousePos, opponent, gameContext);
        if (triggers.skill2) this.executeSkill(1, mousePos, opponent, gameContext);
        if (triggers.skill3) this.executeSkill(2, mousePos, opponent, gameContext);
    }

    interpolate(dt) {
        // 實體線性插值 (指數衰減插值避免網路跳動)
        const factor = Math.min(1, dt * ENGINE_CONFIG.LERP_FACTOR);
        this.x += (this.targetX - this.x) * factor;
        this.y += (this.targetY - this.y) * factor;
    }

    takeDamage(amount, damageType, gameContext) {
        const actual = DamageCalculator.calculate(amount, damageType, this.loadout.stats);
        if (this.shield > 0) {
            if (this.shield >= actual) {
                this.shield -= actual;
                gameContext.vfx.spawnHit(this.x, this.y, '#38bdf8');
                return;
            } else {
                const rem = actual - this.shield;
                this.shield = 0;
                this.hp = Math.max(0, this.hp - rem);
                gameContext.vfx.spawnDamageText(this.x, this.y, rem, damageType);
                gameContext.vfx.spawnHit(this.x, this.y, this.color);
                return;
            }
        }
        this.hp = Math.max(0, this.hp - actual);
        gameContext.vfx.spawnDamageText(this.x, this.y, actual, damageType);
        gameContext.vfx.spawnHit(this.x, this.y, this.color);
    }

    executeBasicAttack(ctx) {
        if (this.attackCooldown > 0) return;
        const atk = this.loadout.basicAttack;

        if (atk.attackType === ATTACK_TYPE.RANGED) {
            ctx.projectiles.push(new Projectile(
                this.id, this.x, this.y, this.aimAngle, atk.speed,
                atk.radius, atk.maxRange, atk.damage, atk.damageType, this.color
            ));
        } else if (atk.attackType === ATTACK_TYPE.MELEE) {
            ctx.meleeSweeps.push(new MeleeSweepVisual(
                this.x, this.y, this.aimAngle, atk.maxRange, atk.swingAngle, this.color
            ));
            ctx.checkMeleeHit(this, this.aimAngle, atk.maxRange, atk.swingAngle, atk.damage, atk.damageType);
        }
        this.attackCooldown = atk.cooldown;
    }

    executeSkill(index, mousePos, opponent, ctx) {
        if (this.skillCooldowns[index] > 0) return;
        const skill = this.loadout.skills[index];
        if (!skill) return;

        const distToMouse = Math.hypot(mousePos.x - this.x, mousePos.y - this.y);

        switch (skill.mechanic) {
            case 'PROJECTILE_STRAIGHT': {
                const count = skill.projectileCount || 1;
                const spread = ((skill.spreadAngle || 0) * Math.PI) / 180;
                const startAngle = this.aimAngle - spread / 2;
                const angleStep = count > 1 ? spread / (count - 1) : 0;

                for (let i = 0; i < count; i++) {
                    const angle = count === 1 ? this.aimAngle : startAngle + angleStep * i;
                    ctx.projectiles.push(new Projectile(
                        this.id, this.x, this.y, angle, skill.projectileSpeed,
                        skill.radius, skill.maxRange, skill.baseDamage, skill.damageType, '#818cf8'
                    ));
                }
                break;
            }
            case 'SELF_BUFF': {
                if (skill.shieldValue) {
                    this.shield = skill.shieldValue;
                    setTimeout(() => { this.shield = 0; }, skill.duration * 1000);
                }
                break;
            }
            case 'GROUND_AOE': {
                const clamped = Math.min(distToMouse, skill.maxRange);
                const tx = this.x + Math.cos(this.aimAngle) * clamped;
                const ty = this.y + Math.sin(this.aimAngle) * clamped;

                ctx.groundAoes.push(new GroundAoeVisual(
                    this.id, tx, ty, skill.radius, skill.delay,
                    skill.baseDamage, skill.damageType, (aoe) => {
                        const d = Math.hypot(opponent.x - aoe.x, opponent.y - aoe.y);
                        if (d <= aoe.radius + opponent.radius) {
                            opponent.takeDamage(aoe.damage, aoe.damageType, ctx);
                        }
                        ctx.vfx.spawnHit(aoe.x, aoe.y, '#ef4444', 24);
                    }
                ));
                break;
            }
            case 'MELEE_SWEEP': {
                ctx.meleeSweeps.push(new MeleeSweepVisual(
                    this.x, this.y, this.aimAngle, skill.maxRange, skill.arcAngle, '#f97316'
                ));
                ctx.checkMeleeHit(this, this.aimAngle, skill.maxRange, skill.arcAngle, skill.baseDamage, skill.damageType);
                break;
            }
            case 'DASH_COLLIDE': {
                const clamped = Math.min(distToMouse, skill.maxRange);
                const dur = clamped / skill.dashSpeed;
                this.dashState = {
                    vx: Math.cos(this.aimAngle) * skill.dashSpeed,
                    vy: Math.sin(this.aimAngle) * skill.dashSpeed,
                    timeRemaining: dur,
                    damage: skill.baseDamage,
                    damageType: skill.damageType
                };
                break;
            }
        }
        this.skillCooldowns[index] = skill.cooldown;
    }

    draw(ctx) {
        ctx.save();
        // 腳底立體陰影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + this.radius * 0.8, this.radius * 1.1, this.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 準星指示線
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(this.aimAngle) * (this.radius + 14), this.y + Math.sin(this.aimAngle) * (this.radius + 14));
        ctx.stroke();

        // 護盾外環
        if (this.shield > 0) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 角色本體多層漸層
        const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.6, this.color);
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * 遊戲主管理器
 */
const GameManager = {
    state: GAME_STATE.LOBBY,
    isPractice: false,
    p1: new ArenaPlayer('p1', 180, 270, '#38bdf8'),
    p2: new ArenaPlayer('p2', 780, 270, '#f43f5e'),
    projectiles: [],
    meleeSweeps: [],
    groundAoes: [],
    vfx: new VFXSystem(),
    syncTimer: 0,

    selectedCoreId: 'STAR_WEAVER',
    selectedFluxId: null,
    selectedRhapsodyId: null,

    localReady: false,
    remoteReady: false,
    remoteInputs: { move: { x: 0, y: 0 }, mouse: { x: 0, y: 0 }, triggers: {} },

    init() {
        Input.init(DOM.canvas);
        this.renderDynamicUI();
        this.setupLobbyEvents();
        this.setupNetworkEvents();
    },

    renderDynamicUI() {
        this.renderCoresUI();
        this.updateSubSelections();
    },

    renderCoresUI() {
        DOM.coresContainer.innerHTML = '';
        Object.values(CORE_MEMORIES).forEach((core, idx) => {
            const card = document.createElement('div');
            card.className = `select-card ${idx === 0 ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="card-title">${core.name}</div>
                <div class="card-desc">${core.description}</div>
                <div class="card-desc" style="color: #38bdf8; margin-top: 4px;">HP: ${core.baseStats.hpMax} ｜ 移速: ${core.baseStats.moveSpeed}</div>
            `;
            card.addEventListener('click', () => {
                if (this.selectedCoreId === core.id) return;
                document.querySelectorAll('#dynamic-cores-container .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedCoreId = core.id;
                this.updateSubSelections();
            });
            DOM.coresContainer.appendChild(card);
        });
    },

    updateSubSelections() {
        // 1. 過濾專屬流變並預設選取首項
        const availableFluxes = Object.values(FLUX_TALENTS).filter(f => f.coreId === this.selectedCoreId);
        this.selectedFluxId = availableFluxes.length > 0 ? availableFluxes[0].id : null;
        DOM.fluxContainer.innerHTML = '';

        availableFluxes.forEach((flux) => {
            const card = document.createElement('div');
            card.className = `select-card ${flux.id === this.selectedFluxId ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="card-title">${flux.name}</div>
                <div class="card-desc">${flux.description}</div>
            `;
            card.addEventListener('click', () => {
                this.selectedFluxId = flux.id;
                document.querySelectorAll('#dynamic-flux-container .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
            DOM.fluxContainer.appendChild(card);
        });

        // 2. 過濾專屬狂想並預設選取首項
        const availableRhapsodies = Object.values(RHAPSODIES).filter(r => r.coreId === this.selectedCoreId);
        this.selectedRhapsodyId = availableRhapsodies.length > 0 ? availableRhapsodies[0].id : null;
        DOM.rhapsodyContainer.innerHTML = '';

        availableRhapsodies.forEach((rhap) => {
            const card = document.createElement('div');
            card.className = `select-card ${rhap.id === this.selectedRhapsodyId ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="card-title">${rhap.name}</div>
                <div class="card-desc">${rhap.description}</div>
            `;
            card.addEventListener('click', () => {
                this.selectedRhapsodyId = rhap.id;
                document.querySelectorAll('#dynamic-rhapsody-container .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
            DOM.rhapsodyContainer.appendChild(card);
        });
    },

    setupLobbyEvents() {
        DOM.btnPracticeMode.addEventListener('click', () => {
            this.isPractice = true;
            this.state = GAME_STATE.LOADOUT;
            DOM.connectionStatus.textContent = '進入單人訓練場 (AI/假人模式)';
            DOM.loadoutSelection.classList.remove('hidden');
        });

        DOM.btnCreateRoom.addEventListener('click', async () => {
            DOM.btnCreateRoom.disabled = true;
            DOM.connectionStatus.textContent = '註冊專屬房間代碼...';
            try {
                const id = await NetworkManager.init();
                DOM.roomIdDisplay.textContent = `房間代碼：${id}`;
                DOM.connectionStatus.textContent = '房間已建立，等待訪客連線...';
            } catch {
                DOM.connectionStatus.textContent = '建立失敗，請檢查網路狀態';
                DOM.btnCreateRoom.disabled = false;
            }
        });

        DOM.btnJoinRoom.addEventListener('click', async () => {
            const code = DOM.inputRoomId.value.trim();
            if (!code) return;
            DOM.btnJoinRoom.disabled = true;
            DOM.connectionStatus.textContent = '正建立 WebRTC P2P 連線...';
            try {
                await NetworkManager.init();
                NetworkManager.joinRoom(code);
            } catch {
                DOM.connectionStatus.textContent = '加入失敗';
                DOM.btnJoinRoom.disabled = false;
            }
        });

        DOM.btnReady.addEventListener('click', () => {
            this.localReady = true;
            DOM.btnReady.disabled = true;

            const payload = {
                coreId: this.selectedCoreId,
                fluxIds: Array.from(this.selectedFluxIds),
                rhapsodyIds: Array.from(this.selectedRhapsodyIds)
            };

            if (this.isPractice) {
                this.p1.applyLoadout(buildCombatLoadout(payload.coreId, payload.fluxIds, payload.rhapsodyIds));
                this.p2.applyLoadout(buildCombatLoadout('IRON_OATH', [], []));
                this.startGame();
                return;
            }

            DOM.readyStatus.textContent = '配置已鎖定，等待對手...';
            NetworkManager.send({ type: 'LOADOUT_READY', loadout: payload });

            if (NetworkManager.isHost) {
                this.p1.applyLoadout(buildCombatLoadout(payload.coreId, payload.fluxIds, payload.rhapsodyIds));
            } else {
                this.p2.applyLoadout(buildCombatLoadout(payload.coreId, payload.fluxIds, payload.rhapsodyIds));
            }
            this.checkMatchStart();
        });
    },

    setupNetworkEvents() {
        NetworkManager.onConnected = (isHost) => {
            this.state = GAME_STATE.LOADOUT;
            DOM.connectionStatus.textContent = `連線成功！身分：${isHost ? '主機 (P1)' : '訪客 (P2)'}`;
            DOM.loadoutSelection.classList.remove('hidden');
        };

        NetworkManager.onDataReceived = (pkg) => {
            switch (pkg.type) {
                case 'LOADOUT_READY': {
                    this.remoteReady = true;
                    if (NetworkManager.isHost) {
                        this.p2.applyLoadout(buildCombatLoadout(pkg.loadout.coreId, pkg.loadout.fluxIds, pkg.loadout.rhapsodyIds));
                    } else {
                        this.p1.applyLoadout(buildCombatLoadout(pkg.loadout.coreId, pkg.loadout.fluxIds, pkg.loadout.rhapsodyIds));
                    }
                    this.checkMatchStart();
                    break;
                }
                case 'START_GAME': {
                    this.startGame();
                    break;
                }
                case 'CLIENT_INPUT': {
                    if (NetworkManager.isHost) {
                        this.remoteInputs = pkg.input;
                    }
                    break;
                }
                case 'HOST_SNAPSHOT': {
                    if (!NetworkManager.isHost) {
                        this.applySnapshot(pkg.snapshot);
                    }
                    break;
                }
            }
        };
    },

    checkMatchStart() {
        if (this.localReady && this.remoteReady && NetworkManager.isHost) {
            NetworkManager.send({ type: 'START_GAME' });
            this.startGame();
        }
    },

    startGame() {
        this.state = GAME_STATE.IN_GAME;
        DOM.lobbyPanel.classList.add('hidden');
        DOM.battleContainer.classList.remove('hidden');

        DOM.p1Name.textContent = `P1: ${this.p1.loadout.name}`;
        DOM.p2Name.textContent = `P2: ${this.p2.loadout.name}`;

        const myPlayer = (this.isPractice || NetworkManager.isHost) ? this.p1 : this.p2;
        for (let i = 0; i < 3; i++) {
            DOM.nameSkills[i].textContent = myPlayer.loadout.skills[i].name;
        }
    },

    checkMeleeHit(attacker, angle, range, arcAngle, damage, damageType) {
        const def = attacker.id === 'p1' ? this.p2 : this.p1;
        const dist = Math.hypot(def.x - attacker.x, def.y - attacker.y);
        if (dist > range + def.radius) return;

        let diff = Math.atan2(def.y - attacker.y, def.x - attacker.x) - angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) <= ((arcAngle * Math.PI) / 180) / 2) {
            def.takeDamage(damage, damageType, this);
        }
    },

    update(dt) {
        if (this.state !== GAME_STATE.IN_GAME) return;

        this.vfx.update(dt);

        if (this.isPractice) {
            const p1Move = Input.getMovementVector();
            const triggers = Input.consumeTriggers();
            this.p1.update(dt, p1Move, Input.mouse, triggers, this.p2, this);

            if (this.p2.hp <= 0) this.p2.hp = this.p2.loadout.stats.hpMax;

            this.updateSimulatedEntities(dt);
            this.updateHUD();
            return;
        }

        if (NetworkManager.isHost) {
            const p1Move = Input.getMovementVector();
            const p1Triggers = Input.consumeTriggers();
            this.p1.update(dt, p1Move, Input.mouse, p1Triggers, this.p2, this);

            this.p2.update(
                dt,
                this.remoteInputs.move || { x: 0, y: 0 },
                this.remoteInputs.mouse || { x: 0, y: 0 },
                this.remoteInputs.triggers || {},
                this.p1,
                this
            );
            this.remoteInputs.triggers = {};

            this.updateSimulatedEntities(dt);

            // 主機定期向訪客廣播全場快照 (30Hz)
            this.syncTimer += dt;
            if (this.syncTimer >= ENGINE_CONFIG.SYNC_RATE) {
                this.syncTimer = 0;
                NetworkManager.send({
                    type: 'HOST_SNAPSHOT',
                    snapshot: {
                        p1: { x: this.p1.x, y: this.p1.y, hp: this.p1.hp, shield: this.p1.shield, aim: this.p1.aimAngle, cdAtk: this.p1.attackCooldown, cds: this.p1.skillCooldowns },
                        p2: { x: this.p2.x, y: this.p2.y, hp: this.p2.hp, shield: this.p2.shield, aim: this.p2.aimAngle, cdAtk: this.p2.attackCooldown, cds: this.p2.skillCooldowns },
                        projectiles: this.projectiles.map(p => ({ x: p.x, y: p.y, r: p.radius, c: p.color })),
                        sweeps: this.meleeSweeps.map(s => ({ x: s.x, y: s.y, a: s.angle, r: s.range, arc: s.arcAngle, c: s.color, life: s.life })),
                        aoes: this.groundAoes.map(a => ({ x: a.x, y: a.y, r: a.radius, delay: a.delay, total: a.totalDelay }))
                    }
                });
            }
        } else {
            // 訪客端核心：客戶端預測 (Client-side Prediction)
            const p2Move = Input.getMovementVector();
            const triggers = Input.consumeTriggers();

            // 本地直接計算移動，完全消除等待主機回傳的延遲
            this.p2.x += p2Move.x * this.p2.loadout.stats.moveSpeed * dt;
            this.p2.y += p2Move.y * this.p2.loadout.stats.moveSpeed * dt;
            this.p2.x = Math.max(this.p2.radius, Math.min(ENGINE_CONFIG.CANVAS.WIDTH - this.p2.radius, this.p2.x));
            this.p2.y = Math.max(this.p2.radius, Math.min(ENGINE_CONFIG.CANVAS.HEIGHT - this.p2.radius, this.p2.y));
            this.p2.aimAngle = Math.atan2(Input.mouse.y - this.p2.y, Input.mouse.x - this.p2.x);

            // 對主機進行線性插值追蹤
            this.p1.interpolate(dt);

            // 發送操作封包
            NetworkManager.send({
                type: 'CLIENT_INPUT',
                input: {
                    move: p2Move,
                    mouse: Input.mouse,
                    triggers
                }
            });
        }

        this.updateHUD();
    },

    updateSimulatedEntities(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);
            const target = p.ownerId === 'p1' ? this.p2 : this.p1;
            if (Math.hypot(p.x - target.x, p.y - target.y) < p.radius + target.radius) {
                p.isAlive = false;
                target.takeDamage(p.damage, p.damageType, this);
            }
            if (!p.isAlive) this.projectiles.splice(i, 1);
        }

        for (let i = this.meleeSweeps.length - 1; i >= 0; i--) {
            this.meleeSweeps[i].update(dt);
            if (this.meleeSweeps[i].life <= 0) this.meleeSweeps.splice(i, 1);
        }

        for (let i = this.groundAoes.length - 1; i >= 0; i--) {
            this.groundAoes[i].update(dt);
            if (!this.groundAoes[i].isAlive) this.groundAoes.splice(i, 1);
        }
    },

    applySnapshot(s) {
        // 主機授權位置和解 (Reconciliation)
        this.p1.targetX = s.p1.x;
        this.p1.targetY = s.p1.y;
        this.p1.hp = s.p1.hp;
        this.p1.shield = s.p1.shield;
        this.p1.aimAngle = s.p1.aim;

        // 若本地預測與伺服器差距過大才進行平滑校正
        const delta = Math.hypot(this.p2.x - s.p2.x, this.p2.y - s.p2.y);
        if (delta > 40) {
            this.p2.x = s.p2.x;
            this.p2.y = s.p2.y;
        }
        this.p2.hp = s.p2.hp;
        this.p2.shield = s.p2.shield;
        this.p2.attackCooldown = s.p2.cdAtk;
        this.p2.skillCooldowns = s.p2.cds;

        this.projectiles = s.projectiles.map(p => new Projectile('remote', p.x, p.y, 0, 0, p.r, 999, 0, '', p.c));
        this.meleeSweeps = s.sweeps.map(sw => {
            const inst = new MeleeSweepVisual(sw.x, sw.y, sw.a, sw.r, (sw.arc * 180) / Math.PI, sw.c);
            inst.life = sw.life;
            return inst;
        });
        this.groundAoes = s.aoes.map(a => {
            const inst = new GroundAoeVisual('remote', a.x, a.y, a.r, a.delay, 0, '', null);
            inst.totalDelay = a.total;
            return inst;
        });
    },

    updateHUD() {
        if (!this.p1.loadout || !this.p2.loadout) return;

        const p1HpRatio = Math.max(0, this.p1.hp / this.p1.loadout.stats.hpMax);
        const p2HpRatio = Math.max(0, this.p2.hp / this.p2.loadout.stats.hpMax);

        DOM.p1HpFill.style.width = `${p1HpRatio * 100}%`;
        DOM.p2HpFill.style.width = `${p2HpRatio * 100}%`;
        DOM.p1HpText.textContent = `${this.p1.hp}/${this.p1.loadout.stats.hpMax} ${this.p1.shield > 0 ? `(+${this.p1.shield})` : ''}`;
        DOM.p2HpText.textContent = `${this.p2.hp}/${this.p2.loadout.stats.hpMax} ${this.p2.shield > 0 ? `(+${this.p2.shield})` : ''}`;

        const me = (this.isPractice || NetworkManager.isHost) ? this.p1 : this.p2;
        DOM.cdAttack.style.height = `${(me.attackCooldown / me.loadout.basicAttack.cooldown) * 100}%`;
        for (let i = 0; i < 3; i++) {
            DOM.cdSkills[i].style.height = `${(me.skillCooldowns[i] / me.loadout.skills[i].cooldown) * 100}%`;
        }
    },

    render() {
        if (this.state !== GAME_STATE.IN_GAME) return;
        const ctx = DOM.ctx;

        ctx.clearRect(0, 0, ENGINE_CONFIG.CANVAS.WIDTH, ENGINE_CONFIG.CANVAS.HEIGHT);

        // 背景暗角網格
        ctx.strokeStyle = ENGINE_CONFIG.CANVAS.GRID_COLOR;
        ctx.lineWidth = 1;
        for (let x = 0; x < ENGINE_CONFIG.CANVAS.WIDTH; x += ENGINE_CONFIG.CANVAS.GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ENGINE_CONFIG.CANVAS.HEIGHT); ctx.stroke();
        }
        for (let y = 0; y < ENGINE_CONFIG.CANVAS.HEIGHT; y += ENGINE_CONFIG.CANVAS.GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ENGINE_CONFIG.CANVAS.WIDTH, y); ctx.stroke();
        }

        // 實體與特效渲染
        this.groundAoes.forEach(a => a.draw(ctx));
        this.p1.draw(ctx);
        this.p2.draw(ctx);
        this.projectiles.forEach(p => p.draw(ctx));
        this.meleeSweeps.forEach(s => s.draw(ctx));
        this.vfx.draw(ctx);
    }
};

/**
 * 主循環
 */
let lastTimestamp = 0;
function mainLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    GameManager.update(dt);
    GameManager.render();

    requestAnimationFrame(mainLoop);
}

GameManager.init();
requestAnimationFrame(mainLoop);
