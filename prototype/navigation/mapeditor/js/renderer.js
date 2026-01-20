/**
 * Renderer - Handles all canvas rendering
 */
export class Renderer {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.editor = editor;

        // Colors
        this.colors = {
            background: '#1a1a2e',
            grid: '#2a2a4e',
            gridSnap: '#3a3a5e', // Slightly brighter for snap grid
            outerPoly: '#4ecdc4',
            outerPolyFill: 'rgba(78, 205, 196, 0.1)',
            building: '#e94560',
            buildingFill: 'rgba(233, 69, 96, 0.3)',
            wall: '#feca57',
            wallFill: 'rgba(254, 202, 87, 0.3)',
            wallSubdivision: 'rgba(254, 202, 87, 0.5)',
            obstacle: '#808080', // Gray for non-destructible obstacles
            obstacleFill: 'rgba(128, 128, 128, 0.3)',
            selected: '#00ff00',
            selectedFill: 'rgba(0, 255, 0, 0.2)',
            preview: 'rgba(255, 255, 255, 0.5)',
            previewFill: 'rgba(255, 255, 255, 0.1)',
            vertex: '#ffffff',
            vertexSelected: '#00ff00',
            navmeshTriangle: 'rgba(100, 200, 255, 0.3)',
            navmeshTriangleBorder: 'rgba(100, 200, 255, 0.6)',
            navmeshMerged: 'rgba(100, 255, 100, 0.2)',
            navmeshMergedBorder: 'rgba(100, 255, 100, 0.8)',
            snap: '#ff00ff',
            // Connection indicators
            connectionVertex: '#00ffff', // Cyan for vertex connections
            connectionEdge: '#ff00ff',   // Magenta for edge connections
            connectionWall: '#ffff00',   // Yellow for wall-to-wall connections
            // Debug holes visualization (merged hole = building + wall union)
            debugHole: 'rgba(0, 100, 255, 0.4)',
            debugHoleBorder: '#00ffff',
            // Debug merge components visualization
            debugBuildingPoly: 'rgba(0, 200, 0, 0.4)',
            debugBuildingPolyBorder: '#ff00ff',
            debugWallPoly: 'rgba(255, 0, 0, 0.4)',
            debugWallPolyBorder: '#ffffff'
        };
    }

    /**
     * Helper check if object is selected
     */
    isSelected(obj) {
        if (this.editor.selectedObject === obj) return true;
        if (this.editor.selection && this.editor.selection.has(obj)) return true;
        return false;
    }

    /**
     * Clear and redraw everything
     */
    render() {
        const ctx = this.ctx;
        const camera = this.editor.camera;

        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context and apply camera transform
        ctx.save();
        ctx.translate(camera.offsetX, camera.offsetY);
        ctx.scale(camera.zoom, camera.zoom);

        // Draw grid
        this.drawGrid();
        /*
        // Draw snap grid overlay if enabled
        if (this.editor.gridSnapEnabled) {
            this.drawSnapGrid();
        }
        */
        // Check if debug mode is active
        const debugActive = (this.editor.showHolesDebug && this.editor.debugHoles) ||
            (this.editor.showMergeComponentsDebug && this.editor.debugMergeComponents);

        // Draw navmesh only if no debug mode is active
        if (this.editor.navmesh && !debugActive) {
            this.drawNavMesh();
        }

        // Draw debug holes if enabled (ONLY this, nothing else)
        if (this.editor.showHolesDebug && this.editor.debugHoles) {
            this.drawDebugHoles();
        }

        // Draw debug merge components if enabled (ONLY this, nothing else)
        if (this.editor.showMergeComponentsDebug && this.editor.debugMergeComponents) {
            this.drawDebugMergeComponents();
        }

        // Draw outer polygon
        this.drawOuterPoly();

        // Draw obstacles (non-destructible)
        this.drawObstacles();

        // Draw buildings
        this.drawBuildings();

        // Draw walls
        this.drawWalls();

        // Draw current tool preview
        if (this.editor.currentTool) {
            this.editor.currentTool.drawPreview(ctx);
        }

        // Draw snap indicator (vertex)
        if (this.editor.snapEnabled && this.editor.snapPoint) {
            this.drawSnapIndicator(this.editor.snapPoint);
        }

        // Draw snap indicator (edge)
        if (this.editor.snapToEdgeEnabled && this.editor.edgeSnapInfo) {
            this.drawEdgeSnapIndicator(this.editor.edgeSnapInfo);
        }

        ctx.restore();
    }

    /**
     * Draw background grid
     */
    /**
  * Disegna la griglia di riferimento e l'overlay di snap
  */
    drawGrid() {
        const ctx = this.ctx;
        const { camera, gridSize, gridSnapEnabled } = this.editor;
        const viewBounds = this.editor.getViewBounds();

        // 1. Ottimizzazione: se le celle della griglia sono troppo piccole sullo schermo
        // (meno di 5 pixel), smettiamo di disegnarle per evitare flickering e lag.
        if (gridSize * camera.zoom < 5) return;

        const startX = Math.floor(viewBounds.minX / gridSize) * gridSize;
        const startY = Math.floor(viewBounds.minY / gridSize) * gridSize;

        // --- DISEGNO LINEE ---
        ctx.beginPath();
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1 / camera.zoom;

        // Se lo snap è attivo, possiamo rendere le linee leggermente più visibili
        ctx.globalAlpha = gridSnapEnabled ? 0.4 : 0.2;

        for (let x = startX; x <= viewBounds.maxX; x += gridSize) {
            ctx.moveTo(x, viewBounds.minY);
            ctx.lineTo(x, viewBounds.maxY);
        }

        for (let y = startY; y <= viewBounds.maxY; y += gridSize) {
            ctx.moveTo(viewBounds.minX, y);
            ctx.lineTo(viewBounds.maxX, y);
        }
        ctx.stroke();

        // --- DISEGNO PUNTINI (Solo se Snap è attivo) ---
        if (gridSnapEnabled) {
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = this.colors.gridSnap;

            // Usiamo un quadratino piccolo invece di un cerchio (arc) 
            // per performance migliori nei loop annidati
            const dotSize = 2 / camera.zoom;
            const halfDot = dotSize / 2;

            for (let x = startX; x <= viewBounds.maxX; x += gridSize) {
                for (let y = startY; y <= viewBounds.maxY; y += gridSize) {
                    ctx.fillRect(x - halfDot, y - halfDot, dotSize, dotSize);
                }
            }
        }

        ctx.globalAlpha = 1.0;
    }

    /**
     * Calculate appropriate grid size based on zoom
     */
    calculateGridSize() {
        const zoom = this.editor.camera.zoom;
        const baseSize = 50;

        if (zoom < 0.3) return baseSize * 4;
        if (zoom < 0.6) return baseSize * 2;
        if (zoom > 2) return baseSize / 2;
        return baseSize;
    }


    /**
     * Draw outer polygon
     */
    drawOuterPoly() {
        const poly = this.editor.mapData.outerPoly;
        if (poly.length < 2) return;

        const ctx = this.ctx;
        const selected = this.isSelected('outer');

        // Draw filled polygon
        if (poly.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = selected ? this.colors.selectedFill : this.colors.outerPolyFill;
            ctx.fill();
        }

        // Draw outline
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
            ctx.lineTo(poly[i].x, poly[i].y);
        }
        if (poly.length >= 3) {
            ctx.closePath();
        }
        ctx.strokeStyle = selected ? this.colors.selected : this.colors.outerPoly;
        ctx.lineWidth = 2 / this.editor.camera.zoom;
        ctx.stroke();

        // Draw vertices
        this.drawVertices(poly, selected);
    }

    /**
     * Draw all obstacles (non-destructible)
     */
    drawObstacles() {
        for (const obstacle of this.editor.mapData.obstacles) {
            this.drawObstacle(obstacle);
        }
    }

    /**
     * Draw a single obstacle
     */
    drawObstacle(obstacle) {
        const ctx = this.ctx;
        const vertices = obstacle.getVertices();
        const selected = this.isSelected(obstacle);

        if (vertices.length < 3) return;

        // Draw filled polygon
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = selected ? this.colors.selectedFill : this.colors.obstacleFill;
        ctx.fill();

        // Draw outline
        ctx.strokeStyle = selected ? this.colors.selected : this.colors.obstacle;
        ctx.lineWidth = 2 / this.editor.camera.zoom;
        ctx.stroke();

        // Draw vertices
        this.drawVertices(vertices, selected);

        // Draw center indicator
        const center = obstacle.getCenter();
        ctx.beginPath();
        ctx.arc(center.x, center.y, 4 / this.editor.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = selected ? this.colors.selected : this.colors.obstacle;
        ctx.fill();
    }

    /**
  * Draw all buildings
  */
    drawBuildings() {
        // .values() restituisce un iteratore con solo gli oggetti Building
        for (const building of this.editor.mapData.buildings.values()) {
            this.drawBuilding(building);
        }
    }

    /**
     * Draw a single building
     */
    drawBuilding(building) {
        const ctx = this.ctx;
        const vertices = building.getVertices();
        const selected = this.isSelected(building);

        if (vertices.length < 3) return;

        // Draw filled polygon
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = selected ? this.colors.selectedFill : this.colors.buildingFill;
        ctx.fill();

        // Draw outline
        ctx.strokeStyle = selected ? this.colors.selected : this.colors.building;
        ctx.lineWidth = 2 / this.editor.camera.zoom;
        ctx.stroke();

        // Draw center point
        const center = building.getCenter();
        ctx.beginPath();
        ctx.arc(center.x, center.y, 4 / this.editor.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = selected ? this.colors.selected : this.colors.building;
        ctx.fill();
    }

    /**
     * Disegna tutti i muri presenti nella mappa
     */
    drawWalls() {
        // Usiamo .values() perché mapData.walls ora è una Map
        for (const wall of this.editor.mapData.walls.values()) {
            this.drawWall(wall);
        }
    }

    /**
     * Disegna un singolo muro usando le sue unità distruttibili (quadrilateri)
     */
    drawWall(wall) {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const selected = this.isSelected(wall);

        // Se il muro non ha unità (es. meno di 2 punti), non disegniamo nulla
        if (!wall.units || wall.units.length === 0) return;

        // 1. Disegna le unità distruttibili
        ctx.save();
        wall.units.forEach((unit) => {
            const v = unit.vertices;
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            ctx.lineTo(v[1].x, v[1].y);
            ctx.lineTo(v[2].x, v[2].y);
            ctx.lineTo(v[3].x, v[3].y);
            ctx.closePath();

            // Riempimento
            ctx.fillStyle = selected ? this.colors.selectedFill : this.colors.wallFill;
            ctx.fill();

            // Bordi delle suddivisioni (per far vedere i "mattoni")
            ctx.strokeStyle = selected ? this.colors.selected : this.colors.wallSubdivision;
            ctx.lineWidth = (selected ? 1.5 : 0.5) / zoom;
            ctx.stroke();
        });
        ctx.restore();

        // 2. Disegna i punti di controllo della polilinea centrale (solo se selezionato)
        if (selected) {
            ctx.fillStyle = this.colors.selected;
            for (const point of wall.points) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4 / zoom, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * Draw connection indicators at wall endpoints
     */
    drawWallConnections(wall) {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const radius = 8 / zoom;
        const lineWidth = 2 / zoom;

        // Helper to get connection color and symbol
        const getConnectionStyle = (snap) => {
            if (!snap) return null;

            if (snap.snapType === 'vertex') {
                if (snap.type === 'wall') {
                    return { color: this.colors.connectionWall, symbol: 'W' };
                }
                return { color: this.colors.connectionVertex, symbol: 'V' };
            } else if (snap.edge || snap.snapType === 'edge') {
                return { color: this.colors.connectionEdge, symbol: 'E' };
            }
            return null;
        };

        // Draw start connection
        if (wall.startSnap && wall.points.length > 0) {
            const style = getConnectionStyle(wall.startSnap);
            if (style) {
                const p = wall.points[0];

                // Draw circle
                ctx.strokeStyle = style.color;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.stroke();

                // Draw symbol
                ctx.fillStyle = style.color;
                ctx.font = `${10 / zoom}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(style.symbol, p.x, p.y - radius - 6 / zoom);
            }
        }

        // Draw end connection
        if (wall.endSnap && wall.points.length > 1) {
            const style = getConnectionStyle(wall.endSnap);
            if (style) {
                const p = wall.points[wall.points.length - 1];

                // Draw circle
                ctx.strokeStyle = style.color;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.stroke();

                // Draw symbol
                ctx.fillStyle = style.color;
                ctx.font = `${10 / zoom}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(style.symbol, p.x, p.y - radius - 6 / zoom);
            }
        }
    }

    /**
     * Draw vertices of a polygon
     */
    drawVertices(vertices, selected = false) {
        const ctx = this.ctx;
        const radius = 5 / this.editor.camera.zoom;

        ctx.fillStyle = selected ? this.colors.vertexSelected : this.colors.vertex;

        for (const v of vertices) {
            ctx.beginPath();
            ctx.arc(v.x, v.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Draw snap indicator
     */
    drawSnapIndicator(point) {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const size = 8 / zoom;

        // Draw crosshair
        ctx.strokeStyle = this.colors.connectionVertex;
        ctx.lineWidth = 2 / zoom;

        ctx.beginPath();
        ctx.moveTo(point.x - size, point.y);
        ctx.lineTo(point.x + size, point.y);
        ctx.moveTo(point.x, point.y - size);
        ctx.lineTo(point.x, point.y + size);
        ctx.stroke();

        // Draw "V" label for vertex snap
        ctx.fillStyle = this.colors.connectionVertex;
        ctx.font = `bold ${12 / zoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('VERTEX', point.x, point.y - size - 4 / zoom);
    }

    /**
     * Draw edge snap indicator
     */
    drawEdgeSnapIndicator(snapInfo) {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;

        // Draw the target edge highlighted
        ctx.strokeStyle = this.colors.connectionEdge;
        ctx.lineWidth = 3 / zoom;
        ctx.beginPath();
        ctx.moveTo(snapInfo.edge.p1.x, snapInfo.edge.p1.y);
        ctx.lineTo(snapInfo.edge.p2.x, snapInfo.edge.p2.y);
        ctx.stroke();

        // Draw the snap point on the edge
        const size = 6 / zoom;
        ctx.fillStyle = this.colors.connectionEdge;
        ctx.beginPath();
        ctx.arc(snapInfo.point.x, snapInfo.point.y, size, 0, Math.PI * 2);
        ctx.fill();

        // Draw perpendicular indicator
        const perpSize = 12 / zoom;
        const dx = snapInfo.edge.p2.x - snapInfo.edge.p1.x;
        const dy = snapInfo.edge.p2.y - snapInfo.edge.p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;
            ctx.strokeStyle = this.colors.connectionEdge;
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.moveTo(snapInfo.point.x, snapInfo.point.y);
            ctx.lineTo(snapInfo.point.x + nx * perpSize, snapInfo.point.y + ny * perpSize);
            ctx.stroke();
        }

        // Draw "EDGE" label with target type
        const targetType = snapInfo.type ? snapInfo.type.toUpperCase() : 'EDGE';
        ctx.fillStyle = this.colors.connectionEdge;
        ctx.font = `bold ${10 / zoom}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`EDGE (${targetType})`, snapInfo.point.x, snapInfo.point.y - size - 4 / zoom);
    }

    /**
     * Draw navmesh polygons
     */
    drawNavMesh() {
        const ctx = this.ctx;
        const navmesh = this.editor.navmesh;
        const showTriangles = this.editor.showTriangles;

        // Draw triangles if enabled
        if (showTriangles && navmesh.triangles) {
            for (const tri of navmesh.triangles) {
                ctx.beginPath();
                ctx.moveTo(tri[0].x, tri[0].y);
                ctx.lineTo(tri[1].x, tri[1].y);
                ctx.lineTo(tri[2].x, tri[2].y);
                ctx.closePath();
                ctx.fillStyle = this.colors.navmeshTriangle;
                ctx.fill();
                ctx.strokeStyle = this.colors.navmeshTriangleBorder;
                ctx.lineWidth = 1 / this.editor.camera.zoom;
                ctx.stroke();
            }
        }

        // Draw merged polygons
        if (navmesh.merged) {
            for (const poly of navmesh.merged) {
                ctx.beginPath();
                ctx.moveTo(poly[0].x, poly[0].y);
                for (let i = 1; i < poly.length; i++) {
                    ctx.lineTo(poly[i].x, poly[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = this.colors.navmeshMerged;
                ctx.fill();
                ctx.strokeStyle = this.colors.navmeshMergedBorder;
                ctx.lineWidth = 1.5 / this.editor.camera.zoom;
                ctx.stroke();
            }
        }
    }

    /**
     * Draw a polygon preview (for tools)
     */
    drawPolygonPreview(vertices, closed = false) {
        if (vertices.length < 1) return;

        const ctx = this.ctx;

        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        if (closed && vertices.length >= 3) {
            ctx.closePath();
            ctx.fillStyle = this.colors.previewFill;
            ctx.fill();
        }

        ctx.strokeStyle = this.colors.preview;
        ctx.lineWidth = 2 / this.editor.camera.zoom;
        ctx.setLineDash([5 / this.editor.camera.zoom, 5 / this.editor.camera.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw vertices
        const radius = 4 / this.editor.camera.zoom;
        ctx.fillStyle = this.colors.preview;
        for (const v of vertices) {
            ctx.beginPath();
            ctx.arc(v.x, v.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
 * Disegna gli assi locali di un oggetto (X=Rosso, Y=Verde)
 */
    drawLocalAxes(pos, rotation, scaleX, scaleY, activeConstraint = null) {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;

        // Lunghezza degli assi (leggermente più lunghi della scala attuale per sporgere)
        const lengthX = (scaleX + 20) / zoom;
        const lengthY = (scaleY + 20) / zoom;

        ctx.save();

        // 1. Spostiamoci al centro dell'edificio
        ctx.translate(pos.x, pos.y);
        // 2. Ruotiamo il sistema di coordinate
        ctx.rotate(rotation);

        // Dentro drawLocalAxes, dopo ctx.rotate(rotation)
        ctx.font = `${12 / zoom}px Arial`;
        ctx.fillStyle = '#ff4444';
        ctx.fillText('X', lengthX + 5, 0);
        ctx.fillStyle = '#44ff44';
        ctx.fillText('Y', 0, -lengthY - 5);

        // --- ASSE X (Locale) ---
        ctx.beginPath();
        ctx.moveTo(-lengthX, 0);
        ctx.lineTo(lengthX, 0);
        ctx.strokeStyle = activeConstraint === 'x' ? '#ff4444' : 'rgba(255, 0, 0, 0.3)';
        ctx.lineWidth = activeConstraint === 'x' ? 3 / zoom : 1 / zoom;
        if (activeConstraint !== 'x') ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.stroke();

        // --- ASSE Y (Locale) ---
        ctx.setLineDash([]); // Reset dash
        ctx.beginPath();
        ctx.moveTo(0, -lengthY);
        ctx.lineTo(0, lengthY);
        ctx.strokeStyle = activeConstraint === 'y' ? '#44ff44' : 'rgba(0, 255, 0, 0.3)';
        ctx.lineWidth = activeConstraint === 'y' ? 3 / zoom : 1 / zoom;
        if (activeConstraint !== 'y') ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Draw building preview (ghost)
     */
    drawBuildingPreview(position, rotation, scaleX, scaleY, localVertices) {
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);

        const worldVertices = localVertices.map(v => {
            let x = v.x * scaleX;
            let y = v.y * scaleY;
            return {
                x: (x * cosR - y * sinR) + position.x,
                y: (x * sinR + y * cosR) + position.y
            };
        });

        this.drawPolygonPreview(worldVertices, true);
    }
    /**
 * Disegna l'anteprima del muro durante il disegno
 */
    drawWallPreview(points, thickness, maxSegmentLength) {
        if (points.length < 1) return;
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const halfThickness = thickness / 2;

        // 1. Disegna la linea centrale (tratteggiata)
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = this.colors.preview;
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (points.length >= 2) {
            // Calcoliamo i punti miter temporanei per il preview
            // (Possiamo riutilizzare la logica della classe Wall o semplificarla qui)
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const dir = { x: dx / len, y: dy / len };
                const norm = { x: -dir.y, y: dir.x };

                // Disegna i bordi esterni del preview
                ctx.moveTo(p1.x + norm.x * halfThickness, p1.y + norm.y * halfThickness);
                ctx.lineTo(p2.x + norm.x * halfThickness, p2.y + norm.y * halfThickness);
                ctx.moveTo(p1.x - norm.x * halfThickness, p1.y - norm.y * halfThickness);
                ctx.lineTo(p2.x - norm.x * halfThickness, p2.y - norm.y * halfThickness);

                // Disegna i "tagli" delle suddivisioni
                const numSegments = Math.ceil(len / maxSegmentLength);
                for (let j = 1; j < numSegments; j++) {
                    const t = j / numSegments;
                    const tx = p1.x + dx * t;
                    const ty = p1.y + dy * t;
                    ctx.moveTo(tx + norm.x * halfThickness, ty + norm.y * halfThickness);
                    ctx.lineTo(tx - norm.x * halfThickness, ty - norm.y * halfThickness);
                }
            }
            ctx.stroke();
        }

        // 2. Disegna i nodi cliccati
        ctx.fillStyle = this.colors.preview;
        for (const p of points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        if (len < 0.001) return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    }

    /**
     * Draw debug visualization of computed holes (merged building + wall)
     */
    drawDebugHoles() {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const holes = this.editor.debugHoles;

        for (let holeIdx = 0; holeIdx < holes.length; holeIdx++) {
            const hole = holes[holeIdx];
            if (hole.length < 3) continue;

            // Draw filled polygon
            ctx.beginPath();
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let i = 1; i < hole.length; i++) {
                ctx.lineTo(hole[i].x, hole[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = this.colors.debugHole;
            ctx.fill();
            ctx.strokeStyle = this.colors.debugHoleBorder;
            ctx.lineWidth = 2 / zoom;
            ctx.stroke();
        }
    }

    /**
     * Calculate centroid of a polygon
     */
    calculateCentroid(polygon) {
        let cx = 0, cy = 0;
        for (const p of polygon) {
            cx += p.x;
            cy += p.y;
        }
        return { x: cx / polygon.length, y: cy / polygon.length };
    }

    /**
     * Draw debug visualization of merge components (building + wall polygons before union)
     */
    drawDebugMergeComponents() {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const components = this.editor.debugMergeComponents;

        for (let compIdx = 0; compIdx < components.length; compIdx++) {
            const comp = components[compIdx];

            // Draw building polygon (green fill, magenta border)
            if (comp.buildingPolygon && comp.buildingPolygon.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(comp.buildingPolygon[0].x, comp.buildingPolygon[0].y);
                for (let i = 1; i < comp.buildingPolygon.length; i++) {
                    ctx.lineTo(comp.buildingPolygon[i].x, comp.buildingPolygon[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = this.colors.debugBuildingPoly;
                ctx.fill();
                ctx.strokeStyle = this.colors.debugBuildingPolyBorder;
                ctx.lineWidth = 2 / zoom;
                ctx.stroke();
            }

            // Draw wall polygons (red fill, white border)
            if (comp.wallPolygons) {
                for (const wallPoly of comp.wallPolygons) {
                    if (wallPoly && wallPoly.length >= 3) {
                        ctx.beginPath();
                        ctx.moveTo(wallPoly[0].x, wallPoly[0].y);
                        for (let i = 1; i < wallPoly.length; i++) {
                            ctx.lineTo(wallPoly[i].x, wallPoly[i].y);
                        }
                        ctx.closePath();
                        ctx.fillStyle = this.colors.debugWallPoly;
                        ctx.fill();
                        ctx.strokeStyle = this.colors.debugWallPolyBorder;
                        ctx.lineWidth = 2 / zoom;
                        ctx.stroke();
                    }
                }
            }
        }
    }

    /**
     * Resize canvas to fit container
     */
    resize() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.render();
    }
}
