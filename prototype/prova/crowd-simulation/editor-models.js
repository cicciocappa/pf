// ========================================
// editor-models.js
// Building, Wall, Obstacle, Boundary, ConnectionManager, EditorData
// ========================================

import { GeometryFactory, pointInPolygon, pointInPolygonArray, distPointToSegment, lineLineIntersection, normalize } from './editor-geometry.js';

// ========================================
// Building
// ========================================
export class Building {
    constructor(data = {}) {
        this.id = data.id;
        // buildingType: tipo dell'edificio (corrisponde alla cartella GLTF)
        this.buildingType = data.buildingType || data.templateId || 'GUARD_TOWER';
        this.type = 'building';
        this.label = data.label || '';
        this.position = data.position || { x: 0, y: 0 };
        this.rotation = data.rotation || 0;
        // Scala uniforme (singolo valore applicato a tutte le dimensioni)
        this.scale = data.scale || data.scaleX || 5;
        this.vertices = data.vertices ? [...data.vertices] : [];
        this.baseVertices = [];

        if (this.vertices.length === 0) {
            this.regenerateBase();
        }
    }

    containsPoint(x, y) {
        return pointInPolygon(x, y, this.vertices);
    }

    getTemplateVertices() {
        return GeometryFactory.getTemplate(this.buildingType);
    }

    regenerateBase() {
        const localTemplate = this.getTemplateVertices();
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);

        this.baseVertices = localTemplate.map((v, index) => {
            // Scala uniforme
            let x = v.x * this.scale;
            let y = v.y * this.scale;
            const vertexId = `v_${index}`;
            return {
                id: vertexId,
                edgeId: `e_${vertexId}`,
                x: (x * cos - y * sin) + this.position.x,
                y: (x * sin + y * cos) + this.position.y
            };
        });

        this.vertices = this.baseVertices.map(v => ({ ...v }));
    }

    translate(dx, dy) {
        this.position.x += dx;
        this.position.y += dy;
        this.vertices.forEach(v => { v.x += dx; v.y += dy; });
        if (this.baseVertices) {
            this.baseVertices.forEach(v => { v.x += dx; v.y += dy; });
        }
    }

    getCenter() {
        if (this.vertices.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const v of this.vertices) { cx += v.x; cy += v.y; }
        return { x: cx / this.vertices.length, y: cy / this.vertices.length };
    }

    toJSON() {
        return {
            id: this.id,
            buildingType: this.buildingType,
            label: this.label,
            position: { ...this.position },
            rotation: this.rotation,
            scale: this.scale,
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y }))
        };
    }

    static fromJSON(json) {
        return new Building({
            id: json.id,
            // Retrocompatibilità: supporta sia buildingType che templateId
            buildingType: json.buildingType || json.templateId,
            label: json.label,
            position: json.position,
            rotation: json.rotation,
            // Retrocompatibilità: supporta sia scale che scaleX
            scale: json.scale || json.scaleX
        });
    }
}

// ========================================
// Wall
// ========================================
export class Wall {
    constructor(options = {}) {
        this.id = options.id;
        this.points = options.points || [];
        this.thickness = options.thickness || 2;
        this.maxSegmentLength = options.maxSegmentLength || 3;
        this.type = 'wall';
        this.label = options.label || '';
        this.units = [];
        this.startCapOverride = null;
        this.endCapOverride = null;
    }

    updateVertices() {
        if (this.points.length < 2) {
            this.units = [];
            return;
        }
        this.units = this.generateDestructibleUnits();
    }

    containsPoint(x, y) {
        const outline = this.getOutline();
        if (outline.length < 3) return false;
        return pointInPolygon(x, y, outline);
    }

