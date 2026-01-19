import { GeometryFactory } from "../factories/geometry-factory.js";

export class Building {
    /**
     * Il costruttore ora accetta un oggetto di dati che può contenere 
     * o un template+options (per la creazione) o vertici diretti (per il caricamento)
     */
    constructor(data = {}) {
        this.id = data.id;
        this.templateId = data.templateId || 'ngon_4';
        this.type = 'building';

        // Parametri di trasformazione (la "memoria" dell'asset)
        this.position = data.position || { x: 0, y: 0 };
        this.rotation = data.rotation || 0;
        this.scaleX = data.scaleX || 50;
        this.scaleY = data.scaleY || 50;

        // I vertici "vivi" (possono essere modificati dai manager)
        this.vertices = data.vertices ? [...data.vertices] : [];

        // Se non abbiamo vertici (nuovo edificio), generiamo la base
        if (this.vertices.length === 0) {
            this.regenerateBase();
        }
    }

    /**
     * Ritorna i vertici locali del template originale
     */
    getTemplateVertices() {
        if (this.templateId.startsWith('ngon_')) {
            const sides = parseInt(this.templateId.split('_')[1]);
            return GeometryFactory.createNGon(sides);
        }
        return GeometryFactory.getTemplate(this.templateId);
    }

    /**
     * Ripristina la geometria alla forma originale dell'asset, 
     * applicando posizione, scala e rotazione correnti.
     */
    regenerateBase() {
        const localTemplate = this.getTemplateVertices();
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);

        // Salviamo i vertici trasformati in un array "base" che non verrà mai toccato dallo splice
        this.baseVertices = localTemplate.map((v, index) => {
            let x = v.x * this.scaleX;
            let y = v.y * this.scaleY;
            const vertexId = `v_${index}`;
            return {
                id: vertexId, // ID STABILE basato sulla posizione nel template
                edgeId: `e_${vertexId}`,
                x: (x * cos - y * sin) + this.position.x,
                y: (x * sin + y * cos) + this.position.y
            };
        });

        // Copiamo i baseVertices nei vertices "vivi" su cui lavorerà il manager
        this.vertices = this.baseVertices.map(v => ({ ...v }));
    }

    /**
     * Trasforma i vertici del template in vertici World Space una sola volta
     */
    _generateWorldVertices(localVertices, { position, rotation, scaleX, scaleY }) {
        console.log(localVertices);
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        return localVertices.map(v => {
            // 1. Scala locale
            let x = v.x * scaleX;
            let y = v.y * scaleY;
            // 2. Rotazione
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            // 3. Traslazione alla posizione mondo
            return {
                x: rx + position.x,
                y: ry + position.y
            };
        });
    }

    /**
     * Sposta l'edificio applicando un delta a tutti i vertici espliciti
     */
    translate(dx, dy) {
        this.vertices.forEach(v => {
            v.x += dx;
            v.y += dy;
        });
    }

    /**
     * Calcola il centro approssimativo (centroid) basato sui vertici attuali.
     * Utile per la rotazione o per il posizionamento di etichette.
     */
    getCenter() {
        if (this.vertices.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const v of this.vertices) {
            cx += v.x;
            cy += v.y;
        }
        return { x: cx / this.vertices.length, y: cy / this.vertices.length };
    }

    getVertices() {
        return this.vertices;
    }

    getTemplate() {
        return this.templateId;
    }

    // Aggiungi questo metodo
    resetToWorldBase(position, rotation, scaleX, scaleY, template) {
        // Rigenera i vertici World Space "puliti" partendo dal template locale
        this.vertices = this._generateWorldVertices(template.vertices, {
            position, rotation, scaleX, scaleY
        });
    }

    /**
     * Serializzazione: salviamo i vertici espliciti (che potrebbero essere stati smussati)
     */
    toJSON() {
        return {
            id: this.id,
            templateId: this.templateId,
            position: { ...this.position },
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            // Salviamo anche i vertici attuali (già smussati) per sicurezza
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y }))
        };
    }

    static fromJSON(json) {
        // Passiamo l'oggetto JSON direttamente al costruttore
        // Il costruttore userà il percorso "data.vertices"
        return new Building(json);
    }


}