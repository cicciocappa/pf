export class ConnectionManager {
    constructor(mapData) {
        this.mapData = mapData;
    }

    add(conn) {
        this.mapData.connections.push(conn);
        this.mapData.updateAllGeometry();
    }

    resolveAll() {
        // Ordine di risoluzione suggerito:
        // 1. Unioni di edifici (Caso 5-6)
        // 2. Connessioni Muro-Edificio (Caso 1-2)
        // 3. Connessioni Muro-Muro (Caso 3-4)
        
        for (const conn of this.mapData.connections) {
            switch(conn.type) {
                case 'WALL_TO_BUILDING_VERTEX':
                    this._resolveWallToBuildingVertex(conn);
                    break;
                case 'WALL_TO_WALL_END':
                    this._resolveWallToWallEnd(conn);
                    break;
                // ... altri casi
            }
        }
    }

    _resolveWallToBuildingVertex(conn) {
        const wall = this.mapData.getWallById(conn.wallId);
        const bldg = this.mapData.getBuildingById(conn.targetId);
        
        if (!wall || !bldg) return;

        const vertex = bldg.vertices[conn.targetVertexIndex];
        
        // Modifica la geometria del muro (il punto di inizio/fine)
        if (conn.wallEnd === 'start') {
            wall.vertices[0].x = vertex.x;
            wall.vertices[0].y = vertex.y;
        } else {
            wall.vertices[wall.vertices.length - 1].x = vertex.x;
            wall.vertices[wall.vertices.length - 1].y = vertex.y;
        }
        
        // Qui andrebbe la logica complessa: l'edificio deve "aprirsi"
        // o adattare il vertice se il muro ha uno spessore (thickness).
    }
}