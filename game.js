/**
 * 核心設定常數 (避免硬編碼)
 */
const CONFIG = {
    CANVAS: {
        WIDTH: 960,
        HEIGHT: 540,
        GRID_SIZE: 40,
        BG_COLOR: '#1a1c23',
        GRID_COLOR: '#232733'
    },
    PLAYER: {
        RADIUS: 18,
        // 原速度 3.375 px/幀 (60 FPS 下為 202.5 px/s)，折半後為 101.25 px/s
        SPEED: 101.25,
        COLOR: '#38bdf8',
        BARREL_COLOR: '#94a3b8',
        BARREL_LENGTH: 10,
        // 普攻發射間隔：每 2 秒 1 發
        ATTACK_COOLDOWN: 2.0
    },
    SPELL: {
        RADIUS: 8,
        // 保持原設定之 3.6 px/幀 (60 FPS 下為 216 px/s)
        SPEED: 216,
        COLOR_INNER: '#ffffff',
        COLOR_MID: '#fb923c',
        COLOR_OUTER: '#ef4444'
    },
    DUMMY: {
        RADIUS: 26,
        MAX_HP: 200,
        COLOR: '#f43f5e',
        DAMAGE_TAKEN: 20
    },
    PARTICLE: {
        COUNT: 15,
        DECAY_MIN: 0.02,
        DECAY_MAX: 0.05,
        SPEED_MIN: 120,
        SPEED_MAX: 480
    },
    EFFECTS: {
        SCREEN_SHAKE_INTENSITY: 6,
        SCREEN_SHAKE_DECAY: 0.85
    }
};

/**
 * 系統初始化
 */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');

let lastTimestamp = 0;
let screenShake = 0;

/**
 * 輸入監聽模組
 */
const InputController = {
    keys: { w: false, a: false, s: false, d: false },
    mouse: { x: 0, y: 0, isDown: false },

    init(targetCanvas) {
        window.addEventListener('keydown', (e) => this.setKey(e.key.toLowerCase(), true));
        window.addEventListener('keyup', (e) => this.setKey(e.key.toLowerCase(), false));
        
        targetCanvas.addEventListener('mousemove', (e) => {
            const rect = targetCanvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        targetCanvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.isDown = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.isDown = false;
        });
    },

    setKey(key, state) {
        if (Object.prototype.hasOwnProperty.call(this.keys, key)) {
            this.keys[key] = state;
        }
    },

    getMovementVector() {
        let dx = 0;
        let dy = 0;
        if (this.keys.w) dy -= 1;
        if (this.keys.s) dy += 1;
        if (this.keys.a) dx -= 1;
        if (this.keys.d) dx += 1;

        if (dx !== 0 && dy !== 0) {
            dx *= 0.70710678;
            dy *= 0.70710678;
        }
        return { x: dx, y: dy };
    }
};

/**
 * 粒子實體類別
 */
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 3 + 2;
        
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (CONFIG.PARTICLE.SPEED_MAX - CONFIG.PARTICLE.SPEED_MIN) + CONFIG.PARTICLE.SPEED_MIN;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        this.life = 1.0;
        this.decay = Math.random() * (CONFIG.PARTICLE.DECAY_MAX - CONFIG.PARTICLE.DECAY_MIN) + CONFIG.PARTICLE.DECAY_MIN;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= Math.pow(0.05, dt);
        this.vy *= Math.pow(0.05, dt);
        this.life -= this.decay * (dt * 60);
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
 * 普攻彈道類別
 */
class Spell {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.radius = CONFIG.SPELL.RADIUS;
        this.speed = CONFIG.SPELL.SPEED;
        this.isAlive = true;

        const angle = Math.atan2(targetY - y, targetX - x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.isAlive = false;
        }
    }

    draw(ctx) {
        ctx.save();
        const gradient = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.radius);
        gradient.addColorStop(0, CONFIG.SPELL.COLOR_INNER);
        gradient.addColorStop(0.4, CONFIG.SPELL.COLOR_MID);
        gradient.addColorStop(1, CONFIG.SPELL.COLOR_OUTER);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 玩家模組
 */
