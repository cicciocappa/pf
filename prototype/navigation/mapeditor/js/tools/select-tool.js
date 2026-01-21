import { Tool } from './tool.js';

export class SelectTool extends Tool {
   constructor(editor) {
        super(editor);
        this.name = 'select';
        this.isDragging = false;
        this.isMarquee = false;
        this.dragStartMouse = { x: 0, y: 0 };
        this.marqueeStart = { x: 0, y: 0 };
        this.marqueeEnd = { x: 0, y: 0 };
    }

    onMouseDown(x, y, event) {
        if (event.button !== 0) return;

        const obj = this.editor.mapData.findObjectAt(x, y);
        const isShift = event.shiftKey;

        if (obj) {
            // --- CASO A: CLICK SU OGGETTO ---
            this.isMarquee = false;

            // Se l'oggetto non è ancora selezionato
            if (!this.editor.selection.has(obj)) {
                if (!isShift) this.editor.selection.clear();
                this.editor.selection.add(obj);
            } else {
                // Se è già selezionato e premo Shift, lo deseleziono (toggle)
                if (isShift) {
                    this.editor.selection.delete(obj);
                    this.editor.render();
                    return; // Non iniziamo il drag se abbiamo appena rimosso l'oggetto
                }
            }

            this.isDragging = true;
            this.dragStartMouse = { x, y };
        } else {
            // --- CASO B: CLICK NEL VUOTO ---
            this.isDragging = false;
            this.isMarquee = true;
            this.marqueeStart = { x, y };
            this.marqueeEnd = { x, y };

            // Se non premo Shift, deseleziono tutto iniziando un nuovo rettangolo
            if (!isShift) this.editor.selection.clear();
        }

        this.editor.render();
    }

    onMouseMove(x, y, event) {
        if (this.isDragging) {
            const dx = x - this.dragStartMouse.x;
            const dy = y - this.dragStartMouse.y;
            this.dragStartMouse = { x, y };

            // Sposta tutto il gruppo selezionato
            for (const obj of this.editor.selection) {
                if (obj.type === 'building' || obj.type === 'obstacle') {
                    obj.position.x += dx;
                    obj.position.y += dy;
                } else if (obj.type === 'wall') {
                    for (const p of obj.points) {
                        p.x += dx;
                        p.y += dy;
                    }
                }
            }
            this.editor.mapData.updateAllGeometry();
        } 
        else if (this.isMarquee) {
            this.marqueeEnd = { x, y };
        }

        this.editor.render();
    }

    onMouseUp(x, y, event) {
        if (this.isMarquee) {
            this._performMarqueeSelection();
            this.isMarquee = false;
        }

        if (this.isDragging && this.editor.history) {
            this.editor.history.save();
        }

        this.isDragging = false;
        this.editor.render();
    }

    onWheel(x, y, deltaY, event) {
        if (this.editor.selection.size === 0) return;

        // Shift + Wheel per ruotare il gruppo
        if (event.shiftKey) {
            if (this.editor.history) this.editor.history.save();

            const angle = (deltaY > 0 ? -15 : 15) * Math.PI / 180;
            const center = this._getSelectionCenter();

            for (const obj of this.editor.selection) {
                this._rotateObject(obj, center, angle);
            }

            this.editor.mapData.updateAllGeometry();
            this.editor.render();
            event.preventDefault();
        }
    }
    onDoubleClick(x, y, event) {
        const obj = this.editor.mapData.findObjectAt(x, y);
        if (obj) {
            // Ensure one object is selected for properties
            this.editor.selection.clear();
            this.editor.selection.add(obj);
            this.editor.selectedObject = obj;

            this.editor.showPropertiesDialog(obj);
        }
    }

    _performMarqueeSelection() {
        const xMin = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
        const xMax = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
        const yMin = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
        const yMax = Math.max(this.marqueeStart.y, this.marqueeEnd.y);

        const found = this.editor.mapData.findObjectsInRect(xMin, yMin, xMax, yMax);
        found.forEach(obj => this.editor.selection.add(obj));
    }

    drawPreview(ctx) {
        if (this.isMarquee) {
            ctx.strokeStyle = '#0078d7';
            ctx.fillStyle = 'rgba(0, 120, 215, 0.2)';
            const w = this.marqueeEnd.x - this.marqueeStart.x;
            const h = this.marqueeEnd.y - this.marqueeStart.y;
            ctx.fillRect(this.marqueeStart.x, this.marqueeStart.y, w, h);
            ctx.strokeRect(this.marqueeStart.x, this.marqueeStart.y, w, h);
        }
    }

