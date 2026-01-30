// ========================================
// Proiettili (frecce, palle di fuoco, ecc.)
// ========================================

let nextProjId = 1;

export class Projectile {
    constructor(x, y, target, speed, damage, color, aoeRadius = 0) {
        this.id = nextProjId++;
        this.x = x;
        this.y = y;
        this.target = target;    // Entity bersaglio
        this.speed = speed;
        this.damage = damage;
        this.color = color;
        this.aoeRadius = aoeRadius;
        this.radius = 0.08;
        this.alive = true;

        // PIXI
        this.graphics = null;
    }

    createVisual() {
        this.graphics = new PIXI.Graphics();
        this._draw();
        this._syncPosition();
        return this.graphics;
    }

    _draw() {
        const g = this.graphics;
        g.clear();
        g.beginFill(this.color);
        g.drawCircle(0, 0, this.radius);
        g.endFill();

        // Alone per palle di fuoco
        if (this.aoeRadius > 0) {
            g.beginFill(this.color, 0.3);
            g.drawCircle(0, 0, this.radius * 2);
            g.endFill();
        }
    }

    _syncPosition() {
        if (this.graphics) {
            this.graphics.position.set(this.x, this.y);
            this.graphics.visible = this.alive;
        }
    }

    /**
     * Aggiorna posizione. Restituisce true se ha raggiunto il bersaglio.
     */
    update(dt) {
        if (!this.alive) return false;

        // Se il bersaglio è morto, il proiettile va verso l'ultima posizione nota
        const tx = this.target.alive ? this.target.x : this.target.x;
        const ty = this.target.alive ? this.target.y : this.target.y;

        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this.speed * dt + 0.1) {
            // Colpito!
            this.x = tx;
            this.y = ty;
            this.alive = false;
            this._syncPosition();
            return true;
        }

        // Muovi verso il bersaglio
        const nx = dx / dist;
        const ny = dy / dist;
        this.x += nx * this.speed * dt;
        this.y += ny * this.speed * dt;
        this._syncPosition();
        return false;
    }
}