    generateDestructibleUnits() {
        const units = [];
        const halfThickness = this.thickness / 2;
        const miterPoints = this.calculateThicknessPoints();

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            const p1Eff = (i === 0 && this.startCapOverride) ?
                {
                    x: (this.startCapOverride.left.x + this.startCapOverride.right.x) / 2,
                    y: (this.startCapOverride.left.y + this.startCapOverride.right.y) / 2
                } : p1;

            const p2Eff = (i === this.points.length - 2 && this.endCapOverride) ?
                {
                    x: (this.endCapOverride.left.x + this.endCapOverride.right.x) / 2,
                    y: (this.endCapOverride.left.y + this.endCapOverride.right.y) / 2
                } : p2;

            const dxEff = p2Eff.x - p1Eff.x;
            const dyEff = p2Eff.y - p1Eff.y;
            const lengthEff = Math.sqrt(dxEff * dxEff + dyEff * dyEff);

            if (lengthEff < 0.1) continue;

            const segmentDx = p2.x - p1.x;
            const segmentDy = p2.y - p1.y;
            const segmentLen = Math.sqrt(segmentDx * segmentDx + segmentDy * segmentDy);
            const normal = { x: -segmentDy / segmentLen, y: segmentDx / segmentLen };

            const numSubdivisions = Math.ceil(lengthEff / this.maxSegmentLength);

            const getCutLine = (t, isWallStart, isWallEnd) => {
                if (t <= 0 && isWallStart && this.startCapOverride) {
                    return { L: this.startCapOverride.left, R: this.startCapOverride.right };
                }
                if (t >= 1 && isWallEnd && this.endCapOverride) {
                    return { L: this.endCapOverride.left, R: this.endCapOverride.right };
                }
                if (t <= 0) return { L: miterPoints[i].left, R: miterPoints[i].right };
                if (t >= 1) return { L: miterPoints[i + 1].left, R: miterPoints[i + 1].right };

                const centerPos = {
                    x: p1Eff.x + dxEff * t,
                    y: p1Eff.y + dyEff * t
                };
                return {
                    L: { x: centerPos.x + normal.x * halfThickness, y: centerPos.y + normal.y * halfThickness },
                    R: { x: centerPos.x - normal.x * halfThickness, y: centerPos.y - normal.y * halfThickness }
                };
            };

            for (let j = 0; j < numSubdivisions; j++) {
                const tStart = j / numSubdivisions;
                const tEnd = (j + 1) / numSubdivisions;
                const isAtAbsoluteStart = (i === 0 && j === 0);
                const isAtAbsoluteEnd = (i === this.points.length - 2 && j === numSubdivisions - 1);

                const startLine = getCutLine(tStart, isAtAbsoluteStart, false);
                const endLine = getCutLine(tEnd, false, isAtAbsoluteEnd);

                units.push({
                    id: `${this.id}_u${units.length}`,
                    vertices: [
                        { ...startLine.L },
                        { ...endLine.L },
                        { ...endLine.R },
                        { ...startLine.R }
                    ]
                });
            }
        }
        return units;
    }

    calculateThicknessPoints() {
        const result = [];
        const halfThickness = this.thickness / 2;

        for (let i = 0; i < this.points.length; i++) {
            const curr = this.points[i];
            const prev = this.points[i - 1];
            const next = this.points[i + 1];
            let normal = this.getMiterNormal(prev, curr, next);

            result.push({
                center: curr,
                left: { x: curr.x + normal.x * halfThickness, y: curr.y + normal.y * halfThickness },
                right: { x: curr.x - normal.x * halfThickness, y: curr.y - normal.y * halfThickness }
            });
        }
        return result;
    }

    getMiterNormal(prev, curr, next) {
        if (!prev) {
            const dir = this._normalize({ x: next.x - curr.x, y: next.y - curr.y });
            return { x: -dir.y, y: dir.x };
        }
        if (!next) {
            const dir = this._normalize({ x: curr.x - prev.x, y: curr.y - prev.y });
            return { x: -dir.y, y: dir.x };
        }

        const dir1 = this._normalize({ x: curr.x - prev.x, y: curr.y - prev.y });
        const dir2 = this._normalize({ x: next.x - curr.x, y: next.y - curr.y });
        const tangent = this._normalize({ x: dir1.x + dir2.x, y: dir1.y + dir2.y });
        const miterNormal = { x: -tangent.y, y: tangent.x };

        const dot = miterNormal.x * (-dir1.y) + miterNormal.y * dir1.x;
        const length = Math.min(1 / dot, 2.0);

        return { x: miterNormal.x * length, y: miterNormal.y * length };
    }

    _normalize(v) {
        const l = Math.sqrt(v.x * v.x + v.y * v.y);
        return l < 0.0001 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
    }

    getOutline() {
        if (this.points.length < 2) return [];
        const thicknessPoints = this.calculateThicknessPoints();
        const outline = [];

        for (let i = 0; i < thicknessPoints.length; i++) {
            if (i === 0 && this.startCapOverride) {
                outline.push({ x: this.startCapOverride.left.x, y: this.startCapOverride.left.y });
            } else if (i === thicknessPoints.length - 1 && this.endCapOverride) {
                outline.push({ x: this.endCapOverride.left.x, y: this.endCapOverride.left.y });
            } else {
                outline.push({ x: thicknessPoints[i].left.x, y: thicknessPoints[i].left.y });
            }
        }

        for (let i = thicknessPoints.length - 1; i >= 0; i--) {
            if (i === thicknessPoints.length - 1 && this.endCapOverride) {
                outline.push({ x: this.endCapOverride.right.x, y: this.endCapOverride.right.y });
            } else if (i === 0 && this.startCapOverride) {
                outline.push({ x: this.startCapOverride.right.x, y: this.startCapOverride.right.y });
            } else {
                outline.push({ x: thicknessPoints[i].right.x, y: thicknessPoints[i].right.y });
            }
        }

        return outline;
    }

    getOutlineDetailed() {
        if (this.units.length === 0) return this.getOutline();
        const outline = [];

        for (let i = 0; i < this.units.length; i++) {
            outline.push({ x: this.units[i].vertices[0].x, y: this.units[i].vertices[0].y });
        }
        const lastUnit = this.units[this.units.length - 1];
        outline.push({ x: lastUnit.vertices[1].x, y: lastUnit.vertices[1].y });

        outline.push({ x: lastUnit.vertices[2].x, y: lastUnit.vertices[2].y });
        for (let i = this.units.length - 1; i >= 0; i--) {
            outline.push({ x: this.units[i].vertices[3].x, y: this.units[i].vertices[3].y });
        }

        return outline;
    }

    translate(dx, dy) {
        this.points.forEach(p => { p.x += dx; p.y += dy; });
        this.updateVertices();
    }

    getCenter() {
        if (this.points.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const p of this.points) { cx += p.x; cy += p.y; }
        return { x: cx / this.points.length, y: cy / this.points.length };
    }

    toJSON() {
        return {
            id: this.id,
            label: this.label,
            points: this.points.map(p => ({ ...p })),
            thickness: this.thickness,
            maxSegmentLength: this.maxSegmentLength
        };
    }

    static fromJSON(json) {
        const points = (json.points || []).map(p => ({
            id: p.id, edgeId: p.edgeId,
            x: p.x, y: p.y
        }));
        return new Wall({
            id: json.id, label: json.label,
            points: points,
            thickness: json.thickness,
            maxSegmentLength: json.maxSegmentLength
        });
    }
}

