// ========================================
// Gestione input mouse e tastiera
// ========================================

export class InputManager {
    constructor(canvas, camera, game) {
        this.canvas = canvas;
        this.camera = camera;
        this.game = game;

        // Stato mouse
        this.isPanning = false;
        this.lastMouse = { x: 0, y: 0 };

        // Stato tastiera
        this.keys = {};

        // Spell mode: se attivo, il prossimo click lancia lo spell
        this.activeSpell = null;

        this._setupMouse();
        this._setupKeyboard();
    }

    _screenSize() {
        return { w: this.canvas.width, h: this.canvas.height };
    }

    _mouseWorld(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const s = this._screenSize();
        return this.camera.screenToWorld(sx, sy, s.w, s.h);
    }

    _setupMouse() {
        const c = this.canvas;

        c.addEventListener('contextmenu', e => e.preventDefault());

        c.addEventListener('mousedown', e => {
            const world = this._mouseWorld(e);

            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                // Middle click o Alt+click: pan
                this.isPanning = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                c.style.cursor = 'grabbing';
            } else if (e.button === 2) {
                // Right click: muovi mago / creature selezionate verso posizione
                this.game.onRightClick(world);
            } else if (e.button === 0) {
                // Left click
                if (this.activeSpell) {
                    this.game.onCastSpell(this.activeSpell, world);
                    this.activeSpell = null;
                    c.style.cursor = 'default';
                } else {
                    this.game.onLeftClick(world);
                }
            }
        });

        c.addEventListener('mousemove', e => {
            if (this.isPanning) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.camera.pan(dx, dy);
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });

        c.addEventListener('mouseup', e => {
            if (this.isPanning) {
                this.isPanning = false;
                c.style.cursor = 'default';
            }
        });

        c.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const s = this._screenSize();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this.camera.zoomAt(factor, sx, sy, s.w, s.h);
        }, { passive: false });
    }

    _setupKeyboard() {
        window.addEventListener('keydown', e => {
            this.keys[e.key] = true;

            // Spell hotkeys
            if (e.key === '1') {
                this.activeSpell = 'FIREBALL';
                this.canvas.style.cursor = 'crosshair';
            }

            // Evoca creature
            if (e.key === 'g' || e.key === 'G') {
                this.game.onSummonCreature('GIANT');
            }
            if (e.key === 'l' || e.key === 'L') {
                this.game.onSummonCreature('LARVA');
            }
            if (e.key === 'e' || e.key === 'E') {
                this.game.onSummonCreature('ELEMENTAL');
            }

            // Annulla spell
            if (e.key === 'Escape') {
                this.activeSpell = null;
                this.canvas.style.cursor = 'default';
            }
        });

        window.addEventListener('keyup', e => {
            this.keys[e.key] = false;
        });
    }

    /** Chiamato ogni frame per camera pan da WASD */
    update(dt) {
        const panSpeed = 400; // pixel/sec
        if (this.keys['w'] || this.keys['W'] || this.keys['ArrowUp'])    this.camera.pan(0, panSpeed * dt);
        if (this.keys['s'] || this.keys['S'] || this.keys['ArrowDown'])  this.camera.pan(0, -panSpeed * dt);
        if (this.keys['a'] || this.keys['A'] || this.keys['ArrowLeft'])  this.camera.pan(panSpeed * dt, 0);
        if (this.keys['d'] || this.keys['D'] || this.keys['ArrowRight']) this.camera.pan(-panSpeed * dt, 0);
    }
}
