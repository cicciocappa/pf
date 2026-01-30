// ========================================
// NavMesh Crowd Simulation usando navcat
// ========================================

import {
    createNavMesh,
    buildTile,
    addTile,
    findNearestPoly,
    createFindNearestPolyResult,
    DEFAULT_QUERY_FILTER,
    polygonsToNavMeshTilePolys,
    polysToTileDetailMesh,
} from './navcat/dist/index.js';

import { crowd } from './navcat/dist/blocks.js';

import { vec3, box3 } from 'mathcat';

// ========================================
// Classe principale dell'applicazione
// ========================================
class CrowdSimulationApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // NavMesh e Crowd navcat
        this.navMesh = null;
        this.crowdSim = null;

        // Dati JSON originali per il rendering
        this.jsonVertices = [];
        this.jsonPolygons = [];

        // Selezione agenti
        this.selectedAgents = new Set();

        // Camera
        this.camera = {
            x: 0,
            y: 0,
            zoom: 15
        };

        // Input state
        this.isDragging = false;
        this.isPanning = false;
        this.isSelecting = false;
        this.dragStart = { x: 0, y: 0 };
        this.selectionRect = null;

        // Performance
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.loadSampleNavMesh();
        this.startLoop();
    }

    setupCanvas() {
        const resize = () => {
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        };
        resize();
        window.addEventListener('resize', resize);
    }

    setupEventListeners() {
        // File loading
        document.getElementById('loadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        this.loadNavMeshFromJSON(json);
                    } catch (err) {
                        console.error('Errore nel parsing del JSON:', err);
                        this.setStatus('Errore nel caricamento della navmesh');
                    }
                };
                reader.readAsText(file);
            }
        });

        document.getElementById('clearAgents').addEventListener('click', () => {
            this.clearAllAgents();
        });

        document.getElementById('generateSample').addEventListener('click', () => {
            this.loadSampleNavMesh();
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ========================================
    // Conversione NavMesh JSON -> navcat
    // ========================================
    loadNavMeshFromJSON(json) {
        // Salva i dati originali per il rendering
        this.jsonVertices = json.vertices;
        this.jsonPolygons = json.polygons;

        // Converti vertices in flat array e calcola bounds
        const flatVertices = [];
        const bounds = box3.create();

        for (const v of json.vertices) {
            const point = [v[0], v[1], v[2]];
            flatVertices.push(v[0], v[1], v[2]);
            box3.expandByPoint(bounds, bounds, point);
        }

        console.log('Vertices count:', json.vertices.length);
        console.log('Bounds:', bounds);
        console.log('Flat vertices sample:', flatVertices.slice(0, 12));

        // Converti polygons nel formato navcat ExternalPolygon
        const externalPolygons = json.polygons.map((p, i) => {
            console.log(`Polygon ${i}: vertices = [${p.vertices.join(', ')}]`);
            return {
                vertices: [...p.vertices], // copia array
                flags: 1,
                area: 0
            };
        });

        // Crea tile polys con calcolo automatico dei neighbors
        console.log('Calling polygonsToNavMeshTilePolys...');
        const tilePolys = polygonsToNavMeshTilePolys(
            externalPolygons,
            flatVertices,
            0, // borderSize = 0 per single tile
            bounds
        );

        console.log('TilePolys result:', tilePolys);
        console.log('Polys count:', tilePolys.polys.length);

        // Log neighbor info
        for (let i = 0; i < Math.min(5, tilePolys.polys.length); i++) {
            console.log(`Poly ${i} neis:`, tilePolys.polys[i].neis);
        }

        // Crea detail mesh
        const tileDetailMesh = polysToTileDetailMesh(tilePolys.polys);
        console.log('Detail mesh:', tileDetailMesh);

        // Crea NavMesh
        this.navMesh = createNavMesh();

        // Configura NavMesh dimensions (follow exact pattern from navcat example)
        this.navMesh.tileWidth = bounds[1][0] - bounds[0][0];
        this.navMesh.tileHeight = bounds[1][2] - bounds[0][2];
        this.navMesh.origin[0] = bounds[0][0];
        this.navMesh.origin[1] = bounds[0][1];
        this.navMesh.origin[2] = bounds[0][2];

        console.log('NavMesh dimensions:', {
            tileWidth: this.navMesh.tileWidth,
            tileHeight: this.navMesh.tileHeight,
            origin: [...this.navMesh.origin],
            bounds: JSON.stringify(bounds)
        });

        // Parametri tile
        const tileParams = {
            bounds: bounds,
            vertices: tilePolys.vertices,
            polys: tilePolys.polys,
            detailMeshes: tileDetailMesh.detailMeshes,
            detailVertices: tileDetailMesh.detailVertices,
            detailTriangles: tileDetailMesh.detailTriangles,
            tileX: 0,
            tileY: 0,
            tileLayer: 0,
            cellSize: 0.2,
            cellHeight: 0.2,
            walkableHeight: 2.0,
            walkableRadius: 0.4,
            walkableClimb: 0.5,
        };

        // Build e add tile
        console.log('Building tile...');
        const tile = buildTile(tileParams);
        console.log('Tile built:', tile);

        addTile(this.navMesh, tile);
        console.log('Tile added to navMesh');

        // Verifica NavMesh
        console.log('NavMesh tiles:', Object.keys(this.navMesh.tiles));
        console.log('NavMesh nodes:', this.navMesh.nodes.length);

        // Check tile details
        const tileIds = Object.keys(this.navMesh.tiles);
        if (tileIds.length > 0) {
            const firstTile = this.navMesh.tiles[tileIds[0]];
            console.log('First tile polys count:', firstTile.polys.length);
            console.log('First tile vertices sample:', firstTile.vertices.slice(0, 12));
            // Log first few polys with their neighbors
            for (let i = 0; i < Math.min(3, firstTile.polys.length); i++) {
                const poly = firstTile.polys[i];
                console.log(`Poly ${i}: vertices=${poly.vertices.join(',')}, neis=${poly.neis.join(',')}`);
            }
        }

        // Crea nuovo crowd
        this.crowdSim = crowd.create(0.5); // maxAgentRadius
        console.log('Crowd created:', this.crowdSim);

        // Reset selezione
        this.selectedAgents.clear();

        // Centra camera
        this.centerCamera();

        this.setStatus(`NavMesh caricata: ${json.polygons.length} poligoni, ${this.navMesh.nodes.length} nodi`);
    }

    loadSampleNavMesh() {
        fetch('sample-navmesh.json')
            .then(r => r.json())
            .then(json => this.loadNavMeshFromJSON(json))
            .catch(err => {
                console.error('Errore nel caricamento:', err);
                this.setStatus('Errore nel caricamento della navmesh di esempio');
            });
    }

    centerCamera() {
        if (this.jsonVertices.length === 0) return;

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const v of this.jsonVertices) {
            minX = Math.min(minX, v[0]);
            maxX = Math.max(maxX, v[0]);
            minZ = Math.min(minZ, v[2]);
            maxZ = Math.max(maxZ, v[2]);
        }

        this.camera.x = (minX + maxX) / 2;
        this.camera.y = (minZ + maxZ) / 2;

        const width = maxX - minX;
        const height = maxZ - minZ;
        const maxDim = Math.max(width, height);
        this.camera.zoom = Math.min(this.canvas.width, this.canvas.height) / (maxDim * 1.2);
    }

    // ========================================
    // Gestione Agenti
    // ========================================
    addAgent(worldPos) {
        if (!this.navMesh || !this.crowdSim) {
            console.log('NavMesh or Crowd not ready');
            return null;
        }

        const position = [worldPos.x, 0, worldPos.y];
        console.log('Adding agent at position:', position);

        // Trova il poligono più vicino alla posizione
        const nearestResult = createFindNearestPolyResult();
        findNearestPoly(
            nearestResult,
            this.navMesh,
            position,
            [5, 5, 5], // halfExtents - più grande per trovare il poly
            DEFAULT_QUERY_FILTER
        );

        console.log('FindNearestPoly result:', nearestResult);

        if (!nearestResult.success) {
            console.log('Could not find polygon near position');
            this.setStatus('Posizione non valida sulla navmesh');
            return null;
        }

        const agentParams = {
            radius: 0.4,
            height: 1.8,
            maxAcceleration: 15.0,
            maxSpeed: 3.5,
            collisionQueryRange: 2.5,
            pathOptimizationRange: 12.0,
            separationWeight: 0.5,
            updateFlags: crowd.CrowdUpdateFlags.ANTICIPATE_TURNS |
                        crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE |
                        crowd.CrowdUpdateFlags.SEPARATION |
                        crowd.CrowdUpdateFlags.OPTIMIZE_VIS |
                        crowd.CrowdUpdateFlags.OPTIMIZE_TOPO,
            queryFilter: DEFAULT_QUERY_FILTER,
            obstacleAvoidance: crowd.DEFAULT_OBSTACLE_AVOIDANCE_PARAMS,
            autoTraverseOffMeshConnections: true,
        };

        const agentId = crowd.addAgent(this.crowdSim, this.navMesh, nearestResult.position, agentParams);
        console.log('Agent added with ID:', agentId);
        console.log('Agent data:', this.crowdSim.agents[agentId]);

        return agentId;
    }

    moveAgentsToTarget(worldPos) {
        if (!this.navMesh || !this.crowdSim) return;

        const targetPos = [worldPos.x, 0, worldPos.y];
        console.log('Moving agents to:', targetPos);

        // Trova il poligono più vicino al target
        const nearestResult = createFindNearestPolyResult();
        findNearestPoly(
            nearestResult,
            this.navMesh,
            targetPos,
            [5, 5, 5], // halfExtents
            DEFAULT_QUERY_FILTER
        );

        console.log('Target findNearestPoly result:', nearestResult);

        if (!nearestResult.success) {
            this.setStatus('Target non raggiungibile');
            return;
        }

        // Imposta il target per tutti gli agenti selezionati
        for (const agentId of this.selectedAgents) {
            console.log(`Setting target for agent ${agentId}:`, nearestResult.position);
            const success = crowd.requestMoveTarget(
                this.crowdSim,
                agentId,
                nearestResult.nodeRef,
                nearestResult.position
            );
            console.log(`requestMoveTarget result: ${success}`);
        }
    }

    clearAllAgents() {
        if (!this.crowdSim) return;

        const agentIds = Object.keys(this.crowdSim.agents);
        for (const agentId of agentIds) {
            crowd.removeAgent(this.crowdSim, agentId);
        }

        this.selectedAgents.clear();
        this.updateUI();
    }

    // ========================================
    // Input Mouse
    // ========================================
    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: (sx - cx) / this.camera.zoom + this.camera.x,
            y: (sy - cy) / this.camera.zoom + this.camera.y
        };
    }

    worldToScreen(wx, wy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: (wx - this.camera.x) * this.camera.zoom + cx,
            y: (wy - this.camera.y) * this.camera.zoom + cy
        };
    }

    getAgentAtPosition(worldPos) {
        if (!this.crowdSim) return null;

        for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
            const dx = agent.position[0] - worldPos.x;
            const dz = agent.position[2] - worldPos.y;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < agent.radius * 1.5) {
                return agentId;
            }
        }

        return null;
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const worldPos = this.screenToWorld(sx, sy);

        this.dragStart = { x: sx, y: sy, worldX: worldPos.x, worldY: worldPos.y };

        if (e.button === 1) {
            // Middle click: pan
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
        } else if (e.button === 0) {
            // Left click
            const clickedAgent = this.getAgentAtPosition(worldPos);

            if (clickedAgent) {
                // Click su agente: seleziona
                if (!e.shiftKey) {
                    this.selectedAgents.clear();
                }
                this.selectedAgents.add(clickedAgent);
            } else {
                // Click su spazio vuoto: inizia selezione rettangolare
                this.isSelecting = true;
                this.selectionRect = { x1: sx, y1: sy, x2: sx, y2: sy };
            }
        } else if (e.button === 2) {
            // Right click: aggiungi agente o muovi selezionati
            if (this.selectedAgents.size > 0) {
                this.moveAgentsToTarget(worldPos);
            } else {
                this.addAgent(worldPos);
            }
        }

        this.updateUI();
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        if (this.isPanning) {
            const dx = (sx - this.dragStart.x) / this.camera.zoom;
            const dy = (sy - this.dragStart.y) / this.camera.zoom;
            this.camera.x -= dx;
            this.camera.y -= dy;
            this.dragStart.x = sx;
            this.dragStart.y = sy;
        } else if (this.isSelecting) {
            this.selectionRect.x2 = sx;
            this.selectionRect.y2 = sy;
        }
    }

    onMouseUp(e) {
        if (this.isSelecting && this.selectionRect) {
            // Completa selezione rettangolare
            const minX = Math.min(this.selectionRect.x1, this.selectionRect.x2);
            const maxX = Math.max(this.selectionRect.x1, this.selectionRect.x2);
            const minY = Math.min(this.selectionRect.y1, this.selectionRect.y2);
            const maxY = Math.max(this.selectionRect.y1, this.selectionRect.y2);

            const width = maxX - minX;
            const height = maxY - minY;

            if (width > 5 || height > 5) {
                // Selezione rettangolare
                if (!e.shiftKey) {
                    this.selectedAgents.clear();
                }

                if (this.crowdSim) {
                    for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
                        const screen = this.worldToScreen(agent.position[0], agent.position[2]);
                        if (screen.x >= minX && screen.x <= maxX &&
                            screen.y >= minY && screen.y <= maxY) {
                            this.selectedAgents.add(agentId);
                        }
                    }
                }
            } else if (width < 5 && height < 5) {
                // Click semplice su spazio vuoto: spawna agente
                const worldPos = this.screenToWorld(this.selectionRect.x1, this.selectionRect.y1);
                if (!this.getAgentAtPosition(worldPos)) {
                    this.addAgent(worldPos);
                }
            }
        }

        this.isPanning = false;
        this.isSelecting = false;
        this.selectionRect = null;
        this.canvas.style.cursor = 'default';

        this.updateUI();
    }

    onWheel(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom *= factor;
        this.camera.zoom = Math.max(1, Math.min(100, this.camera.zoom));
    }

    // ========================================
    // Update e Rendering
    // ========================================
    update(dt) {
        if (this.crowdSim && this.navMesh) {
            crowd.update(this.crowdSim, this.navMesh, dt);

            // Debug: log agent state periodically
            if (Math.random() < 0.01) { // Log ~1% of frames
                for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
                    console.log(`Agent ${agentId}:`, {
                        pos: [...agent.position],
                        vel: [...agent.velocity],
                        desVel: [...agent.desiredVelocity],
                        targetState: agent.targetState,
                        targetPos: [...agent.targetPosition],
                        corridorLen: agent.corridor?.path?.length || 0,
                        corners: agent.corners?.length || 0
                    });
                }
            }
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();

        // Camera transform
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // Render navmesh
        this.renderNavMesh(ctx);

        // Render agenti
        this.renderAgents(ctx);

        ctx.restore();

        // Render selezione rettangolare (in screen space)
        if (this.isSelecting && this.selectionRect) {
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(
                this.selectionRect.x1,
                this.selectionRect.y1,
                this.selectionRect.x2 - this.selectionRect.x1,
                this.selectionRect.y2 - this.selectionRect.y1
            );
            ctx.setLineDash([]);
        }
    }

    renderNavMesh(ctx) {
        if (this.jsonPolygons.length === 0) return;

        // Render poligoni
        for (let i = 0; i < this.jsonPolygons.length; i++) {
            const poly = this.jsonPolygons[i];

            ctx.beginPath();
            for (let j = 0; j < poly.vertices.length; j++) {
                const v = this.jsonVertices[poly.vertices[j]];
                if (j === 0) {
                    ctx.moveTo(v[0], v[2]);
                } else {
                    ctx.lineTo(v[0], v[2]);
                }
            }
            ctx.closePath();

            // Fill
            ctx.fillStyle = `hsla(${200 + (i * 17) % 60}, 50%, 30%, 0.5)`;
            ctx.fill();

            // Stroke
            ctx.strokeStyle = '#0f3460';
            ctx.lineWidth = 0.1;
            ctx.stroke();
        }

        // Render bordi (muri)
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 0.15;

        for (const poly of this.jsonPolygons) {
            const verts = poly.vertices;
            for (let i = 0; i < verts.length; i++) {
                const v1 = this.jsonVertices[verts[i]];
                const v2 = this.jsonVertices[verts[(i + 1) % verts.length]];

                // Controlla se questo edge è condiviso con un altro poligono
                const isWall = !this.isSharedEdge(verts[i], verts[(i + 1) % verts.length]);

                if (isWall) {
                    ctx.beginPath();
                    ctx.moveTo(v1[0], v1[2]);
                    ctx.lineTo(v2[0], v2[2]);
                    ctx.stroke();
                }
            }
        }
    }

    isSharedEdge(v1Idx, v2Idx) {
        let count = 0;
        for (const poly of this.jsonPolygons) {
            const verts = poly.vertices;
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i];
                const b = verts[(i + 1) % verts.length];
                if ((a === v1Idx && b === v2Idx) || (a === v2Idx && b === v1Idx)) {
                    count++;
                    if (count > 1) return true;
                }
            }
        }
        return false;
    }

    renderAgents(ctx) {
        if (!this.crowdSim) return;

        for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
            const x = agent.position[0];
            const z = agent.position[2];
            const radius = agent.radius;

            const isSelected = this.selectedAgents.has(agentId);

            // Corpo agente
            ctx.beginPath();
            ctx.arc(x, z, radius, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#e94560' : '#4a90d9';
            ctx.fill();

            // Bordo
            ctx.strokeStyle = isSelected ? '#fff' : '#2a5080';
            ctx.lineWidth = 0.08;
            ctx.stroke();

            // Direzione velocità
            const velLen = Math.sqrt(agent.velocity[0] ** 2 + agent.velocity[2] ** 2);
            if (velLen > 0.1) {
                const dirX = agent.velocity[0] / velLen;
                const dirZ = agent.velocity[2] / velLen;

                ctx.beginPath();
                ctx.moveTo(x, z);
                ctx.lineTo(x + dirX * radius * 1.5, z + dirZ * radius * 1.5);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 0.06;
                ctx.stroke();
            }

            // Path visualization (corners)
            if (agent.corners && agent.corners.length > 0) {
                ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
                ctx.lineWidth = 0.05;
                ctx.beginPath();
                ctx.moveTo(x, z);
                for (const corner of agent.corners) {
                    ctx.lineTo(corner.position[0], corner.position[2]);
                }
                ctx.stroke();

                // Disegna i corner points
                ctx.fillStyle = 'rgba(100, 200, 100, 0.8)';
                for (const corner of agent.corners) {
                    ctx.beginPath();
                    ctx.arc(corner.position[0], corner.position[2], 0.15, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Target position
            if (agent.targetState === crowd.AgentTargetState.VALID) {
                ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.lineWidth = 0.03;
                ctx.setLineDash([0.2, 0.2]);
                ctx.beginPath();
                ctx.moveTo(x, z);
                ctx.lineTo(agent.targetPosition[0], agent.targetPosition[2]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Target marker
                ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.beginPath();
                ctx.arc(agent.targetPosition[0], agent.targetPosition[2], 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ========================================
    // Loop principale
    // ========================================
    startLoop() {
        const loop = (time) => {
            const dt = Math.min((time - this.lastTime) / 1000, 0.1);
            this.lastTime = time;

            // FPS counter
            this.frameCount++;
            if (this.frameCount >= 30) {
                this.fps = Math.round(this.frameCount / dt / 30);
                this.frameCount = 0;
            }

            this.update(dt);
            this.render();
            this.updateUI();

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    updateUI() {
        const agentCount = this.crowdSim ? Object.keys(this.crowdSim.agents).length : 0;
        document.getElementById('agentCount').textContent = agentCount;
        document.getElementById('selectedCount').textContent = this.selectedAgents.size;
        document.getElementById('fps').textContent = this.fps;
    }

    setStatus(text) {
        document.getElementById('status').textContent = text;
    }
}

// ========================================
// Avvio applicazione
// ========================================
window.addEventListener('DOMContentLoaded', () => {
    window.app = new CrowdSimulationApp();
});
