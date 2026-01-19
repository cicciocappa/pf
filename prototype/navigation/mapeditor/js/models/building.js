export class Building {
    constructor(options = {}) {
        this.id = options.id;
        this.position = options.position || { x: 0, y: 0 };
        this.rotation = options.rotation || 0;
        this.scaleX = options.scaleX || 50;
        this.scaleY = options.scaleY || 50;
        this.sides = options.sides || 4;

        // Inizializza offsets se presenti, altrimenti array vuoto
        this.offsets = options.offsets || Array.from({ length: this.sides }, () => ({ x: 0, y: 0 }));

        // Vertici come cache interna
        this.vertices = Array.from({ length: this.sides }, () => ({ x: 0, y: 0 }));

        this.type = 'building';
        this.updateVertices(); // Primo calcolo
    }

    // Nella classe Building
    getVertices() {
        return this.vertices;
    }

    updateVertices() {
        this._adjustArrays();
        const angleStep = (2 * Math.PI) / this.sides;

        // Se i lati sono 4, aggiungiamo PI/4 (45°) per avere un quadrato dritto e non un rombo
        // In generale, per avere la base piatta, l'angolo di partenza dovrebbe essere 
        // regolato in base al numero di lati.
        const baseOffset = (this.sides === 4) ? Math.PI / 4 : 0;
        const startAngle = -Math.PI / 2 + baseOffset;

        const cosR = Math.cos(this.rotation);
        const sinR = Math.sin(this.rotation);

        for (let i = 0; i < this.sides; i++) {
            const localAngle = startAngle + i * angleStep;

            // 1. Calcolo vertice sul cerchio unitario (Local Space)
            let vx = Math.cos(localAngle);
            let vy = Math.sin(localAngle);

            // 2. SCALA LOCALE: Applichiamo la scala prima della rotazione
            vx *= this.scaleX;
            vy *= this.scaleY;

            // 3. ROTAZIONE: Ruotiamo il punto già scalato attorno all'origine (0,0)
            // Formula: x' = x*cos - y*sin, y' = x*sin + y*cos
            const rotX = vx * cosR - vy * sinR;
            const rotY = vx * sinR + vy * cosR;

            // 4. TRASLAZIONE + OFFSETS: Portiamo il punto nel World Space
            this.vertices[i].x = this.position.x + rotX + (this.offsets[i]?.x || 0);
            this.vertices[i].y = this.position.y + rotY + (this.offsets[i]?.y || 0);
        }
    }

    _adjustArrays() {
        const currentLength = this.offsets.length;
        const targetLength = this.sides;

        if (currentLength < targetLength) {
            // --- AGGIUNTA DI LATI ---
            for (let i = currentLength; i < targetLength; i++) {
                // Aggiungiamo nuovi offset (inizialmente a zero)
                this.offsets.push({ x: 0, y: 0 });
                // Aggiungiamo nuovi vertici (verranno popolati da updateVertices)
                this.vertices.push({ x: 0, y: 0 });
            }
        } else if (currentLength > targetLength) {
            // --- RIMOZIONE DI LATI ---
            // Accorciamo gli array. Usare .splice() o .length è indifferente,
            // ma .length è leggermente più veloce in JS.
            this.offsets.length = targetLength;
            this.vertices.length = targetLength;
        }
    }

    toJSON() {
        return {
            id: this.id,
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            sides: this.sides,
            offsets: this.offsets.map(o => ({ ...o })) // Copia profonda per sicurezza
        };
    }

    static fromJSON(json) {
        return new Building(json);
    }
}