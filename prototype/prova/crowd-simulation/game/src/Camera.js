// ========================================
// Camera 2D con pan e zoom
// ========================================

export class Camera {
    constructor() {
        this.x = 0;            // centro camera in world units
        this.y = 0;
        this.zoom = 32;        // pixels per world unit
        this.minZoom = 8;
        this.maxZoom = 128;
    }

    /** Applica la trasformazione camera a un PIXI.Container */
    apply(container, screenWidth, screenHeight) {
        container.scale.set(this.zoom, this.zoom);
        container.position.set(
            screenWidth / 2 - this.x * this.zoom,
            screenHeight / 2 - this.y * this.zoom
        );
    }

    /** Converte coordinate schermo -> mondo */
    screenToWorld(sx, sy, screenWidth, screenHeight) {
        return {
            x: (sx - screenWidth / 2) / this.zoom + this.x,
            y: (sy - screenHeight / 2) / this.zoom + this.y,
        };
    }

    /** Converte coordinate mondo -> schermo */
    worldToScreen(wx, wy, screenWidth, screenHeight) {
        return {
            x: (wx - this.x) * this.zoom + screenWidth / 2,
            y: (wy - this.y) * this.zoom + screenHeight / 2,
        };
    }

    /** Pan relativo in pixel schermo */
    pan(dxPixels, dyPixels) {
        this.x -= dxPixels / this.zoom;
        this.y -= dyPixels / this.zoom;
    }

    /** Zoom centrato su un punto schermo */
    zoomAt(factor, sx, sy, screenWidth, screenHeight) {
        const worldBefore = this.screenToWorld(sx, sy, screenWidth, screenHeight);
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
        const worldAfter = this.screenToWorld(sx, sy, screenWidth, screenHeight);
        this.x += worldBefore.x - worldAfter.x;
        this.y += worldBefore.y - worldAfter.y;
    }

    /** Centra la camera su una posizione mondo */
    centerOn(wx, wy) {
        this.x = wx;
        this.y = wy;
    }
}
