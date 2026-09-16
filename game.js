import { ATTACK_TYPE, DAMAGE_TYPE, CORE_MEMORIES, FLUX_TALENTS, RHAPSODIES } from './definitions.js';
import { buildCombatLoadout } from './builder.js';
import { NetworkManager } from './network.js';
import { Camera2D } from './camera.js';
import { DungeonMap } from './map.js';
import { DungeonEnemy } from './enemy.js';

/**
 * 引擎設定常數與遊戲狀態
 */
const ENGINE_CONFIG = {
    CANVAS: { WIDTH: 960, HEIGHT: 540 },
    SYNC_RATE: 1 / 30,
    LERP_FACTOR: 18
};

const GAME_STATE = Object.freeze({
    LOBBY: 'LOBBY',
    LOADOUT: 'LOADOUT',
    IN_GAME: 'IN_GAME'
});

/**
 * DOM 節點快取
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
    fluxPointsDisplay: document.getElementById('flux-points-display'),
    btnResetFlux: document.getElementById('btn-reset-flux'),
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
 * 輸入監聽模組 (支援 Q/E/R 技能鍵與滑鼠點擊)
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
            if (k === 'e' || k === '2') this.triggers.skill2 = true;
            if (k === 'r' || k === '3') this.triggers.skill3 = true;
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
 * 浮動戰鬥數字
 */
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x + (Math.random() - 0.5) * 16;
        this.y = y - 10;
        this.text = text;
        this.color = color;
        this.life = 0.8;
        this.vy = -45;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / 0.8);
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

/**
 * 特效與粒子系統
 */
class VFXSystem {
    constructor() {
        this.particles = [];
        this.floatingTexts = [];
    }

    spawnHit(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 200 + 50;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 2.5 + 1.5,
                color,
                life: 0.35,
                maxLife: 0.35
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
 * 彈道實體
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

        if (this.remainingDist <= 0) {
            this.isAlive = false;
        }
    }

    draw(ctx) {
        ctx.save();
        const grad = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, this.radius * 1.5);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, this.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 近戰揮擊視覺
 */
class MeleeSweepVisual {
    constructor(x, y, angle, range, arcAngle, color) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.range = range;
        this.arcAngle = (arcAngle * Math.PI) / 180;
        this.color = color;
        this.life = 0.15;
    }

