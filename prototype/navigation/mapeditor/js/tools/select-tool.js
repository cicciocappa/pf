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
            // Se l'oggetto è già selezionato e usiamo Shift, lo togliamo
            if (isShift && this.editor.selection.has(obj)) {
                this.editor.deselectObject(obj);
            } else {
                // Altrimenti lo selezioniamo (append = true se Shift è premuto)
                this.editor.selectObject(obj, isShift);
            }

            // Se dopo il click l'oggetto è selezionato, iniziamo il drag
            if (this.editor.selection.has(obj)) {
                this.isDragging = true;
                this.dragStartMouse = { x, y };
            }
        } else {
            if (!isShift) this.editor.deselectObject();
            this.isMarquee = true;
            this.marqueeStart = { x, y };
        }
        this.editor.render();
    }

    onMouseMove(x, y, event) {
        if (this.isDragging) {
            const dx = x - this.dragStartMouse.x;
            const dy = y - this.dragStartMouse.y;
            this.dragStartMouse = { x, y }; // Aggiorniamo per il prossimo delta

            // Muoviamo tutti gli oggetti selezionati
            for (const obj of this.editor.selection) {
                if (obj.type === 'building') {
                    obj.position.x += dx;
                    obj.position.y += dy;
                } else if (obj.type === 'wall') {
                    for (const point of obj.points) {
                        point.x += dx;
                        point.y += dy;
                    }
                }
            }

            // IMPORTANTE: Ricalcoliamo le connessioni (Bevel) durante il drag
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
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (this.editor.selection.size > 0) {
                if (this.editor.history) this.editor.history.save();

                this.editor.selection.forEach(obj => {
                    this.editor.mapData.removeObject(obj);
                });
                this.editor.selection.clear();
                this.editor.mapData.updateAllGeometry();
                this.editor.render();
            }
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

    // ... getStatusText() aggiornato per mostrare il numero di oggetti selezionati
    getStatusText() {
        if (this.editor.selection && this.editor.selection.size > 1) {
            return `Selected: ${this.editor.selection.size} objects | Drag to move | DEL to delete`;
        }

        if (this.editor.selectedObject) {
            const obj = this.editor.selectedObject;
            if (obj.type === 'building') {
                return `Selected: Building (${obj.sides} sides) | Double-click to edit | DEL to delete`;
            } else if (obj.type === 'wall') {
                return `Selected: Wall (${obj.points.length} points) | Double-click to edit | DEL to delete`;
            }
        }
        return 'Click to select | Drag to move | Double-click to edit properties';
    }

    getCursor() {
        if (this.isDragging) {
            return 'grabbing';
        }
        return 'default';
    }
}