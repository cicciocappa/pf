/**
 * GeometryFactory - Genera asset poligonali convessi in spazio locale (range -1 a 1)
 */
export const GeometryFactory = {
    
    /**
     * Genera un n-gon regolare (3-12 lati)
     * @param {number} sides Numero di lati
     * @returns {Array<{x, y}>} Vertici locali
     */
    createNGon(sides) {
        const vertices = [];
        // Limitiamo i lati tra 3 e 12 come richiesto
        const s = Math.max(3, Math.min(12, sides));
        
        // Offset per avere la base piatta:
        // Se 4 lati (quadrato), ruotiamo di 45° (PI/4) per evitare il rombo.
        // Per altri n-gon, la logica standard è -PI/2 (punta in alto).
        const baseOffset = (s === 4) ? Math.PI / 4 : 0;
        const angleStep = (2 * Math.PI) / s;
        
        for (let i = 0; i < s; i++) {
            const angle = -Math.PI / 2 + baseOffset + (i * angleStep);
            vertices.push({
                x: Math.cos(angle),
                y: Math.sin(angle)
            });
        }
        return vertices;
    },

    /**
     * Restituisce un template predefinito basato sull'ID
     * @param {string} id ID del template (es. 'TOWER', 'BARRACKS')
     * @returns {Array<{x, y}>} Vertici locali
     */
    getTemplate(id) {
        const templates = {
            'TOWER': this.createNGon(12), // Una torre è un n-gon con molti lati
            
            'BARRACKS': [ // Rettangolo lungo
                { x: -1.5, y: -0.8 }, 
                { x: 1.5, y: -0.8 }, 
                { x: 1.5, y: 0.8 }, 
                { x: -1.5, y: 0.8 }
            ],
            
            'SMALL_HOUSE': this.createNGon(4),
            
            'LONG_HALL': [ // Rettangolo molto stretto e lungo
                { x: -2.5, y: -0.6 }, 
                { x: 2.5, y: -0.6 }, 
                { x: 2.5, y: 0.6 }, 
                { x: -2.5, y: 0.6 }
            ],

            'BASTION': [ // Forma a cuneo convessa
                { x: 0, y: -1.2 }, 
                { x: 1, y: 0 }, 
                { x: 0.8, y: 1 }, 
                { x: -0.8, y: 1 }, 
                { x: -1, y: 0 }
            ]
        };

        return templates[id] || this.createNGon(4);
    },

    /**
     * Utility per ottenere la lista dei nomi dei template disponibili
     */
    getAvailableTemplates() {
        return ['TOWER', 'BARRACKS', 'SMALL_HOUSE', 'LONG_HALL', 'BASTION'];
    }
};