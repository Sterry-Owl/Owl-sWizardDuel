/**
 * 2D 攝影機視口模組
 */
export class Camera2D {
    constructor(viewportWidth, viewportHeight) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
        this.x = 0;
        this.y = 0;
        this.worldBounds = { minX: 0, minY: 0, maxX: 2400, maxY: 2400 };
    }

    setWorldBounds(maxX, maxY) {
        this.worldBounds.maxX = maxX;
        this.worldBounds.maxY = maxY;
    }

    /**
     * 平滑追隨目標世界座標 (指數插值)
     */
    follow(targetX, targetY, dt) {
        const desiredX = targetX - this.viewportWidth / 2;
        const desiredY = targetY - this.viewportHeight / 2;

        const factor = 1 - Math.exp(-12 * dt);
        this.x += (desiredX - this.x) * factor;
        this.y += (desiredY - this.y) * factor;

        // 限制在世界地圖邊界內
        this.x = Math.max(0, Math.min(this.worldBounds.maxX - this.viewportWidth, this.x));
        this.y = Math.max(0, Math.min(this.worldBounds.maxY - this.viewportHeight, this.y));
    }

    /**
     * 套用攝影機位移矩陣至畫布
     */
    apply(ctx) {
        ctx.save();
        ctx.translate(-Math.round(this.x), -Math.round(this.y));
    }

    /**
     * 還原畫布位移矩陣
     */
    restore(ctx) {
        ctx.restore();
    }

    /**
     * 螢幕座標轉世界座標 (用於滑鼠瞄準)
     */
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.x,
            y: screenY + this.y
        };
    }

    /**
     * 視錐剔除：檢查實體是否在視野內
     */
    isInView(worldX, worldY, radius = 0) {
        return (
            worldX + radius >= this.x &&
            worldX - radius <= this.x + this.viewportWidth &&
            worldY + radius >= this.y &&
            worldY - radius <= this.y + this.viewportHeight
        );
    }
}
