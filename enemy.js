import { DAMAGE_TYPE } from './definitions.js';

export class DungeonEnemy {
    constructor(id, x, y, type = 'MELEE') {
        this.id = id;
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = type === 'MELEE' ? 18 : 15;
        this.maxHp = type === 'MELEE' ? 240 : 130;
        this.hp = this.maxHp;
        this.speed = type === 'MELEE' ? 95 : 65;
        this.color = type === 'MELEE' ? '#e11d48' : '#9333ea';

        this.attackRange = type === 'MELEE' ? 50 : 260;
        this.attackCooldown = 0;
        this.maxCooldown = type === 'MELEE' ? 1.6 : 2.5;
        this.aimAngle = 0;
        this.isAlive = true;

        this.stats = { physDef: 8, magicRes: 8 };
    }

    update(dt, players, map, gameContext) {
        if (!this.isAlive) return;

        // 1. 搜尋距離最近的存活玩家
        let nearestPlayer = null;
        let minDist = Infinity;
        for (const player of players) {
            if (player && player.hp > 0) {
                const d = Math.hypot(player.x - this.x, player.y - this.y);
                if (d < minDist) {
                    minDist = d;
                    nearestPlayer = player;
                }
            }
        }

        // 超過感知半徑 (650px) 進入休眠，不消耗運算
        if (!nearestPlayer || minDist > 650) return;

        this.aimAngle = Math.atan2(nearestPlayer.y - this.y, nearestPlayer.x - this.x);

        // 2. 移動邏輯與射程控制
        if (minDist > this.attackRange * 0.85) {
            this.x += Math.cos(this.aimAngle) * this.speed * dt;
            this.y += Math.sin(this.aimAngle) * this.speed * dt;
            map.resolveCircleCollision(this);
        }

        // 3. 攻擊判定與發動
        if (this.attackCooldown > 0) {
            this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        }

        if (minDist <= this.attackRange && this.attackCooldown <= 0) {
            if (this.type === 'MELEE') {
                nearestPlayer.takeDamage(22, DAMAGE_TYPE.PHYSICAL, gameContext);
                gameContext.vfx.spawnHit(nearestPlayer.x, nearestPlayer.y, '#f43f5e', 14);
            } else if (this.type === 'RANGED') {
                gameContext.spawnEnemyProjectile(
                    this.x, this.y, this.aimAngle, 190, 8, 300, 20, DAMAGE_TYPE.MAGIC, '#a855f7'
                );
            }
            this.attackCooldown = this.maxCooldown;
        }
    }

    takeDamage(amount, damageType, gameContext) {
        this.hp -= amount;
        gameContext.vfx.spawnDamageText(this.x, this.y, amount, damageType);
        gameContext.vfx.spawnHit(this.x, this.y, this.color, 8);

        if (this.hp <= 0) {
            this.isAlive = false;
            gameContext.vfx.spawnHit(this.x, this.y, '#fbbf24', 24);
        }
    }

    draw(ctx) {
        if (!this.isAlive) return;

        ctx.save();
        // 腳底陰影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + this.radius * 0.7, this.radius * 1.1, this.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 怪物本體
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // 血條渲染
        const barW = 36;
        const barH = 5;
        const hpRate = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(this.x - barW / 2, this.y - this.radius - 10, barW, barH);
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(this.x - barW / 2, this.y - this.radius - 10, barW * hpRate, barH);

        ctx.restore();
    }
}
