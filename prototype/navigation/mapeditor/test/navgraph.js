// navgraph.js - Generazione del visibility graph

import { state, config } from './state.js';
import {
    offsetPolygon,
    simplifyContour,
    ensureCCW,
    pointsClose,
    segmentsIntersect,
    isPointWalkable
} from './geometry.js';

function checkVisibility(p1, p2, segments, geometry) {
    for (const seg of segments) {
        if (pointsClose(p1, seg.p1) || pointsClose(p1, seg.p2) ||
            pointsClose(p2, seg.p1) || pointsClose(p2, seg.p2)) {
            continue;
        }

        if (segmentsIntersect(p1, p2, seg.p1, seg.p2)) {
            return false;
        }
    }

    const midPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
    };

    if (!isPointWalkable(midPoint, geometry)) {
        return false;
    }

    return true;
}

export { checkVisibility };

export function generateGraph() {
    if (!state.mapData) {
        console.error('No map data loaded');
        return;
    }

    const startTime = performance.now();
    console.log('Generating Visibility Graph...');

    const agentRadius = config.agentRadius;
    const margin = 0.1;
    const totalOffset = agentRadius + margin;

    let rawOuter = state.mapData.outer.map(p => ({ x: p.x, y: p.y }));
    let rawHoles = (state.mapData.holes || []).map(h => h.map(p => ({ x: p.x, y: p.y })));

    rawOuter = ensureCCW(rawOuter);
    rawHoles = rawHoles.map(h => ensureCCW(h));

    const expandedOuter = offsetPolygon(rawOuter, -totalOffset);
    const expandedHoles = rawHoles.map(h => offsetPolygon(h, totalOffset));

    const simplifyThreshold = config.simplifyThreshold;
    state.processedGeometry.outer = simplifyContour(expandedOuter, simplifyThreshold);
    state.processedGeometry.holes = expandedHoles.map(h => simplifyContour(h, simplifyThreshold));

    let nodes = [];
    let nodeIdCounter = 0;

    // Offset nodes slightly inward from polygon edges to avoid boundary issues
    const nodeInwardOffset = 2.0;

    const addNodesFromPoly = (poly, isHole = false) => {
        for (let i = 0; i < poly.length; i++) {
            const prev = poly[(i - 1 + poly.length) % poly.length];
            const curr = poly[i];
            const next = poly[(i + 1) % poly.length];

            // Calculate inward normal at this vertex
            const edge1 = { x: curr.x - prev.x, y: curr.y - prev.y };
            const edge2 = { x: next.x - curr.x, y: next.y - curr.y };
            const len1 = Math.hypot(edge1.x, edge1.y);
            const len2 = Math.hypot(edge2.x, edge2.y);

            if (len1 < 0.001 || len2 < 0.001) {
                nodes.push({ id: nodeIdCounter++, x: curr.x, y: curr.y, neighbors: [] });
                continue;
            }

            // Normals pointing inward (for outer poly: positive, for holes: negative)
            const sign = isHole ? 1 : -1;
            const n1 = { x: sign * edge1.y / len1, y: sign * -edge1.x / len1 };
            const n2 = { x: sign * edge2.y / len2, y: sign * -edge2.x / len2 };

            // Average normal
            let nx = n1.x + n2.x;
            let ny = n1.y + n2.y;
            const nlen = Math.hypot(nx, ny);

            if (nlen > 0.001) {
                nx /= nlen;
                ny /= nlen;
            } else {
                nx = n1.x;
                ny = n1.y;
            }

            // Offset the node position inward
            nodes.push({
                id: nodeIdCounter++,
                x: curr.x + nx * nodeInwardOffset,
                y: curr.y + ny * nodeInwardOffset,
                neighbors: []
            });
        }
    };

    addNodesFromPoly(state.processedGeometry.outer, false);
    state.processedGeometry.holes.forEach(h => addNodesFromPoly(h, true));

    console.log(`Extracted ${nodes.length} nodes.`);

    let edges = [];
    let currentNodeIndex = 0;

    const addContourEdges = (poly) => {
        const numVertices = poly.length;
        if (numVertices < 2) {
            currentNodeIndex += numVertices;
            return;
        }

        for (let i = 0; i < numVertices; i++) {
            const idxA = currentNodeIndex + i;
            const idxB = currentNodeIndex + ((i + 1) % numVertices);

            const nodeA = nodes[idxA];
            const nodeB = nodes[idxB];

            const dist = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);

            edges.push({ from: nodeA, to: nodeB, cost: dist });
            nodeA.neighbors.push({ node: nodeB, cost: dist });
            nodeB.neighbors.push({ node: nodeA, cost: dist });
        }

        currentNodeIndex += numVertices;
    };

    addContourEdges(state.processedGeometry.outer);
    state.processedGeometry.holes.forEach(h => addContourEdges(h));

    const blockingSegments = [];
    const addSegments = (poly) => {
        for (let i = 0; i < poly.length; i++) {
            blockingSegments.push({
                p1: poly[i],
                p2: poly[(i + 1) % poly.length]
            });
        }
    };
    addSegments(state.processedGeometry.outer);
    state.processedGeometry.holes.forEach(h => addSegments(h));

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];

            const dist = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);

            if (checkVisibility(nodeA, nodeB, blockingSegments, state.processedGeometry)) {
                edges.push({ from: nodeA, to: nodeB, cost: dist });
                nodeA.neighbors.push({ node: nodeB, cost: dist });
                nodeB.neighbors.push({ node: nodeA, cost: dist });
            }
        }
    }

    state.visibilityGraph = { nodes, edges };

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
    console.log(`Graph generated: ${nodes.length} nodes, ${edges.length} edges in ${elapsed}s`);
}
