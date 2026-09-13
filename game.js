import { ATTACK_TYPE, DAMAGE_TYPE } from './definitions.js';
import { buildCombatLoadout } from './builder.js';

/**
 * 引擎常數定義
 */
const ENGINE_CONFIG = {
    CANVAS: {
        WIDTH: 960,
        HEIGHT: 540,
        GRID_SIZE: 40,
        GRID_COLOR: '#232733'
    },
    VFX: {
        SCREEN_SHAKE_DECAY: 0.85,
        PARTICLE_COUNT: 12
    }
};

/**
 * DOM 節點快取
 */
const DOM = {
    canvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    coreName: document.getElementById('core-name'),
    dummyStatus: document.getElementById('dummy-status'),
    btnSwitchCore: document.getElementById('btn-switch-core'),
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
    activeTriggers: { attack: false, skill1: false, skill2: false, skill3: false },

    init(canvasElement) {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;

            if (key === 'q' || key === '1') this.activeTriggers.skill1 = true;
            if (key === 'w' || key === '2') this.activeTriggers.skill2 = true;
            if (key === 'e' || key === '3') this.activeTriggers.skill3 = true;
            if (key === 'tab') {
                e.preventDefault();
                GameManager.toggleLoadout();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        canvasElement.addEventListener('mousemove', (e) => {
            const rect = canvasElement.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        canvasElement.addEventListener('mousedown', (e) => {
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
    }
};

/**
 * 傷害計算管線
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
 * 粒子與視覺特效系統
 */
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 3 + 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 200 + 50;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 2.0 + 1.0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= this.decay * dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 近戰扇形揮擊視覺與判定實體
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
        this.totalLife = 0.15;
    }

    update(dt) {
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.totalLife);
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(
            this.x,
            this.y,
            this.range,
            this.angle - this.arcAngle / 2,
            this.angle + this.arcAngle / 2
        );
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha *= 0.25;
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 地面延遲範圍傷害實體 (Ground AOE)
 */
class GroundAoeVisual {
    constructor(x, y, radius, delay, onExplode) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.delay = delay;
        this.totalDelay = delay;
        this.onExplode = onExplode;
        this.isAlive = true;
    }

    update(dt) {
        this.delay -= dt;
        if (this.delay <= 0) {
            this.isAlive = false;
            this.onExplode(this.x, this.y, this.radius);
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
 * 彈道飛行實體
 */
class Projectile {
    constructor(x, y, angle, speed, radius, maxRange, damage, damageType, color) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = radius;
        this.damage = damage;
        this.damageType = damageType;
        this.color = color;
        this.remainingDistance = maxRange;
        this.isAlive = true;
    }

    update(dt) {
        const step = Math.hypot(this.vx * dt, this.vy * dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.remainingDistance -= step;

        if (this.remainingDistance <= 0 || 
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
 * 測試假人實體
 */
class TargetDummy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 24;
        this.stats = {
            hpMax: 1000,
            physDef: 10,
            magicRes: 10
        };
        this.currentHp = this.stats.hpMax;
    }

    takeDamage(amount, damageType) {
        const actualDamage = DamageCalculator.calculateDamage(amount, damageType, this.stats);
        this.currentHp = Math.max(0, this.currentHp - actualDamage);
        GameManager.triggerShake(4);
        GameManager.spawnParticles(this.x, this.y, damageType === DAMAGE_TYPE.PHYSICAL ? '#f59e0b' : '#38bdf8');

        if (this.currentHp <= 0) {
            this.currentHp = this.stats.hpMax;
        }
        DOM.dummyStatus.textContent = `測試假人：HP ${this.currentHp}/${this.stats.hpMax} (物防 ${this.stats.physDef} / 魔抗 ${this.stats.magicRes}) - 受傷 ${actualDamage}`;
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        const barW = 60;
        const barH = 6;
        const hpRate = this.currentHp / this.stats.hpMax;
        ctx.fillStyle = '#334155';
        ctx.fillRect(this.x - barW / 2, this.y - this.radius - 14, barW, barH);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(this.x - barW / 2, this.y - this.radius - 14, barW * hpRate, barH);
        ctx.restore();
    }
}

/**
 * 玩家戰鬥實體
 */
class CombatPlayer {
    constructor(x, y, loadout) {
        this.x = x;
        this.y = y;
        this.radius = 18;
        this.loadout = loadout;

        this.currentHp = loadout.stats.hpMax;
        this.shield = 0;
        this.damageReduction = 0;

        // 冷卻計時器
        this.attackCooldown = 0;
        this.skillCooldowns = [0, 0, 0];

        // 衝鋒狀態
        this.dashState = null;
    }

    setLoadout(newLoadout) {
        this.loadout = newLoadout;
        this.currentHp = newLoadout.stats.hpMax;
        this.shield = 0;
        this.damageReduction = 0;
        this.attackCooldown = 0;
        this.skillCooldowns = [0, 0, 0];
        this.dashState = null;
    }

    update(dt, input) {
        // 衝鋒中優先處理位移
        if (this.dashState) {
            this.dashState.timeRemaining -= dt;
            this.x += this.dashState.vx * dt;
            this.y += this.dashState.vy * dt;

            // 衝鋒碰撞判定
            const dist = Math.hypot(this.x - GameManager.dummy.x, this.y - GameManager.dummy.y);
            if (dist < this.radius + GameManager.dummy.radius) {
                GameManager.dummy.takeDamage(this.dashState.damage, this.dashState.damageType);
                this.dashState = null;
            } else if (this.dashState.timeRemaining <= 0) {
                this.dashState = null;
            }
        } else {
            const moveVec = input.getMovementVector();
            this.x += moveVec.x * this.loadout.stats.moveSpeed * dt;
            this.y += moveVec.y * this.loadout.stats.moveSpeed * dt;
        }

        // 邊界防禦
        this.x = Math.max(this.radius, Math.min(ENGINE_CONFIG.CANVAS.WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(ENGINE_CONFIG.CANVAS.HEIGHT - this.radius, this.y));

        // 冷卻時間遞減
        if (this.attackCooldown > 0) {
            this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        }
        for (let i = 0; i < this.skillCooldowns.length; i++) {
            if (this.skillCooldowns[i] > 0) {
                this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
            }
        }

        // 指令輸入判定
        if (input.activeTriggers.attack) {
            this.executeBasicAttack(input.mouse);
            input.activeTriggers.attack = false;
        }
        if (input.activeTriggers.skill1) {
            this.executeSkill(0, input.mouse);
            input.activeTriggers.skill1 = false;
        }
        if (input.activeTriggers.skill2) {
            this.executeSkill(1, input.mouse);
            input.activeTriggers.skill2 = false;
        }
        if (input.activeTriggers.skill3) {
            this.executeSkill(2, input.mouse);
            input.activeTriggers.skill3 = false;
        }
    }

    executeBasicAttack(mouse) {
        if (this.attackCooldown > 0) return;
        const atk = this.loadout.basicAttack;
        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

        if (atk.attackType === ATTACK_TYPE.RANGED) {
            GameManager.projectiles.push(
                new Projectile(
                    this.x, this.y, angle, atk.speed, atk.radius,
                    atk.maxRange, atk.damage, atk.damageType, '#38bdf8'
                )
            );
        } else if (atk.attackType === ATTACK_TYPE.MELEE) {
            GameManager.meleeSweeps.push(
                new MeleeSweepVisual(this.x, this.y, angle, atk.maxRange, atk.swingAngle, '#fbbf24')
            );
            this.checkSectorCollision(angle, atk.maxRange, atk.swingAngle, atk.damage, atk.damageType);
        }

        this.attackCooldown = atk.cooldown;
    }

    executeSkill(index, mouse) {
        if (this.skillCooldowns[index] > 0) return;
        const skill = this.loadout.skills[index];
        if (!skill) return;

        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        const distToMouse = Math.hypot(mouse.x - this.x, mouse.y - this.y);

        switch (skill.mechanic) {
            case 'PROJECTILE_STRAIGHT': {
                const count = skill.projectileCount || 1;
                const spread = ((skill.spreadAngle || 0) * Math.PI) / 180;
                const startAngle = angle - spread / 2;
                const angleStep = count > 1 ? spread / (count - 1) : 0;

                for (let i = 0; i < count; i++) {
                    const currentAngle = count === 1 ? angle : startAngle + angleStep * i;
                    GameManager.projectiles.push(
                        new Projectile(
                            this.x, this.y, currentAngle, skill.projectileSpeed,
                            skill.radius, skill.maxRange, skill.baseDamage,
                            skill.damageType, '#818cf8'
                        )
                    );
                }
                break;
            }

            case 'SELF_BUFF': {
                if (skill.shieldValue) {
                    this.shield = skill.shieldValue;
                    setTimeout(() => { this.shield = 0; }, skill.duration * 1000);
                }
                if (skill.damageReduction) {
                    this.damageReduction = skill.damageReduction;
                    setTimeout(() => { this.damageReduction = 0; }, skill.duration * 1000);
                }
                GameManager.spawnParticles(this.x, this.y, '#38bdf8');
                break;
            }

            case 'GROUND_AOE': {
                // 最大施法射程限制
                const clampedDist = Math.min(distToMouse, skill.maxRange);
                const targetX = this.x + Math.cos(angle) * clampedDist;
                const targetY = this.y + Math.sin(angle) * clampedDist;

                GameManager.groundAoes.push(
                    new GroundAoeVisual(targetX, targetY, skill.radius, skill.delay, (ex, ey, r) => {
                        GameManager.triggerShake(8);
                        GameManager.spawnParticles(ex, ey, '#ef4444');
                        const dummyDist = Math.hypot(GameManager.dummy.x - ex, GameManager.dummy.y - ey);
                        if (dummyDist <= r + GameManager.dummy.radius) {
                            GameManager.dummy.takeDamage(skill.baseDamage, skill.damageType);
                        }
                    })
                );
                break;
            }

            case 'MELEE_SWEEP': {
                GameManager.meleeSweeps.push(
                    new MeleeSweepVisual(this.x, this.y, angle, skill.maxRange, skill.arcAngle, '#f97316')
                );
                this.checkSectorCollision(angle, skill.maxRange, skill.arcAngle, skill.baseDamage, skill.damageType);
                break;
            }

            case 'DASH_COLLIDE': {
                const clampedDist = Math.min(distToMouse, skill.maxRange);
                const duration = clampedDist / skill.dashSpeed;
                this.dashState = {
                    vx: Math.cos(angle) * skill.dashSpeed,
                    vy: Math.sin(angle) * skill.dashSpeed,
                    timeRemaining: duration,
                    damage: skill.baseDamage,
                    damageType: skill.damageType
                };
                break;
            }
        }

        this.skillCooldowns[index] = skill.cooldown;
    }

    checkSectorCollision(angle, range, arcAngleDegrees, damage, damageType) {
        const dummy = GameManager.dummy;
        const dx = dummy.x - this.x;
        const dy = dummy.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > range + dummy.radius) return;

        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - angle;

        // 正規化角度差至 [-PI, PI]
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        const halfArc = ((arcAngleDegrees * Math.PI) / 180) / 2;
        if (Math.abs(angleDiff) <= halfArc) {
            dummy.takeDamage(damage, damageType);
        }
    }

    draw(ctx, mouse) {
        ctx.save();
        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

        // 準星指示線
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(angle) * (this.radius + 12), this.y + Math.sin(angle) * (this.radius + 12));
        ctx.stroke();

        // 護盾外環
        if (this.shield > 0) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 角色本體
        ctx.fillStyle = this.loadout.coreId === 'STAR_WEAVER' ? '#38bdf8' : '#e2e8f0';
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
 * 遊戲主管理器 (統整實體生命週期與更新)
 */
const GameManager = {
    player: null,
    dummy: null,
    projectiles: [],
    meleeSweeps: [],
    groundAoes: [],
    particles: [],
    screenShake: 0,
    currentLoadoutIndex: 0,
    testLoadouts: [],

    init() {
        // 建構兩套驗證配置 (星軌編織者 vs 鋼鐵誓約)
        this.testLoadouts = [
            buildCombatLoadout('STAR_WEAVER', ['FLUX_HP_BOOST'], ['RHAP_TRIPLE_BOLT']),
            buildCombatLoadout('IRON_OATH', ['FLUX_SWIFT_FOOT'], ['RHAP_COLOSSAL_CLEAVE'])
        ];

        this.dummy = new TargetDummy(720, 270);
        this.player = new CombatPlayer(200, 270, this.testLoadouts[0]);

        DOM.btnSwitchCore.addEventListener('click', () => this.toggleLoadout());
        this.updateHUD();
    },

    toggleLoadout() {
        this.currentLoadoutIndex = (this.currentLoadoutIndex + 1) % this.testLoadouts.length;
        this.player.setLoadout(this.testLoadouts[this.currentLoadoutIndex]);
        this.updateHUD();
    },

    updateHUD() {
        const loadout = this.player.loadout;
        DOM.coreName.textContent = `當前核心：${loadout.name} [${loadout.basicAttack.attackType}]`;
        for (let i = 0; i < 3; i++) {
            DOM.nameSkills[i].textContent = loadout.skills[i] ? loadout.skills[i].name : '-';
        }
    },

    triggerShake(amount) {
        this.screenShake = amount;
    },

    spawnParticles(x, y, color) {
        for (let i = 0; i < ENGINE_CONFIG.VFX.PARTICLE_COUNT; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    },

    update(dt) {
        this.player.update(dt, Input);

        // 彈道更新與碰撞
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt);

            const dist = Math.hypot(p.x - this.dummy.x, p.y - this.dummy.y);
            if (dist < p.radius + this.dummy.radius) {
                p.isAlive = false;
                this.dummy.takeDamage(p.damage, p.damageType);
            }

            if (!p.isAlive) this.projectiles.splice(i, 1);
        }

        // 近戰視覺更新
        for (let i = this.meleeSweeps.length - 1; i >= 0; i--) {
            this.meleeSweeps[i].update(dt);
            if (this.meleeSweeps[i].life <= 0) this.meleeSweeps.splice(i, 1);
        }

        // 地面 AOE 更新
        for (let i = this.groundAoes.length - 1; i >= 0; i--) {
            this.groundAoes[i].update(dt);
            if (!this.groundAoes[i].isAlive) this.groundAoes.splice(i, 1);
        }

        // 粒子更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }

        // HUD 冷卻條即時更新
        const atk = this.player.loadout.basicAttack;
        DOM.cdAttack.style.height = `${(this.player.attackCooldown / atk.cooldown) * 100}%`;

        for (let i = 0; i < 3; i++) {
            const maxCd = this.player.loadout.skills[i].cooldown;
            const currentCd = this.player.skillCooldowns[i];
            DOM.cdSkills[i].style.height = `${(currentCd / maxCd) * 100}%`;
        }
    },

    render() {
        const ctx = DOM.ctx;
        ctx.save();

        if (this.screenShake > 0) {
            ctx.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
            this.screenShake *= ENGINE_CONFIG.VFX.SCREEN_SHAKE_DECAY;
            if (this.screenShake < 0.2) this.screenShake = 0;
        }

        ctx.clearRect(0, 0, ENGINE_CONFIG.CANVAS.WIDTH, ENGINE_CONFIG.CANVAS.HEIGHT);

        // 繪製背景格線
        ctx.strokeStyle = ENGINE_CONFIG.CANVAS.GRID_COLOR;
        ctx.lineWidth = 1;
        for (let x = 0; x < ENGINE_CONFIG.CANVAS.WIDTH; x += ENGINE_CONFIG.CANVAS.GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ENGINE_CONFIG.CANVAS.HEIGHT); ctx.stroke();
        }
        for (let y = 0; y < ENGINE_CONFIG.CANVAS.HEIGHT; y += ENGINE_CONFIG.CANVAS.GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ENGINE_CONFIG.CANVAS.WIDTH, y); ctx.stroke();
        }

        // 實體渲染
        this.groundAoes.forEach(a => a.draw(ctx));
        this.dummy.draw(ctx);
        this.player.draw(ctx, Input.mouse);
        this.projectiles.forEach(p => p.draw(ctx));
        this.meleeSweeps.forEach(s => s.draw(ctx));

        // 粒子加色模式
        ctx.globalCompositeOperation = 'lighter';
        this.particles.forEach(p => p.draw(ctx));
        ctx.globalCompositeOperation = 'source-over';

        ctx.restore();
    }
};

/**
 * 引擎啟動迴圈
 */
let lastTime = 0;
function engineLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    GameManager.update(dt);
    GameManager.render();

    requestAnimationFrame(engineLoop);
}

Input.init(DOM.canvas);
GameManager.init();
requestAnimationFrame(engineLoop);
