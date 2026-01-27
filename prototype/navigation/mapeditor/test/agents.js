// agents.js - Gestione agenti e movimento
// Processamento in ordine di priorità: chi ha priorità muove prima e "prenota" la posizione

import { state } from './state.js';
import { computePreferredVelocity } from './rvo.js';
import { calculatePathForAgent } from './pathfinding.js';

export function spawnAgent(x, y) {
    state.agents.push({
        id: state.agents.length,
        pos: { x, y },
        vel: { x: 0, y: 0 },
        path: [],
        destination: null,
        radius: 12,
        maxSpeed: 2.5,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        stoppedFrames: 0,
        blockedBy: -1
    });
}

/**
 * Check if two circles overlap
 */
function circlesCollide(pos1, r1, pos2, r2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const minDist = r1 + r2;
    return (dx * dx + dy * dy) < (minDist * minDist);
}

/**
 * Get distance to final destination (lower = higher priority)
 */
function getDistanceToDestination(agent) {
    if (!agent.destination) return Infinity;
    return Math.hypot(
        agent.destination.x - agent.pos.x,
        agent.destination.y - agent.pos.y
    );
}

/**
 * Swap destinations between two agents
 */
function swapDestinations(agent1, agent2) {
    console.log(`Swapping destinations between agent ${agent1.id} and ${agent2.id}`);

    const dest1 = agent1.destination ? { ...agent1.destination } : null;
    const dest2 = agent2.destination ? { ...agent2.destination } : null;

    if (dest2) {
        calculatePathForAgent(agent1, dest2);
    } else {
        agent1.path = [];
        agent1.destination = null;
    }

    if (dest1) {
        calculatePathForAgent(agent2, dest1);
    } else {
        agent2.path = [];
        agent2.destination = null;
    }

    agent1.stoppedFrames = 0;
    agent2.stoppedFrames = 0;
    agent1.blockedBy = -1;
    agent2.blockedBy = -1;
}

export function updateAgents() {
    const numAgents = state.agents.length;
    if (numAgents === 0) return;

    // Phase 1: Calculate desired velocities and next positions for all agents
    const desiredVel = [];
    const desiredNextPos = [];

    for (const agent of state.agents) {
        // Check waypoint reached
        if (agent.path.length > 0) {
            const nextPoint = agent.path[0];
            const dist = Math.hypot(nextPoint.x - agent.pos.x, nextPoint.y - agent.pos.y);
            const acceptRadius = agent.path.length === 1 ? 5 : 12;
            if (dist < acceptRadius) {
                agent.path.shift();
            }
        }

        // Calculate and smooth velocity
        const preferred = computePreferredVelocity(agent);
        const smoothing = 0.4;
        const vel = {
            x: agent.vel.x * (1 - smoothing) + preferred.x * smoothing,
            y: agent.vel.y * (1 - smoothing) + preferred.y * smoothing
        };

        desiredVel.push(vel);
        desiredNextPos.push({
            x: agent.pos.x + vel.x,
            y: agent.pos.y + vel.y
        });
    }

    // Phase 2: Sort agents by priority (closer to destination first, then lower ID)
    const priorityOrder = state.agents.map((_, i) => i);
    priorityOrder.sort((i, j) => {
        const distI = getDistanceToDestination(state.agents[i]);
        const distJ = getDistanceToDestination(state.agents[j]);

        // Agent with no destination has lowest priority
        if (distI === Infinity && distJ === Infinity) return i - j;
        if (distI === Infinity) return 1;
        if (distJ === Infinity) return -1;

        // Closer to destination = higher priority
        if (Math.abs(distI - distJ) > 15) {
            return distI - distJ;
        }
        // Tie-breaker: lower ID
        return i - j;
    });

    // Phase 3: Process agents in priority order, committing positions
    const committedPos = new Array(numAgents).fill(null);
    const willMove = new Array(numAgents).fill(false);
    const newBlockedBy = new Array(numAgents).fill(-1);

    for (const i of priorityOrder) {
        const agent = state.agents[i];
        const nextPos = desiredNextPos[i];

        // Check if moving would collide with any already-committed position
        let blocked = false;
        let blockerId = -1;

        for (let j = 0; j < numAgents; j++) {
            if (j === i || committedPos[j] === null) continue;

            if (circlesCollide(nextPos, agent.radius, committedPos[j], state.agents[j].radius)) {
                blocked = true;
                blockerId = j;
                break;
            }
        }

        if (!blocked) {
            // Can move - commit to next position
            committedPos[i] = nextPos;
            willMove[i] = true;
        } else {
            // Blocked - commit to current position
            committedPos[i] = { x: agent.pos.x, y: agent.pos.y };
            willMove[i] = false;
            newBlockedBy[i] = blockerId;
        }
    }

    // Phase 4: Apply movements and handle deadlocks
    for (let i = 0; i < numAgents; i++) {
        const agent = state.agents[i];

        if (willMove[i]) {
            agent.pos.x = committedPos[i].x;
            agent.pos.y = committedPos[i].y;
            agent.vel.x = desiredVel[i].x;
            agent.vel.y = desiredVel[i].y;
            agent.stoppedFrames = 0;
            agent.blockedBy = -1;
        } else {
            agent.vel.x = 0;
            agent.vel.y = 0;
            agent.blockedBy = newBlockedBy[i];

            // Only increment if actually has somewhere to go
            if (agent.path.length > 0 || agent.destination) {
                agent.stoppedFrames++;
            } else {
                agent.stoppedFrames = 0;
            }

            // Deadlock detection: blocked for too long
            if (agent.stoppedFrames > 45 && agent.blockedBy >= 0) {
                const blocker = state.agents[agent.blockedBy];

                // Check if blocker is also stuck or has no destination
                const blockerIsStuck = blocker.stoppedFrames > 10;
                const blockerHasNoPath = blocker.path.length === 0 && !blocker.destination;

                if ((blockerIsStuck || blockerHasNoPath) && agent.destination) {
                    if (blocker.destination) {
                        // Both have destinations - swap them
                        swapDestinations(agent, blocker);
                    } else {
                        // Blocker has no destination - just push it aside conceptually
                        // by giving it the blocked agent's destination temporarily
                        // Actually, let's just have the blocked agent wait more
                        // or recalculate its path
                        console.log(`Agent ${agent.id} recalculating path`);
                        calculatePathForAgent(agent, agent.destination);
                        agent.stoppedFrames = 0;
                    }
                }
            }
        }

        // Clear destination when arrived
        if (agent.path.length === 0 && agent.destination) {
            const dist = Math.hypot(
                agent.destination.x - agent.pos.x,
                agent.destination.y - agent.pos.y
            );
            if (dist < 10) {
                agent.destination = null;
                agent.vel.x = 0;
                agent.vel.y = 0;
            }
        }
    }
}