// ========================================
// Obstacle
// ========================================
export class Obstacle {
    constructor(data = {}) {
        this.id = data.id;
        this.type = 'obstacle';
        this.vertices = data.vertices || [];
    }

    containsPoint(x, y) {
        return pointInPolygon(x, y, this.vertices);
    }

    translate(dx, dy) {
        this.vertices.forEach(v => { v.x += dx; v.y += dy; });
    }

    getCenter() {
        if (this.vertices.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const v of this.vertices) { cx += v.x; cy += v.y; }
        return { x: cx / this.vertices.length, y: cy / this.vertices.length };
    }

    toJSON() {
        return {
            id: this.id,
            vertices: this.vertices.map(v => ({ x: v.x, y: v.y }))
        };
    }

    static fromJSON(json) {
        return new Obstacle({
            id: json.id,
            vertices: (json.vertices || []).map(v => ({ x: v.x, y: v.y }))
        });
    }
}

// ========================================
// Boundary
// ========================================
export class Boundary {
    constructor(data = {}) {
        this.id = data.id;
        this.type = 'boundary';
        this.vertices = data.vertices || []; // [[x,y], ...]
    }

    containsPoint(x, y) {
        return pointInPolygonArray(x, y, this.vertices);
    }

    translate(dx, dy) {
        this.vertices.forEach(v => { v[0] += dx; v[1] += dy; });
    }

