// ========================================
// Mappa a griglia di tile
// ========================================

import { TileProps } from './config.js';

export class TileMap {
    constructor(cols, rows, tilesData) {
        this.cols = cols;
        this.rows = rows;
        this.tiles = tilesData; // array 2D [row][col]
    }

    /** Tipo tile a una posizione griglia */
    getTile(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return this.tiles[row][col];
    }

    /** Proprietà tile a una posizione griglia */
    getTileProps(col, row) {
        const t = this.getTile(col, row);
        return TileProps[t] || null;
    }

    /** Tile walkable? */
    isWalkable(col, row) {
        const p = this.getTileProps(col, row);
        return p ? p.walkable : false;
    }

    /** Posizione mondo (centro tile) da coordinate griglia */
    gridToWorld(col, row) {
        return { x: col + 0.5, y: row + 0.5 };
    }

    /** Coordinate griglia da posizione mondo */
    worldToGrid(wx, wy) {
        return { col: Math.floor(wx), row: Math.floor(wy) };
    }

    /** Crea il PIXI.Graphics per il rendering della mappa */
    createGraphics() {
        const g = new PIXI.Graphics();
        this.redraw(g);
        return g;
    }

    /** Ridisegna la mappa (chiamare quando il terreno cambia) */
    redraw(graphics) {
        graphics.clear();
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const tile = this.tiles[row][col];
                const props = TileProps[tile];
                if (!props) continue;

                graphics.beginFill(props.color);
                graphics.drawRect(col, row, 1, 1);
                graphics.endFill();
            }
        }

        // Bordo griglia sottile
        graphics.lineStyle(0.02, 0x000000, 0.15);
        for (let row = 0; row <= this.rows; row++) {
            graphics.moveTo(0, row);
            graphics.lineTo(this.cols, row);
        }
        for (let col = 0; col <= this.cols; col++) {
            graphics.moveTo(col, 0);
            graphics.lineTo(col, this.rows);
        }
    }
}
