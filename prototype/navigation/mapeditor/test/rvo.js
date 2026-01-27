// rvo.js - Simple Priority-Based Collision Avoidance
// Invece di deviare (che causa blocchi), gli agenti rallentano/si fermano

import { state, config } from './state.js';

const EPSILON = 0.0001;

/**
 * Calcola la nuova velocità con collision avoidance basato su priorità
 */
export function computeORCAVelocity(agent, preferredVelocity) {
    // Se RVO è disattivato, ritorna la velocità preferita
    if (!config.useRVO) {
        return clampVelocity(preferredVelocity, agent.maxSpeed);
    }

    let speedMultiplier = 1.0;

    // Controlla collisioni con altri agenti
    for (const other of state.agents) {
        if (other === agent) continue;

        const result = checkAgentCollision(agent, other, preferredVelocity);
        speedMultiplier = Math.min(speedMultiplier, result.speedMultiplier);
    }

    // Applica il moltiplicatore di velocità
    const finalVelocity = {
        x: preferredVelocity.x * speedMultiplier,
        y: preferredVelocity.y * speedMultiplier
    };

    return clampVelocity(finalVelocity, agent.maxSpeed);
}

/**
 * Controlla se c'è rischio di collisione con un altro agente
 * Ritorna un moltiplicatore di velocità (0 = fermati, 1 = vai normale)
 */
function checkAgentCollision(agent, other, velocity) {
    const dx = other.pos.x - agent.pos.x;
    const dy = other.pos.y - agent.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const minDist = agent.radius + other.radius + 4;

    // Se già sovrapposti, l'agente con ID più alto si ferma
    if (dist < minDist) {
        // Priorità: ID più basso = priorità più alta
        if (agent.id > other.id) {
            return { speedMultiplier: 0 };
        } else {
            // L'agente con priorità va avanti normalmente
            return { speedMultiplier: 1.0 };
        }
    }

    // Calcola se siamo in rotta di collisione
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (speed < EPSILON) {
        return { speedMultiplier: 1.0 };
    }

    // Direzione del movimento
    const dirX = velocity.x / speed;
    const dirY = velocity.y / speed;

    // L'altro agente è davanti a noi?
    const dotProduct = dx * dirX + dy * dirY;
    if (dotProduct <= 0) {
        // L'altro è dietro di noi, nessun problema
        return { speedMultiplier: 1.0 };
    }

    // Distanza laterale dal nostro percorso
    const lateralDist = Math.abs(dx * (-dirY) + dy * dirX);

    // Se l'altro agente non è sul nostro percorso, nessun problema
    if (lateralDist > minDist) {
        return { speedMultiplier: 1.0 };
    }

    // Tempo alla collisione
    const timeToCollision = dotProduct / speed;
    const lookAhead = 1.5; // secondi

    if (timeToCollision > lookAhead) {
        return { speedMultiplier: 1.0 };
    }

    // C'è rischio di collisione - chi ha priorità?
    // Priorità basata su:
    // 1. Chi è più vicino alla propria destinazione ha priorità
    // 2. In caso di parità, ID più basso

    const myDistToDest = agent.destination
        ? Math.hypot(agent.destination.x - agent.pos.x, agent.destination.y - agent.pos.y)
        : Infinity;
    const otherDistToDest = other.destination
        ? Math.hypot(other.destination.x - other.pos.x, other.destination.y - other.pos.y)
        : Infinity;

    let iHavePriority;
    if (Math.abs(myDistToDest - otherDistToDest) > 20) {
        // Chi è più vicino alla destinazione ha priorità
        iHavePriority = myDistToDest < otherDistToDest;
    } else {
        // Parità - usa ID
        iHavePriority = agent.id < other.id;
    }

    if (iHavePriority) {
        // Ho priorità, vado avanti (magari un po' più piano)
        const slowdown = Math.max(0.5, timeToCollision / lookAhead);
        return { speedMultiplier: slowdown };
    } else {
        // L'altro ha priorità, rallento o mi fermo
        const slowdown = Math.max(0, (timeToCollision / lookAhead) - 0.3);
        return { speedMultiplier: slowdown };
    }
}

/**
 * Limita la velocità al massimo
 */
function clampVelocity(vel, maxSpeed) {
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (speed > maxSpeed) {
        return {
            x: vel.x / speed * maxSpeed,
            y: vel.y / speed * maxSpeed
        };
    }
    return { x: vel.x, y: vel.y };
}

/**
 * Calcola la velocità preferita verso il prossimo waypoint
 */
export function computePreferredVelocity(agent) {
    if (agent.path.length === 0) {
        return { x: 0, y: 0 };
    }

    const target = agent.path[0];
    const dx = target.x - agent.pos.x;
    const dy = target.y - agent.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < EPSILON) {
        return { x: 0, y: 0 };
    }

    // Arrive behavior per l'ultimo waypoint
    let speed = agent.maxSpeed;
    if (agent.path.length === 1 && dist < 30) {
        speed = Math.max(0.2, agent.maxSpeed * (dist / 30));
    }

    return {
        x: (dx / dist) * speed,
        y: (dy / dist) * speed
    };
}
