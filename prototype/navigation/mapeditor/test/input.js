// input.js - Gestione input mouse/tastiera

import { state, camera, inputState } from './state.js';
import { isPointInPolygon, isPointWalkable, getClosestPointOnSegment, getPolygonCentroid } from './geometry.js';
import { spawnAgent } from './agents.js';
import { calculatePathForAgent } from './pathfinding.js';
import { getFormationPositions, assignTargetsIdeally } from './formation.js';
import { render } from './renderer.js';

export function getWorldPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
}

export function screenToWorld(x, y) {
    return {
        x: (x - camera.offsetX) / camera.zoom,
        y: (y - camera.offsetY) / camera.zoom
    };
}

export function getValidTarget(clickPos) {
    let clickedHoleIndex = -1;
    if (state.mapData.holes) {
        for (let i = 0; i < state.mapData.holes.length; i++) {
            if (isPointInPolygon(clickPos.x, clickPos.y, state.mapData.holes[i])) {
                clickedHoleIndex = i;
                break;
            }
        }
    }

    if (clickedHoleIndex === -1) {
        return { pos: clickPos, type: 'move' };
    }

    const expandedPoly = state.processedGeometry.holes[clickedHoleIndex];

    let bestPoint = null;
    let minDistSq = Infinity;
    const SAFETY_PADDING = 2.0;

    for (let i = 0; i < expandedPoly.length; i++) {
        const p1 = expandedPoly[i];
        const p2 = expandedPoly[(i + 1) % expandedPoly.length];

        const proj = getClosestPointOnSegment(clickPos, p1, p2);
        const distSq = (proj.x - clickPos.x) ** 2 + (proj.y - clickPos.y) ** 2;

        if (distSq < minDistSq) {
            minDistSq = distSq;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);

            const nx = dy / len;
            const ny = -dx / len;

            bestPoint = {
                x: proj.x + nx * SAFETY_PADDING,
                y: proj.y + ny * SAFETY_PADDING
            };
        }
    }

    return {
        pos: bestPoint,
        type: 'attack',
        targetId: clickedHoleIndex
    };
}

export function handleMouseDown(e, canvas) {
    if (e.button === 0 && e.shiftKey) {
        const w = getWorldPos(e, canvas);
        spawnAgent(w.x, w.y);
        render(canvas);
        return;
    }
    if (e.button === 1 || (e.button === 0 && inputState.spacePressed)) {
        inputState.isPanning = true;
        inputState.panStart = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    }
}

export function handleMouseMove(e, canvas) {
    if (inputState.isPanning) {
        camera.offsetX += e.clientX - inputState.panStart.x;
        camera.offsetY += e.clientY - inputState.panStart.y;
        inputState.panStart = { x: e.clientX, y: e.clientY };
        render(canvas);
    }
}

export function handleMouseUp(e, canvas) {
    inputState.isPanning = false;
    canvas.style.cursor = inputState.spacePressed ? 'grab' : 'default';
}

export function handleWheel(e, canvas) {
    if (e.altKey) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        camera.zoom *= factor;
        render(canvas);
    }
}

export function handleKeyDown(e, canvas) {
    if (e.code === 'Space') {
        inputState.spacePressed = true;
        canvas.style.cursor = 'grab';
    }
}

export function handleKeyUp(e, canvas) {
    if (e.code === 'Space') {
        inputState.spacePressed = false;
        canvas.style.cursor = 'default';
    }
}

export function handleRightClick(e, canvas) {
    e.preventDefault();
    if (state.agents.length === 0) return;

    const w = getWorldPos(e, canvas);
    const targetInfo = getValidTarget(w);

    let formationPoints = [];
    const AGENT_SPACING = 30;

    if (targetInfo.type === 'attack') {
        const holePoly = state.mapData.holes[targetInfo.targetId];
        const obstacleCenter = getPolygonCentroid(holePoly);
        let radiusSum = 0;
        holePoly.forEach(p => radiusSum += Math.hypot(p.x - obstacleCenter.x, p.y - obstacleCenter.y));
        const avgRadius = radiusSum / holePoly.length;

        formationPoints = getFormationPositions(
            obstacleCenter,
            state.agents.length,
            AGENT_SPACING,
            'attack',
            avgRadius
        );

    } else {
        formationPoints = getFormationPositions(
            targetInfo.pos,
            state.agents.length,
            AGENT_SPACING,
            'move'
        );
    }

    formationPoints = formationPoints.map(p => {
        if (isPointWalkable(p, state.processedGeometry)) {
            return p;
        } else {
            const fix = getValidTarget(p);
            return fix.pos;
        }
    });

    const assignments = assignTargetsIdeally(state.agents, formationPoints);

    assignments.forEach(assignment => {
        calculatePathForAgent(assignment.agent, assignment.target);
    });

    render(canvas);
}

export function bindEvents(canvas) {
    canvas.addEventListener('mousedown', (e) => handleMouseDown(e, canvas));
    canvas.addEventListener('contextmenu', (e) => handleRightClick(e, canvas));
    canvas.addEventListener('mousemove', (e) => handleMouseMove(e, canvas));
    canvas.addEventListener('mouseup', (e) => handleMouseUp(e, canvas));
    canvas.addEventListener('wheel', (e) => handleWheel(e, canvas), { passive: false });
    window.addEventListener('keydown', (e) => handleKeyDown(e, canvas));
    window.addEventListener('keyup', (e) => handleKeyUp(e, canvas));
}
