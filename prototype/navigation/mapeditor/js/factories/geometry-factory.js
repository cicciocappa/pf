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
            // === TORRI ===
            'TOWER': this.createNGon(12),

            'MAGIC_TOWER': this.createNGon(8),

            'BALLISTA_TOWER': [ // Torre quadrata con sporgenze
                { x: -0.8, y: -1 },
                { x: 0.8, y: -1 },
                { x: 1, y: -0.8 },
                { x: 1, y: 0.8 },
                { x: 0.8, y: 1 },
                { x: -0.8, y: 1 },
                { x: -1, y: 0.8 },
                { x: -1, y: -0.8 }
            ],

            'ARCHERY_TOWER': this.createNGon(6),

            'WATCHTOWER': [ // Torre stretta e alta
                { x: -0.5, y: -1 },
                { x: 0.5, y: -1 },
                { x: 0.5, y: 1 },
                { x: -0.5, y: 1 }
            ],

            // === EDIFICI MILITARI ===
            'BARRACKS': [
                { x: -1.5, y: -0.8 },
                { x: 1.5, y: -0.8 },
                { x: 1.5, y: 0.8 },
                { x: -1.5, y: 0.8 }
            ],

            'ARCHERY_RANGE': [
                { x: -2, y: -0.5 },
                { x: 2, y: -0.5 },
                { x: 2, y: 0.5 },
                { x: -2, y: 0.5 }
            ],

            'STABLE': [
                { x: -1.8, y: -1 },
                { x: 1.8, y: -1 },
                { x: 1.8, y: 1 },
                { x: -1.8, y: 1 }
            ],

            'ARMORY': [
                { x: -1.2, y: -0.8 },
                { x: 1.2, y: -0.8 },
                { x: 1.2, y: 0.8 },
                { x: -1.2, y: 0.8 }
            ],

            'SIEGE_WORKSHOP': [
                { x: -1.5, y: -1.2 },
                { x: 1.5, y: -1.2 },
                { x: 1.5, y: 1.2 },
                { x: -1.5, y: 1.2 }
            ],

            // === EDIFICI FANTASY ===
            'DRAGON_PIT': this.createNGon(10),

            'MAGE_GUILD': this.createNGon(5),

            'TEMPLE': [
                { x: 0, y: -1.5 },
                { x: 1.2, y: -0.5 },
                { x: 1.2, y: 1 },
                { x: -1.2, y: 1 },
                { x: -1.2, y: -0.5 }
            ],

            'ALTAR': this.createNGon(6),

            'CRYSTAL_SPIRE': this.createNGon(3),

            // === EDIFICI RESIDENZIALI ===
            'SMALL_HOUSE': this.createNGon(4),

            'LARGE_HOUSE': [
                { x: -1.3, y: -1 },
                { x: 1.3, y: -1 },
                { x: 1.3, y: 1 },
                { x: -1.3, y: 1 }
            ],

            'MANOR': [
                { x: -1.8, y: -1.2 },
                { x: 1.8, y: -1.2 },
                { x: 1.8, y: 1.2 },
                { x: -1.8, y: 1.2 }
            ],

            'LONG_HALL': [
                { x: -2.5, y: -0.6 },
                { x: 2.5, y: -0.6 },
                { x: 2.5, y: 0.6 },
                { x: -2.5, y: 0.6 }
            ],

            // === FORTIFICAZIONI ===
            'BASTION': [
                { x: 0, y: -1.2 },
                { x: 1, y: 0 },
                { x: 0.8, y: 1 },
                { x: -0.8, y: 1 },
                { x: -1, y: 0 }
            ],

            'GATEHOUSE': [
                { x: -1.5, y: -1 },
                { x: 1.5, y: -1 },
                { x: 1.5, y: 1 },
                { x: -1.5, y: 1 }
            ],

            'CORNER_TOWER': [
                { x: -1, y: -1 },
                { x: 1, y: -1 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
                { x: -1, y: 1 }
            ],

            // === PRODUZIONE ===
            'BLACKSMITH': [
                { x: -1.2, y: -0.9 },
                { x: 1.2, y: -0.9 },
                { x: 1.2, y: 0.9 },
                { x: -1.2, y: 0.9 }
            ],

            'MILL': this.createNGon(8),

            'GRANARY': [
                { x: -1, y: -1.5 },
                { x: 1, y: -1.5 },
                { x: 1, y: 1.5 },
                { x: -1, y: 1.5 }
            ],

            'LUMBER_MILL': [
                { x: -2, y: -0.8 },
                { x: 2, y: -0.8 },
                { x: 2, y: 0.8 },
                { x: -2, y: 0.8 }
            ],

            'MINE_ENTRANCE': [
                { x: -0.8, y: -0.6 },
                { x: 0.8, y: -0.6 },
                { x: 1, y: 0.6 },
                { x: -1, y: 0.6 }
            ],

            'TAVERN': [
                { x: -1.4, y: -1 },
                { x: 1.4, y: -1 },
                { x: 1.4, y: 1 },
                { x: -1.4, y: 1 }
            ],

            // === SPECIALI ===
            'TREASURY': this.createNGon(6),

            'OBSERVATORY': this.createNGon(12),

            'MARKETPLACE': [
                { x: -2, y: -1.5 },
                { x: 2, y: -1.5 },
                { x: 2, y: 1.5 },
                { x: -2, y: 1.5 }
            ]
        };

        return templates[id] || this.createNGon(4);
    },

    /**
     * Utility per ottenere la lista dei nomi dei template disponibili
     */
    getAvailableTemplates() {
        return [
            // Torri
            'TOWER', 'MAGIC_TOWER', 'BALLISTA_TOWER', 'ARCHERY_TOWER', 'WATCHTOWER',
            // Militari
            'BARRACKS', 'ARCHERY_RANGE', 'STABLE', 'ARMORY', 'SIEGE_WORKSHOP',
            // Fantasy
            'DRAGON_PIT', 'MAGE_GUILD', 'TEMPLE', 'ALTAR', 'CRYSTAL_SPIRE',
            // Residenziali
            'SMALL_HOUSE', 'LARGE_HOUSE', 'MANOR', 'LONG_HALL',
            // Fortificazioni
            'BASTION', 'GATEHOUSE', 'CORNER_TOWER',
            // Produzione
            'BLACKSMITH', 'MILL', 'GRANARY', 'LUMBER_MILL', 'MINE_ENTRANCE', 'TAVERN',
            // Speciali
            'TREASURY', 'OBSERVATORY', 'MARKETPLACE'
        ];
    }
};