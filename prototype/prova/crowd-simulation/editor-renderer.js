// ========================================
// editor-renderer.js
// Rendering canvas 2D con colorazione per tipo
// ========================================

export class EditorRenderer {
    constructor(editor) {
        this.editor = editor;
    }

    render() {
        const ctx = this.editor.ctx;
        const canvas = this.editor.canvas;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(this.editor.camera.zoom, this.editor.camera.zoom);
        ctx.translate(-this.editor.camera.x, -this.editor.camera.y);

        this.renderGrid(ctx);
        this.renderTerrainTriangles(ctx);
        this.renderBuildingPolygons(ctx);
        this.renderWallUnitQuads(ctx);
        this.renderObstacleOutlines(ctx);
        this.renderBoundaryOutlines(ctx);
        this.renderOffMeshLinks(ctx);
        this.renderSelection(ctx);
        this.renderCurrentPolygon(ctx);
        this.renderToolPreview(ctx);
        this.renderSnapIndicator(ctx);
        this.renderVertexHandles(ctx);

        ctx.restore();
    }

    // ========================================
    // Grid
    // ========================================
    renderGrid(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;
        const halfW = (this.editor.canvas.width / 2) * invZoom;
        const halfH = (this.editor.canvas.height / 2) * invZoom;

        const left = this.editor.camera.x - halfW;
        const right = this.editor.camera.x + halfW;
        const top = this.editor.camera.y - halfH;
        const bottom = this.editor.camera.y + halfH;

        let gridSize = 1;
        if (this.editor.camera.zoom < 5) gridSize = 10;
        else if (this.editor.camera.zoom < 15) gridSize = 5;
        else if (this.editor.camera.zoom > 60) gridSize = 0.5;

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = invZoom * 0.5;

        const startX = Math.floor(left / gridSize) * gridSize;
        const startY = Math.floor(top / gridSize) * gridSize;

        for (let x = startX; x <= right; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        }
        for (let y = startY; y <= bottom; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = invZoom;
        ctx.beginPath(); ctx.moveTo(left, 0); ctx.lineTo(right, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, bottom); ctx.stroke();
    }

    // ========================================
    // Terrain triangles
    // ========================================
    renderTerrainTriangles(ctx) {
        const navmesh = this.editor.navmeshData;
        if (!navmesh) return;

        const { vertices, polygons } = navmesh;
        const invZoom = 1 / this.editor.camera.zoom;

        // Build edge map for internal/external edge detection
        const edgeMap = new Map();
        const terrainPolygons = polygons.filter(p => p.type === 'terrain');

        for (let t = 0; t < terrainPolygons.length; t++) {
            const indices = terrainPolygons[t].indices;
            for (let e = 0; e < indices.length; e++) {
                const a = indices[e];
                const b = indices[(e + 1) % indices.length];
                const key = Math.min(a, b) + ',' + Math.max(a, b);
                edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
            }
        }

        // Fill triangles
        let terrainIdx = 0;
        for (const poly of polygons) {
            if (poly.type !== 'terrain') continue;

            const indices = poly.indices;
            ctx.beginPath();
            const v0 = vertices[indices[0]];
            ctx.moveTo(v0[0], v0[1]);
            for (let i = 1; i < indices.length; i++) {
                const v = vertices[indices[i]];
                ctx.lineTo(v[0], v[1]);
            }
            ctx.closePath();

            // Highlight for merge tool
            const isMergeSelected = this.editor.mergeSelection &&
                (this.editor.mergeSelection.includes(polygons.indexOf(poly)));
            const isMergeHover = this.editor.mergeHover === polygons.indexOf(poly);

            if (isMergeSelected) {
                ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
            } else if (isMergeHover) {
                ctx.fillStyle = 'rgba(74, 222, 128, 0.4)';
            } else {
                ctx.fillStyle = `hsla(${200 + (terrainIdx * 17) % 60}, 50%, 30%, 0.4)`;
            }
            ctx.fill();
            terrainIdx++;
        }

        // Draw edges
        for (const poly of polygons) {
            if (poly.type !== 'terrain') continue;
            const indices = poly.indices;

            for (let e = 0; e < indices.length; e++) {
                const a = indices[e];
                const b = indices[(e + 1) % indices.length];
                const key = Math.min(a, b) + ',' + Math.max(a, b);
                const shared = edgeMap.get(key) > 1;

                ctx.beginPath();
                ctx.moveTo(vertices[a][0], vertices[a][1]);
                ctx.lineTo(vertices[b][0], vertices[b][1]);

                if (shared) {
                    ctx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
                    ctx.lineWidth = invZoom;
                } else {
                    ctx.strokeStyle = 'rgba(233, 69, 96, 0.7)';
                    ctx.lineWidth = invZoom * 1.5;
                }
                ctx.stroke();
            }
        }

        // Split preview: midpoint on hovered edge
        if (this.editor.splitPreview) {
            const sp = this.editor.splitPreview;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, invZoom * 5, 0, Math.PI * 2);
            ctx.fillStyle = '#00ffff';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = invZoom;
            ctx.stroke();
        }
    }

