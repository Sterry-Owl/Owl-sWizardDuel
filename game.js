const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');

// 遊戲狀態與畫面震動變數
let screenShake = 0;

// 輸入控制器
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: 0, y: 0, isDown: false, canShoot: true };

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.isDown = true;
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.isDown = false;
});

// 粒子特效類別
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 3 + 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.life -= this.decay;
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

// 彈道技能類別
class Spell {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        this.speed = 12;
        this.isAlive = true;

        const angle = Math.atan2(targetY - y, targetX - x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // 邊界檢查
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.isAlive = false;
        }
    }

    draw(ctx) {
        ctx.save();
        const gradient = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.radius);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.4, '#fb923c');
        gradient.addColorStop(1, '#ef4444');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// 玩家實體
const player = {
    x: 180,
    y: 270,
    radius: 18,
    speed: 4.5,
    color: '#38bdf8',
    shootCooldown: 0,
    maxCooldown: 12, // 幀數間隔 (約 0.2 秒一發)

    update() {
        // 八方向等速正規化移動
        let dx = 0;
        let dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;

        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x + dx * this.speed));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y + dy * this.speed));

        // 射擊冷卻計算
        if (this.shootCooldown > 0) this.shootCooldown--;
        if (mouse.isDown && this.shootCooldown === 0) {
            spells.push(new Spell(this.x, this.y, mouse.x, mouse.y));
            this.shootCooldown = this.maxCooldown;
        }
    },

    draw(ctx) {
        ctx.save();
        // 繪製朝向槍管/法杖方向指示
        const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(angle) * (this.radius + 10), this.y + Math.sin(angle) * (this.radius + 10));
        ctx.stroke();

        // 繪製本體
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

// 靶子（用於驗證打擊感）
const dummy = {
    x: 750,
    y: 270,
    radius: 26,
    maxHp: 200,
    currentHp: 200,
    color: '#f43f5e',

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

        // 血量條繪製
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

// 物件容器
let spells = [];
let particles = [];

// 主遊戲迴圈 (60 FPS)
function gameLoop() {
    // 1. 邏輯更新
    player.update();

    for (let i = spells.length - 1; i >= 0; i--) {
        const spell = spells[i];
        spell.update();

        // 假人碰撞判定 (兩圓距離檢測)
        const dist = Math.hypot(spell.x - dummy.x, spell.y - dummy.y);
        if (dist < spell.radius + dummy.radius) {
            spell.isAlive = false;
            dummy.takeDamage(20);
            screenShake = 6; // 觸發畫面微震

            // 產生 15 個散開的燃燒粒子
            for (let p = 0; p < 15; p++) {
                particles.push(new Particle(spell.x, spell.y, Math.random() < 0.5 ? '#f97316' : '#facc15'));
            }
        }

        if (!spell.isAlive) {
            spells.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }

    // 2. 畫面渲染
    ctx.save();
    
    // 畫面震動位移
    if (screenShake > 0) {
        const offsetX = (Math.random() - 0.5) * screenShake;
        const offsetY = (Math.random() - 0.5) * screenShake;
        ctx.translate(offsetX, offsetY);
        screenShake *= 0.85;
        if (screenShake < 0.5) screenShake = 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 繪製背景網格
    ctx.strokeStyle = '#232733';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // 實體繪製
    dummy.draw(ctx);
    player.draw(ctx);
    spells.forEach(s => s.draw(ctx));

    // 特效使用加色模式提升發光感
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach(p => p.draw(ctx));
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

// 啟動主迴圈
requestAnimationFrame(gameLoop);