    getCenter() {
        if (this.vertices.length === 0) return { x: 0, y: 0 };
        let cx = 0, cy = 0;
        for (const v of this.vertices) { cx += v[0]; cy += v[1]; }
        return { x: cx / this.vertices.length, y: cy / this.vertices.length };
    }

    toJSON() {
        return { id: this.id, vertices: this.vertices.map(v => [...v]) };
    }

    static fromJSON(json) {
        return new Boundary({
            id: json.id,
            vertices: (json.vertices || []).map(v => [...v])
        });
    }
}

// ========================================
// ConnectionManager
// ========================================
export class ConnectionManager {
    constructor(editorData) {
        this.editorData = editorData;
    }

    add(conn) {
        this.editorData.connections.push(conn);
        this.editorData.updateAllGeometry();
    }

    resolveAll() {
        this.editorData.walls.forEach(w => {
            w.startCapOverride = null;
            w.endCapOverride = null;
        });

        for (const conn of this.editorData.connections) {
            switch (conn.type) {
                case 'WALL_TO_BUILDING_VERTEX': {
                    const bldg = this.editorData.buildings.get(conn.targetId);
                    if (bldg) this._resolveWallToBuildingVertex(conn, bldg);
                    break;
                }
                case 'WALL_TO_EDGE':
                    this._resolveWallToEdge(conn);
                    break;
                case 'WALL_TO_WALL_EDGE': {
                    const targetWall = this.editorData.walls.get(conn.targetId);
                    if (targetWall) this._resolveWallToWallEdge(conn, targetWall);
                    break;
                }
                case 'WALL_TO_WALL_VERTEX':
                    this._resolveWallToWallVertex(conn);
                    break;
            }
        }
    }

