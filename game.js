import { ATTACK_TYPE, DAMAGE_TYPE } from './definitions.js';
import { buildCombatLoadout } from './builder.js';
import { NetworkManager } from './network.js';

/**
 * 引擎常數與狀態機列舉
 */
const GAME_STATE = Object.freeze({
    LOBBY: 'LOBBY',
    LOADOUT: 'LOADOUT',
    IN_GAME: 'IN_GAME'
});

const ENGINE_CONFIG = {
    CANVAS: { WIDTH: 960, HEIGHT: 540, GRID_SIZE: 40, GRID_COLOR: '#232733' },
    SYNC_RATE: 1 / 30 // 主機廣播頻率 (30Hz)
};

/**
 * DOM 快取
 */
const DOM = {
    lobbyPanel: document.getElementById('lobby-panel'),
    battleContainer: document.getElementById('battle-container'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    roomIdDisplay: document.getElementById('room-id-display'),
    inputRoomId: document.getElementById('input-room-id'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    connectionStatus: document.getElementById('connection-status'),
    loadoutSelection: document.getElementById('loadout-selection'),
    selectCore: document.getElementById('select-core'),
    fluxCheckboxes: document.querySelectorAll('#flux-options input'),
    rhapsodyCheckboxes: document.querySelectorAll('#rhapsody-options input'),
    btnReady: document.getElementById('btn-ready'),
    readyStatus: document.getElementById('ready-status'),
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    p1Info: document.getElementById('p1-info'),
    p2Info: document.getElementById('p2-info'),
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
 * 使用者輸入控制器
 */
const Input = {
    keys: {},
    mouse: { x: 0, y: 0, isDown: false },
    activeTriggers: { attack: false, skill1: false, skill2: false, skill3: false },

    init(canvas) {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            if (key === 'q' || key === '1') this.activeTriggers.skill1 = true;
            if (key === 'w' || key === '2') this.activeTriggers.skill2 = true;
            if (key === 'e' || key === '3') this.activeTriggers.skill3 = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.mouse.isDown = true;
                this.activeTriggers.attack = true;
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

    clearTriggers() {
        this.activeTriggers.attack = false;
        this.activeTriggers.skill1 = false;
        this.activeTriggers.skill2 = false;
        this.activeTriggers.skill3 = false;
    }
};

/**
 * 傷害計算器
 */
const DamageCalculator = {
    calculateDamage(attackerDamage, damageType, defenderStats) {
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
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
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
        this.life = 0.15;
    }

    update(dt) {
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / 0.15);
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, this.range, this.angle - this.arcAngle / 2, this.angle + this.arcAngle / 2);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha *= 0.2;
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 實體類別：地面延時範圍傷害
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
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 玩家邏輯實體 (伺服端/本機端運算)
 */
class NetworkPlayer {
    constructor(id, x, y, color) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = 18;
        this.color = color;
        this.loadout = null;

        this.hp = 100;
        this.shield = 0;
        this.attackCooldown = 0;
        this.skillCooldowns = [0, 0, 0];
        this.dashState = null;
        this.aimAngle = 0;
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

        // 衝鋒位移處理
        if (this.dashState) {
            this.dashState.timeRemaining -= dt;
            this.x += this.dashState.vx * dt;
            this.y += this.dashState.vy * dt;

            const dist = Math.hypot(this.x - opponent.x, this.y - opponent.y);
            if (dist < this.radius + opponent.radius) {
                opponent.takeDamage(this.dashState.damage, this.dashState.damageType);
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

        // 行動指令判定
        if (triggers.attack) this.executeBasicAttack(mousePos, gameContext);
        if (triggers.skill1) this.executeSkill(0, mousePos, opponent, gameContext);
        if (triggers.skill2) this.executeSkill(1, mousePos, opponent, gameContext);
        if (triggers.skill3) this.executeSkill(2, mousePos, opponent, gameContext);
    }

    takeDamage(amount, damageType) {
        const actualDmg = DamageCalculator.calculateDamage(amount, damageType, this.loadout.stats);
        if (this.shield > 0) {
            if (this.shield >= actualDmg) {
                this.shield -= actualDmg;
                return;
            } else {
                const remain = actualDmg - this.shield;
                this.shield = 0;
                this.hp = Math.max(0, this.hp - remain);
                return;
            }
        }
        this.hp = Math.max(0, this.hp - actualDmg);
    }

    executeBasicAttack(mousePos, ctx) {
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
                const clampedDist = Math.min(distToMouse, skill.maxRange);
                const targetX = this.x + Math.cos(this.aimAngle) * clampedDist;
                const targetY = this.y + Math.sin(this.aimAngle) * clampedDist;

                ctx.groundAoes.push(new GroundAoeVisual(
                    this.id, targetX, targetY, skill.radius, skill.delay,
                    skill.baseDamage, skill.damageType, (aoe) => {
                        const dist = Math.hypot(opponent.x - aoe.x, opponent.y - aoe.y);
                        if (dist <= aoe.radius + opponent.radius) {
                            opponent.takeDamage(aoe.damage, aoe.damageType);
                        }
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
                const clampedDist = Math.min(distToMouse, skill.maxRange);
                const duration = clampedDist / skill.dashSpeed;
                this.dashState = {
                    vx: Math.cos(this.aimAngle) * skill.dashSpeed,
                    vy: Math.sin(this.aimAngle) * skill.dashSpeed,
                    timeRemaining: duration,
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
        // 準星指示線
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(this.aimAngle) * (this.radius + 12), this.y + Math.sin(this.aimAngle) * (this.radius + 12));
        ctx.stroke();

        // 護盾外圈
        if (this.shield > 0) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 角色本體
        ctx.fillStyle = this.color;
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
 * 遊戲整體狀態與對戰管理系統
 */
const GameManager = {
    state: GAME_STATE.LOBBY,
    p1: new NetworkPlayer('p1', 180, 270, '#38bdf8'),
    p2: new NetworkPlayer('p2', 780, 270, '#f43f5e'),
    projectiles: [],
    meleeSweeps: [],
    groundAoes: [],
    syncTimer: 0,

    // 連線與準備標記
    localReady: false,
    remoteReady: false,
    remoteInputs: { moveVec: { x: 0, y: 0 }, mouse: { x: 0, y: 0 }, triggers: {} },

    init() {
        Input.init(DOM.canvas);
        this.setupLobbyEvents();
        this.setupNetworkEvents();
    },

    setupLobbyEvents() {
        DOM.btnCreateRoom.addEventListener('click', async () => {
            DOM.btnCreateRoom.disabled = true;
            DOM.connectionStatus.textContent = '正在向信令伺服器註冊房間...';
            try {
                const id = await NetworkManager.init();
                DOM.roomIdDisplay.textContent = `房間代碼：${id}`;
                DOM.connectionStatus.textContent = '房間已建立，等待訪客連線...';
            } catch (err) {
                DOM.connectionStatus.textContent = '建立失敗，請檢查網路連線';
                DOM.btnCreateRoom.disabled = false;
            }
        });

        DOM.btnJoinRoom.addEventListener('click', async () => {
            const targetId = DOM.inputRoomId.value.trim();
            if (!targetId) return;
            DOM.btnJoinRoom.disabled = true;
            DOM.connectionStatus.textContent = '連線中...';
            try {
                await NetworkManager.init();
                NetworkManager.joinRoom(targetId);
            } catch (err) {
                DOM.connectionStatus.textContent = '加入失敗';
                DOM.btnJoinRoom.disabled = false;
            }
        });

        DOM.btnReady.addEventListener('click', () => {
            this.localReady = true;
            DOM.btnReady.disabled = true;
            DOM.readyStatus.textContent = '已鎖定配置，等待對手...';

            const myLoadoutData = this.collectSelectedLoadout();
            NetworkManager.send({
                type: 'LOADOUT_READY',
                loadout: myLoadoutData
            });

            if (NetworkManager.isHost) {
                this.p1.applyLoadout(buildCombatLoadout(myLoadoutData.coreId, myLoadoutData.fluxIds, myLoadoutData.rhapsodyIds));
            } else {
                this.p2.applyLoadout(buildCombatLoadout(myLoadoutData.coreId, myLoadoutData.fluxIds, myLoadoutData.rhapsodyIds));
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

    collectSelectedLoadout() {
        const coreId = DOM.selectCore.value;
        const fluxIds = Array.from(DOM.fluxCheckboxes).filter(c => c.checked).map(c => c.value);
        const rhapsodyIds = Array.from(DOM.rhapsodyCheckboxes).filter(c => c.checked).map(c => c.value);
        return { coreId, fluxIds, rhapsodyIds };
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

        // 更新 HUD 名稱
        const myPlayer = NetworkManager.isHost ? this.p1 : this.p2;
        for (let i = 0; i < 3; i++) {
            DOM.nameSkills[i].textContent = myPlayer.loadout.skills[i].name;
        }
    },

    checkMeleeHit(attacker, angle, range, arcAngle, damage, damageType) {
        const defender = attacker.id === 'p1' ? this.p2 : this.p1;
        const dx = defender.x - attacker.x;
        const dy = defender.y - attacker.y;
        const distance = Math.hypot(dx, dy);

        if (distance > range + defender.radius) return;

        let angleDiff = Math.atan2(dy, dx) - angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        if (Math.abs(angleDiff) <= ((arcAngle * Math.PI) / 180) / 2) {
            defender.takeDamage(damage, damageType);
        }
    },

    update(dt) {
        if (this.state !== GAME_STATE.IN_GAME) return;

        if (NetworkManager.isHost) {
            // 主機負責運算全場實體
            const p1Move = Input.getMovementVector();
            this.p1.update(dt, p1Move, Input.mouse, Input.activeTriggers, this.p2, this);
            Input.clearTriggers();

            this.p2.update(
                dt,
                this.remoteInputs.moveVec || { x: 0, y: 0 },
                this.remoteInputs.mouse || { x: 0, y: 0 },
                this.remoteInputs.triggers || {},
                this.p1,
                this
            );
            this.remoteInputs.triggers = {};

            // 彈道更新與碰撞
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.update(dt);
                const target = p.ownerId === 'p1' ? this.p2 : this.p1;
                if (Math.hypot(p.x - target.x, p.y - target.y) < p.radius + target.radius) {
                    p.isAlive = false;
                    target.takeDamage(p.damage, p.damageType);
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

            // 定頻向訪客廣播戰局快照 (30Hz)
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
            // 訪客端：採樣輸入並傳送至主機
            NetworkManager.send({
                type: 'CLIENT_INPUT',
                input: {
                    moveVec: Input.getMovementVector(),
                    mouse: Input.mouse,
                    triggers: { ...Input.activeTriggers }
                }
            });
            Input.clearTriggers();
        }

        this.updateHUD();
    },

    applySnapshot(s) {
        this.p1.x = s.p1.x; this.p1.y = s.p1.y; this.p1.hp = s.p1.hp; this.p1.shield = s.p1.shield; this.p1.aimAngle = s.p1.aim;
        this.p2.x = s.p2.x; this.p2.y = s.p2.y; this.p2.hp = s.p2.hp; this.p2.shield = s.p2.shield; this.p2.aimAngle = s.p2.aim;
        this.p2.attackCooldown = s.p2.cdAtk;
        this.p2.skillCooldowns = s.p2.cds;

        this.projectiles = s.projectiles.map(p => {
            const inst = new Projectile('remote', p.x, p.y, 0, 0, p.r, 999, 0, '', p.c);
            return inst;
        });

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
        DOM.p1Info.textContent = `P1 (${this.p1.loadout.name})：HP ${this.p1.hp}/${this.p1.loadout.stats.hpMax} ${this.p1.shield > 0 ? `[護盾: ${this.p1.shield}]` : ''}`;
        DOM.p2Info.textContent = `P2 (${this.p2.loadout.name})：HP ${this.p2.hp}/${this.p2.loadout.stats.hpMax} ${this.p2.shield > 0 ? `[護盾: ${this.p2.shield}]` : ''}`;

        const myPlayer = NetworkManager.isHost ? this.p1 : this.p2;
        DOM.cdAttack.style.height = `${(myPlayer.attackCooldown / myPlayer.loadout.basicAttack.cooldown) * 100}%`;
        for (let i = 0; i < 3; i++) {
            DOM.cdSkills[i].style.height = `${(myPlayer.skillCooldowns[i] / myPlayer.loadout.skills[i].cooldown) * 100}%`;
        }
    },

    render() {
        if (this.state !== GAME_STATE.IN_GAME) return;
        const ctx = DOM.ctx;
        ctx.clearRect(0, 0, ENGINE_CONFIG.CANVAS.WIDTH, ENGINE_CONFIG.CANVAS.HEIGHT);

        // 格線背景
        ctx.strokeStyle = ENGINE_CONFIG.CANVAS.GRID_COLOR;
        ctx.lineWidth = 1;
        for (let x = 0; x < ENGINE_CONFIG.CANVAS.WIDTH; x += ENGINE_CONFIG.CANVAS.GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ENGINE_CONFIG.CANVAS.HEIGHT); ctx.stroke();
        }
        for (let y = 0; y < ENGINE_CONFIG.CANVAS.HEIGHT; y += ENGINE_CONFIG.CANVAS.GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ENGINE_CONFIG.CANVAS.WIDTH, y); ctx.stroke();
        }

        this.groundAoes.forEach(a => a.draw(ctx));
        this.p1.draw(ctx);
        this.p2.draw(ctx);
        this.projectiles.forEach(p => p.draw(ctx));
        this.meleeSweeps.forEach(s => s.draw(ctx));
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
