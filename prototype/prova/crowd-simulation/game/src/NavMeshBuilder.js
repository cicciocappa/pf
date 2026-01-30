// ========================================
// Genera navmesh navcat dalla TileMap
// ========================================

import {
    createNavMesh,
    buildTile,
    addTile,
    polygonsToNavMeshTilePolys,
    polysToTileDetailMesh,
} from 'navcat';

import { box3 } from 'mathcat';

/**
 * Costruisce una navmesh navcat dalle tile walkable della mappa.
 * Ogni tile walkable diventa un poligono quadrato.
 * Tile adiacenti condividono edge → navcat calcola i neighbor automaticamente.
 */
export function buildNavMeshFromTileMap(tileMap) {
    const { cols, rows } = tileMap;

    // Griglia vertici: (cols+1) x (rows+1)
    // Vertex index = vy * (cols+1) + vx
    // Posizione 3D: (vx, 0, vy)  [y=0 piano orizzontale]
    const vertCount = (cols + 1) * (rows + 1);
    const flatVertices = new Float64Array(vertCount * 3);

    for (let vy = 0; vy <= rows; vy++) {
        for (let vx = 0; vx <= cols; vx++) {
            const idx = (vy * (cols + 1) + vx) * 3;
            flatVertices[idx]     = vx;   // x
            flatVertices[idx + 1] = 0;    // y (altezza)
            flatVertices[idx + 2] = vy;   // z
        }
    }

    // Crea poligoni per ogni tile walkable
    const polygons = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (!tileMap.isWalkable(col, row)) continue;

            // Vertici del quad in ordine CW visto dall'alto (+Y)
            // (coerente con il formato navcat/recastnavigation)
            const bl = row * (cols + 1) + col;           // (col,   0, row)
            const br = row * (cols + 1) + col + 1;       // (col+1, 0, row)
            const tr = (row + 1) * (cols + 1) + col + 1; // (col+1, 0, row+1)
            const tl = (row + 1) * (cols + 1) + col;     // (col,   0, row+1)

            // CW dall'alto: BL -> TL -> TR -> BR
            polygons.push({
                vertices: [bl, tl, tr, br],
                flags: 1,
                area: 0,
            });
        }
    }

    if (polygons.length === 0) {
        console.error('NavMeshBuilder: nessuna tile walkable trovata!');
        return null;
    }

    // Calcola bounds
    const bounds = box3.create();
    box3.expandByPoint(bounds, bounds, [0, 0, 0]);
    box3.expandByPoint(bounds, bounds, [cols, 0, rows]);

    // Converti in formato navcat con calcolo automatico dei neighbor
    const tilePolys = polygonsToNavMeshTilePolys(
        polygons,
        Array.from(flatVertices),
        0,       // borderSize
        bounds
    );

    // Detail mesh
    const tileDetailMesh = polysToTileDetailMesh(tilePolys.polys);

    // Crea NavMesh
    const navMesh = createNavMesh();

    navMesh.tileWidth = cols;
    navMesh.tileHeight = rows;
    navMesh.origin[0] = 0;
    navMesh.origin[1] = 0;
    navMesh.origin[2] = 0;

    // Build tile
    const tile = buildTile({
        bounds,
        vertices: tilePolys.vertices,
        polys: tilePolys.polys,
        detailMeshes: tileDetailMesh.detailMeshes,
        detailVertices: tileDetailMesh.detailVertices,
        detailTriangles: tileDetailMesh.detailTriangles,
        tileX: 0,
        tileY: 0,
        tileLayer: 0,
        cellSize: 0.2,
        cellHeight: 0.2,
        walkableHeight: 2.0,
        walkableRadius: 0.3,
        walkableClimb: 0.5,
    });

    addTile(navMesh, tile);

    console.log(`NavMesh creata: ${polygons.length} poligoni, ${navMesh.nodes.length} nodi`);

    return navMesh;
}
