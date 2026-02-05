// ========================================
// Wrapper per navcat crowd simulation (3D)
// ========================================

import {
    findNearestPoly,
    createFindNearestPolyResult,
    DEFAULT_QUERY_FILTER,
    getNodeByRef,
} from 'navcat';

import { crowd } from 'navcat/blocks';
import { AREA_WALKABLE_NARROW, LARGE_RADIUS, EntityState } from './config.js';

export class CrowdSystem {
    constructor(navMesh) {
        this.navMesh = navMesh;
        this.crowd = crowd.create(LARGE_RADIUS);
        this._agentEntityMap = new Map(); // agentId -> Entity

        // Query filters
        this.smallQueryFilter = {
            includeFlags: DEFAULT_QUERY_FILTER.includeFlags,
            excludeFlags: DEFAULT_QUERY_FILTER.excludeFlags,
            getCost: DEFAULT_QUERY_FILTER.getCost,
            passFilter: DEFAULT_QUERY_FILTER.passFilter,
        };

        this.largeQueryFilter = {
            getCost: DEFAULT_QUERY_FILTER.getCost,
            passFilter(nodeRef, navMesh) {
                const node = getNodeByRef(navMesh, nodeRef);
                return node.area !== AREA_WALKABLE_NARROW;
            },
        };
    }

    /**
     * Aggiunge un'entità al crowd system.
     * Restituisce l'agentId o null se fallisce.
     */
    addAgent(entity) {
        const position = [entity.x, 0, entity.z];
        const isLarge = entity.radius >= LARGE_RADIUS;
        const queryFilter = isLarge ? this.largeQueryFilter : this.smallQueryFilter;

        const nearest = createFindNearestPolyResult();
        findNearestPoly(
            nearest,
            this.navMesh,
            position,
            [5, 5, 5],
            queryFilter
        );

        if (!nearest.success) {
            console.warn(`CrowdSystem: impossibile trovare poly per entity ${entity.id} a (${entity.x}, ${entity.z})`);
            return null;
        }

        const agentParams = {
            radius: entity.radius,
            height: 1.8,
            maxAcceleration: 15.0,
            maxSpeed: entity.speed || 3.0,
            collisionQueryRange: isLarge ? 7.5 : 2.5,
            pathOptimizationRange: 12.0,
            separationWeight: 0.5,
            updateFlags:
                crowd.CrowdUpdateFlags.ANTICIPATE_TURNS |
                crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE |
                crowd.CrowdUpdateFlags.SEPARATION |
                crowd.CrowdUpdateFlags.OPTIMIZE_VIS |
                crowd.CrowdUpdateFlags.OPTIMIZE_TOPO,
            queryFilter,
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
    requestMove(entity, targetX, targetZ) {
        if (entity.crowdAgentId == null) return false;

        const targetPos = [targetX, 0, targetZ];
        const isLarge = entity.radius >= LARGE_RADIUS;
        const queryFilter = isLarge ? this.largeQueryFilter : this.smallQueryFilter;

        const nearest = createFindNearestPolyResult();
        findNearestPoly(
            nearest,
            this.navMesh,
            targetPos,
            [5, 5, 5],
            queryFilter
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
            entity.z = agent.position[2];

            // Calcola angolo dalla velocità
            const vx = agent.velocity[0];
            const vz = agent.velocity[2];
            const speedSq = vx * vx + vz * vz;
            if (speedSq > 0.01) {
                entity.angle = Math.atan2(vx, vz);
            }

            // Rileva arrivo: velocità quasi zero mentre in MOVING → IDLE
            if (entity.state === EntityState.MOVING && speedSq < 0.01) {
                entity.state = EntityState.IDLE;
            }
        }
    }

    /**
     * Restituisce l'agente navcat per un'entità.
     */
    getAgent(entity) {
        if (entity.crowdAgentId == null) return null;
        return this.crowd.agents[entity.crowdAgentId];
    }

    /**
     * Aggiorna la navmesh utilizzata dal crowd system.
     * Riposiziona tutti gli agenti sulla nuova navmesh.
     */
    updateNavMesh(newNavMesh) {
        this.navMesh = newNavMesh;

        // Riposiziona tutti gli agenti sulla nuova navmesh
        for (const [agentId, entity] of this._agentEntityMap) {
            const position = [entity.x, 0, entity.z];
            const isLarge = entity.radius >= LARGE_RADIUS;
            const queryFilter = isLarge ? this.largeQueryFilter : this.smallQueryFilter;

            const nearest = createFindNearestPolyResult();
            findNearestPoly(
                nearest,
                this.navMesh,
                position,
                [5, 5, 5],
                queryFilter
            );

            if (nearest.success) {
                // Aggiorna la posizione dell'agente sulla nuova navmesh
                const agent = this.crowd.agents[agentId];
                if (agent) {
                    agent.position[0] = nearest.position[0];
                    agent.position[1] = nearest.position[1];
                    agent.position[2] = nearest.position[2];
                    agent.corridor.nodeRefs = [nearest.nodeRef];
                    agent.corridor.positions = [[...nearest.position]];
                }
            } else {
                console.warn(`Agent ${agentId} non trovato sulla nuova navmesh`);
            }
        }

        console.log(`CrowdSystem: navmesh aggiornata, ${this._agentEntityMap.size} agenti riposizionati`);
    }
}
