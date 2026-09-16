export const TILE_TYPE = Object.freeze({
    FLOOR: 0,
    WALL: 1
});

/**
 * 偽隨機數生成器 (PRNG - Mulberry32)
 */
function createPRNG(seed) {
    let s = seed | 0;
    return function() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class DungeonMap {
    constructor(seed = 12345, cols = 50, rows = 50, tileSize = 48) {
        this.seed = seed;
        this.cols = cols;
        this.rows = rows;
        this.tileSize = tileSize;
        this.worldWidth = cols * tileSize;
        this.worldHeight = rows * tileSize;

        this.grid = new Uint8Array(cols * rows);
        this.rooms = [];
        this.playerSpawn = { x: 0, y: 0 };
        this.portal = { x: 0, y: 0, radius: 28, active: false };
        this.enemySpawns = [];

        this.generate(seed);
    }

    getTile(gx, gy) {
        if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return TILE_TYPE.WALL;
        return this.grid[gy * this.cols + gx];
    }

    setTile(gx, gy, type) {
        if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows) {
            this.grid[gy * this.cols + gx] = type;
        }
    }

    generate(seed) {
        this.seed = seed;
        const random = createPRNG(seed);
        this.grid.fill(TILE_TYPE.WALL);
        this.rooms = [];
        this.enemySpawns = [];

        const targetRoomCount = 7;
        const maxAttempts = 50;

        // 1. 生成箱庭矩形房間
        for (let attempt = 0; attempt < maxAttempts && this.rooms.length < targetRoomCount; attempt++) {
            const w = Math.floor(random() * 5 + 6); // 寬 6~10 格
            const h = Math.floor(random() * 5 + 6); // 高 6~10 格
            const x = Math.floor(random() * (this.cols - w - 4)) + 2;
            const y = Math.floor(random() * (this.rows - h - 4)) + 2;

            const newRoom = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };

            // 檢查重疊 (保留至少 2 格牆距)
            const overlap = this.rooms.some(r => 
                x < r.x + r.w + 2 && x + w + 2 > r.x &&
                y < r.y + r.h + 2 && y + h + 2 > r.y
            );

            if (!overlap) {
                this.rooms.push(newRoom);
                // 雕刻房間內部地板
                for (let ry = y; ry < y + h; ry++) {
                    for (let rx = x; rx < x + w; rx++) {
                        this.setTile(rx, ry, TILE_TYPE.FLOOR);
                    }
                }
            }
        }

        // 2. 開鑿走廊連結所有相鄰房間 (L型連通廊道)
        for (let i = 0; i < this.rooms.length - 1; i++) {
            const rA = this.rooms[i];
            const rB = this.rooms[i + 1];

            let curX = rA.cx;
            let curY = rA.cy;

            while (curX !== rB.cx) {
                this.setTile(curX, curY, TILE_TYPE.FLOOR);
                this.setTile(curX, curY + 1, TILE_TYPE.FLOOR); // 2格寬通道
                curX += curX < rB.cx ? 1 : -1;
            }
            while (curY !== rB.cy) {
                this.setTile(curX, curY, TILE_TYPE.FLOOR);
                this.setTile(curX + 1, curY, TILE_TYPE.FLOOR);
                curY += curY < rB.cy ? 1 : -1;
            }
        }

        // 3. 標記出生點、傳送門與怪物點位
        const firstRoom = this.rooms[0];
        this.playerSpawn = {
            x: firstRoom.cx * this.tileSize,
            y: firstRoom.cy * this.tileSize
        };

        const lastRoom = this.rooms[this.rooms.length - 1];
        this.portal = {
            x: lastRoom.cx * this.tileSize,
            y: lastRoom.cy * this.tileSize,
            radius: 28,
            active: false
        };

        for (let i = 1; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const count = Math.floor(random() * 2 + 2); // 每個房間 2~3 隻怪物
            for (let c = 0; c < count; c++) {
                const ex = (room.x + 2 + Math.floor(random() * (room.w - 4))) * this.tileSize;
                const ey = (room.y + 2 + Math.floor(random() * (room.h - 4))) * this.tileSize;
                this.enemySpawns.push({ x: ex, y: ey, type: random() < 0.5 ? 'MELEE' : 'RANGED' });
            }
        }
    }

    /**
     * 圓形實體與牆體的防穿牆分軸滑動修正
     */
    resolveCircleCollision(circle) {
        const minGx = Math.floor((circle.x - circle.radius) / this.tileSize);
        const maxGx = Math.floor((circle.x + circle.radius) / this.tileSize);
        const minGy = Math.floor((circle.y - circle.radius) / this.tileSize);
        const maxGy = Math.floor((circle.y + circle.radius) / this.tileSize);

        for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
                if (this.getTile(gx, gy) === TILE_TYPE.WALL) {
                    const nearestX = Math.max(gx * this.tileSize, Math.min(circle.x, (gx + 1) * this.tileSize));
                    const nearestY = Math.max(gy * this.tileSize, Math.min(circle.y, (gy + 1) * this.tileSize));
                    const distX = circle.x - nearestX;
                    const distY = circle.y - nearestY;
                    const distance = Math.hypot(distX, distY);

                    if (distance < circle.radius) {
                        const overlap = circle.radius - distance;
                        if (distance === 0) {
                            circle.x += overlap;
                        } else {
                            circle.x += (distX / distance) * overlap;
                            circle.y += (distY / distance) * overlap;
                        }
                    }
                }
            }
        }
    }

    /**
     * 檢查彈道與牆體碰撞
     */
    isPointInWall(x, y) {
        const gx = Math.floor(x / this.tileSize);
        const gy = Math.floor(y / this.tileSize);
        return this.getTile(gx, gy) === TILE_TYPE.WALL;
    }

    /**
     * 僅繪製攝影機視線內的磚牆與傳送陣
     */
    render(ctx, camera) {
        const startCol = Math.max(0, Math.floor(camera.x / this.tileSize));
        const endCol = Math.min(this.cols - 1, Math.floor((camera.x + camera.viewportWidth) / this.tileSize) + 1);
        const startRow = Math.max(0, Math.floor(camera.y / this.tileSize));
        const endRow = Math.min(this.rows - 1, Math.floor((camera.y + camera.viewportHeight) / this.tileSize) + 1);

        for (let gy = startRow; gy <= endRow; gy++) {
            for (let gx = startCol; gx <= endCol; gx++) {
                const tile = this.grid[gy * this.cols + gx];
                const px = gx * this.tileSize;
                const py = gy * this.tileSize;

                if (tile === TILE_TYPE.WALL) {
                    ctx.fillStyle = '#1e293b';
                    ctx.fillRect(px, py, this.tileSize, this.tileSize);
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px, py, this.tileSize, this.tileSize);
                } else {
                    ctx.fillStyle = '#0a0d14';
                    ctx.fillRect(px, py, this.tileSize, this.tileSize);
                    ctx.strokeStyle = '#151c28';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, this.tileSize, this.tileSize);
                }
            }
        }

        // 繪製下一層傳送陣
        if (camera.isInView(this.portal.x, this.portal.y, this.portal.radius * 2)) {
            ctx.save();
            ctx.strokeStyle = this.portal.active ? '#38bdf8' : '#475569';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.portal.x, this.portal.y, this.portal.radius, 0, Math.PI * 2);
            ctx.stroke();

            if (this.portal.active) {
                ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
                ctx.fill();
            }
            ctx.restore();
        }
    }
}
