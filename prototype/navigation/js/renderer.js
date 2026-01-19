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

        // Draw snap grid overlay if enabled
        if (this.editor.gridSnapEnabled) {
            this.drawSnapGrid();
        }

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
    drawGrid() {
        const ctx = this.ctx;
        const camera = this.editor.camera;

        // Calculate visible area in world coordinates
        const viewBounds = this.editor.getViewBounds();
        const gridSize = this.calculateGridSize();

        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1 / camera.zoom;

        const startX = Math.floor(viewBounds.minX / gridSize) * gridSize;
        const startY = Math.floor(viewBounds.minY / gridSize) * gridSize;

        ctx.beginPath();

        // Vertical lines
        for (let x = startX; x <= viewBounds.maxX; x += gridSize) {
            ctx.moveTo(x, viewBounds.minY);
            ctx.lineTo(x, viewBounds.maxY);
        }

        // Horizontal lines
        for (let y = startY; y <= viewBounds.maxY; y += gridSize) {
            ctx.moveTo(viewBounds.minX, y);
            ctx.lineTo(viewBounds.maxX, y);
        }

        ctx.stroke();
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
     * Draw snap grid overlay
     */
    drawSnapGrid() {
        const ctx = this.ctx;
        const camera = this.editor.camera;
        const gridSize = this.editor.gridSize;

        // Calculate visible area in world coordinates
        const viewBounds = this.editor.getViewBounds();

        ctx.strokeStyle = this.colors.gridSnap;
        ctx.lineWidth = 1 / camera.zoom;
        ctx.globalAlpha = 0.5;

        const startX = Math.floor(viewBounds.minX / gridSize) * gridSize;
        const startY = Math.floor(viewBounds.minY / gridSize) * gridSize;

        ctx.beginPath();

        // Vertical lines
        for (let x = startX; x <= viewBounds.maxX; x += gridSize) {
            ctx.moveTo(x, viewBounds.minY);
            ctx.lineTo(x, viewBounds.maxY);
        }

        // Horizontal lines
        for (let y = startY; y <= viewBounds.maxY; y += gridSize) {
            ctx.moveTo(viewBounds.minX, y);
            ctx.lineTo(viewBounds.maxX, y);
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Draw dots at intersections for better visibility
        ctx.fillStyle = this.colors.gridSnap;
        const dotRadius = 2 / camera.zoom;
        for (let x = startX; x <= viewBounds.maxX; x += gridSize) {
            for (let y = startY; y <= viewBounds.maxY; y += gridSize) {
                ctx.beginPath();
                ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * Draw outer polygon
     */
    drawOuterPoly() {
        const poly = this.editor.mapData.outerPoly;
        if (poly.length < 2) return;

        const ctx = this.ctx;
        const selected = this.editor.selectedObject === 'outer';

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
        const selected = this.editor.selectedObject === obstacle;

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
        for (const building of this.editor.mapData.buildings) {
            this.drawBuilding(building);
        }
    }

    /**
     * Draw a single building
     */
    drawBuilding(building) {
        const ctx = this.ctx;
        const vertices = building.getVertices();
        const selected = this.editor.selectedObject === building;

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
        ctx.beginPath();
        ctx.arc(building.position.x, building.position.y, 4 / this.editor.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = selected ? this.colors.selected : this.colors.building;
        ctx.fill();
    }

    /**
     * Draw all walls
     */
    drawWalls() {
        for (const wall of this.editor.mapData.walls) {
            this.drawWall(wall);
        }
    }

    /**
 * Draw a single wall using its trapezoidal subdivisions
 */
    drawWall(wall) {
        const ctx = this.ctx;
        const zoom = this.editor.camera.zoom;
        const selected = this.editor.selectedObject === wall;

        // Recuperiamo i quadrilateri trapezoidali (mitered)
        const quads = wall.toQuadrilaterals(this.editor.mapData);
        if (quads.length === 0) return;

        // 1. Disegna il riempimento e i bordi delle suddivisioni
        quads.forEach((quad, index) => {
            ctx.beginPath();
            ctx.moveTo(quad[0].x, quad[0].y);
            for (let i = 1; i < quad.length; i++) {
                ctx.lineTo(quad[i].x, quad[i].y);
            }
            ctx.closePath();

            // Riempimento
            ctx.fillStyle = selected ? this.colors.selectedFill : this.colors.wallFill;
            ctx.fill();

            // Bordi della suddivisione (per far vedere i pezzi distruttibili)
            ctx.strokeStyle = selected ? this.colors.selected : this.colors.wallSubdivision;
            ctx.lineWidth = (selected ? 2 : 1) / zoom;
            ctx.stroke();
        });

        // 2. Disegna i punti di controllo (center points della polilinea)
        ctx.fillStyle = selected ? this.colors.selected : this.colors.wall;
        for (const point of wall.points) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. Disegna gli indicatori di connessione (Vertex/Edge snap)
        this.drawWallConnections(wall);
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
     * Draw building preview (ghost)
     */
    drawBuildingPreview(position, rotation, scaleX, scaleY, sides) {
        const vertices = [];
        const angleStep = (2 * Math.PI) / sides;
        const startAngle = -Math.PI / 2;

        for (let i = 0; i < sides; i++) {
            const angle = startAngle + i * angleStep + rotation;
            vertices.push({
                x: position.x + Math.cos(angle) * scaleX,
                y: position.y + Math.sin(angle) * scaleY
            });
        }

        this.drawPolygonPreview(vertices, true);
    }

    /**
     * Draw wall preview
     */
    drawWallPreview(points, thickness, maxSegmentLength) {
        if (points.length < 1) return;

        const ctx = this.ctx;

        // Draw center line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = this.colors.preview;
        ctx.lineWidth = 2 / this.editor.camera.zoom;
        ctx.setLineDash([5 / this.editor.camera.zoom, 5 / this.editor.camera.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw thickness preview if we have at least 2 points
        if (points.length >= 2) {
            // Create temporary wall for preview
            const tempWall = { points, thickness, maxSegmentLength };
            const halfThickness = thickness / 2;

            // Calculate parallel lines
            const leftPoints = [];
            const rightPoints = [];

            for (let i = 0; i < points.length; i++) {
                const curr = points[i];
                const prev = points[i - 1];
                const next = points[i + 1];

                let normal;

                if (i === 0 && next) {
                    const dir = this.normalize({ x: next.x - curr.x, y: next.y - curr.y });
                    normal = { x: -dir.y, y: dir.x };
                } else if (i === points.length - 1 && prev) {
                    const dir = this.normalize({ x: curr.x - prev.x, y: curr.y - prev.y });
                    normal = { x: -dir.y, y: dir.x };
                } else if (prev && next) {
                    const dir1 = this.normalize({ x: curr.x - prev.x, y: curr.y - prev.y });
                    const dir2 = this.normalize({ x: next.x - curr.x, y: next.y - curr.y });
                    const n1 = { x: -dir1.y, y: dir1.x };
                    const n2 = { x: -dir2.y, y: dir2.x };
                    normal = this.normalize({ x: n1.x + n2.x, y: n1.y + n2.y });
                } else {
                    continue;
                }

                leftPoints.push({
                    x: curr.x + normal.x * halfThickness,
                    y: curr.y + normal.y * halfThickness
                });
                rightPoints.push({
                    x: curr.x - normal.x * halfThickness,
                    y: curr.y - normal.y * halfThickness
                });
            }

            // Draw parallel lines
            if (leftPoints.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
                for (let i = 1; i < leftPoints.length; i++) {
                    ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
                }
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1 / this.editor.camera.zoom;
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(rightPoints[0].x, rightPoints[0].y);
                for (let i = 1; i < rightPoints.length; i++) {
                    ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
                }
                ctx.stroke();
            }

            // Draw subdivision markers
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const length = Math.sqrt(dx * dx + dy * dy);

                if (length < 0.001) continue;

                const numSegments = Math.ceil(length / maxSegmentLength);
                const dir = { x: dx / length, y: dy / length };
                const normal = { x: -dir.y, y: dir.x };

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                for (let j = 1; j < numSegments; j++) {
                    const t = j / numSegments;
                    const point = { x: p1.x + dx * t, y: p1.y + dy * t };

                    ctx.beginPath();
                    ctx.moveTo(
                        point.x + normal.x * halfThickness,
                        point.y + normal.y * halfThickness
                    );
                    ctx.lineTo(
                        point.x - normal.x * halfThickness,
                        point.y - normal.y * halfThickness
                    );
                    ctx.stroke();
                }
            }
        }

        // Draw points
        const radius = 4 / this.editor.camera.zoom;
        ctx.fillStyle = this.colors.preview;
        for (const p of points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
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