    // ========================================
    // Building polygons
    // ========================================
    renderBuildingPolygons(ctx) {
        const navmesh = this.editor.navmeshData;
        const invZoom = 1 / this.editor.camera.zoom;

        if (navmesh) {
            const { vertices, polygons } = navmesh;

            for (const poly of polygons) {
                if (poly.type !== 'building') continue;

                const indices = poly.indices;
                ctx.beginPath();
                const v0 = vertices[indices[0]];
                ctx.moveTo(v0[0], v0[1]);
                for (let i = 1; i < indices.length; i++) {
                    const v = vertices[indices[i]];
                    ctx.lineTo(v[0], v[1]);
                }
                ctx.closePath();

                const isSelected = this.editor.selectedObject &&
                    this.editor.selectedObject.type === 'building' &&
                    this.editor.selectedObject.id === poly.sourceId;

                ctx.fillStyle = isSelected ? 'rgba(192, 132, 252, 0.4)' : 'rgba(168, 85, 247, 0.3)';
                ctx.fill();

                ctx.strokeStyle = isSelected ? '#e9d5ff' : '#a855f7';
                ctx.lineWidth = invZoom * (isSelected ? 2.5 : 1.5);
                ctx.stroke();
            }
        } else {
            // Render buildings directly from editorData when no navmesh built yet
            this.editor.editorData.buildings.forEach(bldg => {
                this._renderBuildingDirect(ctx, bldg);
            });
        }
    }

    _renderBuildingDirect(ctx, bldg) {
        const invZoom = 1 / this.editor.camera.zoom;
        const verts = bldg.vertices;
        if (verts.length < 3) return;

        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
        }
        ctx.closePath();

