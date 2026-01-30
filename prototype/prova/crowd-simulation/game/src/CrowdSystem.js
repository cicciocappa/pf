// ========================================
// Wrapper per navcat crowd simulation
// ========================================

import {
    findNearestPoly,
    createFindNearestPolyResult,
    DEFAULT_QUERY_FILTER,
} from 'navcat';

import { crowd } from 'navcat/blocks';

export class CrowdSystem {
    constructor(navMesh) {
        this.navMesh = navMesh;
        this.crowd = crowd.create(0.5);
        this._agentEntityMap = new Map(); // agentId -> Entity
    }

    /**
     * Aggiunge un'entità al crowd system.
     * Restituisce l'agentId o null se fallisce.
     */
    addAgent(entity) {
        const position = [entity.x, 0, entity.y];

        const nearest = createFindNearestPolyResult();
        findNearestPoly(
            nearest,
            this.navMesh,
            position,
            [5, 5, 5],
            DEFAULT_QUERY_FILTER
        );

        if (!nearest.success) {
            console.warn(`CrowdSystem: impossibile trovare poly per entity ${entity.id} a (${entity.x}, ${entity.y})`);
            return null;
        }

        const agentParams = {
            radius: entity.radius,
            height: 1.8,
            maxAcceleration: 15.0,
            maxSpeed: entity.speed || 3.0,
            collisionQueryRange: 2.5,
            pathOptimizationRange: 12.0,
            separationWeight: 0.5,
            updateFlags:
                crowd.CrowdUpdateFlags.ANTICIPATE_TURNS |
                crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE |
                crowd.CrowdUpdateFlags.SEPARATION |
                crowd.CrowdUpdateFlags.OPTIMIZE_VIS |
                crowd.CrowdUpdateFlags.OPTIMIZE_TOPO,
            queryFilter: DEFAULT_QUERY_FILTER,
            obstacleAvoidance: crowd.DEFAULT_OBSTACLE_AVOIDANCE_PARAMS,
            autoTraverseOffMeshConnections: true,
        };

        const agentId = crowd.addAgent(this.crowd, this.navMesh, nearest.position, agentParams);
        entity.crowdAgentId = agentId;
        this._agentEntityMap.set(agentId, entity);

        return agentId;
    }

    /**
     * Rimuove un'entità dal crowd.
     */
    removeAgent(entity) {
        if (entity.crowdAgentId == null) return;
        crowd.removeAgent(this.crowd, entity.crowdAgentId);
        this._agentEntityMap.delete(entity.crowdAgentId);
        entity.crowdAgentId = null;
    }

    /**
     * Imposta il bersaglio di movimento per un'entità.
     */
    requestMove(entity, targetX, targetY) {
        if (entity.crowdAgentId == null) return false;

        const targetPos = [targetX, 0, targetY];

        const nearest = createFindNearestPolyResult();
        findNearestPoly(
            nearest,
            this.navMesh,
            targetPos,
            [5, 5, 5],
            DEFAULT_QUERY_FILTER
        );

        if (!nearest.success) {
            console.warn('CrowdSystem: target non raggiungibile');
            return false;
        }

        return crowd.requestMoveTarget(
            this.crowd,
            entity.crowdAgentId,
            nearest.nodeRef,
            nearest.position
        );
    }

    /**
     * Aggiorna la simulazione e sincronizza le posizioni delle entità.
     */
    update(dt) {
        crowd.update(this.crowd, this.navMesh, dt);

        // Sincronizza posizioni agenti → entità
        for (const [agentId, entity] of this._agentEntityMap) {
            const agent = this.crowd.agents[agentId];
            if (!agent) continue;

            entity.x = agent.position[0];
            entity.y = agent.position[2];

            // Calcola angolo dalla velocità
            const vx = agent.velocity[0];
            const vz = agent.velocity[2];
            if (vx * vx + vz * vz > 0.01) {
                entity.angle = Math.atan2(vz, vx);
            }
        }
    }

    /**
     * Restituisce l'agente navcat per un'entità (per debug).
     */
    getAgent(entity) {
        if (entity.crowdAgentId == null) return null;
        return this.crowd.agents[entity.crowdAgentId];
    }
}
