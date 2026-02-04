// ============================================================================
// Crowd Simulation con navcat (mesh 3D → navmesh automatica, multi-agent)
// ============================================================================
//
// Questa applicazione è un simulatore di folla basato su navigation mesh.
// La navmesh viene generata automaticamente da navcat a partire da una mesh
// 3D prodotta dall'editor (ground plane + volumi ostacolo estrusi).
//
// Supporta agenti di due dimensioni:
//   - Piccoli (default): radius 0.4, passano ovunque
//   - Grandi (Shift+click sinistro): radius 1.2, non passano nelle zone strette
//
// Funzionalità:
//   - Caricare una mesh 3D da file JSON o dall'editor integrato
//   - navcat genera la navmesh con aree marcate per agenti multi-dimensione
//   - Piazzare agenti sulla navmesh con click destro (piccoli) o Shift+sinistro (grandi)
//   - Selezionare agenti (singolo click o selezione rettangolare)
//   - Muovere gli agenti selezionati verso un target (click destro)
//   - Abilitare/disabilitare strutture (edifici, muri) dal pannello laterale
//   - Supporto per connessioni off-mesh tra isole separate della navmesh
// ============================================================================

// --- Import da navcat (API basso livello per pipeline personalizzata) ---

import {
    findNearestPoly,
    createFindNearestPolyResult,
    DEFAULT_QUERY_FILTER,
    getNodeByRef,
    addOffMeshConnection,
    OffMeshConnectionDirection,
    isOffMeshConnectionConnected,
    // Pipeline navmesh
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

// --- Costanti per le aree ---
const AREA_WALKABLE = 1;
const AREA_WALKABLE_NARROW = 2;

// --- Parametri agenti ---
const SMALL_RADIUS = 0.4;
const LARGE_RADIUS = 1.2; // 3x small

// ============================================================================
// Classe principale dell'applicazione
// ============================================================================
class CrowdSimulationApp {
    constructor() {
        // --- Riferimenti DOM ---
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

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

        // --- Query Filter per agenti piccoli (passano ovunque) ---
        this.smallQueryFilter = {
            includeFlags: DEFAULT_QUERY_FILTER.includeFlags,
            excludeFlags: DEFAULT_QUERY_FILTER.excludeFlags,
            getCost: DEFAULT_QUERY_FILTER.getCost,
            passFilter: DEFAULT_QUERY_FILTER.passFilter
        };

        // --- Query Filter per agenti grandi (esclusi da zone strette) ---
        this.largeQueryFilter = {
            getCost: DEFAULT_QUERY_FILTER.getCost,
            passFilter(nodeRef, navMesh) {
                const node = getNodeByRef(navMesh, nodeRef);
                return node.area !== AREA_WALKABLE_NARROW;
            }
        };

        // --- Selezione agenti ---
        this.selectedAgents = new Set();

        // --- Camera 2D ---
        this.camera = {
            x: 0,
            y: 0,
            zoom: 15
        };

        // --- Stato dell'input ---
        this.isPanning = false;
        this.isSelecting = false;
        this.dragStart = { x: 0, y: 0 };
        this.selectionRect = null;

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

        this.init();
    }

    // ========================================================================
    // Inizializzazione
    // ========================================================================

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.loadInitialData();
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

        // Pulsanti strutture
        document.getElementById('structAllOn')?.addEventListener('click', () => {
            this.disabledStructures.clear();
            this._updateStructureCheckboxes();
            this.rebuildNavMesh();
        });

        document.getElementById('structAllOff')?.addEventListener('click', () => {
            if (this.structuredMeshData) {
                for (const s of this.structuredMeshData.structures) {
                    this.disabledStructures.add(s.id);
                }
                this._updateStructureCheckboxes();
                this.rebuildNavMesh();
            }
        });

        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ========================================================================
    // Generazione NavMesh con pipeline personalizzata (multi-agent)
    // ========================================================================

    /**
     * Genera un tile dalla mesh data (positions/indices) senza creare un nuovo navmesh.
     * Esegue tutta la pipeline: markWalkableTriangles → rasterize → filter → compact →
     * erode → regions → contours → polyMesh → buildTile.
     */
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

        const cs_ = cs;
        const ch_ = ch;

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
            cellSize: cs_,
            cellHeight: ch_,
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

    /**
     * Combina ground + strutture abilitate + obstacles in positions/indices flat.
     */
    _combineMeshData() {
        const data = this.structuredMeshData;
        if (!data) return null;

        const positions = [];
        const indices = [];

        // Ground
        for (let i = 0; i < data.ground.positions.length; i++) {
            positions.push(data.ground.positions[i]);
        }
        for (let i = 0; i < data.ground.indices.length; i++) {
            indices.push(data.ground.indices[i]);
        }

        // Structures (solo quelle abilitate)
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

        // Static obstacles
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

    /**
     * Ricostruisce la navmesh in modo asincrono, sostituendo il tile esistente
     * senza ricreare il crowd. Gli agenti sopravvivono e i loro path vengono
     * rivalidati automaticamente da checkPathValidity() in crowd.update().
     */
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

    /**
     * Callback quando il worker completa il calcolo del tile.
     */
    _onWorkerResult(e) {
        const { tile, error, generationId } = e.data;

        // Ignora risultati di generazioni precedenti (stale)
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

        // Rimuovi il tile esistente e aggiungi quello nuovo
        removeTile(this.navMesh, 0, 0, 0);
        addTile(this.navMesh, tile);

        // Assegna flags univoci ai poligoni
        for (const tileId of Object.keys(this.navMesh.tiles)) {
            const t = this.navMesh.tiles[tileId];
            for (let i = 0; i < t.polys.length; i++) {
                t.polys[i].flags = i + 1;
                const nodeIdx = t.polyNodes[i];
                this.navMesh.nodes[nodeIdx].flags = i + 1;
            }
        }

        // Ri-aggiungi connessioni off-mesh
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

        // Flood fill pruning
        this._floodFillPrune();

        // NON ricreare il crowd - gli agenti sopravvivono

        this._extractRenderData();
        const narrowCount = this._countNarrowPolys();
        const agentCount = this.crowdSim ? Object.keys(this.crowdSim.agents).length : 0;
        this.setStatus(`NavMesh rigenerata: ${this.renderPolygons.length} poligoni (${narrowCount} narrow), ${agentCount} agenti preservati`);
    }

    /**
     * Flood fill pruning: disabilita i poligoni non raggiungibili dai seed points.
     */
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

    /**
     * Conta poligoni narrow nella navmesh.
     */
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
        // Detect formato: nuovo se json.ground esiste
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

            // Assegna flags univoci
            for (const tileId of Object.keys(this.navMesh.tiles)) {
                const tile = this.navMesh.tiles[tileId];
                for (let i = 0; i < tile.polys.length; i++) {
                    tile.polys[i].flags = i + 1;
                    const nodeIdx = tile.polyNodes[i];
                    this.navMesh.nodes[nodeIdx].flags = i + 1;
                }
            }

            // Off-mesh connections
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

            // Flood fill pruning
            this._floodFillPrune();

            this.crowdSim = crowd.create(LARGE_RADIUS);
            this.selectedAgents.clear();
            this._extractRenderData();
            this.centerCamera();

            this._buildStructurePanel();
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
            this._extractRenderData();
            this.centerCamera();

            const narrowCount = this._countNarrowPolys();
            this.setStatus(`NavMesh generata: ${this.renderPolygons.length} poligoni (${narrowCount} narrow), ${this.navMesh.nodes.length} nodi`);
        }
    }

    /**
     * Estrae vertici e poligoni dalla tile della navmesh per il rendering 2D.
     */
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

        this.camera.x = (minX + maxX) / 2;
        this.camera.y = (minZ + maxZ) / 2;

        const width = maxX - minX;
        const height = maxZ - minZ;
        const maxDim = Math.max(width, height);
        if (maxDim > 0) {
            this.camera.zoom = Math.min(this.canvas.width, this.canvas.height) / (maxDim * 1.2);
        }
    }

    // ========================================================================
    // Gestione Agenti
    // ========================================================================

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

        this.selectedAgents.clear();
        this.updateUI();
    }

    // ========================================================================
    // Input Mouse
    // ========================================================================

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
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
        } else if (e.button === 0 && e.shiftKey) {
            // Shift + click sinistro: crea agente grande
            this.addAgent(worldPos, true);
        } else if (e.button === 0) {
            // Click sinistro: selezione o creazione agente piccolo
            const clickedAgent = this.getAgentAtPosition(worldPos);

            if (clickedAgent) {
                this.selectedAgents.clear();
                this.selectedAgents.add(clickedAgent);
            } else {
                this.isSelecting = true;
                this.selectionRect = { x1: sx, y1: sy, x2: sx, y2: sy };
            }
        } else if (e.button === 2) {
            if (this.selectedAgents.size > 0) {
                this.moveAgentsToTarget(worldPos);
            } else {
                this.addAgent(worldPos, false);
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
            const minX = Math.min(this.selectionRect.x1, this.selectionRect.x2);
            const maxX = Math.max(this.selectionRect.x1, this.selectionRect.x2);
            const minY = Math.min(this.selectionRect.y1, this.selectionRect.y2);
            const maxY = Math.max(this.selectionRect.y1, this.selectionRect.y2);

            const width = maxX - minX;
            const height = maxY - minY;

            if (width > 5 || height > 5) {
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
                const worldPos = this.screenToWorld(this.selectionRect.x1, this.selectionRect.y1);
                if (!this.getAgentAtPosition(worldPos)) {
                    this.addAgent(worldPos, false);
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

    // ========================================================================
    // Update e Rendering
    // ========================================================================

    update(dt) {
        if (this.crowdSim && this.navMesh) {
            crowd.update(this.crowdSim, this.navMesh, dt);
        }
    }

    render() {
        const ctx = this.ctx;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();

        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        this.renderNavMesh(ctx);
        this.renderAgents(ctx);

        ctx.restore();

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
        if (this.renderPolygons.length === 0) return;

        const verts = this.renderVertices;

        for (let i = 0; i < this.renderPolygons.length; i++) {
            const poly = this.renderPolygons[i];
            if (poly.flags === 0) continue; // pruned by flood fill
            const isNarrow = poly.area === AREA_WALKABLE_NARROW;

            ctx.beginPath();
            for (let j = 0; j < poly.vertices.length; j++) {
                const vi = poly.vertices[j];
                const x = verts[vi * 3];
                const z = verts[vi * 3 + 2];
                if (j === 0) {
                    ctx.moveTo(x, z);
                } else {
                    ctx.lineTo(x, z);
                }
            }
            ctx.closePath();

            if (isNarrow) {
                ctx.fillStyle = `hsla(30, 50%, 25%, 0.5)`;
            } else {
                ctx.fillStyle = `hsla(${200 + (i * 17) % 60}, 50%, 30%, 0.5)`;
            }
            ctx.fill();

            ctx.strokeStyle = isNarrow ? '#886633' : '#0f3460';
            ctx.lineWidth = 0.1;
            ctx.stroke();
        }

        // Muri (bordi non condivisi)
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 0.15;

        for (let pi = 0; pi < this.renderPolygons.length; pi++) {
            const poly = this.renderPolygons[pi];
            const polyVerts = poly.vertices;

            for (let j = 0; j < polyVerts.length; j++) {
                const v1i = polyVerts[j];
                const v2i = polyVerts[(j + 1) % polyVerts.length];

                const isWall = !this.isSharedEdge(v1i, v2i);

                if (isWall) {
                    const v1x = verts[v1i * 3];
                    const v1z = verts[v1i * 3 + 2];
                    const v2x = verts[v2i * 3];
                    const v2z = verts[v2i * 3 + 2];

                    ctx.beginPath();
                    ctx.moveTo(v1x, v1z);
                    ctx.lineTo(v2x, v2z);
                    ctx.stroke();
                }
            }
        }

        // Connessioni off-mesh
        for (const conn of this.jsonOffMeshConnections) {
            const sx = conn.start[0], sz = conn.start[2];
            const ex = conn.end[0], ez = conn.end[2];

            ctx.beginPath();
            ctx.moveTo(sx, sz);
            ctx.lineTo(ex, ez);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 0.15;
            ctx.setLineDash([0.3, 0.2]);
            ctx.stroke();
            ctx.setLineDash([]);

            const dx = ex - sx, dz = ez - sz;
            const len = Math.hypot(dx, dz);
            if (len > 0) {
                const nx = dx / len, nz = dz / len;
                const as = 0.4;
                ctx.beginPath();
                ctx.moveTo(ex, ez);
                ctx.lineTo(ex - nx * as - nz * as * 0.5, ez - nz * as + nx * as * 0.5);
                ctx.lineTo(ex - nx * as + nz * as * 0.5, ez - nz * as - nx * as * 0.5);
                ctx.closePath();
                ctx.fillStyle = '#f59e0b';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(sx, sz, 0.25, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(ex, ez, 0.25, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
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

    renderAgents(ctx) {
        if (!this.crowdSim) return;

        for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
            const x = agent.position[0];
            const z = agent.position[2];
            const radius = agent.radius;
            const isLarge = radius > SMALL_RADIUS * 1.5;

            const isSelected = this.selectedAgents.has(agentId);

            // Corpo
            ctx.beginPath();
            ctx.arc(x, z, radius, 0, Math.PI * 2);
            if (isSelected) {
                ctx.fillStyle = '#e94560';
            } else if (isLarge) {
                ctx.fillStyle = '#d97706';
            } else {
                ctx.fillStyle = '#4a90d9';
            }
            ctx.fill();

            // Bordo
            ctx.strokeStyle = isSelected ? '#fff' : (isLarge ? '#92400e' : '#2a5080');
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

            // Percorso (corners)
            if (agent.corners && agent.corners.length > 0) {
                ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
                ctx.lineWidth = 0.05;
                ctx.beginPath();
                ctx.moveTo(x, z);
                for (const corner of agent.corners) {
                    ctx.lineTo(corner.position[0], corner.position[2]);
                }
                ctx.stroke();

                ctx.fillStyle = 'rgba(100, 200, 100, 0.8)';
                for (const corner of agent.corners) {
                    ctx.beginPath();
                    ctx.arc(corner.position[0], corner.position[2], 0.15, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Target
            if (agent.targetState === crowd.AgentTargetState.VALID) {
                ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.lineWidth = 0.03;
                ctx.setLineDash([0.2, 0.2]);
                ctx.beginPath();
                ctx.moveTo(x, z);
                ctx.lineTo(agent.targetPosition[0], agent.targetPosition[2]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.beginPath();
                ctx.arc(agent.targetPosition[0], agent.targetPosition[2], 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ========================================================================
    // Game Loop
    // ========================================================================

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
