// pathfinding.js - A* e calcolo percorsi

import { state } from './state.js';
import { getBlockingSegments } from './geometry.js';
import { checkVisibility } from './navgraph.js';

function aStar(start, end, nodesCanSeeEnd) {
    const openSet = [start];
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(start, 0);

    const fScore = new Map();
    fScore.set(start, Math.hypot(end.x - start.x, end.y - start.y));

    while (openSet.length > 0) {
        openSet.sort((a, b) => (fScore.get(a) || Infinity) - (fScore.get(b) || Infinity));
        const current = openSet.shift();

        if (current === end) {
            return reconstructPath(cameFrom, current);
        }

        let neighbors = current.neighbors ? [...current.neighbors] : [];

        const toEnd = nodesCanSeeEnd.find(n => n.source === current);
        if (toEnd) {
            neighbors.push({ node: end, cost: toEnd.cost });
        }

        for (const neighbor of neighbors) {
            const tentativeG = gScore.get(current) + neighbor.cost;
            const neighborNode = neighbor.node;

            if (tentativeG < (gScore.get(neighborNode) || Infinity)) {
                cameFrom.set(neighborNode, current);
                gScore.set(neighborNode, tentativeG);
                fScore.set(neighborNode, tentativeG + Math.hypot(end.x - neighborNode.x, end.y - neighborNode.y));

                if (!openSet.includes(neighborNode)) {
                    openSet.push(neighborNode);
                }
            }
        }
    }
    return [];
}

function reconstructPath(cameFrom, current) {
    const totalPath = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        totalPath.unshift(current);
    }
    if (totalPath.length > 0) totalPath.shift();
    return totalPath;
}

export function calculatePathForAgent(agent, targetPos) {
    if (!agent.pos || !targetPos || !state.visibilityGraph.nodes.length) return;

    const startNode = { id: 'start', x: agent.pos.x, y: agent.pos.y, neighbors: [] };
    const endNode = { id: 'end', x: targetPos.x, y: targetPos.y, neighbors: [] };

    const allNodes = [...state.visibilityGraph.nodes];
    const blockingSegments = getBlockingSegments(state.processedGeometry);

    for (const node of allNodes) {
        const dist = Math.hypot(node.x - startNode.x, node.y - startNode.y);
        if (checkVisibility(startNode, node, blockingSegments, state.processedGeometry)) {
            startNode.neighbors.push({ node: node, cost: dist });
        }
    }

    const nodesCanSeeEnd = [];
    for (const node of allNodes) {
        const dist = Math.hypot(node.x - endNode.x, node.y - endNode.y);
        if (checkVisibility(node, endNode, blockingSegments, state.processedGeometry)) {
            nodesCanSeeEnd.push({ source: node, cost: dist });
        }
    }

    const distDirect = Math.hypot(endNode.x - startNode.x, endNode.y - startNode.y);
    if (checkVisibility(startNode, endNode, blockingSegments, state.processedGeometry)) {
        startNode.neighbors.push({ node: endNode, cost: distDirect });
    }

    const path = aStar(startNode, endNode, nodesCanSeeEnd);

    if (path.length > 0) {
        agent.path = path;
        agent.destination = { x: targetPos.x, y: targetPos.y };
    } else {
        agent.path = [];
        agent.destination = null;
    }
}