    onKeyDown(event) {
        const key = event.key.toLowerCase();

        // 1. CANCELLAZIONE (Delete/Backspace)
        if (key === 'delete' || key === 'backspace') {
            if (this.editor.selection.size > 0) {
                if (this.editor.history) this.editor.history.save();

                this.editor.selection.forEach(obj => {
                    this.editor.mapData.removeObject(obj);
                });
                this.editor.selection.clear();
                this.editor.mapData.updateAllGeometry();
                this.editor.render();
            }
            event.preventDefault();
        }

        // 2. SCOLLEGAMENTO (U - Unlink)
        if (key === 'u') {
            if (this.editor.selection.size > 1) {
                this.unlinkSelectedObjects();
            }
            event.preventDefault();
        }
    }

    // Aggiungi questo metodo al SelectTool
    onWheel(x, y, deltaY, event) {
        if (this.editor.selection.size === 0) return;

        // Usiamo Shift + Wheel per la rotazione di gruppo
        if (event.shiftKey) {
            const angle = (deltaY > 0 ? -15 : 15) * Math.PI / 180;
            const center = this._getSelectionCenter();

            if (this.editor.history) this.editor.history.save();

            for (const obj of this.editor.selection) {
                this._rotateObject(obj, center, angle);
            }

            this.editor.mapData.updateAllGeometry();
            this.editor.render();
            event.preventDefault();
        }
    }
    /**
       * Calcola il centro geometrico di tutti gli oggetti selezionati
       */
    _getSelectionCenter() {
        let sumX = 0, sumY = 0, count = 0;

        for (const obj of this.editor.selection) {
            if (obj.type === 'building') {
                sumX += obj.position.x;
                sumY += obj.position.y;
                count++;
            } else if (obj.type === 'wall') {
                for (const p of obj.points) {
                    sumX += p.x;
                    sumY += p.y;
                    count++;
                }
            }
        }

        return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
    }

    /**
     * Ruota un singolo oggetto attorno a un punto arbitrario
     */
    _rotateObject(obj, center, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotatePoint = (p) => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            return {
                x: center.x + (dx * cos - dy * sin),
                y: center.y + (dx * sin + dy * cos)
            };
        };

        if (obj.type === 'building') {
            // 1. Ruota la posizione dell'edificio attorno al centro comune
            const newPos = rotatePoint(obj.position);
            obj.position.x = newPos.x;
            obj.position.y = newPos.y;

            // 2. Ruota l'edificio su se stesso
            obj.rotation += angle;
        }
        else if (obj.type === 'wall') {
            // Ruota ogni punto del muro attorno al centro comune
            for (const p of obj.points) {
                const newP = rotatePoint(p);
                p.x = newP.x;
                p.y = newP.y;
            }
        }
    }
    /**
 * Rimuove le connessioni tra gli oggetti attualmente selezionati (SelectTool)
 */
    unlinkSelectedObjects() {
        const selection = this.editor.selection;
        if (selection.size < 2) return;

        // Creiamo un set di ID selezionati
        const selectedIds = new Set(Array.from(selection).map(obj => obj.id));

        // Verifichiamo se esistono connessioni tra questi oggetti prima di salvare l'history
        const hasConnectionsToRemove = this.editor.mapData.connections.some(conn => {
            const sourceInSelection = selectedIds.has(conn.wallId);
            const targetInSelection = selectedIds.has(conn.targetId) || selectedIds.has(conn.targetWallId);
            return sourceInSelection && targetInSelection;
        });

        if (hasConnectionsToRemove) {
            // SALVATAGGIO HISTORY: Ora l'operazione è reversibile
            if (this.editor.history) {
                this.editor.history.save();
            }

            const initialCount = this.editor.mapData.connections.length;

            this.editor.mapData.connections = this.editor.mapData.connections.filter(conn => {
                const sourceSelected = selectedIds.has(conn.wallId);
                const targetSelected = selectedIds.has(conn.targetId) || selectedIds.has(conn.targetWallId);
                // Se entrambi i capi sono nella selezione, rimuoviamo (false)
                return !(sourceSelected && targetSelected);
            });

            // Reset geometrico per riflettere lo stato "scollegato" (caps piatti e no bevel)
            this.editor.mapData.updateAllGeometry();
            this.editor.render();

            console.log(`Unlinked ${initialCount - this.editor.mapData.connections.length} connections.`);
        }
    }


    // ... getStatusText() aggiornato per mostrare il numero di oggetti selezionati
    getStatusText() {
        const count = this.editor.selection.size;
        if (count > 0) {
            let text = `Selected: ${count} objects | DEL to delete`;
            if (count > 1) {
                text += ` | U to unlink connections between them`;
            }
            return text;
        }
        return 'Click to select | Shift+Click for multiple | Drag to move | Double-click for properties';
    }

    getCursor() {
        if (this.isDragging) {
            return 'grabbing';
        }
        return 'default';
    }
}