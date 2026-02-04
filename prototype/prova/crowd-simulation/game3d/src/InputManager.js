// ========================================
// Gestione input mouse e tastiera (3D)
// RTS-style selection: rect drag, double-click, shift, ESC
// ========================================

export class InputManager {
    constructor(sceneManager, game) {
        this.sceneManager = sceneManager;
        this.game = game;
        this.canvas = sceneManager.canvas;

        // Stato tastiera
        this.keys = {};

        // Spell mode
        this.activeSpell = null;

        // Drag selection state
        this._dragStart = null;      // {sx, sy} screen coords
        this._isDragging = false;
        this._dragThreshold = 5;     // pixel minimi per considerare un drag

        // Double-click detection
        this._lastClickTime = 0;
        this._lastClickPos = null;
        this._doubleClickThreshold = 300; // ms

        // Selection rect DOM element
        this._selRect = document.getElementById('selection-rect');

        this._setupMouse();
        this._setupKeyboard();
    }

    _setupMouse() {
        const c = this.canvas;

        c.addEventListener('contextmenu', e => e.preventDefault());

        c.addEventListener('mousedown', e => {
            if (e.button === 2) {
                // Right click: muovi
                const worldPos = this.sceneManager.getWorldPosFromMouse(e);
                if (worldPos) {
                    this.game.onRightClick(worldPos);
                }
            } else if (e.button === 0) {
                if (this.activeSpell) {
                    // Cast spell
                    const worldPos = this.sceneManager.getWorldPosFromMouse(e);
                    if (worldPos) {
                        this.game.onCastSpell(this.activeSpell, worldPos);
                    }
                    this.activeSpell = null;
                    c.style.cursor = 'default';
                } else {
                    // Inizia potenziale drag selection
                    this._dragStart = { sx: e.clientX, sy: e.clientY };
                    this._isDragging = false;
                }
            }
        });

        c.addEventListener('mousemove', e => {
            if (!this._dragStart) return;

            const dx = e.clientX - this._dragStart.sx;
            const dy = e.clientY - this._dragStart.sy;
            if (Math.abs(dx) > this._dragThreshold || Math.abs(dy) > this._dragThreshold) {
                this._isDragging = true;
                this._updateSelectionRect(this._dragStart.sx, this._dragStart.sy, e.clientX, e.clientY);
            }
        });

        c.addEventListener('mouseup', e => {
            if (e.button !== 0) return;

            if (this._isDragging && this._dragStart) {
                // Fine drag selection: seleziona creature nel rettangolo
                this._finishDragSelection(e);
            } else if (this._dragStart) {
                // Click singolo (no drag)
                this._handleClick(e);
            }

            this._dragStart = null;
            this._isDragging = false;
            this._hideSelectionRect();
        });

        c.addEventListener('wheel', e => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.1 : 0.9;
            this.sceneManager.zoomCamera(factor);
        }, { passive: false });
    }

    _handleClick(e) {
        const now = performance.now();
        const shift = e.shiftKey;

        // Check double-click
        if (this._lastClickPos &&
            now - this._lastClickTime < this._doubleClickThreshold &&
            Math.abs(e.clientX - this._lastClickPos.x) < 10 &&
            Math.abs(e.clientY - this._lastClickPos.y) < 10) {
            // Double-click: seleziona tutte le creature dello stesso tipo
            this._handleDoubleClick(e);
            this._lastClickTime = 0;
            return;
        }

        this._lastClickTime = now;
        this._lastClickPos = { x: e.clientX, y: e.clientY };

        const worldPos = this.sceneManager.getWorldPosFromMouse(e);
        if (!worldPos) return;

        // Cerca torre nemica per attacco
        const enemyTarget = this.game._findEntityAt(worldPos.x, worldPos.z, 'enemy');
        if (enemyTarget) {
            this.game._orderAttack(enemyTarget);
            return;
        }

        // Cerca creatura alleata per selezione
        const creature = this._findSelectableAt(worldPos.x, worldPos.z);
        if (creature) {
            if (shift) {
                // Shift+click: toggle nella selezione
                if (creature.selected) {
                    this.game.selectedCreatures.delete(creature);
                    creature.setSelected(false);
                } else {
                    this.game.selectCreature(creature, true);
                }
            } else {
                this.game.selectCreature(creature);
            }
        } else if (!shift) {
            // Click nel vuoto senza shift: deseleziona
            this.game.deselectAll();
        }
    }

    _handleDoubleClick(e) {
        const worldPos = this.sceneManager.getWorldPosFromMouse(e);
        if (!worldPos) return;

        const unit = this._findSelectableAt(worldPos.x, worldPos.z);
        if (unit && unit.creatureType) {
            this.game.selectAllOfType(unit.creatureType);
        } else if (unit) {
            // Mago: seleziona solo lui
            this.game.selectCreature(unit);
        }
    }

    _findSelectableAt(wx, wz) {
        let closest = null;
        let closestDist = 1.0;

        // Include mago e creature
        const units = [...this.game.creatures];
        if (this.game.wizard && this.game.wizard.alive) {
            units.push(this.game.wizard);
        }

        for (const c of units) {
            if (!c.alive) continue;
            const dx = c.x - wx;
            const dz = c.z - wz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < closestDist) {
                closestDist = d;
                closest = c;
            }
        }
        return closest;
    }

    _finishDragSelection(e) {
        const shift = e.shiftKey;

        // Rettangolo in coordinate schermo (pixel)
        const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        const sx1 = this._dragStart.sx - rect.left;
        const sy1 = this._dragStart.sy - rect.top;
        const sx2 = e.clientX - rect.left;
        const sy2 = e.clientY - rect.top;

        const minSx = Math.min(sx1, sx2);
        const maxSx = Math.max(sx1, sx2);
        const minSy = Math.min(sy1, sy2);
        const maxSy = Math.max(sy1, sy2);

        // Proietta ogni unità sullo schermo e verifica se cade nel rettangolo
        const units = [...this.game.creatures];
        if (this.game.wizard && this.game.wizard.alive) {
            units.push(this.game.wizard);
        }
        const selected = [];
        for (const c of units) {
            if (!c.alive) continue;
            const screen = this.sceneManager.worldToScreen(c.x, 0, c.z);
            if (!screen) continue;
            if (screen.x >= minSx && screen.x <= maxSx &&
                screen.y >= minSy && screen.y <= maxSy) {
                selected.push(c);
            }
        }

        if (selected.length > 0) {
            this.game.selectCreatures(selected, shift);
        } else if (!shift) {
            this.game.deselectAll();
        }
    }

    _updateSelectionRect(x1, y1, x2, y2) {
        if (!this._selRect) return;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        this._selRect.style.display = 'block';
        this._selRect.style.left = left + 'px';
        this._selRect.style.top = top + 'px';
        this._selRect.style.width = width + 'px';
        this._selRect.style.height = height + 'px';
    }

    _hideSelectionRect() {
        if (this._selRect) {
            this._selRect.style.display = 'none';
        }
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

            // ESC: deseleziona tutto + annulla spell
            if (e.key === 'Escape') {
                this.game.deselectAll();
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
        const panSpeed = 15;
        if (this.keys['w'] || this.keys['W'] || this.keys['ArrowUp'])    this.sceneManager.panCamera(0, -panSpeed * dt);
        if (this.keys['s'] || this.keys['S'] || this.keys['ArrowDown'])  this.sceneManager.panCamera(0, panSpeed * dt);
        if (this.keys['a'] || this.keys['A'] || this.keys['ArrowLeft'])  this.sceneManager.panCamera(-panSpeed * dt, 0);
        if (this.keys['d'] || this.keys['D'] || this.keys['ArrowRight']) this.sceneManager.panCamera(panSpeed * dt, 0);
    }
}
