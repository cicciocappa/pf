// ============================================================================
// Crowd Simulation con navcat (mesh 3D → navmesh automatica, multi-agent)
// Player 3D con Three.js
// ============================================================================

// --- Import da navcat ---
import {
    findNearestPoly,
    createFindNearestPolyResult,
    DEFAULT_QUERY_FILTER,
    getNodeByRef,
    addOffMeshConnection,
    OffMeshConnectionDirection,
    isOffMeshConnectionConnected,
    BuildContext,
    markWalkableTriangles,
    calculateMeshBounds,
    calculateGridSize,
    createHeightfield,
    rasterizeTriangles,
    filterLowHangingWalkableObstacles,
    filterLedgeSpans,
    filterWalkableLowHeightSpans,
    buildCompactHeightfield,
    erodeAndMarkWalkableAreas,
    medianFilterWalkableArea,
    buildDistanceField,
    buildRegionsMonotone,
    buildContours,
    buildPolyMesh,
    buildPolyMeshDetail,
    polyMeshToTilePolys,
    polyMeshDetailToTileDetailMesh,
    buildTile,
    addTile,
    removeTile,
    createNavMesh,
    WALKABLE_AREA,
    ContourBuildFlags,
} from './navcat/dist/index.js';

import { crowd, floodFillNavMesh } from './navcat/dist/blocks.js';
import { vec3, box3, vec2 } from 'mathcat';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Costanti per le aree ---
const AREA_WALKABLE = 1;
const AREA_WALKABLE_NARROW = 2;

// --- Parametri agenti ---
const SMALL_RADIUS = 0.4;
const LARGE_RADIUS = 1.2;

// ============================================================================
// Classe principale dell'applicazione
// ============================================================================
class CrowdSimulationApp {
    constructor() {
        // --- Stato NavMesh e Crowd ---
        this.navMesh = null;
        this.crowdSim = null;

        // --- Dati per il rendering ---
        this.renderVertices = [];
        this.renderPolygons = [];
        this.jsonOffMeshConnections = [];
        this.jsonSeedPoints = [];

        // --- Dati mesh strutturati ---
        this.structuredMeshData = null;
        this.disabledStructures = new Set();

        // --- Query Filters ---
        this.smallQueryFilter = {
            includeFlags: DEFAULT_QUERY_FILTER.includeFlags,
            excludeFlags: DEFAULT_QUERY_FILTER.excludeFlags,
            getCost: DEFAULT_QUERY_FILTER.getCost,
            passFilter: DEFAULT_QUERY_FILTER.passFilter
        };

        this.largeQueryFilter = {
            getCost: DEFAULT_QUERY_FILTER.getCost,
            passFilter(nodeRef, navMesh) {
                const node = getNodeByRef(navMesh, nodeRef);
                return node.area !== AREA_WALKABLE_NARROW;
            }
        };

        // --- Selezione agenti ---
        this.selectedAgents = new Set();

        // --- Three.js objects ---
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // --- Scene geometry groups ---
        this.levelGroup = new THREE.Group();
        this.navMeshGroup = new THREE.Group();
        this.agentMeshes = new Map(); // agentId → { sphere, directionLine, pathLine, targetLine, targetSphere }

        // --- Raycasting ---
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.mouse = new THREE.Vector2();

        // --- Selection state ---
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionRect = null;
        this.selectionDiv = null;

        // --- Web Worker per navmesh ---
        this.navMeshWorker = new Worker('navmesh-worker-bundle.js');
        this._navMeshGeneration = 0;
        this._rebuildPending = false;
        this.navMeshWorker.onmessage = (e) => this._onWorkerResult(e);
        this.navMeshWorker.onerror = (e) => {
            console.error('NavMesh worker error:', e.message);
            this._rebuildPending = false;
        };

        // --- Performance tracking ---
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;

        // --- Shared geometries for agents ---
        this._smallSphereGeom = new THREE.SphereGeometry(SMALL_RADIUS, 16, 12);
        this._largeSphereGeom = new THREE.SphereGeometry(LARGE_RADIUS, 16, 12);

        this.init();
    }

    // ========================================================================
    // Inizializzazione
    // ========================================================================

    init() {
        this.setupThreeJS();
        this.setupEventListeners();
        this.loadInitialData();
        this.startLoop();
    }

