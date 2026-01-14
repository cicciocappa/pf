// ============================================
// SISTEMA CAMERA
// Camera che segue il giocatore con smooth follow
// ============================================

class Camera {
    constructor(viewportWidth, viewportHeight) {
        // Posizione della camera (angolo top-left del viewport nel mondo)
        this.x = 0;
        this.y = 0;

        // Dimensioni del viewport (canvas)
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;

        // Dimensioni del mondo (mappa)
        this.worldWidth = viewportWidth;
        this.worldHeight = viewportHeight;

        // Target da seguire
        this.target = null;

        // Parametri smooth follow
        this.smoothness = 0.08; // 0 = istantaneo, 1 = nessun movimento

        // Dead zone: area centrale in cui il target può muoversi senza che la camera segua
        // Espressa come percentuale delle dimensioni del viewport
        this.deadZoneX = 0.2; // 20% del viewport
        this.deadZoneY = 0.2;
    }

    // Imposta le dimensioni del mondo (mappa)
    setWorldBounds(width, height) {
        this.worldWidth = width;
        this.worldHeight = height;
    }

    // Imposta il target da seguire
    setTarget(target) {
        this.target = target;
        // Centra immediatamente sul target
        if (target) {
            this.centerOn(target.x, target.y);
        }
    }

    // Centra la camera su un punto (senza smooth)
    centerOn(x, y) {
        this.x = x - this.viewportWidth / 2;
        this.y = y - this.viewportHeight / 2;
        this.clampToBounds();
    }

    // Aggiorna la camera (chiamato ogni frame)
    update(dt) {
        if (!this.target) return;

        // Posizione desiderata: target al centro del viewport
        const targetCameraX = this.target.x - this.viewportWidth / 2;
        const targetCameraY = this.target.y - this.viewportHeight / 2;

        // Calcola la dead zone in pixel
        const deadZonePixelsX = this.viewportWidth * this.deadZoneX / 2;
        const deadZonePixelsY = this.viewportHeight * this.deadZoneY / 2;

        // Centro attuale della camera
        const cameraCenterX = this.x + this.viewportWidth / 2;
        const cameraCenterY = this.y + this.viewportHeight / 2;

        // Distanza del target dal centro della camera
        const deltaX = this.target.x - cameraCenterX;
        const deltaY = this.target.y - cameraCenterY;

        // Nuova posizione target (considerando dead zone)
        let newTargetX = this.x;
        let newTargetY = this.y;

        // Se il target esce dalla dead zone, la camera deve seguirlo
        if (Math.abs(deltaX) > deadZonePixelsX) {
            // Sposta la camera per riportare il target al bordo della dead zone
            const overflow = Math.abs(deltaX) - deadZonePixelsX;
            newTargetX = this.x + Math.sign(deltaX) * overflow;
        }

        if (Math.abs(deltaY) > deadZonePixelsY) {
            const overflow = Math.abs(deltaY) - deadZonePixelsY;
            newTargetY = this.y + Math.sign(deltaY) * overflow;
        }

        // Smooth follow con lerp
        this.x = this.lerp(this.x, newTargetX, this.smoothness);
        this.y = this.lerp(this.y, newTargetY, this.smoothness);

        // Mantieni la camera nei limiti del mondo
        this.clampToBounds();
    }

    // Interpolazione lineare
    lerp(current, target, factor) {
        return current + (target - current) * factor;
    }

    // Limita la camera ai bordi del mondo
    clampToBounds() {
        // Non permettere alla camera di andare oltre i bordi del mondo
        const maxX = this.worldWidth - this.viewportWidth;
        const maxY = this.worldHeight - this.viewportHeight;

        this.x = Math.max(0, Math.min(this.x, maxX));
        this.y = Math.max(0, Math.min(this.y, maxY));

        // Se il mondo è più piccolo del viewport, centra
        if (this.worldWidth <= this.viewportWidth) {
            this.x = (this.worldWidth - this.viewportWidth) / 2;
        }
        if (this.worldHeight <= this.viewportHeight) {
            this.y = (this.worldHeight - this.viewportHeight) / 2;
        }
    }

    // Applica la trasformazione al contesto del canvas
    apply(ctx) {
        ctx.save();
        ctx.translate(-Math.round(this.x), -Math.round(this.y));
    }

    // Ripristina il contesto
    restore(ctx) {
        ctx.restore();
    }

    // Converte coordinate schermo in coordinate mondo
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.x,
            y: screenY + this.y
        };
    }

    // Converte coordinate mondo in coordinate schermo
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.x,
            y: worldY - this.y
        };
    }

    // Verifica se un punto nel mondo è visibile nel viewport
    isVisible(worldX, worldY, margin = 0) {
        return worldX >= this.x - margin &&
               worldX <= this.x + this.viewportWidth + margin &&
               worldY >= this.y - margin &&
               worldY <= this.y + this.viewportHeight + margin;
    }

    // Verifica se un rettangolo nel mondo è visibile (anche parzialmente)
    isRectVisible(worldX, worldY, width, height, margin = 0) {
        return worldX + width >= this.x - margin &&
               worldX <= this.x + this.viewportWidth + margin &&
               worldY + height >= this.y - margin &&
               worldY <= this.y + this.viewportHeight + margin;
    }
}
