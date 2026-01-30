import { Tile, TowerType } from '../config.js';

const G = Tile.GRASS;
const W = Tile.WALL;
const D = Tile.DIRT;
const R = Tile.WATER;
const F = Tile.FOREST;
const M = Tile.MUD;

// 25 colonne x 18 righe
export const level1 = {
    name: 'Primo Assalto',
    cols: 25,
    rows: 18,

    // Griglia terreno (riga per riga, dall'alto)
    tiles: [
        // riga 0
        [F,F,F,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,F,F],
        // riga 1
        [F,G,G,G,G,G,G,G,G,G,W,W,W,W,W,W,W,W,G,G,G,G,G,G,F],
        // riga 2
        [G,G,G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,W,G,G,G,G,G,G,G],
        // riga 3
        [G,G,G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,W,G,G,G,G,G,G,G],
        // riga 4
        [G,G,G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,W,G,G,G,G,G,G,G],
        // riga 5
        [G,G,G,G,G,G,G,G,W,W,W,D,D,D,D,D,D,W,W,W,W,W,G,G,G],
        // riga 6
        [G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,D,D,D,D,D,D,W,G,G,G],
        // riga 7
        [G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,D,D,D,D,D,D,W,G,G,G],
        // riga 8 - apertura
        [G,G,G,G,G,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,W,G,G,G],
        // riga 9 - apertura
        [G,G,G,G,G,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,W,G,G,G],
        // riga 10
        [G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,D,D,D,D,D,D,W,G,G,G],
        // riga 11
        [G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,D,D,D,D,D,D,W,G,G,G],
        // riga 12
        [G,G,G,G,G,G,G,G,W,W,W,D,D,D,D,D,D,W,W,W,W,W,G,G,G],
        // riga 13
        [G,G,G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,W,G,G,G,G,G,G,G],
        // riga 14
        [G,G,G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,W,G,G,G,G,G,G,G],
        // riga 15
        [G,G,G,G,G,G,G,G,G,G,W,D,D,D,D,D,D,W,G,G,G,G,G,G,G],
        // riga 16
        [F,G,G,G,G,G,G,G,G,G,W,W,W,W,W,W,W,W,G,G,G,G,G,G,F],
        // riga 17
        [F,F,F,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,G,F,F],
    ],

    // Posizione iniziale mago (col, row)
    wizardStart: { col: 2, row: 9 },

    // Torri nemiche: { col, row, type }
    towers: [
        { col: 14, row: 4,  type: TowerType.GUARD },
        { col: 14, row: 14, type: TowerType.GUARD },
        { col: 19, row: 8,  type: TowerType.BALLISTA },
    ],

    // Posizione tesoro (obiettivo)
    treasure: { col: 14, row: 9 },
};