    _resolveWallToBuildingVertex(conn, bldg) {
        const wall = this.editorData.walls.get(conn.wallId);
        if (!wall) return;

        const vIdx = bldg.vertices.findIndex(v => v.id === conn.targetVertexId);
        if (vIdx === -1) return;

        const vertices = bldg.vertices;
        const vCurr = vertices[vIdx];
        const vPrev = vertices[(vIdx - 1 + vertices.length) % vertices.length];
        const vNext = vertices[(vIdx + 1) % vertices.length];

        const dirToPrev = this._normalize({ x: vPrev.x - vCurr.x, y: vPrev.y - vCurr.y });
        const dirToNext = this._normalize({ x: vNext.x - vCurr.x, y: vNext.y - vCurr.y });

        const isStart = conn.wallEnd === 'start';
        const pTarget = isStart ? wall.points[0] : wall.points[wall.points.length - 1];
        const pAdj = isStart ? wall.points[1] : wall.points[wall.points.length - 2];

        const projDir = this._normalize({ x: pTarget.x - pAdj.x, y: pTarget.y - pAdj.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = wall.thickness / 2;

        const leftLinePoint = { x: pTarget.x + wallNormal.x * hT, y: pTarget.y + wallNormal.y * hT };
        const rightLinePoint = { x: pTarget.x - wallNormal.x * hT, y: pTarget.y - wallNormal.y * hT };

        const L_on_Prev = lineLineIntersection(leftLinePoint, projDir, vCurr, dirToPrev);
        const L_on_Next = lineLineIntersection(leftLinePoint, projDir, vCurr, dirToNext);
        const R_on_Prev = lineLineIntersection(rightLinePoint, projDir, vCurr, dirToPrev);
        const R_on_Next = lineLineIntersection(rightLinePoint, projDir, vCurr, dirToNext);

        let intersectPrev, intersectNext, finalLeft, finalRight;

        if (L_on_Prev && R_on_Next) {
            intersectPrev = L_on_Prev;
            intersectNext = R_on_Next;
            finalLeft = L_on_Prev;
            finalRight = R_on_Next;
        } else {
            intersectPrev = R_on_Prev;
            intersectNext = L_on_Next;
            finalLeft = L_on_Next;
            finalRight = R_on_Prev;
        }

        if (intersectPrev && intersectNext) {
            const newV1 = { ...intersectPrev, id: `${vCurr.id}_bevel_L` };
            const newV2 = { ...intersectNext, id: `${vCurr.id}_bevel_R` };
            vertices.splice(vIdx, 1, newV1, newV2);

            if (isStart) {
                wall.startCapOverride = { left: finalRight, right: finalLeft };
                wall.points[0].x = (finalLeft.x + finalRight.x) / 2;
                wall.points[0].y = (finalLeft.y + finalRight.y) / 2;
            } else {
                wall.endCapOverride = { left: finalLeft, right: finalRight };
                wall.points[wall.points.length - 1].x = (finalLeft.x + finalRight.x) / 2;
                wall.points[wall.points.length - 1].y = (finalLeft.y + finalRight.y) / 2;
            }
        }
    }

    _resolveWallToEdge(conn) {
        const incomingWall = this.editorData.walls.get(conn.wallId);
        if (!incomingWall) return;

        let targetPoints = [];
        if (conn.targetType === 'building') {
            const b = this.editorData.buildings.get(conn.targetId);
            if (b) targetPoints = b.vertices;
        } else if (conn.targetType === 'obstacle') {
            const o = this.editorData.obstacles.get(conn.targetId);
            if (o) targetPoints = o.vertices;
        } else if (conn.targetType === 'boundary') {
            const bd = this.editorData.getBoundaryById(conn.targetId);
            if (bd) targetPoints = bd.vertices.map((v, i) => ({ x: v[0], y: v[1], id: `v_${i}` }));
        }

        if (targetPoints.length === 0) return;

        const p1Idx = targetPoints.findIndex(p => `e_${p.id}` === conn.targetEdgeId);
        if (p1Idx === -1) return;

        const p1 = targetPoints[p1Idx];
        const p2 = targetPoints[(p1Idx + 1) % targetPoints.length];

        const edgeDir = this._normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
        const isStart = (conn.wallEnd === 'start');
        const pA = isStart ? incomingWall.points[0] : incomingWall.points[incomingWall.points.length - 1];
        const pB = isStart ? incomingWall.points[1] : incomingWall.points[incomingWall.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incomingWall.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        const intersectL = lineLineIntersection(pL, projDir, p1, edgeDir);
        const intersectR = lineLineIntersection(pR, projDir, p1, edgeDir);

        if (intersectL && intersectR) {
            const override = isStart ?
                { left: intersectR, right: intersectL } :
                { left: intersectL, right: intersectR };
            if (isStart) incomingWall.startCapOverride = override;
            else incomingWall.endCapOverride = override;
        }
    }

    _resolveWallToWallEdge(conn, targetWall) {
        const incomingWall = this.editorData.walls.get(conn.wallId);
        if (!incomingWall) return;

        const p1Idx = targetWall.points.findIndex(p => `e_${p.id}` === conn.targetEdgeId);
        if (p1Idx === -1) return;

        const tP1 = targetWall.points[p1Idx];
        const tP2 = targetWall.points[p1Idx + 1];

        const tDir = this._normalize({ x: tP2.x - tP1.x, y: tP2.y - tP1.y });
        const tNormal = { x: -tDir.y, y: tDir.x };
        const tHalfThickness = targetWall.thickness / 2;

        const sideSign = (conn.targetSide === 'left') ? 1 : -1;
        const boundaryPoint = {
            x: tP1.x + tNormal.x * tHalfThickness * sideSign,
            y: tP1.y + tNormal.y * tHalfThickness * sideSign
        };

        const isStart = (conn.wallEnd === 'start');
        const pA = isStart ? incomingWall.points[0] : incomingWall.points[incomingWall.points.length - 1];
        const pB = isStart ? incomingWall.points[1] : incomingWall.points[incomingWall.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incomingWall.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        const intersectL = lineLineIntersection(pL, projDir, boundaryPoint, tDir);
        const intersectR = lineLineIntersection(pR, projDir, boundaryPoint, tDir);

        if (intersectL && intersectR) {
            if (isStart) {
                incomingWall.startCapOverride = { left: intersectR, right: intersectL };
                incomingWall.points[0].x = (intersectL.x + intersectR.x) / 2;
                incomingWall.points[0].y = (intersectL.y + intersectR.y) / 2;
            } else {
                incomingWall.endCapOverride = { left: intersectL, right: intersectR };
                incomingWall.points[incomingWall.points.length - 1].x = (intersectL.x + intersectR.x) / 2;
                incomingWall.points[incomingWall.points.length - 1].y = (intersectL.y + intersectR.y) / 2;
            }
        }
    }

    _resolveWallToWallVertex(conn) {
        let wallA = this.editorData.walls.get(conn.wallId);
        let wallB = this.editorData.walls.get(conn.targetWallId);
        if (!wallA || !wallB) return;

        let target = wallA.thickness >= wallB.thickness ? wallA : wallB;
        let incoming = wallA.thickness >= wallB.thickness ? wallB : wallA;
        let targetEnd = (target === wallA) ? conn.wallEnd : conn.targetWallEnd;
        let incomingEnd = (target === wallA) ? conn.targetWallEnd : conn.wallEnd;

        const targetCap = this._getWallCapVertices(target, targetEnd);
        const v1 = targetCap.left;
        const v2 = targetCap.right;
        const edgeDir = this._normalize({ x: v2.x - v1.x, y: v2.y - v1.y });

        const isStartInc = (incomingEnd === 'start');
        const pA = isStartInc ? incoming.points[0] : incoming.points[incoming.points.length - 1];
        const pB = isStartInc ? incoming.points[1] : incoming.points[incoming.points.length - 2];

        const projDir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const wallNormal = { x: -projDir.y, y: projDir.x };
        const hT = incoming.thickness / 2;

        const pL = { x: pA.x + wallNormal.x * hT, y: pA.y + wallNormal.y * hT };
        const pR = { x: pA.x - wallNormal.x * hT, y: pA.y - wallNormal.y * hT };

        const intersectL = lineLineIntersection(pL, projDir, v1, edgeDir);
        const intersectR = lineLineIntersection(pR, projDir, v1, edgeDir);

        if (intersectL && intersectR) {
            const override = isStartInc ?
                { left: intersectR, right: intersectL } :
                { left: intersectL, right: intersectR };
            if (isStartInc) incoming.startCapOverride = override;
            else incoming.endCapOverride = override;
        }
    }

    _getWallCapVertices(wall, end) {
        const isStart = (end === 'start');
        const pA = isStart ? wall.points[0] : wall.points[wall.points.length - 1];
        const pB = isStart ? wall.points[1] : wall.points[wall.points.length - 2];

        const dir = this._normalize({ x: pA.x - pB.x, y: pA.y - pB.y });
        const norm = { x: -dir.y, y: dir.x };
        const hT = wall.thickness / 2;

        return {
            left: { x: pA.x + norm.x * hT, y: pA.y + norm.y * hT },
            right: { x: pA.x - norm.x * hT, y: pA.y - norm.y * hT }
        };
    }

    _normalize(v) {
        const l = Math.sqrt(v.x * v.x + v.y * v.y);
        return l < 0.0001 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
    }
}

// ========================================
// EditorData
// ========================================
export class EditorData {
    constructor() {
        this.boundaries = [];
        this.buildings = new Map();
        this.walls = new Map();
        this.obstacles = new Map();
        this.offMeshLinks = [];
        this.seedPoints = [];
        this.startingPosition = null; // [x, y] or null
        this.connections = [];
        this.connectionManager = new ConnectionManager(this);

        this._idCounter = 0;

        // Snap cache
        this._cachedVertices = [];
        this._cachedEdges = [];
        this._snapCacheDirty = true;
    }

    generateId(prefix) {
        return `${prefix}_${++this._idCounter}`;
    }

    // --- CRUD ---

    addBoundary(boundary) {
        this.boundaries.push(boundary);
        this._snapCacheDirty = true;
    }

    removeBoundary(index) {
        this.boundaries.splice(index, 1);
        this._snapCacheDirty = true;
    }

    addBuilding(building) {
        this.buildings.set(building.id, building);
        this._snapCacheDirty = true;
    }

    removeBuilding(id) {
        this.buildings.delete(id);
        this.connections = this.connections.filter(c => c.targetId !== id && c.wallId !== id);
        this._snapCacheDirty = true;
    }

    addWall(wall) {
        this.walls.set(wall.id, wall);
        this._snapCacheDirty = true;
    }

    removeWall(id) {
        this.walls.delete(id);
        this.connections = this.connections.filter(c => c.wallId !== id && c.targetId !== id && c.targetWallId !== id);
        this._snapCacheDirty = true;
    }

    addObstacle(obstacle) {
        this.obstacles.set(obstacle.id, obstacle);
        this._snapCacheDirty = true;
    }

    removeObstacle(id) {
        this.obstacles.delete(id);
        this.connections = this.connections.filter(c => c.targetId !== id);
        this._snapCacheDirty = true;
    }

    getBoundaryById(id) {
        return this.boundaries.find(b => b.id === id) || null;
    }

    // --- Geometry update ---

    updateAllGeometry() {
        // Reset buildings to base
        this.buildings.forEach(b => b.regenerateBase());

        // Resolve connections
        this.connectionManager.resolveAll();

        // Update wall units
        this.walls.forEach(w => w.updateVertices());

        this._snapCacheDirty = true;
    }

    // --- Snap system ---

    _rebuildSnapCache() {
        this._cachedVertices = [];
        this._cachedEdges = [];

        // Buildings
        this.buildings.forEach(bldg => {
            const verts = bldg.vertices;
            for (let i = 0; i < verts.length; i++) {
                this._cachedVertices.push({
                    point: verts[i],
                    type: 'building',
                    targetId: bldg.id,
                    vertexIndex: i,
                    isEndpoint: false
                });

                const next = verts[(i + 1) % verts.length];
                this._cachedEdges.push({
                    p1: verts[i], p2: next,
                    type: 'building',
                    targetId: bldg.id,
                    edgeIndex: i,
                    targetEdgeId: verts[i].edgeId ? `e_${verts[i].id}` : `e_v_${i}`
                });
            }
        });

        // Walls
        this.walls.forEach(wall => {
            for (let i = 0; i < wall.points.length; i++) {
                const p = wall.points[i];
                this._cachedVertices.push({
                    point: p,
                    type: 'wall',
                    targetId: wall.id,
                    vertexIndex: i,
                    isEndpoint: i === 0 || i === wall.points.length - 1,
                    endpointType: i === 0 ? 'start' : (i === wall.points.length - 1 ? 'end' : null)
                });

                if (i < wall.points.length - 1) {
                    this._cachedEdges.push({
                        p1: wall.points[i],
                        p2: wall.points[i + 1],
                        type: 'wall',
                        targetId: wall.id,
                        edgeIndex: i,
                        targetEdgeId: p.edgeId ? `e_${p.id}` : `e_p_${i}`
                    });
                }
            }
        });

        // Obstacles
        this.obstacles.forEach(obs => {
            const verts = obs.vertices;
            for (let i = 0; i < verts.length; i++) {
                this._cachedVertices.push({
                    point: verts[i],
                    type: 'obstacle',
                    targetId: obs.id,
                    vertexIndex: i,
                    isEndpoint: false
                });

                const next = verts[(i + 1) % verts.length];
                this._cachedEdges.push({
                    p1: verts[i], p2: next,
                    type: 'obstacle',
                    targetId: obs.id,
                    edgeIndex: i,
                    targetEdgeId: verts[i].id ? `e_${verts[i].id}` : `e_o_${i}`
                });
            }
        });

        // Boundaries
        for (const bd of this.boundaries) {
            for (let i = 0; i < bd.vertices.length; i++) {
                const v = bd.vertices[i];
                const pt = { x: v[0], y: v[1], id: `v_${i}` };
                this._cachedVertices.push({
                    point: pt,
                    type: 'boundary',
                    targetId: bd.id,
                    vertexIndex: i,
                    isEndpoint: false
                });

                const next = bd.vertices[(i + 1) % bd.vertices.length];
                this._cachedEdges.push({
                    p1: { x: v[0], y: v[1], id: `v_${i}` },
                    p2: { x: next[0], y: next[1], id: `v_${(i + 1) % bd.vertices.length}` },
                    type: 'boundary',
                    targetId: bd.id,
                    edgeIndex: i,
                    targetEdgeId: `e_v_${i}`
                });
            }
        }

        this._snapCacheDirty = false;
    }

    findNearestVertex(x, y, threshold) {
        if (this._snapCacheDirty) this._rebuildSnapCache();

        let best = null;
        let bestDist = threshold;

        for (const entry of this._cachedVertices) {
            const p = entry.point;
            const d = Math.hypot(x - p.x, y - p.y);
            if (d < bestDist) {
                bestDist = d;
                best = entry;
            }
        }

        return best;
    }

    findNearestEdge(x, y, threshold) {
        if (this._snapCacheDirty) this._rebuildSnapCache();

        let best = null;
        let bestDist = threshold;

        for (const entry of this._cachedEdges) {
            const result = distPointToSegment(x, y, entry.p1.x, entry.p1.y, entry.p2.x, entry.p2.y);
            if (result.dist < bestDist) {
                bestDist = result.dist;
                best = {
                    ...entry,
                    point: { x: result.x, y: result.y },
                    edge: { p1: entry.p1, p2: entry.p2 },
                    t: result.t
                };
            }
        }

        return best;
    }

    findObjectAt(x, y) {
        // Check buildings first
        for (const [id, bldg] of this.buildings) {
            if (bldg.containsPoint(x, y)) return bldg;
        }
        // Check walls
        for (const [id, wall] of this.walls) {
            if (wall.containsPoint(x, y)) return wall;
        }
        // Check obstacles
        for (const [id, obs] of this.obstacles) {
            if (obs.containsPoint(x, y)) return obs;
        }
        return null;
    }

    // --- Serialization ---

    toJSON() {
        return {
            boundaries: this.boundaries.map(b => b.toJSON()),
            buildings: [...this.buildings.values()].map(b => b.toJSON()),
            walls: [...this.walls.values()].map(w => w.toJSON()),
            obstacles: [...this.obstacles.values()].map(o => o.toJSON()),
            offMeshLinks: this.offMeshLinks.map(l => ({ ...l })),
            seedPoints: this.seedPoints.map(p => [...p]),
            startingPosition: this.startingPosition ? [...this.startingPosition] : null,
            connections: JSON.parse(JSON.stringify(this.connections)),
            _idCounter: this._idCounter
        };
    }

    fromJSON(data) {
        this.clear();

        this._idCounter = data._idCounter || 0;

        if (data.boundaries) {
            for (const bd of data.boundaries) {
                this.boundaries.push(Boundary.fromJSON(bd));
            }
        }

        if (data.buildings) {
            for (const b of data.buildings) {
                const bldg = Building.fromJSON(b);
                this.buildings.set(bldg.id, bldg);
            }
        }

        if (data.walls) {
            for (const w of data.walls) {
                const wall = Wall.fromJSON(w);
                this.walls.set(wall.id, wall);
            }
        }

        if (data.obstacles) {
            for (const o of data.obstacles) {
                const obs = Obstacle.fromJSON(o);
                this.obstacles.set(obs.id, obs);
            }
        }

        this.offMeshLinks = data.offMeshLinks || [];
        this.seedPoints = data.seedPoints || [];
        this.startingPosition = data.startingPosition ? [...data.startingPosition] : null;
        this.connections = data.connections || [];

        this.updateAllGeometry();
    }

    clear() {
        this.boundaries = [];
        this.buildings.clear();
        this.walls.clear();
        this.obstacles.clear();
        this.offMeshLinks = [];
        this.seedPoints = [];
        this.startingPosition = null;
        this.connections = [];
        this._snapCacheDirty = true;
    }
}