        const isSelected = this.editor.selectedObject === bldg;
        ctx.fillStyle = isSelected ? 'rgba(192, 132, 252, 0.4)' : 'rgba(168, 85, 247, 0.3)';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#e9d5ff' : '#a855f7';
        ctx.lineWidth = invZoom * (isSelected ? 2.5 : 1.5);
        ctx.stroke();
    }

    // ========================================
    // Wall unit quads
    // ========================================
    renderWallUnitQuads(ctx) {
        const navmesh = this.editor.navmeshData;
        const invZoom = 1 / this.editor.camera.zoom;

        if (navmesh) {
            const { vertices, polygons } = navmesh;

            for (const poly of polygons) {
                if (poly.type !== 'wall_unit') continue;

                const indices = poly.indices;
                ctx.beginPath();
                const v0 = vertices[indices[0]];
                ctx.moveTo(v0[0], v0[1]);
                for (let i = 1; i < indices.length; i++) {
                    const v = vertices[indices[i]];
                    ctx.lineTo(v[0], v[1]);
                }
                ctx.closePath();

                ctx.fillStyle = 'rgba(251, 146, 60, 0.3)';
                ctx.fill();
                ctx.strokeStyle = '#fb923c';
                ctx.lineWidth = invZoom * 1.5;
                ctx.stroke();
            }
        } else {
            // Render walls directly from editorData when no navmesh built yet
            this.editor.editorData.walls.forEach(wall => {
                this._renderWallDirect(ctx, wall);
            });
        }
    }

    _renderWallDirect(ctx, wall) {
        const invZoom = 1 / this.editor.camera.zoom;
        const isSelected = this.editor.selectedObject === wall;

        for (const unit of wall.units) {
            const verts = unit.vertices;
            if (verts.length < 3) continue;

            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) {
                ctx.lineTo(verts[i].x, verts[i].y);
            }
            ctx.closePath();

            ctx.fillStyle = isSelected ? 'rgba(251, 146, 60, 0.4)' : 'rgba(251, 146, 60, 0.3)';
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fcd34d' : '#fb923c';
            ctx.lineWidth = invZoom * (isSelected ? 2 : 1.5);
            ctx.stroke();
        }
    }

    // ========================================
    // Obstacle outlines
    // ========================================
    renderObstacleOutlines(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;

        this.editor.editorData.obstacles.forEach(obs => {
            const verts = obs.vertices;
            if (verts.length < 3) return;

            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) {
                ctx.lineTo(verts[i].x, verts[i].y);
            }
            ctx.closePath();

            const isSelected = this.editor.selectedObject === obs;
            ctx.fillStyle = isSelected ? 'rgba(233, 69, 96, 0.25)' : 'rgba(139, 30, 50, 0.2)';
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#ff6b8a' : '#8b1e32';
            ctx.lineWidth = invZoom * (isSelected ? 2.5 : 1.5);
            ctx.stroke();
        });
    }

    // ========================================
    // Boundary outlines
    // ========================================
    renderBoundaryOutlines(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;
        const colors = ['#4ade80', '#60a5fa', '#facc15', '#c084fc', '#fb923c'];

        for (let bi = 0; bi < this.editor.editorData.boundaries.length; bi++) {
            const boundary = this.editor.editorData.boundaries[bi];
            const verts = boundary.vertices;
            if (verts.length < 2) continue;

            ctx.beginPath();
            ctx.moveTo(verts[0][0], verts[0][1]);
            for (let i = 1; i < verts.length; i++) {
                ctx.lineTo(verts[i][0], verts[i][1]);
            }
            ctx.closePath();

            ctx.strokeStyle = colors[bi % colors.length];
            ctx.lineWidth = invZoom * 2;
            ctx.stroke();
        }
    }

    // ========================================
    // Off-mesh links
    // ========================================
    renderOffMeshLinks(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;

        for (let li = 0; li < this.editor.editorData.offMeshLinks.length; li++) {
            const link = this.editor.editorData.offMeshLinks[li];
            const selected = this.editor.selectedLink === li;
            const sx = link.start[0], sy = link.start[1];
            const ex = link.end[0], ey = link.end[1];

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = selected ? '#fbbf24' : '#f59e0b';
            ctx.lineWidth = invZoom * (selected ? 3 : 2);
            ctx.setLineDash([invZoom * 5, invZoom * 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            const dx = ex - sx, dy = ey - sy;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                const nx = dx / len, ny = dy / len;
                const arrowSize = invZoom * 6;

                const ax = ex - nx * arrowSize * 2;
                const ay = ey - ny * arrowSize * 2;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ax - ny * arrowSize, ay + nx * arrowSize);
                ctx.lineTo(ax + ny * arrowSize, ay - nx * arrowSize);
                ctx.closePath();
                ctx.fillStyle = '#f59e0b';
                ctx.fill();

                if (link.bidirectional) {
                    const bx = sx + nx * arrowSize * 2;
                    const by = sy + ny * arrowSize * 2;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(bx - ny * arrowSize, by + nx * arrowSize);
                    ctx.lineTo(bx + ny * arrowSize, by - nx * arrowSize);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            const r = invZoom * 5;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ex, ey, r, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
        }
    }

    // ========================================
    // Selection highlight
    // ========================================
    renderSelection(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;
        const sel = this.editor.selectedObject;
        if (!sel) return;

        if (sel.type === 'building') {
            const verts = sel.vertices;
            if (verts.length < 3) return;
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = invZoom * 3;
            ctx.setLineDash([invZoom * 4, invZoom * 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (sel.type === 'wall') {
            for (const unit of sel.units) {
                const verts = unit.vertices;
                ctx.beginPath();
                ctx.moveTo(verts[0].x, verts[0].y);
                for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
                ctx.closePath();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = invZoom * 2;
                ctx.setLineDash([invZoom * 3, invZoom * 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        } else if (sel.type === 'obstacle') {
            const verts = sel.vertices;
            if (verts.length < 3) return;
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = invZoom * 2.5;
            ctx.setLineDash([invZoom * 4, invZoom * 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // ========================================
    // Current polygon being drawn
    // ========================================
    renderCurrentPolygon(ctx) {
        const tool = this.editor.currentToolInstance;
        if (!tool) return;
        const points = tool.currentPolygon;
        if (!points || points.length === 0) return;

        const invZoom = 1 / this.editor.camera.zoom;
        const isB = tool.name === 'boundary';

        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.lineTo(this.editor.mouseWorld.x, this.editor.mouseWorld.y);

        ctx.strokeStyle = isB ? 'rgba(74, 222, 128, 0.7)' : 'rgba(233, 69, 96, 0.7)';
        ctx.lineWidth = invZoom * 1.5;
        ctx.setLineDash([invZoom * 4, invZoom * 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        for (const p of points) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], invZoom * 4, 0, Math.PI * 2);
            ctx.fillStyle = isB ? '#4ade80' : '#e94560';
            ctx.fill();
        }

        if (points.length >= 3) {
            const first = points[0];
            if (Math.hypot(this.editor.mouseWorld.x - first[0], this.editor.mouseWorld.y - first[1]) < 0.5) {
                ctx.beginPath();
                ctx.arc(first[0], first[1], invZoom * 8, 0, Math.PI * 2);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = invZoom * 1.5;
                ctx.stroke();
            }
        }
    }

    // ========================================
    // Tool-specific preview
    // ========================================
    renderToolPreview(ctx) {
        const tool = this.editor.currentToolInstance;
        if (tool && tool.drawPreview) {
            tool.drawPreview(ctx);
        }
    }

    // ========================================
    // Snap indicator
    // ========================================
    renderSnapIndicator(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;

        if (this.editor.snapPoint) {
            const p = this.editor.snapPoint;
            ctx.beginPath();
            ctx.arc(p.x, p.y, invZoom * 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = invZoom * 2;
            ctx.stroke();
        }

        if (this.editor.edgeSnapInfo) {
            const info = this.editor.edgeSnapInfo;
            const p = info.point;
            ctx.beginPath();
            const s = invZoom * 6;
            ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = invZoom * 2;
            ctx.stroke();

            // Draw the snapped edge
            if (info.edge) {
                ctx.beginPath();
                ctx.moveTo(info.edge.p1.x, info.edge.p1.y);
                ctx.lineTo(info.edge.p2.x, info.edge.p2.y);
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
                ctx.lineWidth = invZoom * 3;
                ctx.stroke();
            }
        }
    }

    // ========================================
    // Vertex handles
    // ========================================
    renderVertexHandles(ctx) {
        const invZoom = 1 / this.editor.camera.zoom;
        const radius = invZoom * 4;
        const colors = ['#4ade80', '#60a5fa', '#facc15', '#c084fc', '#fb923c'];

        // Boundary vertices
        for (let bi = 0; bi < this.editor.editorData.boundaries.length; bi++) {
            const bd = this.editor.editorData.boundaries[bi];
            const color = colors[bi % colors.length];
            for (let vi = 0; vi < bd.vertices.length; vi++) {
                const p = bd.vertices[vi];
                ctx.beginPath();
                ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
    }

    // ========================================
    // Building preview (for BuildingTool)
    // ========================================
    drawBuildingPreview(position, rotation, scaleX, scaleY, localVertices) {
        const ctx = this.editor.ctx;
        const invZoom = 1 / this.editor.camera.zoom;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        const worldVerts = localVertices.map(v => {
            let x = v.x * scaleX;
            let y = v.y * scaleY;
            return {
                x: (x * cos - y * sin) + position.x,
                y: (x * sin + y * cos) + position.y
            };
        });

        ctx.beginPath();
        ctx.moveTo(worldVerts[0].x, worldVerts[0].y);
        for (let i = 1; i < worldVerts.length; i++) {
            ctx.lineTo(worldVerts[i].x, worldVerts[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
        ctx.lineWidth = invZoom * 2;
        ctx.setLineDash([invZoom * 4, invZoom * 2]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ========================================
    // Local axes (for BuildingTool scale constraint)
    // ========================================
    drawLocalAxes(position, rotation, scaleX, scaleY, constraint) {
        const ctx = this.editor.ctx;
        const invZoom = 1 / this.editor.camera.zoom;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const len = invZoom * 30;

        // X axis
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(position.x + cos * len, position.y + sin * len);
        ctx.strokeStyle = constraint === 'x' ? '#ff4444' : 'rgba(255,100,100,0.4)';
        ctx.lineWidth = invZoom * (constraint === 'x' ? 2 : 1);
        ctx.stroke();

        // Y axis
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(position.x - sin * len, position.y + cos * len);
        ctx.strokeStyle = constraint === 'y' ? '#44ff44' : 'rgba(100,255,100,0.4)';
        ctx.lineWidth = invZoom * (constraint === 'y' ? 2 : 1);
        ctx.stroke();
    }

    // ========================================
    // Wall preview (for WallTool)
    // ========================================
    drawWallPreview(allPoints, thickness, maxSegmentLength) {
        if (allPoints.length < 1) return;

        const ctx = this.editor.ctx;
        const invZoom = 1 / this.editor.camera.zoom;
        const halfThickness = thickness / 2;

        // Draw centerline
        ctx.beginPath();
        ctx.moveTo(allPoints[0].x, allPoints[0].y);
        for (let i = 1; i < allPoints.length; i++) {
            ctx.lineTo(allPoints[i].x, allPoints[i].y);
        }
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.6)';
        ctx.lineWidth = invZoom * 1.5;
        ctx.setLineDash([invZoom * 4, invZoom * 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw thickness preview
        if (allPoints.length >= 2) {
            const outline = this._computeWallOutline(allPoints, halfThickness);
            if (outline.length > 0) {
                ctx.beginPath();
                ctx.moveTo(outline[0].x, outline[0].y);
                for (let i = 1; i < outline.length; i++) {
                    ctx.lineTo(outline[i].x, outline[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(251, 146, 60, 0.15)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(251, 146, 60, 0.5)';
                ctx.lineWidth = invZoom;
                ctx.stroke();
            }
        }

        // Draw points
        for (const p of allPoints) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, invZoom * 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fb923c';
            ctx.fill();
        }
    }

    _computeWallOutline(points, halfThickness) {
        if (points.length < 2) return [];

        const left = [];
        const right = [];

        for (let i = 0; i < points.length; i++) {
            const curr = points[i];
            const prev = i > 0 ? points[i - 1] : null;
            const next = i < points.length - 1 ? points[i + 1] : null;

            let nx, ny;
            if (!prev) {
                const dx = next.x - curr.x, dy = next.y - curr.y;
                const len = Math.hypot(dx, dy);
                nx = -dy / len; ny = dx / len;
            } else if (!next) {
                const dx = curr.x - prev.x, dy = curr.y - prev.y;
                const len = Math.hypot(dx, dy);
                nx = -dy / len; ny = dx / len;
            } else {
                const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
                const d2x = next.x - curr.x, d2y = next.y - curr.y;
                const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
                const tx = d1x / l1 + d2x / l2, ty = d1y / l1 + d2y / l2;
                const tl = Math.hypot(tx, ty);
                if (tl < 0.001) { nx = -d1y / l1; ny = d1x / l1; }
                else {
                    nx = -ty / tl; ny = tx / tl;
                    const dot = nx * (-d1y / l1) + ny * (d1x / l1);
                    const s = Math.min(1 / dot, 2.0);
                    nx *= s; ny *= s;
                }
            }

            left.push({ x: curr.x + nx * halfThickness, y: curr.y + ny * halfThickness });
            right.push({ x: curr.x - nx * halfThickness, y: curr.y - ny * halfThickness });
        }

        return [...left, ...right.reverse()];
    }

    // ========================================
    // Off-mesh preview
    // ========================================
    drawOffMeshPreview(start, end) {
        const ctx = this.editor.ctx;
        const invZoom = 1 / this.editor.camera.zoom;

        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        ctx.lineTo(end[0], end[1]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = invZoom * 2;
        ctx.setLineDash([invZoom * 5, invZoom * 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(start[0], start[1], invZoom * 5, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(end[0], end[1], invZoom * 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.fill();
    }

    // ========================================
    // Rectangle preview (for ObstacleTool)
    // ========================================
    drawRectPreview(x1, y1, x2, y2) {
        const ctx = this.editor.ctx;
        const invZoom = 1 / this.editor.camera.zoom;

        ctx.beginPath();
        ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.7)';
        ctx.lineWidth = invZoom * 1.5;
        ctx.setLineDash([invZoom * 4, invZoom * 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(233, 69, 96, 0.1)';
        ctx.fill();
    }
}