    setupThreeJS() {
        const container = document.querySelector('.canvas-container');

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            2000
        );
        this.camera.position.set(30, 40, 30);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        // OrbitControls - only middle mouse button for orbit/pan, leave left/right free
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.mouseButtons = {
            LEFT: null,   // We handle left button ourselves
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: null   // We handle right button ourselves
        };
        // Allow scroll wheel zoom
        this.controls.enableZoom = true;
        // Disable rotate via left button (we use it for selection)
        this.controls.enableRotate = true;
        // Use keyboard for rotate instead, or middle button
        this.controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        };

        // Lights
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        this.scene.add(dirLight);

        // Add groups to scene
        this.scene.add(this.levelGroup);
        this.scene.add(this.navMeshGroup);

        // Grid helper
        const grid = new THREE.GridHelper(200, 40, 0x333355, 0x222244);
        grid.position.y = -0.01;
        this.scene.add(grid);

        // Selection overlay div
        this.selectionDiv = document.createElement('div');
        this.selectionDiv.style.cssText = 'position:absolute;border:1px dashed #e94560;background:rgba(233,69,96,0.1);pointer-events:none;display:none;';
        container.appendChild(this.selectionDiv);

        // Resize
        window.addEventListener('resize', () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }

    setupEventListeners() {
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
                        this.loadMesh3D(json);
                    } catch (err) {
                        console.error('Errore nel parsing del JSON:', err);
                        this.setStatus('Errore nel caricamento della mesh');
                    }
                };
                reader.readAsText(file);
            }
        });

        document.getElementById('clearAgents').addEventListener('click', () => {
            this.clearAllAgents();
        });

        document.getElementById('generateSample').addEventListener('click', () => {
            this.loadInitialData();
        });

        // Structure panel buttons
        document.getElementById('structAllOn')?.addEventListener('click', () => {
            this.disabledStructures.clear();
            this._updateStructureCheckboxes();
            this.rebuildNavMesh();
            this._rebuildSceneGeometry();
        });

        document.getElementById('structAllOff')?.addEventListener('click', () => {
            if (this.structuredMeshData) {
                for (const s of this.structuredMeshData.structures) {
                    this.disabledStructures.add(s.id);
                }
                this._updateStructureCheckboxes();
                this.rebuildNavMesh();
                this._rebuildSceneGeometry();
            }
        });

        // Mouse events on the renderer canvas
        const canvas = this.renderer.domElement;
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ========================================================================
    // 3D Level Geometry (from preview.html)
    // ========================================================================

    _buildMesh(positions, indices, color, opacity = 1) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.MeshPhongMaterial({
            color,
            side: THREE.DoubleSide,
            transparent: opacity < 1,
            opacity,
            depthWrite: opacity >= 1,
        });
        return new THREE.Mesh(geom, mat);
    }

    _buildWireframe(positions, indices, color) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        const wire = new THREE.WireframeGeometry(geom);
        return new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color, opacity: 0.5, transparent: true }));
    }

    _rebuildSceneGeometry() {
        // Clear existing level geometry
        while (this.levelGroup.children.length > 0) {
            const child = this.levelGroup.children[0];
            this.levelGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }

        const data = this.structuredMeshData;
        if (!data) return;

        // Ground
        if (data.ground && data.ground.positions.length > 0) {
            this.levelGroup.add(this._buildMesh(data.ground.positions, data.ground.indices, 0x3a7d44, 0.7));
            this.levelGroup.add(this._buildWireframe(data.ground.positions, data.ground.indices, 0x66ff66));
        }

        // Structures (only enabled ones)
        const structColors = { building: 0xc0392b, wall: 0xe67e22 };
        for (const s of data.structures) {
            if (this.disabledStructures.has(s.id)) continue;
            const col = structColors[s.type] || 0x9b59b6;
            this.levelGroup.add(this._buildMesh(s.positions, s.indices, col, 0.85));
            this.levelGroup.add(this._buildWireframe(s.positions, s.indices, 0xffffff));
        }

        // Static obstacles
        if (data.staticObstacles && data.staticObstacles.positions.length > 0) {
            this.levelGroup.add(this._buildMesh(data.staticObstacles.positions, data.staticObstacles.indices, 0x8e44ad, 0.85));
            this.levelGroup.add(this._buildWireframe(data.staticObstacles.positions, data.staticObstacles.indices, 0xffffff));
        }

        // Off-mesh connections
        if (data.offMeshConnections && data.offMeshConnections.length > 0) {
            const pts = [];
            for (const link of data.offMeshConnections) {
                pts.push(link.start[0], link.start[1] + 0.1, link.start[2]);
                pts.push(link.end[0], link.end[1] + 0.1, link.end[2]);
            }
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            this.levelGroup.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0x00ffff })));
        }
    }

    // ========================================================================
    // NavMesh 3D Rendering
    // ========================================================================

    _rebuildNavMeshGeometry() {
        // Clear existing navmesh geometry
        while (this.navMeshGroup.children.length > 0) {
            const child = this.navMeshGroup.children[0];
            this.navMeshGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }

        if (this.renderPolygons.length === 0) return;

        const verts = this.renderVertices;

        // Build navmesh polygon mesh
        const positions = [];
        const colors = [];
        const wallPositions = [];

        for (let i = 0; i < this.renderPolygons.length; i++) {
            const poly = this.renderPolygons[i];
            if (poly.flags === 0) continue;
            const isNarrow = poly.area === AREA_WALKABLE_NARROW;

            // Triangulate the polygon (fan from first vertex)
            const pVerts = poly.vertices;
            for (let j = 1; j < pVerts.length - 1; j++) {
                const v0 = pVerts[0], v1 = pVerts[j], v2 = pVerts[j + 1];

                positions.push(
                    verts[v0 * 3], verts[v0 * 3 + 1] + 0.05, verts[v0 * 3 + 2],
                    verts[v1 * 3], verts[v1 * 3 + 1] + 0.05, verts[v1 * 3 + 2],
                    verts[v2 * 3], verts[v2 * 3 + 1] + 0.05, verts[v2 * 3 + 2]
                );

                let r, g, b;
                if (isNarrow) {
                    r = 0.55; g = 0.4; b = 0.2;
                } else {
                    const hue = (200 + (i * 17) % 60) / 360;
                    const c = this._hslToRgb(hue, 0.5, 0.3);
                    r = c[0]; g = c[1]; b = c[2];
                }
                for (let k = 0; k < 3; k++) {
                    colors.push(r, g, b);
                }
            }

            // Collect wall edges
            for (let j = 0; j < pVerts.length; j++) {
                const v1i = pVerts[j];
                const v2i = pVerts[(j + 1) % pVerts.length];
                if (!this.isSharedEdge(v1i, v2i)) {
                    wallPositions.push(
                        verts[v1i * 3], verts[v1i * 3 + 1] + 0.06, verts[v1i * 3 + 2],
                        verts[v2i * 3], verts[v2i * 3 + 1] + 0.06, verts[v2i * 3 + 2]
                    );
                }
            }
        }

        // NavMesh polygons
        if (positions.length > 0) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geom.computeVertexNormals();

            const mat = new THREE.MeshPhongMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            this.navMeshGroup.add(new THREE.Mesh(geom, mat));
        }

        // Wall edges
        if (wallPositions.length > 0) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0xe94560, linewidth: 2 });
            this.navMeshGroup.add(new THREE.LineSegments(geom, mat));
        }

        // Edge wireframe for all polygon edges
        const edgePositions = [];
        for (let i = 0; i < this.renderPolygons.length; i++) {
            const poly = this.renderPolygons[i];
            if (poly.flags === 0) continue;
            const pVerts = poly.vertices;
            for (let j = 0; j < pVerts.length; j++) {
                const v1i = pVerts[j];
                const v2i = pVerts[(j + 1) % pVerts.length];
                edgePositions.push(
                    verts[v1i * 3], verts[v1i * 3 + 1] + 0.06, verts[v1i * 3 + 2],
                    verts[v2i * 3], verts[v2i * 3 + 1] + 0.06, verts[v2i * 3 + 2]
                );
            }
        }
        if (edgePositions.length > 0) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0x0f3460, transparent: true, opacity: 0.4 });
            this.navMeshGroup.add(new THREE.LineSegments(geom, mat));
        }
    }

    _hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [r, g, b];
    }

    // ========================================================================
    // Agent 3D Rendering
    // ========================================================================

    _updateAgentMeshes() {
        if (!this.crowdSim) return;

        const currentAgentIds = new Set(Object.keys(this.crowdSim.agents));

        // Remove meshes for agents that no longer exist
        for (const [agentId, meshData] of this.agentMeshes) {
            if (!currentAgentIds.has(agentId)) {
                this._removeAgentMesh(meshData);
                this.agentMeshes.delete(agentId);
            }
        }

        // Update or create meshes for current agents
        for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
            const isSelected = this.selectedAgents.has(agentId);
            const isLarge = agent.radius > SMALL_RADIUS * 1.5;
            let meshData = this.agentMeshes.get(agentId);

            if (!meshData) {
                meshData = this._createAgentMesh(agent, isLarge);
                this.agentMeshes.set(agentId, meshData);
            }

            // Update position
            const y = agent.radius;
            meshData.sphere.position.set(agent.position[0], y, agent.position[2]);

            // Update color
            let color;
            if (isSelected) {
                color = 0xe94560;
            } else if (isLarge) {
                color = 0xd97706;
            } else {
                color = 0x4a90d9;
            }
            meshData.sphere.material.color.setHex(color);
            meshData.sphere.material.emissive.setHex(isSelected ? 0x440015 : 0x000000);

            // Direction line
            const velLen = Math.sqrt(agent.velocity[0] ** 2 + agent.velocity[2] ** 2);
            if (velLen > 0.1) {
                const dirX = agent.velocity[0] / velLen;
                const dirZ = agent.velocity[2] / velLen;
                const linePositions = meshData.directionLine.geometry.attributes.position.array;
                linePositions[0] = agent.position[0];
                linePositions[1] = y;
                linePositions[2] = agent.position[2];
                linePositions[3] = agent.position[0] + dirX * agent.radius * 1.5;
                linePositions[4] = y;
                linePositions[5] = agent.position[2] + dirZ * agent.radius * 1.5;
                meshData.directionLine.geometry.attributes.position.needsUpdate = true;
                meshData.directionLine.visible = true;
            } else {
                meshData.directionLine.visible = false;
            }

            // Path line
            if (agent.corners && agent.corners.length > 0) {
                this._updatePathLine(meshData, agent);
                meshData.pathLine.visible = true;
            } else {
                meshData.pathLine.visible = false;
            }

            // Target line and sphere
            if (agent.targetState === crowd.AgentTargetState.VALID) {
                this._updateTargetVis(meshData, agent);
                meshData.targetLine.visible = true;
                meshData.targetSphere.visible = true;
            } else {
                meshData.targetLine.visible = false;
                meshData.targetSphere.visible = false;
            }
        }
    }

    _createAgentMesh(agent, isLarge) {
        const geom = isLarge ? this._largeSphereGeom : this._smallSphereGeom;
        const mat = new THREE.MeshPhongMaterial({ color: 0x4a90d9 });
        const sphere = new THREE.Mesh(geom, mat);
        this.scene.add(sphere);

        // Direction line
        const dirGeom = new THREE.BufferGeometry();
        dirGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        const dirLine = new THREE.Line(dirGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
        dirLine.visible = false;
        this.scene.add(dirLine);

        // Path line (dynamic vertex count)
        const pathGeom = new THREE.BufferGeometry();
        pathGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(300), 3)); // max 100 corners
        pathGeom.setDrawRange(0, 0);
        const pathLine = new THREE.Line(pathGeom, new THREE.LineBasicMaterial({ color: 0x64c864, transparent: true, opacity: 0.6 }));
        pathLine.visible = false;
        this.scene.add(pathLine);

        // Target line
        const targetGeom = new THREE.BufferGeometry();
        targetGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        const targetLine = new THREE.Line(targetGeom, new THREE.LineBasicMaterial({
            color: 0xff6464,
            transparent: true,
            opacity: 0.5,
        }));
        targetLine.visible = false;
        this.scene.add(targetLine);

        // Target sphere
        const targetSphereGeom = new THREE.SphereGeometry(0.2, 8, 6);
        const targetSphere = new THREE.Mesh(targetSphereGeom, new THREE.MeshPhongMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.6,
        }));
        targetSphere.visible = false;
        this.scene.add(targetSphere);

        return { sphere, directionLine: dirLine, pathLine, targetLine, targetSphere };
    }

    _updatePathLine(meshData, agent) {
        const posArr = meshData.pathLine.geometry.attributes.position.array;
        const y = agent.radius;
        let idx = 0;

        // Start from agent position
        posArr[idx++] = agent.position[0];
        posArr[idx++] = y;
        posArr[idx++] = agent.position[2];

        const maxCorners = Math.min(agent.corners.length, 99);
        for (let i = 0; i < maxCorners; i++) {
            posArr[idx++] = agent.corners[i].position[0];
            posArr[idx++] = y;
            posArr[idx++] = agent.corners[i].position[2];
        }

        meshData.pathLine.geometry.attributes.position.needsUpdate = true;
        meshData.pathLine.geometry.setDrawRange(0, 1 + maxCorners);
    }

    _updateTargetVis(meshData, agent) {
        const y = agent.radius;
        const posArr = meshData.targetLine.geometry.attributes.position.array;
        posArr[0] = agent.position[0];
        posArr[1] = y;
        posArr[2] = agent.position[2];
        posArr[3] = agent.targetPosition[0];
        posArr[4] = 0.2;
        posArr[5] = agent.targetPosition[2];
        meshData.targetLine.geometry.attributes.position.needsUpdate = true;

        meshData.targetSphere.position.set(agent.targetPosition[0], 0.2, agent.targetPosition[2]);
    }

    _removeAgentMesh(meshData) {
        for (const key of ['sphere', 'directionLine', 'pathLine', 'targetLine', 'targetSphere']) {
            const obj = meshData[key];
            this.scene.remove(obj);
            if (obj.geometry && obj.geometry !== this._smallSphereGeom && obj.geometry !== this._largeSphereGeom) {
                obj.geometry.dispose();
            }
            if (obj.material) obj.material.dispose();
        }
    }

    // ========================================================================
    // Raycasting Input
    // ========================================================================

    _getWorldPosFromMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
        if (hit) {
            return { x: target.x, y: target.z }; // format expected by addAgent/moveAgentsToTarget
        }
        return null;
    }

    _getAgentAtClick(event) {
        if (!this.crowdSim) return null;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Collect all agent spheres
        const spheres = [];
        const agentIds = [];
        for (const [agentId, meshData] of this.agentMeshes) {
            spheres.push(meshData.sphere);
            agentIds.push(agentId);
        }

        const intersects = this.raycaster.intersectObjects(spheres);
        if (intersects.length > 0) {
            const idx = spheres.indexOf(intersects[0].object);
            if (idx >= 0) return agentIds[idx];
        }
        return null;
    }

    _projectToScreen(position3D) {
        const v = new THREE.Vector3(position3D[0], position3D[1] || 0, position3D[2]);
        v.project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        return {
            x: (v.x * 0.5 + 0.5) * rect.width,
            y: (-v.y * 0.5 + 0.5) * rect.height
        };
    }

    // ========================================================================
    // Mouse Event Handlers
    // ========================================================================

    onMouseDown(e) {
        if (e.button === 0 && e.shiftKey) {
            // Shift + left click: add large agent
            const worldPos = this._getWorldPosFromMouse(e);
            if (worldPos) this.addAgent(worldPos, true);
        } else if (e.button === 0) {
            // Left click: check for agent selection or start rect selection
            const clickedAgent = this._getAgentAtClick(e);

            if (clickedAgent) {
                this.selectedAgents.clear();
                this.selectedAgents.add(clickedAgent);
                this.updateUI();
            } else {
                // Start rectangle selection
                this.isSelecting = true;
                const rect = this.renderer.domElement.getBoundingClientRect();
                this.selectionStart = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                this.selectionRect = {
                    x1: this.selectionStart.x,
                    y1: this.selectionStart.y,
                    x2: this.selectionStart.x,
                    y2: this.selectionStart.y
                };
            }
        } else if (e.button === 2) {
            // Right click: move selected agents or add small agent
            const worldPos = this._getWorldPosFromMouse(e);
            if (worldPos) {
                if (this.selectedAgents.size > 0) {
                    this.moveAgentsToTarget(worldPos);
                } else {
                    this.addAgent(worldPos, false);
                }
            }
            this.updateUI();
        }
    }

    onMouseMove(e) {
        if (this.isSelecting) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.selectionRect.x2 = e.clientX - rect.left;
            this.selectionRect.y2 = e.clientY - rect.top;

            // Update visual selection div
            const minX = Math.min(this.selectionRect.x1, this.selectionRect.x2);
            const minY = Math.min(this.selectionRect.y1, this.selectionRect.y2);
            const w = Math.abs(this.selectionRect.x2 - this.selectionRect.x1);
            const h = Math.abs(this.selectionRect.y2 - this.selectionRect.y1);
            this.selectionDiv.style.display = 'block';
            this.selectionDiv.style.left = minX + 'px';
            this.selectionDiv.style.top = minY + 'px';
            this.selectionDiv.style.width = w + 'px';
            this.selectionDiv.style.height = h + 'px';
        }
    }

    onMouseUp(e) {
        if (this.isSelecting && this.selectionRect) {
            const minX = Math.min(this.selectionRect.x1, this.selectionRect.x2);
            const maxX = Math.max(this.selectionRect.x1, this.selectionRect.x2);
            const minY = Math.min(this.selectionRect.y1, this.selectionRect.y2);
            const maxY = Math.max(this.selectionRect.y1, this.selectionRect.y2);

            const width = maxX - minX;
            const height = maxY - minY;

            if (width > 5 || height > 5) {
                // Rectangle selection: project agent positions to screen
                if (!e.shiftKey) {
                    this.selectedAgents.clear();
                }

                if (this.crowdSim) {
                    for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
                        const screen = this._projectToScreen(agent.position);
                        if (screen.x >= minX && screen.x <= maxX &&
                            screen.y >= minY && screen.y <= maxY) {
                            this.selectedAgents.add(agentId);
                        }
                    }
                }
            } else {
                // Small drag = click - add agent at position
                const worldPos = this._getWorldPosFromMouse(e);
                if (worldPos && !this._getAgentAtClick(e)) {
                    this.addAgent(worldPos, false);
                }
            }

            this.selectionDiv.style.display = 'none';
        }

        this.isSelecting = false;
        this.selectionRect = null;
        this.updateUI();
    }

    // ========================================================================
    // Camera
    // ========================================================================

    centerCamera() {
        if (!this.renderVertices || this.renderVertices.length === 0) return;

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        const numVerts = this.renderVertices.length / 3;
        for (let i = 0; i < numVerts; i++) {
            const x = this.renderVertices[i * 3];
            const z = this.renderVertices[i * 3 + 2];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const dx = maxX - minX;
        const dz = maxZ - minZ;
        const dist = Math.max(dx, dz) * 1.2;

        this.camera.position.set(cx + dist * 0.5, dist * 0.7, cz + dist * 0.5);
        this.controls.target.set(cx, 0, cz);
        this.controls.update();
    }

    // ========================================================================
    // Generazione NavMesh con pipeline personalizzata (multi-agent)
    // ========================================================================

    _buildTileFromMesh(positions, indices) {
        const ctx = BuildContext.create();
        BuildContext.start(ctx, 'navmesh generation');

        const cs = 0.15;
        const ch = 0.15;
        const walkableRadiusVoxels = Math.ceil(SMALL_RADIUS / cs);
        const walkableHeightVoxels = Math.ceil(2.0 / ch);
        const walkableClimbVoxels = Math.ceil(0.5 / ch);
        const walkableSlopeAngleDegrees = 45;
        const borderSize = 0;
        const minRegionArea = 8;
        const mergeRegionArea = 20;
        const maxSimplificationError = 1.3;
        const maxEdgeLength = Math.floor(12 / cs);
        const maxVerticesPerPoly = 6;
        const detailSampleDistance = 6;
        const detailSampleMaxError = 1;

        const walkableRadiusThresholds = [
            {
                areaId: AREA_WALKABLE_NARROW,
                walkableRadiusVoxels: Math.ceil(LARGE_RADIUS / cs),
            }
        ];

        const triAreaIds = new Uint8Array(indices.length / 3).fill(0);
        markWalkableTriangles(positions, indices, triAreaIds, walkableSlopeAngleDegrees);

        const bounds = calculateMeshBounds(box3.create(), positions, indices);
        const [hfWidth, hfHeight] = calculateGridSize(vec2.create(), bounds, cs);
        const heightfield = createHeightfield(hfWidth, hfHeight, bounds, cs, ch);
        rasterizeTriangles(ctx, heightfield, positions, indices, triAreaIds, walkableClimbVoxels);

        filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
        filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
        filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

        const compactHf = buildCompactHeightfield(ctx, walkableHeightVoxels, walkableClimbVoxels, heightfield);

        erodeAndMarkWalkableAreas(walkableRadiusVoxels, walkableRadiusThresholds, compactHf);
        medianFilterWalkableArea(compactHf);

        buildDistanceField(compactHf);
        buildRegionsMonotone(compactHf, borderSize, minRegionArea, mergeRegionArea);

        const contourSet = buildContours(
            ctx, compactHf, maxSimplificationError, maxEdgeLength,
            ContourBuildFlags.CONTOUR_TESS_WALL_EDGES
        );

        const polyMesh = buildPolyMesh(ctx, contourSet, maxVerticesPerPoly);

        for (let i = 0; i < polyMesh.nPolys; i++) {
            if (polyMesh.areas[i] === WALKABLE_AREA) {
                polyMesh.areas[i] = AREA_WALKABLE;
            }
            if (polyMesh.areas[i] !== 0) {
                polyMesh.flags[i] = 1;
            }
        }

        const polyMeshDetail = buildPolyMeshDetail(ctx, polyMesh, compactHf, detailSampleDistance, detailSampleMaxError);

        BuildContext.end(ctx, 'navmesh generation');

        const tilePolys = polyMeshToTilePolys(polyMesh);
        const tileDetailMesh = polyMeshDetailToTileDetailMesh(tilePolys.polys, polyMeshDetail);

        const tileParams = {
            bounds: polyMesh.bounds,
            vertices: tilePolys.vertices,
            polys: tilePolys.polys,
            detailMeshes: tileDetailMesh.detailMeshes,
            detailVertices: tileDetailMesh.detailVertices,
            detailTriangles: tileDetailMesh.detailTriangles,
            tileX: 0,
            tileY: 0,
            tileLayer: 0,
            cellSize: cs,
            cellHeight: ch,
            walkableHeight: 2.0,
            walkableRadius: SMALL_RADIUS,
            walkableClimb: 0.5,
        };

        const tile = buildTile(tileParams);
        return { tile, polyMesh };
    }

    _generateNavMeshMultiAgent(positions, indices) {
        const { tile, polyMesh } = this._buildTileFromMesh(positions, indices);

        const nav = createNavMesh();
        nav.tileWidth = polyMesh.bounds[1][0] - polyMesh.bounds[0][0];
        nav.tileHeight = polyMesh.bounds[1][2] - polyMesh.bounds[0][2];
        vec3.copy(nav.origin, polyMesh.bounds[0]);

        addTile(nav, tile);

        return nav;
    }

    // ========================================================================
    // Combinazione mesh strutturata
    // ========================================================================

    _combineMeshData() {
        const data = this.structuredMeshData;
        if (!data) return null;

        const positions = [];
        const indices = [];

        for (let i = 0; i < data.ground.positions.length; i++) {
            positions.push(data.ground.positions[i]);
        }
        for (let i = 0; i < data.ground.indices.length; i++) {
            indices.push(data.ground.indices[i]);
        }

        for (const s of data.structures) {
            if (this.disabledStructures.has(s.id)) continue;
            const offset = positions.length / 3;
            for (let i = 0; i < s.positions.length; i++) {
                positions.push(s.positions[i]);
            }
            for (let i = 0; i < s.indices.length; i++) {
                indices.push(s.indices[i] + offset);
            }
        }

        if (data.staticObstacles.positions.length > 0) {
            const offset = positions.length / 3;
            for (let i = 0; i < data.staticObstacles.positions.length; i++) {
                positions.push(data.staticObstacles.positions[i]);
            }
            for (let i = 0; i < data.staticObstacles.indices.length; i++) {
                indices.push(data.staticObstacles.indices[i] + offset);
            }
        }

        return { positions, indices };
    }

    rebuildNavMesh() {
        const combined = this._combineMeshData();
        if (!combined || combined.positions.length < 9 || combined.indices.length < 3) {
            this.setStatus('Mesh combinata non valida');
            return;
        }

        this._navMeshGeneration++;
        const generationId = this._navMeshGeneration;
        this._rebuildPending = true;

        console.log(`Rebuilding navmesh in worker (gen ${generationId})...`);
        this.setStatus('Ricalcolo navmesh in corso...');

        this.navMeshWorker.postMessage({
            positions: combined.positions,
            indices: combined.indices,
            generationId
        });
    }

    _onWorkerResult(e) {
        const { tile, error, generationId } = e.data;

        if (generationId !== this._navMeshGeneration) {
            console.log(`Ignoring stale navmesh result (gen ${generationId}, current ${this._navMeshGeneration})`);
            return;
        }

        this._rebuildPending = false;

        if (error) {
            console.error('NavMesh worker error:', error);
            this.setStatus('Errore nella rigenerazione della navmesh');
            return;
        }

        removeTile(this.navMesh, 0, 0, 0);
        addTile(this.navMesh, tile);

        for (const tileId of Object.keys(this.navMesh.tiles)) {
            const t = this.navMesh.tiles[tileId];
            for (let i = 0; i < t.polys.length; i++) {
                t.polys[i].flags = i + 1;
                const nodeIdx = t.polyNodes[i];
                this.navMesh.nodes[nodeIdx].flags = i + 1;
            }
        }

        for (const conn of this.jsonOffMeshConnections) {
            addOffMeshConnection(this.navMesh, {
                start: conn.start,
                end: conn.end,
                radius: conn.radius || 0.5,
                direction: conn.bidirectional
                    ? OffMeshConnectionDirection.BIDIRECTIONAL
                    : OffMeshConnectionDirection.START_TO_END,
                flags: 0xffffff,
                area: 0,
            });
        }

        this._floodFillPrune();

        this._extractRenderData();
        this._rebuildNavMeshGeometry();
        const narrowCount = this._countNarrowPolys();
        const agentCount = this.crowdSim ? Object.keys(this.crowdSim.agents).length : 0;
        this.setStatus(`NavMesh rigenerata: ${this.renderPolygons.length} poligoni (${narrowCount} narrow), ${agentCount} agenti preservati`);
    }

    _floodFillPrune() {
        if (!this.jsonSeedPoints || this.jsonSeedPoints.length === 0) return;

        const halfExtents = [1, 1, 1];
        const startRefs = [];

        for (const sp of this.jsonSeedPoints) {
            const result = findNearestPoly(
                createFindNearestPolyResult(),
                this.navMesh,
                sp,
                halfExtents,
                DEFAULT_QUERY_FILTER
            );
            if (result.nodeRef !== 0) {
                startRefs.push(result.nodeRef);
            }
        }

        if (startRefs.length === 0) {
            console.warn('Flood fill: no seed points matched a navmesh polygon');
            return;
        }

        const { unreachable } = floodFillNavMesh(this.navMesh, startRefs);

        for (const nodeRef of unreachable) {
            const node = getNodeByRef(this.navMesh, nodeRef);
            node.flags = 0;

            const tile = this.navMesh.tiles[node.tileId];
            tile.polys[node.polyIndex].flags = 0;
        }

        console.log(`Flood fill: ${startRefs.length} seeds, ${unreachable.length} unreachable polys disabled`);
    }

    _countNarrowPolys() {
        let count = 0;
        for (const tileId of Object.keys(this.navMesh.tiles)) {
            const tile = this.navMesh.tiles[tileId];
            for (const poly of tile.polys) {
                if (poly.area === AREA_WALKABLE_NARROW) count++;
            }
        }
        return count;
    }

    // ========================================================================
    // Costruzione della NavMesh da mesh 3D
    // ========================================================================

    loadMesh3D(json) {
        if (json.ground) {
            // --- Formato strutturato ---
            this.structuredMeshData = json;
            this.disabledStructures.clear();
            this.jsonOffMeshConnections = json.offMeshConnections || [];
            this.jsonSeedPoints = json.seedPoints || [];

            const combined = this._combineMeshData();
            if (!combined || combined.positions.length < 9 || combined.indices.length < 3) {
                this.setStatus('Mesh 3D strutturata non valida');
                return;
            }

            console.log('Generating navmesh from structured 3D mesh (multi-agent pipeline)...');

            let navMesh;
            try {
                navMesh = this._generateNavMeshMultiAgent(combined.positions, combined.indices);
            } catch (e) {
                console.error('NavMesh generation failed:', e);
                this.setStatus('Errore nella generazione della navmesh');
                return;
            }

            this.navMesh = navMesh;
            console.log('NavMesh generated successfully');

            for (const tileId of Object.keys(this.navMesh.tiles)) {
                const tile = this.navMesh.tiles[tileId];
                for (let i = 0; i < tile.polys.length; i++) {
                    tile.polys[i].flags = i + 1;
                    const nodeIdx = tile.polyNodes[i];
                    this.navMesh.nodes[nodeIdx].flags = i + 1;
                }
            }

            for (const conn of this.jsonOffMeshConnections) {
                const connId = addOffMeshConnection(this.navMesh, {
                    start: conn.start,
                    end: conn.end,
                    radius: conn.radius || 0.5,
                    direction: conn.bidirectional
                        ? OffMeshConnectionDirection.BIDIRECTIONAL
                        : OffMeshConnectionDirection.START_TO_END,
                    flags: 0xffffff,
                    area: 0,
                });
                const connected = isOffMeshConnectionConnected(this.navMesh, connId);
                console.log(`OffMesh connection ${connId}: connected=${connected}`, conn);
            }

            this._floodFillPrune();

            this.crowdSim = crowd.create(LARGE_RADIUS);
            this.selectedAgents.clear();
            this._clearAllAgentMeshes();
            this._extractRenderData();
            this._rebuildSceneGeometry();
            this._rebuildNavMeshGeometry();
            this.centerCamera();

            this._buildStructurePanel();
            this._spawnStartingAgent(json.startingPosition);
            const narrowCount = this._countNarrowPolys();
            this.setStatus(`NavMesh generata: ${this.renderPolygons.length} poligoni (${narrowCount} narrow), ${json.structures.length} strutture`);

        } else {
            // --- Formato legacy flat ---
            const { positions, indices } = json;

            if (!positions || !indices || positions.length < 9 || indices.length < 3) {
                this.setStatus('Mesh 3D non valida');
                return;
            }

            this.structuredMeshData = null;
            this.disabledStructures.clear();
            this._hideStructurePanel();

            console.log('Generating navmesh from 3D mesh (multi-agent pipeline)...');
            console.log(`  Vertices: ${positions.length / 3}, Triangles: ${indices.length / 3}`);

            let navMesh;
            try {
                navMesh = this._generateNavMeshMultiAgent(positions, indices);
            } catch (e) {
                console.error('NavMesh generation failed:', e);
                this.setStatus('Errore nella generazione della navmesh');
                return;
            }

            this.navMesh = navMesh;
            console.log('NavMesh generated successfully');

            for (const tileId of Object.keys(this.navMesh.tiles)) {
                const tile = this.navMesh.tiles[tileId];
                for (let i = 0; i < tile.polys.length; i++) {
                    tile.polys[i].flags = i + 1;
                    const nodeIdx = tile.polyNodes[i];
                    this.navMesh.nodes[nodeIdx].flags = i + 1;
                }
            }

            this.jsonOffMeshConnections = json.offMeshConnections || [];
            for (const conn of this.jsonOffMeshConnections) {
                const connId = addOffMeshConnection(this.navMesh, {
                    start: conn.start,
                    end: conn.end,
                    radius: conn.radius || 0.5,
                    direction: conn.bidirectional
                        ? OffMeshConnectionDirection.BIDIRECTIONAL
                        : OffMeshConnectionDirection.START_TO_END,
                    flags: 0xffffff,
                    area: 0,
                });
                const connected = isOffMeshConnectionConnected(this.navMesh, connId);
                console.log(`OffMesh connection ${connId}: connected=${connected}`, conn);
            }

            this.crowdSim = crowd.create(LARGE_RADIUS);
            this.selectedAgents.clear();
            this._clearAllAgentMeshes();
            this._extractRenderData();
            this._rebuildSceneGeometry();
            this._rebuildNavMeshGeometry();
            this.centerCamera();

            this._spawnStartingAgent(json.startingPosition);
            const narrowCount = this._countNarrowPolys();
            this.setStatus(`NavMesh generata: ${this.renderPolygons.length} poligoni (${narrowCount} narrow), ${this.navMesh.nodes.length} nodi`);
        }
    }

    _extractRenderData() {
        this.renderVertices = [];
        this.renderPolygons = [];

        for (const tileId of Object.keys(this.navMesh.tiles)) {
            const tile = this.navMesh.tiles[tileId];
            this.renderVertices = tile.vertices;

            for (let i = 0; i < tile.polys.length; i++) {
                const poly = tile.polys[i];
                this.renderPolygons.push({
                    vertices: poly.vertices.slice(),
                    neis: poly.neis ? poly.neis.slice() : [],
                    area: poly.area,
                    flags: poly.flags
                });
            }
        }
    }

    isSharedEdge(v1Idx, v2Idx) {
        let count = 0;
        for (let pi = 0; pi < this.renderPolygons.length; pi++) {
            const verts = this.renderPolygons[pi].vertices;
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

    // ========================================================================
    // Pannello strutture UI
    // ========================================================================

    _buildStructurePanel() {
        const panel = document.getElementById('structurePanel');
        const list = document.getElementById('structureList');
        if (!panel || !list) return;

        list.innerHTML = '';

        if (!this.structuredMeshData || this.structuredMeshData.structures.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        for (const s of this.structuredMeshData.structures) {
            const item = document.createElement('div');
            item.className = 'structure-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !this.disabledStructures.has(s.id);
            checkbox.id = `struct_${s.id}`;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.disabledStructures.delete(s.id);
                } else {
                    this.disabledStructures.add(s.id);
                }
                this.rebuildNavMesh();
                this._rebuildSceneGeometry();
            });

            const label = document.createElement('label');
            label.htmlFor = `struct_${s.id}`;
            const typeLabel = s.type === 'building' ? 'Edificio' : 'Muro';
            label.textContent = s.label || `${typeLabel} (${s.id})`;

            item.appendChild(checkbox);
            item.appendChild(label);
            list.appendChild(item);
        }
    }

    _hideStructurePanel() {
        const panel = document.getElementById('structurePanel');
        if (panel) panel.style.display = 'none';
    }

    _updateStructureCheckboxes() {
        if (!this.structuredMeshData) return;
        for (const s of this.structuredMeshData.structures) {
            const cb = document.getElementById(`struct_${s.id}`);
            if (cb) cb.checked = !this.disabledStructures.has(s.id);
        }
    }

    // ========================================================================
    // Dati iniziali
    // ========================================================================

    loadInitialData() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('fromEditor')) {
            const data = localStorage.getItem('editorMesh3D');
            if (data) {
                try {
                    const json = JSON.parse(data);
                    this.loadMesh3D(json);
                    this.setStatus('Mesh 3D caricata dall\'editor');
                    return;
                } catch (e) {
                    console.error('Errore nel parsing della mesh dall\'editor:', e);
                }
            }
        }

        fetch('sample-mesh3d.json')
            .then(r => {
                if (!r.ok) throw new Error('File not found');
                return r.json();
            })
            .then(json => this.loadMesh3D(json))
            .catch(err => {
                console.warn('Nessun file di esempio trovato:', err.message);
                this.setStatus('Carica una mesh 3D dall\'editor o da file per iniziare');
            });
    }

    // ========================================================================
    // Gestione Agenti
    // ========================================================================

    _spawnStartingAgent(startingPosition) {
        if (!startingPosition) return;
        // startingPosition is [x, 0, z] from the exported JSON
        const worldPos = { x: startingPosition[0], y: startingPosition[2] };
        const agentId = this.addAgent(worldPos, false);
        if (agentId) {
            console.log('Starting agent spawned at', startingPosition);
        }
    }

    addAgent(worldPos, large = false) {
        if (!this.navMesh || !this.crowdSim) {
            console.log('NavMesh or Crowd not ready');
            return null;
        }

        const position = [worldPos.x, 0, worldPos.y];
        const queryFilter = large ? this.largeQueryFilter : this.smallQueryFilter;

        const nearestResult = createFindNearestPolyResult();
        findNearestPoly(
            nearestResult,
            this.navMesh,
            position,
            [5, 5, 5],
            queryFilter
        );

        if (!nearestResult.success) {
            this.setStatus(large
                ? 'Posizione non valida per agente grande (zona troppo stretta?)'
                : 'Posizione non valida sulla navmesh');
            return null;
        }

        const radius = large ? LARGE_RADIUS : SMALL_RADIUS;
        const height = large ? 5.4 : 1.8;
        const maxSpeed = large ? 2.0 : 3.5;

        const agentParams = {
            radius,
            height,
            maxAcceleration: 15.0,
            maxSpeed,
            collisionQueryRange: large ? 7.5 : 2.5,
            pathOptimizationRange: 12.0,
            separationWeight: 0.5,
            updateFlags: crowd.CrowdUpdateFlags.ANTICIPATE_TURNS |
                        crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE |
                        crowd.CrowdUpdateFlags.SEPARATION |
                        crowd.CrowdUpdateFlags.OPTIMIZE_VIS |
                        crowd.CrowdUpdateFlags.OPTIMIZE_TOPO,
            queryFilter,
            obstacleAvoidance: crowd.DEFAULT_OBSTACLE_AVOIDANCE_PARAMS,
            autoTraverseOffMeshConnections: true,
        };

        const agentId = crowd.addAgent(this.crowdSim, this.navMesh, nearestResult.position, agentParams);
        console.log(`Agent added (${large ? 'LARGE' : 'small'}) with ID:`, agentId);

        return agentId;
    }

    moveAgentsToTarget(worldPos) {
        if (!this.navMesh || !this.crowdSim) return;

        const targetPos = [worldPos.x, 0, worldPos.y];

        const nearestResult = createFindNearestPolyResult();
        findNearestPoly(
            nearestResult,
            this.navMesh,
            targetPos,
            [5, 5, 5],
            this.smallQueryFilter
        );

        if (!nearestResult.success) {
            this.setStatus('Target non raggiungibile');
            return;
        }

        for (const agentId of this.selectedAgents) {
            crowd.requestMoveTarget(
                this.crowdSim,
                agentId,
                nearestResult.nodeRef,
                nearestResult.position
            );
        }
    }

    clearAllAgents() {
        if (!this.crowdSim) return;

        const agentIds = Object.keys(this.crowdSim.agents);
        for (const agentId of agentIds) {
            crowd.removeAgent(this.crowdSim, agentId);
        }

        this._clearAllAgentMeshes();
        this.selectedAgents.clear();
        this.updateUI();
    }

    _clearAllAgentMeshes() {
        for (const [, meshData] of this.agentMeshes) {
            this._removeAgentMesh(meshData);
        }
        this.agentMeshes.clear();
    }

    // ========================================================================
    // Game Loop
    // ========================================================================

    update(dt) {
        if (this.crowdSim && this.navMesh) {
            crowd.update(this.crowdSim, this.navMesh, dt);
        }
    }

    render() {
        this._updateAgentMeshes();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    startLoop() {
        const loop = (time) => {
            const dt = Math.min((time - this.lastTime) / 1000, 0.1);
            this.lastTime = time;

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

// ============================================================================
// Avvio dell'applicazione
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    window.app = new CrowdSimulationApp();
});