    update(dt) {
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        const alpha = Math.max(0, this.life / 0.15);
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
 * 地面延時 AOE
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
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 玩家實體類別
 */
class ArenaPlayer {
    constructor(id, x, y, baseColor) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.targetX = x;
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

    update(dt, inputVector, mouseWorldPos, triggers, gameContext) {
        if (!this.loadout) return;

        this.aimAngle = Math.atan2(mouseWorldPos.y - this.y, mouseWorldPos.x - this.x);

        if (this.dashState) {
            this.dashState.timeRemaining -= dt;
            this.x += this.dashState.vx * dt;
            this.y += this.dashState.vy * dt;

            // 衝鋒期間檢查碰撞怪物
            for (const enemy of gameContext.enemies) {
                if (Math.hypot(this.x - enemy.x, this.y - enemy.y) < this.radius + enemy.radius) {
                    enemy.takeDamage(this.dashState.damage, this.dashState.damageType, gameContext);
                }
            }

            if (this.dashState.timeRemaining <= 0) {
                this.dashState = null;
            }
        } else {
            this.x += inputVector.x * this.loadout.stats.moveSpeed * dt;
            this.y += inputVector.y * this.loadout.stats.moveSpeed * dt;
        }

        // 迷宮牆壁防穿牆滑動
        if (gameContext.dungeonMap) {
            gameContext.dungeonMap.resolveCircleCollision(this);
        }

        if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        for (let i = 0; i < 3; i++) {
            if (this.skillCooldowns[i] > 0) this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
        }

        if (triggers.attack) this.executeBasicAttack(gameContext);
        if (triggers.skill1) this.executeSkill(0, mouseWorldPos, gameContext);
        if (triggers.skill2) this.executeSkill(1, mouseWorldPos, gameContext);
        if (triggers.skill3) this.executeSkill(2, mouseWorldPos, gameContext);
    }

    interpolate(dt) {
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

    executeSkill(index, mouseWorldPos, ctx) {
        if (this.skillCooldowns[index] > 0) return;
        const skill = this.loadout.skills[index];
        if (!skill) return;

        const distToMouse = Math.hypot(mouseWorldPos.x - this.x, mouseWorldPos.y - this.y);

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
                        for (const enemy of ctx.enemies) {
                            if (Math.hypot(enemy.x - aoe.x, enemy.y - aoe.y) <= aoe.radius + enemy.radius) {
                                enemy.takeDamage(aoe.damage, aoe.damageType, ctx);
                            }
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + this.radius * 0.8, this.radius * 1.1, this.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(this.aimAngle) * (this.radius + 14), this.y + Math.sin(this.aimAngle) * (this.radius + 14));
        ctx.stroke();

        if (this.shield > 0) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
            ctx.stroke();
        }

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
    camera: new Camera2D(960, 540),
    dungeonMap: null,
    currentFloor: 1,

    p1: new ArenaPlayer('p1', 0, 0, '#38bdf8'),
    p2: new ArenaPlayer('p2', 0, 0, '#f43f5e'),

    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    meleeSweeps: [],
    groundAoes: [],
    vfx: new VFXSystem(),
    syncTimer: 0,

    selectedCoreId: 'STAR_WEAVER',
    fluxPoints: 5,
    selectedFluxIds: new Set(),
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
                this.fluxPoints = 5;
                this.selectedFluxIds.clear();
                this.updateSubSelections();
            });
            DOM.coresContainer.appendChild(card);
        });
    },

    updateSubSelections() {
        const availableFluxes = Object.values(FLUX_TALENTS).filter(f => f.coreId === this.selectedCoreId);
        DOM.fluxContainer.innerHTML = '';
        if (DOM.fluxPointsDisplay) DOM.fluxPointsDisplay.textContent = this.fluxPoints;

        availableFluxes.forEach((flux) => {
            const isUnlocked = this.selectedFluxIds.has(flux.id);
            const prerequisitesMet = flux.requires.length === 0 || flux.requires.every(reqId => this.selectedFluxIds.has(reqId));
            const canAllocate = !isUnlocked && this.fluxPoints > 0 && prerequisitesMet;

            const card = document.createElement('div');
            let statusClass = '';
            if (isUnlocked) statusClass = 'talent-active';
            else if (!prerequisitesMet) statusClass = 'talent-locked';

            const reqDesc = flux.requires.length > 0 
                ? `<div style="font-size: 11px; color: #f59e0b; margin-top: 4px;">前置：${flux.requires.map(id => FLUX_TALENTS[id].name).join(', ')}</div>` 
                : '<div style="font-size: 11px; color: #64748b; margin-top: 4px;">基礎天賦</div>';

            card.className = `select-card ${statusClass}`;
            card.innerHTML = `
                <div style="font-size: 11px; color: #94a3b8;">[${flux.branch}]</div>
                <div class="card-title">${flux.name}</div>
                <div class="card-desc">${flux.description}</div>
                ${reqDesc}
            `;

            card.addEventListener('click', () => {
                if (isUnlocked) {
                    const isRequiredByOthers = Array.from(this.selectedFluxIds).some(activeId => {
                        const activeFlux = FLUX_TALENTS[activeId];
                        return activeFlux.requires && activeFlux.requires.includes(flux.id);
                    });
                    if (isRequiredByOthers) {
                        alert('無法退點：有後續已啟用的天賦依賴此節點。');
                        return;
                    }
                    this.selectedFluxIds.delete(flux.id);
                    this.fluxPoints++;
                    this.updateSubSelections();
                    return;
                }

                if (canAllocate) {
                    this.selectedFluxIds.add(flux.id);
                    this.fluxPoints--;
                    this.updateSubSelections();
                }
            });

            DOM.fluxContainer.appendChild(card);
        });

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
        if (DOM.btnResetFlux) {
            DOM.btnResetFlux.addEventListener('click', () => {
                this.fluxPoints = 5;
                this.selectedFluxIds.clear();
                this.updateSubSelections();
            });
        }

        DOM.btnPracticeMode.addEventListener('click', () => {
            this.isPractice = true;
            this.state = GAME_STATE.LOADOUT;
            DOM.connectionStatus.textContent = '進入單人地下城冒險模式';
            DOM.loadoutSelection.classList.remove('hidden');
        });

        DOM.btnCreateRoom.addEventListener('click', async () => {
            DOM.btnCreateRoom.disabled = true;
            DOM.connectionStatus.textContent = '正在註冊 4 碼專屬房間...';
            try {
                const id = await NetworkManager.init();
                DOM.roomIdDisplay.textContent = `房間代碼：${id}`;
                DOM.connectionStatus.textContent = '房間已建立，等待訪客連線...';
            } catch {
                DOM.connectionStatus.textContent = '建立失敗，請檢查網路連線';
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
                rhapsodyIds: this.selectedRhapsodyId ? [this.selectedRhapsodyId] : []
            };

            if (this.isPractice) {
                this.p1.applyLoadout(buildCombatLoadout(payload.coreId, payload.fluxIds, payload.rhapsodyIds));
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
                    this.loadFloor(pkg.floor, pkg.seed);
                    this.startGame();
                    break;
                }
                case 'NEXT_FLOOR': {
                    this.loadFloor(pkg.floor, pkg.seed);
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
            const seed = Math.floor(Math.random() * 1000000);
            NetworkManager.send({ type: 'START_GAME', floor: 1, seed });
            this.loadFloor(1, seed);
            this.startGame();
        }
    },

    loadFloor(floorNumber, seed) {
        this.currentFloor = floorNumber;
        this.dungeonMap = new DungeonMap(seed, 45, 45, 48);
        this.camera.setWorldBounds(this.dungeonMap.worldWidth, this.dungeonMap.worldHeight);

        this.p1.x = this.dungeonMap.playerSpawn.x;
        this.p1.y = this.dungeonMap.playerSpawn.y;
        this.p2.x = this.dungeonMap.playerSpawn.x + 30;
        this.p2.y = this.dungeonMap.playerSpawn.y + 30;

        this.enemies = this.dungeonMap.enemySpawns.map((s, idx) => 
            new DungeonEnemy(`enemy_${idx}`, s.x, s.y, s.type)
        );

        this.projectiles = [];
        this.meleeSweeps = [];
        this.groundAoes = [];
        this.enemyProjectiles = [];
    },

    spawnEnemyProjectile(x, y, angle, speed, radius, maxRange, damage, damageType, color) {
        this.enemyProjectiles.push(
            new Projectile('enemy', x, y, angle, speed, radius, maxRange, damage, damageType, color)
        );
    },

    startGame() {
        this.state = GAME_STATE.IN_GAME;
        DOM.lobbyPanel.classList.add('hidden');
        DOM.battleContainer.classList.remove('hidden');

        if (this.isPractice) {
            this.loadFloor(1, Math.floor(Math.random() * 1000000));
        }

        DOM.p1Name.textContent = `P1: ${this.p1.loadout ? this.p1.loadout.name : '勇者'}`;
        DOM.p2Name.textContent = this.isPractice ? '單人模式' : `P2: ${this.p2.loadout ? this.p2.loadout.name : '隊友'}`;

        const myPlayer = (this.isPractice || NetworkManager.isHost) ? this.p1 : this.p2;
        for (let i = 0; i < 3; i++) {
            DOM.nameSkills[i].textContent = myPlayer.loadout.skills[i].name;
        }
    },

    checkMeleeHit(attacker, angle, range, arcAngle, damage, damageType) {
        for (const enemy of this.enemies) {
            const dist = Math.hypot(enemy.x - attacker.x, enemy.y - attacker.y);
            if (dist > range + enemy.radius) continue;

            let diff = Math.atan2(enemy.y - attacker.y, enemy.x - attacker.x) - angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) <= ((arcAngle * Math.PI) / 180) / 2) {
                enemy.takeDamage(damage, damageType, this);
            }
        }
    },

    update(dt) {
        if (this.state !== GAME_STATE.IN_GAME) return;

        this.vfx.update(dt);
        const myPlayer = (this.isPractice || NetworkManager.isHost) ? this.p1 : this.p2;
        const mouseWorld = this.camera.screenToWorld(Input.mouse.x, Input.mouse.y);

        this.camera.follow(myPlayer.x, myPlayer.y, dt);

        if (this.isPractice || NetworkManager.isHost) {
            const p1Move = Input.getMovementVector();
            const p1Triggers = Input.consumeTriggers();
            this.p1.update(dt, p1Move, mouseWorld, p1Triggers, this);

            if (!this.isPractice && this.p2.loadout) {
                this.p2.update(
                    dt,
                    this.remoteInputs.move || { x: 0, y: 0 },
                    this.remoteInputs.mouse || { x: 0, y: 0 },
                    this.remoteInputs.triggers || {},
                    this
                );
                this.remoteInputs.triggers = {};
            }

            // 更新怪物群
            const activePlayers = [this.p1, this.p2].filter(p => p.loadout !== null && p.hp > 0);
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                enemy.update(dt, activePlayers, this.dungeonMap, this);
                if (!enemy.isAlive) {
                    this.enemies.splice(i, 1);
                }
            }

            // 房間傳送陣判定
            if (this.enemies.length === 0 && !this.dungeonMap.portal.active) {
                this.dungeonMap.portal.active = true;
            }

            if (this.dungeonMap.portal.active) {
                const dPortal = Math.hypot(myPlayer.x - this.dungeonMap.portal.x, myPlayer.y - this.dungeonMap.portal.y);
                if (dPortal < myPlayer.radius + this.dungeonMap.portal.radius) {
                    const nextFloor = this.currentFloor + 1;
                    const nextSeed = Math.floor(Math.random() * 1000000);
                    if (!this.isPractice) {
                        NetworkManager.send({ type: 'NEXT_FLOOR', floor: nextFloor, seed: nextSeed });
                    }
                    this.loadFloor(nextFloor, nextSeed);
                }
            }

            this.updateSimulatedEntities(dt);

            // 主機廣播快照
            if (!this.isPractice) {
                this.syncTimer += dt;
                if (this.syncTimer >= ENGINE_CONFIG.SYNC_RATE) {
                    this.syncTimer = 0;
                    NetworkManager.send({
                        type: 'HOST_SNAPSHOT',
                        snapshot: {
                            p1: { x: this.p1.x, y: this.p1.y, hp: this.p1.hp, shield: this.p1.shield, aim: this.p1.aimAngle, cdAtk: this.p1.attackCooldown, cds: this.p1.skillCooldowns },
                            p2: { x: this.p2.x, y: this.p2.y, hp: this.p2.hp, shield: this.p2.shield, aim: this.p2.aimAngle, cdAtk: this.p2.attackCooldown, cds: this.p2.skillCooldowns },
                            enemies: this.enemies.map(e => ({ id: e.id, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, c: e.color, r: e.radius })),
                            projectiles: this.projectiles.map(p => ({ x: p.x, y: p.y, r: p.radius, c: p.color })),
                            enemyProjectiles: this.enemyProjectiles.map(ep => ({ x: ep.x, y: ep.y, r: ep.radius, c: ep.color })),
                            sweeps: this.meleeSweeps.map(s => ({ x: s.x, y: s.y, a: s.angle, r: s.range, arc: s.arcAngle, c: s.color, life: s.life })),
                            aoes: this.groundAoes.map(a => ({ x: a.x, y: a.y, r: a.radius, delay: a.delay, total: a.totalDelay })),
                            portalActive: this.dungeonMap.portal.active
                        }
                    });
                }
            }
        } else {
            // 訪客端：本地預測與伺服器插值
            const p2Move = Input.getMovementVector();
            const triggers = Input.consumeTriggers();

            this.p2.x += p2Move.x * this.p2.loadout.stats.moveSpeed * dt;
            this.p2.y += p2Move.y * this.p2.loadout.stats.moveSpeed * dt;
            if (this.dungeonMap) this.dungeonMap.resolveCircleCollision(this.p2);
            this.p2.aimAngle = Math.atan2(mouseWorld.y - this.p2.y, mouseWorld.x - this.p2.x);

            this.p1.interpolate(dt);

            NetworkManager.send({
                type: 'CLIENT_INPUT',
                input: {
                    move: p2Move,
                    mouse: mouseWorld,
                    triggers
                }
            });
        }

        this.updateHUD();
    },

    updateSimulatedEntities(dt) {
        // 玩家彈道更新與障礙物消滅
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);

            if (this.dungeonMap.isPointInWall(p.x, p.y)) {
                p.isAlive = false;
                this.vfx.spawnHit(p.x, p.y, '#94a3b8', 6);
            }

            for (const enemy of this.enemies) {
                if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < p.radius + enemy.radius) {
                    p.isAlive = false;
                    enemy.takeDamage(p.damage, p.damageType, this);
                    break;
                }
            }

            if (!p.isAlive) this.projectiles.splice(i, 1);
        }

        // 怪物彈道更新
        for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
            const ep = this.enemyProjectiles[i];
            ep.update(dt);

            if (this.dungeonMap.isPointInWall(ep.x, ep.y)) {
                ep.isAlive = false;
            } else {
                const targetPlayers = [this.p1, this.p2].filter(p => p.loadout && p.hp > 0);
                for (const player of targetPlayers) {
                    if (Math.hypot(ep.x - player.x, ep.y - player.y) < ep.radius + player.radius) {
                        ep.isAlive = false;
                        player.takeDamage(ep.damage, ep.damageType, this);
                        break;
                    }
                }
            }

            if (!ep.isAlive) this.enemyProjectiles.splice(i, 1);
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
        this.p1.targetX = s.p1.x;
        this.p1.targetY = s.p1.y;
        this.p1.hp = s.p1.hp;
        this.p1.shield = s.p1.shield;
        this.p1.aimAngle = s.p1.aim;

        const delta = Math.hypot(this.p2.x - s.p2.x, this.p2.y - s.p2.y);
        if (delta > 40) {
            this.p2.x = s.p2.x;
            this.p2.y = s.p2.y;
        }
        this.p2.hp = s.p2.hp;
        this.p2.shield = s.p2.shield;
        this.p2.attackCooldown = s.p2.cdAtk;
        this.p2.skillCooldowns = s.p2.cds;

        if (this.dungeonMap) this.dungeonMap.portal.active = s.portalActive;

        this.enemies = s.enemies.map(se => {
            const e = new DungeonEnemy(se.id, se.x, se.y, 'MELEE');
            e.hp = se.hp;
            e.maxHp = se.maxHp;
            e.color = se.c;
            e.radius = se.r;
            return e;
        });

        this.projectiles = s.projectiles.map(p => new Projectile('remote', p.x, p.y, 0, 0, p.r, 999, 0, '', p.c));
        this.enemyProjectiles = s.enemyProjectiles.map(ep => new Projectile('enemy', ep.x, ep.y, 0, 0, ep.r, 999, 0, '', ep.c));
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
        const myPlayer = (this.isPractice || NetworkManager.isHost) ? this.p1 : this.p2;
        if (!myPlayer.loadout) return;

        const p1HpRatio = this.p1.loadout ? Math.max(0, this.p1.hp / this.p1.loadout.stats.hpMax) : 0;
        DOM.p1HpFill.style.width = `${p1HpRatio * 100}%`;
        DOM.p1HpText.textContent = this.p1.loadout ? `${this.p1.hp}/${this.p1.loadout.stats.hpMax}` : '';

        if (!this.isPractice && this.p2.loadout) {
            const p2HpRatio = Math.max(0, this.p2.hp / this.p2.loadout.stats.hpMax);
            DOM.p2HpFill.style.width = `${p2HpRatio * 100}%`;
            DOM.p2HpText.textContent = `${this.p2.hp}/${this.p2.loadout.stats.hpMax}`;
        }

        DOM.cdAttack.style.height = `${(myPlayer.attackCooldown / myPlayer.loadout.basicAttack.cooldown) * 100}%`;
        for (let i = 0; i < 3; i++) {
            DOM.cdSkills[i].style.height = `${(myPlayer.skillCooldowns[i] / myPlayer.loadout.skills[i].cooldown) * 100}%`;
        }
    },

    render() {
        if (this.state !== GAME_STATE.IN_GAME) return;
        const ctx = DOM.ctx;

        ctx.clearRect(0, 0, ENGINE_CONFIG.CANVAS.WIDTH, ENGINE_CONFIG.CANVAS.HEIGHT);

        // 攝影機視口平移轉換
        this.camera.apply(ctx);

        if (this.dungeonMap) {
            this.dungeonMap.render(ctx, this.camera);
        }

        this.groundAoes.forEach(a => a.draw(ctx));
        this.enemies.forEach(e => e.draw(ctx));
        if (this.p1.loadout) this.p1.draw(ctx);
        if (!this.isPractice && this.p2.loadout) this.p2.draw(ctx);
        this.projectiles.forEach(p => p.draw(ctx));
        this.enemyProjectiles.forEach(ep => ep.draw(ctx));
        this.meleeSweeps.forEach(s => s.draw(ctx));
        this.vfx.draw(ctx);

        // 還原視口平移矩陣
        this.camera.restore(ctx);
    }
};

/**
 * 引擎主迴圈
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