const player = {
    x: 180,
    y: 270,
    radius: CONFIG.PLAYER.RADIUS,
    speed: CONFIG.PLAYER.SPEED,
    color: CONFIG.PLAYER.COLOR,
    cooldownTimer: 0,

    update(dt, input, onShoot) {
        const moveVec = input.getMovementVector();
        this.x += moveVec.x * this.speed * dt;
        this.y += moveVec.y * this.speed * dt;

        // 邊界防禦判定
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));

        // 冷卻計時器遞減
        if (this.cooldownTimer > 0) {
            this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
        }

        // 發射判定
        if (input.mouse.isDown && this.cooldownTimer === 0) {
            onShoot(this.x, this.y, input.mouse.x, input.mouse.y);
            this.cooldownTimer = CONFIG.PLAYER.ATTACK_COOLDOWN;
        }
    },

    draw(ctx, mouse) {
        ctx.save();
        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        
        // 方向標線
        ctx.strokeStyle = CONFIG.PLAYER.BARREL_COLOR;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(
            this.x + Math.cos(angle) * (this.radius + CONFIG.PLAYER.BARREL_LENGTH),
            this.y + Math.sin(angle) * (this.radius + CONFIG.PLAYER.BARREL_LENGTH)
        );
        ctx.stroke();

        // 玩家本體
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
    }
};

/**
 * 靶子模組
 */
const dummy = {
    x: 750,
    y: 270,
    radius: CONFIG.DUMMY.RADIUS,
    maxHp: CONFIG.DUMMY.MAX_HP,
    currentHp: CONFIG.DUMMY.MAX_HP,
    color: CONFIG.DUMMY.COLOR,

    takeDamage(amount) {
        this.currentHp = Math.max(0, this.currentHp - amount);
        const percent = Math.floor((this.currentHp / this.maxHp) * 100);
        statusText.textContent = `假人血量：${percent}%`;
        if (this.currentHp === 0) {
            this.currentHp = this.maxHp;
            statusText.textContent = `假人血量：100% (已重置)`;
        }
    },

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // 血量條渲染
        const barWidth = 50;
        const barHeight = 6;
        const hpRate = this.currentHp / this.maxHp;
        ctx.fillStyle = '#334155';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 14, barWidth, barHeight);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 14, barWidth * hpRate, barHeight);
        ctx.restore();
    }
};

/**
 * 遊戲管理器與實體容器
 */
const spells = [];
const particles = [];

function spawnParticles(x, y) {
    for (let p = 0; p < CONFIG.PARTICLE.COUNT; p++) {
        const color = Math.random() < 0.5 ? '#f97316' : '#facc15';
        particles.push(new Particle(x, y, color));
    }
}

function handleCollisions() {
    for (let i = spells.length - 1; i >= 0; i--) {
        const spell = spells[i];
        const dist = Math.hypot(spell.x - dummy.x, spell.y - dummy.y);

        if (dist < spell.radius + dummy.radius) {
            spell.isAlive = false;
            dummy.takeDamage(CONFIG.DUMMY.DAMAGE_TAKEN);
            screenShake = CONFIG.EFFECTS.SCREEN_SHAKE_INTENSITY;
            spawnParticles(spell.x, spell.y);
        }

        if (!spell.isAlive) {
            spells.splice(i, 1);
        }
    }
}

function renderBackground() {
    ctx.strokeStyle = CONFIG.CANVAS.GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += CONFIG.CANVAS.GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += CONFIG.CANVAS.GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

/**
 * 主循環 (基於 Delta Time 控制)
 */
function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // 限制上限以防止分頁切換引發穿牆
    lastTimestamp = timestamp;

    // 1. 邏輯更新
    player.update(dt, InputController, (x, y, tx, ty) => {
        spells.push(new Spell(x, y, tx, ty));
    });

    spells.forEach(s => s.update(dt));
    handleCollisions();

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    // 2. 畫面繪製
    ctx.save();

    if (screenShake > 0) {
        const offsetX = (Math.random() - 0.5) * screenShake;
        const offsetY = (Math.random() - 0.5) * screenShake;
        ctx.translate(offsetX, offsetY);
        screenShake *= Math.pow(CONFIG.EFFECTS.SCREEN_SHAKE_DECAY, dt * 60);
        if (screenShake < 0.2) screenShake = 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderBackground();

    dummy.draw(ctx);
    player.draw(ctx, InputController.mouse);
    spells.forEach(s => s.draw(ctx));

    // 粒子光暈加色渲染
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach(p => p.draw(ctx));
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

// 系統啟動
InputController.init(canvas);
requestAnimationFrame(gameLoop);
