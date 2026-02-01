// ============================================================================
// NavMesh Crowd Simulation usando navcat
// ============================================================================
//
// Questa applicazione è un simulatore di folla (crowd simulation) basato su
// navigation mesh (navmesh). Permette di:
//   - Caricare una navmesh da file JSON o dall'editor integrato
//   - Piazzare agenti sulla navmesh con click destro
//   - Selezionare agenti (singolo click o selezione rettangolare)
//   - Muovere gli agenti selezionati verso un target (click destro)
//   - Disabilitare/riabilitare poligoni della navmesh (ALT+click sinistro)
//   - Supporto per connessioni off-mesh tra isole separate della navmesh
//
// La navmesh viene costruita usando la libreria navcat, che gestisce:
//   - Pathfinding (A* su grafi di poligoni)
//   - Crowd simulation (steering, obstacle avoidance, separazione agenti)
//   - Off-mesh connections (passaggi tra zone non contigue)
//   - Query filtering (esclusione dinamica di poligoni dal pathfinding)
// ============================================================================

// --- Import da navcat (libreria di navigazione) ---

import {
    // createNavMesh: crea un oggetto NavMesh vuoto, contenitore per tiles e nodi
    createNavMesh,

    // buildTile: compila i dati geometrici (vertici, poligoni, detail mesh) in una tile binaria
    buildTile,

    // addTile: aggiunge una tile compilata alla NavMesh, rendendola navigabile
    addTile,

    // findNearestPoly: trova il poligono della navmesh più vicino a un punto 3D dato
    findNearestPoly,

    // createFindNearestPolyResult: crea un oggetto risultato riutilizzabile per findNearestPoly
    createFindNearestPolyResult,

    // DEFAULT_QUERY_FILTER: filtro di default per le query sulla navmesh (usa bitmask sui flags)
    DEFAULT_QUERY_FILTER,

    // getNodeByRef: dato un riferimento a nodo (nodeRef), restituisce l'oggetto nodo
    // con le sue proprietà (flags, area, ecc.). Usato nel custom queryFilter.
    getNodeByRef,

    // addOffMeshConnection: aggiunge un collegamento off-mesh alla navmesh.
    // I collegamenti off-mesh connettono punti della mesh che non sono geometricamente adiacenti
    // (es. ponti, teletrasporti, scale tra piani diversi, passaggi tra isole separate).
    addOffMeshConnection,

    // OffMeshConnectionDirection: enum con direzioni possibili per i collegamenti off-mesh:
    //   - START_TO_END: collegamento unidirezionale
    //   - BIDIRECTIONAL: collegamento percorribile in entrambe le direzioni
    OffMeshConnectionDirection,

    // isOffMeshConnectionConnected: verifica se un collegamento off-mesh è stato correttamente
    // collegato alla navmesh (i punti start/end devono trovarsi su poligoni validi)
    isOffMeshConnectionConnected,

    // polygonsToNavMeshTilePolys: converte poligoni esterni (formato semplice con array di indici)
    // nel formato interno navcat con calcolo automatico delle adiacenze (neighbors).
    // Fondamentale per far funzionare il pathfinding tra poligoni adiacenti.
    polygonsToNavMeshTilePolys,

    // polysToTileDetailMesh: genera il detail mesh (mesh triangolata ad alta risoluzione)
    // a partire dai poligoni della tile. Necessario per il posizionamento preciso
    // degli agenti sulla superficie della navmesh.
    polysToTileDetailMesh,
} from './navcat/dist/index.js';

// crowd: modulo per la simulazione di folla. Gestisce:
//   - Creazione/rimozione agenti
//   - Pathfinding e steering verso il target
//   - Obstacle avoidance (evitamento ostacoli dinamici tra agenti)
//   - Separation (forza di separazione tra agenti vicini)
//   - Traversal automatico di off-mesh connections
import { crowd } from './navcat/dist/blocks.js';

// vec3 e box3: utilità matematiche per vettori 3D e bounding box 3D
// vec3: operazioni su vettori [x, y, z]
// box3: bounding box rappresentato come [[minX, minY, minZ], [maxX, maxY, maxZ]]
import { vec3, box3 } from 'mathcat';

// ============================================================================
// Classe principale dell'applicazione
// ============================================================================
//
// CrowdSimulationApp gestisce l'intero ciclo di vita della simulazione:
//   1. Inizializzazione canvas e event listeners
//   2. Caricamento e costruzione della navmesh
//   3. Gestione input utente (mouse: click, drag, wheel)
//   4. Update della simulazione (crowd.update ogni frame)
//   5. Rendering 2D della navmesh, agenti, path e UI
//
// Coordinate:
//   - La navmesh usa coordinate 3D (X, Y, Z) dove Y è l'altezza (piano XZ)
//   - Il canvas 2D mappa X→orizzontale e Z→verticale
//   - La camera gestisce pan (traslazione) e zoom (scala)
// ============================================================================
class CrowdSimulationApp {
    constructor() {
        // --- Riferimenti DOM ---
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // --- Stato NavMesh e Crowd ---
        // navMesh: oggetto navcat contenente tiles, nodi e grafi di adiacenza
        this.navMesh = null;
        // crowdSim: oggetto crowd navcat, contiene tutti gli agenti e i loro stati
        this.crowdSim = null;

        // --- Dati JSON originali ---
        // Conserviamo i dati JSON originali della navmesh per il rendering 2D.
        // Il rendering non usa direttamente la struttura navcat interna, ma i dati
        // originali che sono più semplici da iterare per il disegno su canvas.
        this.jsonVertices = [];      // Array di vertici: [[x, y, z], ...]
        this.jsonPolygons = [];      // Array di poligoni: [{vertices: [i,j,k,...], neighbors: []}, ...]
        this.jsonOffMeshConnections = []; // Array di connessioni off-mesh dal JSON

        // --- Sistema di disabilitazione poligoni ---
        // Set di indici dei poligoni disabilitati. Quando un poligono è nel Set,
        // gli agenti non possono attraversarlo. L'utente può fare ALT+click su un
        // poligono per alternarne lo stato (abilitato/disabilitato).
        //
        // IMPORTANTE: questo Set viene condiviso per riferimento con il queryFilter.
        // NON va mai riassegnato (= new Set()), altrimenti il queryFilter perderebbe
        // il riferimento e continuerebbe a usare il vecchio Set vuoto.
        // Per resettarlo usare sempre .clear().
        this.disabledPolygons = new Set();
        this.sourceIdGroups = new Map();

        // --- Query Filter personalizzato ---
        // Il queryFilter è usato da tutte le operazioni di pathfinding (findNearestPoly,
        // requestMoveTarget, moveAlongSurface, ecc.) per decidere quali poligoni
        // sono attraversabili.
        //
        // Strategia dei flags:
        //   - Ad ogni poligono viene assegnato flags = indice + 1 (durante loadNavMeshFromJSON)
        //   - Si evita flags = 0 perché il DEFAULT_QUERY_FILTER usa un bitmask AND
        //     che fallirebbe con 0 (0 AND qualsiasi = 0 = falso)
        //   - passFilter() controlla se il flag del poligono (convertito in indice)
        //     è nel Set dei poligoni disabilitati
        //
        // Questo approccio è lo stesso usato dall'esempio "doors-and-keys" di navcat:
        // permette di abilitare/disabilitare poligoni a runtime SENZA ricostruire
        // la navmesh. La modifica è istantanea perché il filtro viene controllato
        // ad ogni query di pathfinding e ad ogni step di moveAlongSurface.
        this.queryFilter = {
            // Riferimento al Set dei poligoni disabilitati (condiviso con this.disabledPolygons)
            disabledFlags: this.disabledPolygons,

            // getCost: usa la funzione di costo di default (costo uniforme per area)
            getCost: DEFAULT_QUERY_FILTER.getCost,

            // passFilter: determina se un nodo/poligono è attraversabile.
            // Viene chiamato durante OGNI operazione di pathfinding e movimento.
            // Riceve il nodeRef (riferimento al nodo nella navmesh) e l'oggetto navMesh.
            // Restituisce true se il poligono è attraversabile, false altrimenti.
            passFilter(nodeRef, navMesh) {
                const node = getNodeByRef(navMesh, nodeRef);
                // Il flag del poligono è indice + 1, quindi l'indice è flags - 1
                return !this.disabledFlags.has(node.flags - 1);
            }
        };

        // --- Selezione agenti ---
        // Set di agentId (stringhe) degli agenti attualmente selezionati.
        // Gli agenti selezionati sono evidenziati in rosso e ricevono i comandi
        // di movimento con click destro.
        this.selectedAgents = new Set();

        // --- Camera 2D ---
        // La camera controlla la vista del canvas:
        //   - x, y: posizione del centro della vista in coordinate mondo (X, Z della navmesh)
        //   - zoom: fattore di scala (pixel per unità mondo). Valori più alti = più zoom in.
        this.camera = {
            x: 0,
            y: 0,
            zoom: 15
        };

        // --- Stato dell'input ---
        // Tracciamento dello stato corrente dell'interazione mouse
        this.isDragging = false;  // (non usato attualmente, riservato per future estensioni)
        this.isPanning = false;   // true durante il pan con click centrale
        this.isSelecting = false; // true durante la selezione rettangolare con click sinistro
        this.dragStart = { x: 0, y: 0 }; // posizione iniziale del drag in screen coords
        this.selectionRect = null; // rettangolo di selezione {x1, y1, x2, y2} in screen coords

        // --- Performance tracking ---
        this.lastTime = performance.now(); // timestamp dell'ultimo frame
        this.frameCount = 0; // contatore frame per il calcolo FPS
        this.fps = 0; // FPS correnti visualizzati nella UI

        // Avvia l'applicazione
        this.init();
    }

    // ========================================================================
    // Inizializzazione
    // ========================================================================

    /**
     * Inizializza tutti i sottosistemi dell'applicazione:
     * 1. Configura il canvas per occupare tutto lo spazio disponibile
     * 2. Registra gli event listener per input utente e UI
     * 3. Carica la navmesh di esempio (o quella dall'editor se presente)
     * 4. Avvia il game loop (update + render a 60fps via requestAnimationFrame)
     */
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.loadSampleNavMesh();
        this.startLoop();
    }

    /**
     * Configura il canvas per riempire il suo contenitore e gestisce il resize
     * della finestra. Il canvas viene ridimensionato ogni volta che la finestra
     * cambia dimensione per mantenere il rapporto 1:1 con i pixel fisici.
     */
    setupCanvas() {
        const resize = () => {
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        };
        resize();
        window.addEventListener('resize', resize);
    }

    /**
     * Registra tutti gli event listener per l'interfaccia utente:
     * - Pulsante "Carica NavMesh": apre il file picker per caricare un JSON
     * - Pulsante "Rimuovi Agenti": rimuove tutti gli agenti dalla simulazione
     * - Pulsante "NavMesh di Esempio": carica la navmesh sample-navmesh.json
     * - Eventi mouse sul canvas: click, drag, wheel per interazione con la scena
     * - Disabilitazione del context menu nativo del browser sul canvas
     */
    setupEventListeners() {
        // --- Pulsanti della toolbar ---

        // Carica NavMesh da file JSON
        document.getElementById('loadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        // Handler per il file selezionato: legge il JSON e lo carica nella navmesh
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

        // Rimuovi tutti gli agenti dalla simulazione
        document.getElementById('clearAgents').addEventListener('click', () => {
            this.clearAllAgents();
        });

        // Carica la navmesh di esempio
        document.getElementById('generateSample').addEventListener('click', () => {
            this.loadSampleNavMesh();
        });

        // --- Eventi mouse sul canvas ---
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));

        // Previene il menu contestuale nativo del browser per poter usare
        // il click destro come azione di gioco (aggiunta agente / movimento)
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ========================================================================
    // Costruzione della NavMesh da JSON
    // ========================================================================

    /**
     * Converte un oggetto JSON di navmesh nel formato interno navcat e costruisce
     * la navigation mesh completa.
     *
     * Pipeline di costruzione:
     *   1. Salva i dati originali per il rendering 2D
     *   2. Converte i vertici in flat array e calcola il bounding box
     *   3. Converte i poligoni nel formato navcat (ExternalPolygon) con flags univoci
     *   4. Calcola le adiacenze tra poligoni (polygonsToNavMeshTilePolys)
     *   5. Genera il detail mesh per il posizionamento preciso sulla superficie
     *   6. Crea la NavMesh e configura le dimensioni dal bounding box
     *   7. Compila la tile (buildTile) e la aggiunge alla NavMesh (addTile)
     *   8. Aggiunge eventuali connessioni off-mesh
     *   9. Crea il sistema crowd per la simulazione degli agenti
     *
     * Formato JSON di input atteso:
     *   {
     *     "vertices": [[x, 0, z], ...],           // vertici 3D (Y=0 per navmesh planare)
     *     "polygons": [{"vertices": [i,j,k,...], "neighbors": []}, ...],
     *     "offMeshConnections": [                  // opzionale
     *       {"start": [x,0,z], "end": [x,0,z], "radius": 0.5, "bidirectional": true}
     *     ]
     *   }
     *
     * @param {Object} json - Oggetto JSON con vertices, polygons e opzionalmente offMeshConnections
     */
    loadNavMeshFromJSON(json) {
        // Salva i dati originali per il rendering.
        // Il rendering usa questi dati direttamente perché sono più semplici
        // da iterare rispetto alla struttura interna navcat.
        this.jsonVertices = json.vertices;
        this.jsonPolygons = json.polygons;

        // IMPORTANTE: usa .clear() e NON "= new Set()" per mantenere il riferimento
        // condiviso con this.queryFilter.disabledFlags. Se usassimo = new Set(),
        // il queryFilter continuerebbe a puntare al vecchio Set vuoto e i poligoni
        // disabilitati non verrebbero filtrati.
        this.disabledPolygons.clear();

        // --- Step 1: Converti vertices in flat array e calcola bounding box ---
        // navcat richiede i vertici come flat Float32-like array: [x0,y0,z0, x1,y1,z1, ...]
        // Il bounding box è necessario per configurare le dimensioni della tile.
        const flatVertices = [];
        const bounds = box3.create(); // [[Infinity,Infinity,Infinity], [-Inf,-Inf,-Inf]]

        for (const v of json.vertices) {
            const point = [v[0], v[1], v[2]];
            flatVertices.push(v[0], v[1], v[2]);
            // Espande il bounding box per includere questo punto
            box3.expandByPoint(bounds, bounds, point);
        }

        console.log('Vertices count:', json.vertices.length);
        console.log('Bounds:', bounds);
        console.log('Flat vertices sample:', flatVertices.slice(0, 12));

        // --- Step 2: Converti poligoni nel formato navcat ---
        // Ogni poligono riceve un flags univoco = indice + 1.
        // Questo flags viene usato dal queryFilter per identificare e filtrare
        // i singoli poligoni. Si usa indice+1 perché flags=0 non funzionerebbe
        // con il bitmask AND del DEFAULT_QUERY_FILTER.
        // area: 0 = area di default (costo di attraversamento standard)
        const externalPolygons = json.polygons.map((p, i) => {
            console.log(`Polygon ${i}: vertices = [${p.vertices.join(', ')}]`);
            return {
                vertices: [...p.vertices], // copia dell'array di indici dei vertici
                flags: i + 1,              // flag univoco per il queryFilter
                area: 0                    // area type (0 = default, costo uniforme)
            };
        });

        // --- Step 3: Calcola adiacenze tra poligoni ---
        // polygonsToNavMeshTilePolys analizza quali poligoni condividono edges
        // (coppie di vertici consecutivi) e imposta le relazioni di adiacenza (neis).
        // Queste adiacenze sono fondamentali per il pathfinding A* che naviga
        // da un poligono all'altro attraverso gli edge condivisi.
        console.log('Calling polygonsToNavMeshTilePolys...');
        const tilePolys = polygonsToNavMeshTilePolys(
            externalPolygons,
            flatVertices,
            0,      // borderSize = 0 per single tile (nessun bordo di overlap)
            bounds  // bounding box per la configurazione della tile
        );

        console.log('TilePolys result:', tilePolys);
        console.log('Polys count:', tilePolys.polys.length);

        // Debug: mostra le adiacenze calcolate per i primi poligoni
        for (let i = 0; i < Math.min(5, tilePolys.polys.length); i++) {
            console.log(`Poly ${i} neis:`, tilePolys.polys[i].neis);
        }

        // --- Step 4: Genera detail mesh ---
        // Il detail mesh è una triangolazione più fine della superficie di ogni poligono.
        // Viene usato da navcat per il posizionamento preciso degli agenti:
        // quando un agente si trova su un poligono, il detail mesh determina
        // l'altezza esatta (Y) della superficie in quel punto.
        const tileDetailMesh = polysToTileDetailMesh(tilePolys.polys);
        console.log('Detail mesh:', tileDetailMesh);

        // --- Step 5: Crea NavMesh e configura dimensioni ---
        this.navMesh = createNavMesh();

        // Le dimensioni della tile determinano lo spazio navigabile.
        // Per una navmesh a singola tile, la tile copre l'intero bounding box.
        // L'origine è l'angolo minimo del bounding box.
        this.navMesh.tileWidth = bounds[1][0] - bounds[0][0];   // larghezza (asse X)
        this.navMesh.tileHeight = bounds[1][2] - bounds[0][2];  // profondità (asse Z)
        this.navMesh.origin[0] = bounds[0][0]; // origine X
        this.navMesh.origin[1] = bounds[0][1]; // origine Y (altezza)
        this.navMesh.origin[2] = bounds[0][2]; // origine Z

        console.log('NavMesh dimensions:', {
            tileWidth: this.navMesh.tileWidth,
            tileHeight: this.navMesh.tileHeight,
            origin: [...this.navMesh.origin],
            bounds: JSON.stringify(bounds)
        });

        // --- Step 6: Configura parametri della tile e compilala ---
        // Questi parametri definiscono le proprietà fisiche della navmesh:
        const tileParams = {
            bounds: bounds,                          // bounding box 3D
            vertices: tilePolys.vertices,            // vertici nel formato interno
            polys: tilePolys.polys,                  // poligoni con adiacenze
            detailMeshes: tileDetailMesh.detailMeshes,       // mesh di dettaglio per poligono
            detailVertices: tileDetailMesh.detailVertices,   // vertici aggiuntivi del detail
            detailTriangles: tileDetailMesh.detailTriangles, // triangoli del detail
            tileX: 0,            // coordinata X della tile nella griglia (0 = singola tile)
            tileY: 0,            // coordinata Y della tile nella griglia
            tileLayer: 0,        // layer della tile (0 = singolo livello)
            cellSize: 0.2,       // dimensione cella per la discretizzazione (unità mondo)
            cellHeight: 0.2,     // altezza cella (risoluzione verticale)
            walkableHeight: 2.0, // altezza minima percorribile (per passaggi sotto ostacoli)
            walkableRadius: 0.4, // raggio dell'agente (per shrinking dei bordi)
            walkableClimb: 0.5,  // altezza massima scalabile senza scale/rampe
        };

        // buildTile compila i dati geometrici in un formato binario ottimizzato
        // per le query di pathfinding e navigazione di navcat.
        console.log('Building tile...');
        const tile = buildTile(tileParams);
        console.log('Tile built:', tile);

        // addTile aggiunge la tile compilata alla NavMesh, rendendola attiva
        // e navigabile. Da questo momento gli agenti possono fare pathfinding su di essa.
        addTile(this.navMesh, tile);
        console.log('Tile added to navMesh');

        // --- Step 7: Aggiungi connessioni off-mesh ---
        // Le connessioni off-mesh collegano punti della navmesh che non sono
        // geometricamente adiacenti. Sono usate per modellare:
        //   - Ponti o passerelle tra isole separate
        //   - Teletrasporti o portali
        //   - Scale tra livelli diversi
        //
        // Le connessioni vengono aggiunte DOPO la costruzione della tile perché
        // navcat le integra nella struttura esistente trovando i poligoni più
        // vicini ai punti start/end.
        this.jsonOffMeshConnections = json.offMeshConnections || [];
        for (const conn of this.jsonOffMeshConnections) {
            const connId = addOffMeshConnection(this.navMesh, {
                start: conn.start,   // punto di partenza [x, y, z]
                end: conn.end,       // punto di arrivo [x, y, z]
                radius: conn.radius || 0.5,  // raggio dell'area di attivazione
                direction: conn.bidirectional
                    ? OffMeshConnectionDirection.BIDIRECTIONAL  // percorribile in entrambe le direzioni
                    : OffMeshConnectionDirection.START_TO_END,  // solo da start a end
                flags: 0xffffff, // tutti i flag attivi (sempre attraversabile dal queryFilter)
                area: 0,         // area type di default
            });

            // Verifica che la connessione sia stata collegata correttamente.
            // Una connessione non collegata indica che start o end non si trovano
            // su un poligono valido della navmesh.
            const connected = isOffMeshConnectionConnected(this.navMesh, connId);
            console.log(`OffMesh connection ${connId}: connected=${connected}`, conn);
        }

        // --- Verifica finale della NavMesh ---
        console.log('NavMesh tiles:', Object.keys(this.navMesh.tiles));
        console.log('NavMesh nodes:', this.navMesh.nodes.length);

        // --- Step 8: Crea il sistema crowd ---
        // Il crowd gestisce tutti gli agenti della simulazione. Il parametro è
        // maxAgentRadius: il raggio massimo che un agente può avere.
        // Viene usato internamente per ottimizzare le query spaziali.
        this.crowdSim = crowd.create(0.5);
        console.log('Crowd created:', this.crowdSim);

        // Reset della selezione agenti (necessario se si ricarica una nuova navmesh)
        this.selectedAgents.clear();

        // --- Step 9: Build sourceId → polygon index groups ---
        // Buildings with wall-edge connections are split into multiple sub-polygons,
        // and wall units from the same wall share a common sourceId prefix.
        // We group polygons by sourceId for batch toggle (ALT+click).
        this.sourceIdGroups = new Map(); // sourceId → [polyIdx, ...]
        for (let i = 0; i < json.polygons.length; i++) {
            const sid = json.polygons[i].sourceId;
            if (sid) {
                if (!this.sourceIdGroups.has(sid)) {
                    this.sourceIdGroups.set(sid, []);
                }
                this.sourceIdGroups.get(sid).push(i);
            }
        }

        // --- Step 10: Auto-disable building/wall polygons ---
        // I poligoni di tipo 'building' e 'wall_unit' vengono automaticamente
        // disabilitati nel pathfinding, così gli agenti non possono attraversarli.
        // L'utente può riabilitarli con ALT+click (simulazione distruzione).
        for (let i = 0; i < json.polygons.length; i++) {
            const polyType = json.polygons[i].type;
            if (polyType === 'building' || polyType === 'wall_unit') {
                this.disabledPolygons.add(i);
            }
        }

        // Centra la camera sulla navmesh appena caricata
        this.centerCamera();

        this.setStatus(`NavMesh caricata: ${json.polygons.length} poligoni, ${this.navMesh.nodes.length} nodi`);
    }

    /**
     * Carica la navmesh iniziale. Controlla prima se l'URL contiene il parametro
     * "fromEditor", che indica che l'utente ha esportato una navmesh dall'editor
     * e l'ha salvata in localStorage. Se presente, carica quella; altrimenti
     * carica il file di esempio sample-navmesh.json.
     *
     * Flusso dall'editor:
     *   1. L'utente clicca "Apri nel Simulatore" nell'editor
     *   2. L'editor salva il JSON in localStorage con chiave "editorNavMesh"
     *   3. L'editor apre index.html?fromEditor=1
     *   4. Questa funzione legge il parametro e carica da localStorage
     */
    loadSampleNavMesh() {
        // Controlla se c'è una navmesh dall'editor via URL parameter
        const params = new URLSearchParams(window.location.search);
        if (params.has('fromEditor')) {
            const data = localStorage.getItem('editorNavMesh');
            if (data) {
                try {
                    const json = JSON.parse(data);
                    this.loadNavMeshFromJSON(json);
                    this.setStatus('NavMesh caricata dall\'editor');
                    return;
                } catch (e) {
                    console.error('Errore nel parsing della navmesh dall\'editor:', e);
                }
            }
        }

        // Fallback: carica il file di esempio via fetch
        fetch('sample-navmesh.json')
            .then(r => r.json())
            .then(json => this.loadNavMeshFromJSON(json))
            .catch(err => {
                console.error('Errore nel caricamento:', err);
                this.setStatus('Errore nel caricamento della navmesh di esempio');
            });
    }

    /**
     * Centra la camera sulla navmesh, calcolando il punto medio e lo zoom
     * ottimale per visualizzare l'intera mesh nel canvas.
     * Usa le coordinate X e Z dei vertici (il canvas mappa X→orizzontale, Z→verticale).
     */
    centerCamera() {
        if (this.jsonVertices.length === 0) return;

        // Calcola il bounding box 2D (piano XZ) dei vertici
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const v of this.jsonVertices) {
            minX = Math.min(minX, v[0]);
            maxX = Math.max(maxX, v[0]);
            minZ = Math.min(minZ, v[2]);
            maxZ = Math.max(maxZ, v[2]);
        }

        // Centra la camera sul punto medio della navmesh
        this.camera.x = (minX + maxX) / 2;
        this.camera.y = (minZ + maxZ) / 2;

        // Calcola lo zoom per far entrare tutta la navmesh nel canvas
        // con un margine del 20% (fattore 1.2)
        const width = maxX - minX;
        const height = maxZ - minZ;
        const maxDim = Math.max(width, height);
        this.camera.zoom = Math.min(this.canvas.width, this.canvas.height) / (maxDim * 1.2);
    }

    // ========================================================================
    // Gestione Agenti
    // ========================================================================

    /**
     * Aggiunge un nuovo agente alla simulazione nella posizione mondo specificata.
     *
     * Procedura:
     *   1. Converte la posizione 2D (canvas) in 3D (navmesh: X,0,Z)
     *   2. Trova il poligono più vicino alla posizione usando findNearestPoly
     *   3. Se trovato, crea l'agente con i parametri di navigazione
     *   4. L'agente viene aggiunto al crowd e inizia a partecipare alla simulazione
     *
     * Parametri dell'agente:
     *   - radius: 0.4 unità (raggio collisione con altri agenti)
     *   - height: 1.8 unità (altezza per obstacle avoidance verticale)
     *   - maxAcceleration: 15.0 (quanto velocemente l'agente può cambiare velocità)
     *   - maxSpeed: 3.5 unità/s (velocità massima di movimento)
     *   - collisionQueryRange: 2.5 (raggio entro cui cercare agenti per evitarli)
     *   - pathOptimizationRange: 12.0 (distanza per ottimizzazione locale del path)
     *   - separationWeight: 0.5 (forza di separazione tra agenti vicini)
     *   - autoTraverseOffMeshConnections: true (attraversa automaticamente i link off-mesh)
     *
     * @param {Object} worldPos - Posizione nel mondo {x, y} dove x→X e y→Z
     * @returns {string|null} ID dell'agente creato, o null se la posizione non è valida
     */
    addAgent(worldPos) {
        if (!this.navMesh || !this.crowdSim) {
            console.log('NavMesh or Crowd not ready');
            return null;
        }

        // Converti da coordinate canvas 2D a coordinate navmesh 3D
        // worldPos.x → asse X della navmesh, worldPos.y → asse Z della navmesh
        const position = [worldPos.x, 0, worldPos.y];
        console.log('Adding agent at position:', position);

        // Trova il poligono della navmesh più vicino alla posizione richiesta.
        // halfExtents = [5, 5, 5] definisce il volume di ricerca attorno al punto.
        // Usa this.queryFilter per escludere i poligoni disabilitati dalla ricerca.
        const nearestResult = createFindNearestPolyResult();
        findNearestPoly(
            nearestResult,
            this.navMesh,
            position,
            [5, 5, 5],           // halfExtents: volume di ricerca cubico
            this.queryFilter      // filtro: esclude poligoni disabilitati
        );

        console.log('FindNearestPoly result:', nearestResult);

        if (!nearestResult.success) {
            console.log('Could not find polygon near position');
            this.setStatus('Posizione non valida sulla navmesh');
            return null;
        }

        // Parametri di navigazione dell'agente
        const agentParams = {
            radius: 0.4,              // raggio fisico dell'agente (per collisioni)
            height: 1.8,              // altezza dell'agente
            maxAcceleration: 15.0,    // accelerazione massima (unità/s²)
            maxSpeed: 3.5,            // velocità massima (unità/s)
            collisionQueryRange: 2.5, // raggio di rilevamento altri agenti
            pathOptimizationRange: 12.0, // raggio per ottimizzazione locale del percorso

            // Peso della forza di separazione (0-1): quanto gli agenti si respingono
            separationWeight: 0.5,

            // Flag di comportamento del crowd:
            //   ANTICIPATE_TURNS: anticipa le curve per traiettorie più fluide
            //   OBSTACLE_AVOIDANCE: evita collisioni con altri agenti
            //   SEPARATION: mantiene distanza dagli altri agenti
            //   OPTIMIZE_VIS: ottimizza il percorso usando line-of-sight
            //   OPTIMIZE_TOPO: ottimizza il percorso usando la topologia della mesh
            updateFlags: crowd.CrowdUpdateFlags.ANTICIPATE_TURNS |
                        crowd.CrowdUpdateFlags.OBSTACLE_AVOIDANCE |
                        crowd.CrowdUpdateFlags.SEPARATION |
                        crowd.CrowdUpdateFlags.OPTIMIZE_VIS |
                        crowd.CrowdUpdateFlags.OPTIMIZE_TOPO,

            // Usa il queryFilter personalizzato per rispettare i poligoni disabilitati
            queryFilter: this.queryFilter,

            // Parametri predefiniti per l'obstacle avoidance tra agenti
            obstacleAvoidance: crowd.DEFAULT_OBSTACLE_AVOIDANCE_PARAMS,

            // Abilita l'attraversamento automatico delle connessioni off-mesh.
            // Quando l'agente raggiunge un endpoint di una connessione off-mesh
            // durante il suo percorso, viene automaticamente teletrasportato
            // all'altro endpoint con un'interpolazione lineare di 0.5 secondi.
            autoTraverseOffMeshConnections: true,
        };

        // Aggiunge l'agente al crowd nella posizione trovata sulla navmesh.
        // nearestResult.position è il punto esatto sulla superficie del poligono
        // più vicino, non necessariamente il punto cliccato dall'utente.
        const agentId = crowd.addAgent(this.crowdSim, this.navMesh, nearestResult.position, agentParams);
        console.log('Agent added with ID:', agentId);
        console.log('Agent data:', this.crowdSim.agents[agentId]);

        return agentId;
    }

    /**
     * Imposta il target di movimento per tutti gli agenti selezionati.
     * Trova il poligono più vicino al punto cliccato e chiama requestMoveTarget
     * per ogni agente selezionato, che avvia il pathfinding verso quel target.
     *
     * Il crowd system di navcat gestisce automaticamente:
     *   - Pathfinding A* dalla posizione corrente al target
     *   - Steering verso i waypoint del percorso
     *   - Obstacle avoidance con altri agenti
     *   - Attraversamento di off-mesh connections se nel percorso
     *
     * @param {Object} worldPos - Posizione target nel mondo {x, y}
     */
    moveAgentsToTarget(worldPos) {
        if (!this.navMesh || !this.crowdSim) return;

        // Converti in coordinate 3D navmesh
        const targetPos = [worldPos.x, 0, worldPos.y];
        console.log('Moving agents to:', targetPos);

        // Trova il poligono più vicino al target
        const nearestResult = createFindNearestPolyResult();
        findNearestPoly(
            nearestResult,
            this.navMesh,
            targetPos,
            [5, 5, 5],
            this.queryFilter // rispetta i poligoni disabilitati
        );

        console.log('Target findNearestPoly result:', nearestResult);

        if (!nearestResult.success) {
            this.setStatus('Target non raggiungibile');
            return;
        }

        // Imposta il target per tutti gli agenti selezionati.
        // requestMoveTarget avvia il pathfinding A* per l'agente: calcola il
        // "corridor" (sequenza di poligoni dal corrente al target) e i "corners"
        // (waypoint lungo il percorso). L'agente inizierà a muoversi al prossimo
        // update del crowd.
        for (const agentId of this.selectedAgents) {
            console.log(`Setting target for agent ${agentId}:`, nearestResult.position);
            const success = crowd.requestMoveTarget(
                this.crowdSim,
                agentId,
                nearestResult.nodeRef,    // riferimento al nodo/poligono target
                nearestResult.position    // posizione esatta sulla superficie del poligono
            );
            console.log(`requestMoveTarget result: ${success}`);
        }
    }

    /**
     * Rimuove tutti gli agenti dalla simulazione e resetta la selezione.
     */
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

    /**
     * Converte coordinate schermo (pixel canvas) in coordinate mondo (unità navmesh).
     * La trasformazione tiene conto della posizione e zoom della camera.
     *
     * Formula: worldPos = (screenPos - canvasCenter) / zoom + cameraPos
     *
     * @param {number} sx - coordinata X in pixel del canvas
     * @param {number} sy - coordinata Y in pixel del canvas
     * @returns {Object} {x, y} coordinate mondo dove x→X navmesh, y→Z navmesh
     */
    screenToWorld(sx, sy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: (sx - cx) / this.camera.zoom + this.camera.x,
            y: (sy - cy) / this.camera.zoom + this.camera.y
        };
    }

    /**
     * Converte coordinate mondo in coordinate schermo (inverso di screenToWorld).
     *
     * Formula: screenPos = (worldPos - cameraPos) * zoom + canvasCenter
     *
     * @param {number} wx - coordinata X mondo (asse X navmesh)
     * @param {number} wy - coordinata Y mondo (asse Z navmesh)
     * @returns {Object} {x, y} coordinate in pixel del canvas
     */
    worldToScreen(wx, wy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        return {
            x: (wx - this.camera.x) * this.camera.zoom + cx,
            y: (wy - this.camera.y) * this.camera.zoom + cy
        };
    }

    /**
     * Cerca un agente vicino alla posizione mondo specificata.
     * Itera tutti gli agenti e controlla la distanza dal punto.
     * Il raggio di hit-test è 1.5 volte il raggio dell'agente.
     *
     * @param {Object} worldPos - posizione mondo {x, y}
     * @returns {string|null} agentId dell'agente trovato, o null
     */
    getAgentAtPosition(worldPos) {
        if (!this.crowdSim) return null;

        for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
            // Calcola distanza 2D (piano XZ) tra il punto e la posizione dell'agente
            const dx = agent.position[0] - worldPos.x;  // differenza X
            const dz = agent.position[2] - worldPos.y;  // differenza Z
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Hit-test con margine di 1.5x il raggio dell'agente
            if (dist < agent.radius * 1.5) {
                return agentId;
            }
        }

        return null;
    }

    /**
     * Trova il poligono della navmesh sotto la posizione mondo specificata.
     * Usa il test point-in-polygon 2D sul piano XZ per ogni poligono.
     *
     * @param {Object} worldPos - posizione mondo {x, y} dove x→X, y→Z
     * @returns {number} indice del poligono trovato, o -1 se nessuno
     */
    getPolygonAtPosition(worldPos) {
        for (let i = 0; i < this.jsonPolygons.length; i++) {
            const poly = this.jsonPolygons[i];
            // Mappa gli indici dei vertici alle coordinate 3D
            const pts = poly.vertices.map(vi => this.jsonVertices[vi]);
            // Test point-in-polygon usando coordinate X e Z (indici 0 e 2)
            if (this.pointInPolygon2D(worldPos.x, worldPos.y, pts)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Test point-in-polygon usando l'algoritmo ray casting.
     * Lancia un raggio orizzontale dal punto e conta le intersezioni
     * con i lati del poligono. Se il conteggio è dispari, il punto è dentro.
     *
     * Usa le coordinate X (indice 0) e Z (indice 2) dei vertici 3D,
     * ignorando l'altezza Y (indice 1).
     *
     * @param {number} x - coordinata X del punto da testare
     * @param {number} y - coordinata Z del punto da testare (nota: parametro "y" ma usa asse Z)
     * @param {Array} pts - array di vertici 3D [[x,y,z], ...] del poligono
     * @returns {boolean} true se il punto è dentro il poligono
     */
    pointInPolygon2D(x, y, pts) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i][0], yi = pts[i][2]; // X e Z del vertice i
            const xj = pts[j][0], yj = pts[j][2]; // X e Z del vertice j
            // Test intersezione raggio orizzontale con il lato i-j
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside; // ogni intersezione inverte lo stato dentro/fuori
            }
        }
        return inside;
    }

    /**
     * Alterna lo stato di un poligono tra abilitato e disabilitato.
     * Chiamato quando l'utente fa ALT+click sinistro su un poligono.
     *
     * Quando un poligono viene disabilitato:
     *   1. Il suo indice viene aggiunto a this.disabledPolygons
     *   2. Il queryFilter (condiviso per riferimento) lo escluderà dal pathfinding
     *   3. Tutti gli agenti con un target attivo ricalcolano il loro percorso
     *   4. Il poligono viene renderizzato in rosso scuro con una X
     *   5. I bordi condivisi con poligoni disabilitati diventano "muri" nel rendering
     *
     * Il ricalcolo dei percorsi è necessario perché gli agenti hanno un "corridor"
     * (sequenza di poligoni) calcolato in precedenza che potrebbe passare per il
     * poligono appena disabilitato. Senza ricalcolo, l'agente continuerebbe
     * a seguire il vecchio percorso.
     *
     * @param {number} polyIdx - indice del poligono da alternare
     */
    togglePolygon(polyIdx) {
        // If the polygon has a sourceId, toggle ALL polygons in the group
        // (buildings/walls are fan-triangulated into multiple triangles)
        const poly = this.jsonPolygons[polyIdx];
        const sourceId = poly && poly.sourceId;
        const group = sourceId ? this.sourceIdGroups.get(sourceId) : null;
        const indices = (group && group.length > 1) ? group : [polyIdx];

        const enabling = this.disabledPolygons.has(indices[0]);
        for (const idx of indices) {
            if (enabling) {
                this.disabledPolygons.delete(idx);
            } else {
                this.disabledPolygons.add(idx);
            }
        }

        if (sourceId) {
            this.setStatus(`${poly.type} ${sourceId} ${enabling ? 'riattivato' : 'disattivato'} (${indices.length} poligoni)`);
        } else {
            this.setStatus(`Poligono ${polyIdx} ${enabling ? 'riattivato' : 'disattivato'}`);
        }

        // Forza il ricalcolo dei path per tutti gli agenti con target attivo.
        // Per ogni agente, rifacciamo findNearestPoly sul suo target corrente
        // (che ora rispetterà il nuovo stato dei poligoni disabilitati) e poi
        // chiamiamo requestMoveTarget per rigenerare il corridor di navigazione.
        if (this.crowdSim && this.navMesh) {
            for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
                if (agent.targetState === crowd.AgentTargetState.VALID) {
                    const targetPos = [...agent.targetPosition]; // copia della posizione target
                    const nearestResult = createFindNearestPolyResult();
                    findNearestPoly(nearestResult, this.navMesh, targetPos, [5, 5, 5], this.queryFilter);
                    if (nearestResult.success) {
                        crowd.requestMoveTarget(this.crowdSim, agentId, nearestResult.nodeRef, nearestResult.position);
                    }
                }
            }
        }
    }

    /**
     * Handler per il mousedown sul canvas. Gestisce diverse azioni in base
     * al pulsante premuto e ai tasti modificatori:
     *
     *   - Click centrale (button=1): Inizia il pan della camera
     *   - ALT + Click sinistro (button=0 + altKey): Toggle poligono
     *   - Click sinistro su agente (button=0): Seleziona agente (Shift per aggiungere)
     *   - Click sinistro su vuoto (button=0): Inizia selezione rettangolare
     *   - Click destro con selezione (button=2): Muovi agenti selezionati al target
     *   - Click destro senza selezione (button=2): Piazza un nuovo agente
     */
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left; // coordinata X in pixel del canvas
        const sy = e.clientY - rect.top;  // coordinata Y in pixel del canvas
        const worldPos = this.screenToWorld(sx, sy);

        // Salva il punto di inizio del drag (sia in screen che in world coords)
        this.dragStart = { x: sx, y: sy, worldX: worldPos.x, worldY: worldPos.y };

        if (e.button === 1) {
            // --- Click centrale: Pan della camera ---
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
        } else if (e.button === 0 && e.altKey) {
            // --- ALT + Click sinistro: Toggle poligono ---
            // Trova il poligono sotto il cursore e ne alterna lo stato
            const polyIdx = this.getPolygonAtPosition(worldPos);
            if (polyIdx >= 0) {
                this.togglePolygon(polyIdx);
            }
            return; // non fare altre azioni (selezione, ecc.)
        } else if (e.button === 0) {
            // --- Click sinistro: Selezione ---
            const clickedAgent = this.getAgentAtPosition(worldPos);

            if (clickedAgent) {
                // Click su un agente: selezionalo
                // Se Shift non è premuto, deseleziona tutti gli altri prima
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
            // --- Click destro: Azione contestuale ---
            if (this.selectedAgents.size > 0) {
                // Se ci sono agenti selezionati: muovili verso il punto cliccato
                this.moveAgentsToTarget(worldPos);
            } else {
                // Se nessun agente è selezionato: piazza un nuovo agente
                this.addAgent(worldPos);
            }
        }

        this.updateUI();
    }

    /**
     * Handler per il mousemove. Gestisce il pan della camera e l'aggiornamento
     * del rettangolo di selezione durante il drag.
     */
    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        if (this.isPanning) {
            // Pan: sposta la camera in base allo spostamento del mouse
            // diviso per lo zoom (per mantenere la velocità costante in mondo)
            const dx = (sx - this.dragStart.x) / this.camera.zoom;
            const dy = (sy - this.dragStart.y) / this.camera.zoom;
            this.camera.x -= dx;
            this.camera.y -= dy;
            // Aggiorna il punto di partenza per il prossimo frame
            this.dragStart.x = sx;
            this.dragStart.y = sy;
        } else if (this.isSelecting) {
            // Selezione rettangolare: aggiorna il secondo angolo
            this.selectionRect.x2 = sx;
            this.selectionRect.y2 = sy;
        }
    }

    /**
     * Handler per il mouseup. Completa la selezione rettangolare o il click semplice.
     *
     * Se il rettangolo di selezione è più grande di 5px (in una dimensione):
     *   → Seleziona tutti gli agenti dentro il rettangolo
     * Se il rettangolo è più piccolo di 5px:
     *   → È un click semplice, piazza un nuovo agente (se non c'è già un agente lì)
     */
    onMouseUp(e) {
        if (this.isSelecting && this.selectionRect) {
            // Calcola il rettangolo normalizzato (min/max)
            const minX = Math.min(this.selectionRect.x1, this.selectionRect.x2);
            const maxX = Math.max(this.selectionRect.x1, this.selectionRect.x2);
            const minY = Math.min(this.selectionRect.y1, this.selectionRect.y2);
            const maxY = Math.max(this.selectionRect.y1, this.selectionRect.y2);

            const width = maxX - minX;
            const height = maxY - minY;

            if (width > 5 || height > 5) {
                // --- Selezione rettangolare (drag significativo) ---
                // Se Shift non è premuto, deseleziona tutto prima
                if (!e.shiftKey) {
                    this.selectedAgents.clear();
                }

                // Seleziona tutti gli agenti le cui posizioni (in screen coords)
                // cadono dentro il rettangolo di selezione
                if (this.crowdSim) {
                    for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
                        // Converti posizione agente (X, Z del mondo) in screen coords
                        const screen = this.worldToScreen(agent.position[0], agent.position[2]);
                        if (screen.x >= minX && screen.x <= maxX &&
                            screen.y >= minY && screen.y <= maxY) {
                            this.selectedAgents.add(agentId);
                        }
                    }
                }
            } else if (width < 5 && height < 5) {
                // --- Click semplice (nessun drag significativo) ---
                // Piazza un nuovo agente se non c'è già un agente nella posizione
                const worldPos = this.screenToWorld(this.selectionRect.x1, this.selectionRect.y1);
                if (!this.getAgentAtPosition(worldPos)) {
                    this.addAgent(worldPos);
                }
            }
        }

        // Reset dello stato di input
        this.isPanning = false;
        this.isSelecting = false;
        this.selectionRect = null;
        this.canvas.style.cursor = 'default';

        this.updateUI();
    }

    /**
     * Handler per la rotella del mouse. Gestisce lo zoom della camera.
     * Zoom in (rotella su) moltiplica per 1.1, zoom out (rotella giù) per 0.9.
     * Lo zoom è limitato tra 1 e 100.
     */
    onWheel(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom *= factor;
        this.camera.zoom = Math.max(1, Math.min(100, this.camera.zoom));
    }

    // ========================================================================
    // Update e Rendering
    // ========================================================================

    /**
     * Aggiorna la simulazione della folla di un timestep dt.
     * crowd.update fa avanzare tutti gli agenti:
     *   - Ricalcola steering verso il prossimo waypoint
     *   - Applica obstacle avoidance tra agenti
     *   - Applica forze di separazione
     *   - Aggiorna posizioni e velocità di tutti gli agenti
     *   - Gestisce il traversal delle connessioni off-mesh
     *
     * @param {number} dt - delta time in secondi dall'ultimo frame
     */
    update(dt) {
        if (this.crowdSim && this.navMesh) {
            crowd.update(this.crowdSim, this.navMesh, dt);
        }
    }

    /**
     * Renderizza l'intera scena sul canvas 2D.
     *
     * Pipeline di rendering:
     *   1. Pulisce il canvas con il colore di sfondo
     *   2. Applica la trasformazione camera (traslazione + scala)
     *   3. Renderizza la navmesh (poligoni, muri, connessioni off-mesh)
     *   4. Renderizza gli agenti (corpo, direzione, percorso, target)
     *   5. Ripristina la trasformazione camera
     *   6. Renderizza la selezione rettangolare (in screen space, non in world space)
     */
    render() {
        const ctx = this.ctx;

        // Pulisci il canvas con lo sfondo scuro
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();

        // --- Trasformazione camera ---
        // La sequenza è: traslazione al centro canvas → scala (zoom) → traslazione opposta camera
        // Questo fa sì che la camera punti a (camera.x, camera.y) al centro del canvas.
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // Render navmesh (poligoni, muri, connessioni off-mesh)
        this.renderNavMesh(ctx);

        // Render agenti (corpo, velocità, percorso, target)
        this.renderAgents(ctx);

        ctx.restore();

        // --- Selezione rettangolare ---
        // Renderizzata in screen space (dopo il restore della camera)
        // per avere un rettangolo di dimensioni fisse in pixel
        if (this.isSelecting && this.selectionRect) {
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); // linea tratteggiata
            ctx.strokeRect(
                this.selectionRect.x1,
                this.selectionRect.y1,
                this.selectionRect.x2 - this.selectionRect.x1,
                this.selectionRect.y2 - this.selectionRect.y1
            );
            ctx.setLineDash([]); // reset line dash
        }
    }

    /**
     * Renderizza la navmesh sul canvas. Include:
     *   1. Poligoni riempiti con colore basato sull'indice (HSL) o rosso scuro se disabilitati
     *   2. Bordi dei poligoni
     *   3. Marcatori X sui poligoni disabilitati
     *   4. Muri (bordi non condivisi tra poligoni attivi) in rosso
     *   5. Connessioni off-mesh come linee tratteggiate arancioni con frecce
     *
     * @param {CanvasRenderingContext2D} ctx - contesto di rendering del canvas
     */
    renderNavMesh(ctx) {
        if (this.jsonPolygons.length === 0) return;

        // --- 1. Render dei poligoni (fill + stroke) ---
        for (let i = 0; i < this.jsonPolygons.length; i++) {
            const poly = this.jsonPolygons[i];
            const disabled = this.disabledPolygons.has(i);

            // Disegna il contorno del poligono
            ctx.beginPath();
            for (let j = 0; j < poly.vertices.length; j++) {
                const v = this.jsonVertices[poly.vertices[j]];
                // v[0] = X, v[2] = Z → mappati su canvas X e Y
                if (j === 0) {
                    ctx.moveTo(v[0], v[2]);
                } else {
                    ctx.lineTo(v[0], v[2]);
                }
            }
            ctx.closePath();

            // Riempimento basato sul tipo del poligono (dall'editor tipizzato)
            const polyType = poly.type || 'terrain';

            if (disabled && polyType === 'building') {
                // Edificio disabilitato (non attraversabile) - viola
                ctx.fillStyle = 'rgba(168, 85, 247, 0.4)';
            } else if (disabled && polyType === 'wall_unit') {
                // Unità muro disabilitata (non attraversabile) - arancione
                ctx.fillStyle = 'rgba(251, 146, 60, 0.4)';
            } else if (disabled) {
                // Terreno disabilitato manualmente - rosso scuro
                ctx.fillStyle = 'rgba(80, 20, 20, 0.6)';
            } else if (polyType === 'building') {
                // Edificio attraversabile (distrutto) - viola chiaro
                ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
            } else if (polyType === 'wall_unit') {
                // Muro attraversabile (distrutto) - arancione chiaro
                ctx.fillStyle = 'rgba(251, 146, 60, 0.2)';
            } else {
                // Terreno normale
                ctx.fillStyle = `hsla(${200 + (i * 17) % 60}, 50%, 30%, 0.5)`;
            }
            ctx.fill();

            // Bordo del poligono con colore per tipo
            if (polyType === 'building') {
                ctx.strokeStyle = disabled ? '#a855f7' : '#7c3aed';
            } else if (polyType === 'wall_unit') {
                ctx.strokeStyle = disabled ? '#fb923c' : '#ea580c';
            } else {
                ctx.strokeStyle = disabled ? '#661111' : '#0f3460';
            }
            ctx.lineWidth = 0.1;
            ctx.stroke();

            // --- Marcatore per poligoni disabilitati ---
            if (disabled) {
                const verts = poly.vertices.map(vi => this.jsonVertices[vi]);
                const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
                const cz = verts.reduce((s, v) => s + v[2], 0) / verts.length;

                if (polyType === 'building' || polyType === 'wall_unit') {
                    // Edifici/muri bloccati: indicatore blocco (quadrato pieno piccolo)
                    const sz = 0.3;
                    ctx.fillStyle = polyType === 'building'
                        ? 'rgba(168, 85, 247, 0.5)' : 'rgba(251, 146, 60, 0.5)';
                    ctx.fillRect(cx - sz, cz - sz, sz * 2, sz * 2);
                } else {
                    // Terreno disabilitato manualmente: X rossa
                    ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
                    ctx.lineWidth = 0.08;
                    const sz = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx - sz, cz - sz);
                    ctx.lineTo(cx + sz, cz + sz);
                    ctx.moveTo(cx + sz, cz - sz);
                    ctx.lineTo(cx - sz, cz + sz);
                    ctx.stroke();
                }
            }
        }

        // --- 2. Render dei muri (bordi non condivisi) ---
        // Un "muro" è un bordo di un poligono che non è condiviso con nessun
        // altro poligono attivo. Viene disegnato in rosso per indicare che
        // gli agenti non possono attraversarlo.
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 0.15;

        for (const poly of this.jsonPolygons) {
            const verts = poly.vertices;
            for (let i = 0; i < verts.length; i++) {
                const v1 = this.jsonVertices[verts[i]];
                const v2 = this.jsonVertices[verts[(i + 1) % verts.length]];

                // isSharedEdge controlla se questo edge appare in almeno 2 poligoni attivi.
                // Se non è condiviso, è un muro esterno o il bordo di un poligono disabilitato.
                const isWall = !this.isSharedEdge(verts[i], verts[(i + 1) % verts.length]);

                if (isWall) {
                    ctx.beginPath();
                    ctx.moveTo(v1[0], v1[2]);
                    ctx.lineTo(v2[0], v2[2]);
                    ctx.stroke();
                }
            }
        }

        // --- 3. Render delle connessioni off-mesh ---
        // Le connessioni off-mesh sono visualizzate come linee tratteggiate arancioni
        // con una freccia che indica la direzione, e cerchi colorati agli endpoint
        // (verde = start, rosso = end).
        for (const conn of this.jsonOffMeshConnections) {
            const sx = conn.start[0], sz = conn.start[2]; // punto start (X, Z)
            const ex = conn.end[0], ez = conn.end[2];     // punto end (X, Z)

            // Linea tratteggiata tra start e end
            ctx.beginPath();
            ctx.moveTo(sx, sz);
            ctx.lineTo(ex, ez);
            ctx.strokeStyle = '#f59e0b'; // arancione/ambra
            ctx.lineWidth = 0.15;
            ctx.setLineDash([0.3, 0.2]); // pattern tratteggio
            ctx.stroke();
            ctx.setLineDash([]);

            // Freccia direzionale all'endpoint
            const dx = ex - sx, dz = ez - sz;
            const len = Math.hypot(dx, dz);
            if (len > 0) {
                const nx = dx / len, nz = dz / len; // direzione normalizzata
                const as = 0.4; // dimensione punta della freccia
                ctx.beginPath();
                ctx.moveTo(ex, ez); // punta della freccia
                // I due angoli della freccia, perpendicolari alla direzione
                ctx.lineTo(ex - nx * as - nz * as * 0.5, ez - nz * as + nx * as * 0.5);
                ctx.lineTo(ex - nx * as + nz * as * 0.5, ez - nz * as - nx * as * 0.5);
                ctx.closePath();
                ctx.fillStyle = '#f59e0b';
                ctx.fill();
            }

            // Cerchio verde al punto di partenza
            ctx.beginPath();
            ctx.arc(sx, sz, 0.25, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e'; // verde
            ctx.fill();

            // Cerchio rosso al punto di arrivo
            ctx.beginPath();
            ctx.arc(ex, ez, 0.25, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444'; // rosso
            ctx.fill();
        }
    }

    /**
     * Verifica se un edge (coppia di vertici) è condiviso da almeno 2 poligoni attivi.
     * Un edge condiviso indica un passaggio tra due poligoni adiacenti.
     * Un edge non condiviso è un "muro" o bordo esterno della navmesh.
     *
     * NOTA: i poligoni disabilitati vengono esclusi dal conteggio, così i loro
     * bordi condivisi con poligoni attivi diventano "muri" nel rendering.
     *
     * @param {number} v1Idx - indice del primo vertice dell'edge
     * @param {number} v2Idx - indice del secondo vertice dell'edge
     * @returns {boolean} true se l'edge è condiviso da almeno 2 poligoni attivi
     */
    isSharedEdge(v1Idx, v2Idx) {
        let count = 0;
        for (let pi = 0; pi < this.jsonPolygons.length; pi++) {
            // Salta i poligoni disabilitati: i loro bordi non contano come condivisi
            if (this.disabledPolygons.has(pi)) continue;
            const verts = this.jsonPolygons[pi].vertices;
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i];
                const b = verts[(i + 1) % verts.length];
                // Controlla entrambe le direzioni dell'edge (a→b e b→a)
                if ((a === v1Idx && b === v2Idx) || (a === v2Idx && b === v1Idx)) {
                    count++;
                    if (count > 1) return true; // trovato in almeno 2 poligoni
                }
            }
        }
        return false;
    }

    /**
     * Renderizza tutti gli agenti della simulazione. Per ogni agente disegna:
     *
     *   1. Corpo: cerchio colorato (blu = normale, rosso = selezionato)
     *   2. Bordo: contorno del cerchio (bianco se selezionato)
     *   3. Direzione: linea nella direzione della velocità corrente
     *   4. Percorso: linea verde che collega i "corners" (waypoint) del path
     *   5. Corner points: piccoli cerchi verdi nei punti di svolta del percorso
     *   6. Target: linea tratteggiata rossa verso la posizione target finale
     *   7. Target marker: cerchio rosso semitrasparente alla posizione target
     *
     * @param {CanvasRenderingContext2D} ctx - contesto di rendering del canvas
     */
    renderAgents(ctx) {
        if (!this.crowdSim) return;

        for (const [agentId, agent] of Object.entries(this.crowdSim.agents)) {
            const x = agent.position[0]; // posizione X nel mondo
            const z = agent.position[2]; // posizione Z nel mondo (→ Y canvas)
            const radius = agent.radius;

            const isSelected = this.selectedAgents.has(agentId);

            // --- Corpo dell'agente (cerchio pieno) ---
            ctx.beginPath();
            ctx.arc(x, z, radius, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#e94560' : '#4a90d9'; // rosso se selezionato, blu altrimenti
            ctx.fill();

            // --- Bordo dell'agente ---
            ctx.strokeStyle = isSelected ? '#fff' : '#2a5080';
            ctx.lineWidth = 0.08;
            ctx.stroke();

            // --- Indicatore di direzione (velocità) ---
            // Disegna una linea nella direzione del movimento corrente dell'agente.
            // Visibile solo se la velocità è significativa (> 0.1 unità/s).
            const velLen = Math.sqrt(agent.velocity[0] ** 2 + agent.velocity[2] ** 2);
            if (velLen > 0.1) {
                const dirX = agent.velocity[0] / velLen; // direzione normalizzata X
                const dirZ = agent.velocity[2] / velLen; // direzione normalizzata Z

                ctx.beginPath();
                ctx.moveTo(x, z);
                ctx.lineTo(x + dirX * radius * 1.5, z + dirZ * radius * 1.5);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 0.06;
                ctx.stroke();
            }

            // --- Visualizzazione del percorso (corners) ---
            // I "corners" sono i waypoint calcolati dal pathfinding.
            // Rappresentano i punti di svolta lungo il percorso ottimale
            // dall'agente al target. La linea verde mostra il percorso pianificato.
            if (agent.corners && agent.corners.length > 0) {
                // Linea del percorso
                ctx.strokeStyle = 'rgba(100, 200, 100, 0.5)';
                ctx.lineWidth = 0.05;
                ctx.beginPath();
                ctx.moveTo(x, z); // parte dalla posizione corrente dell'agente
                for (const corner of agent.corners) {
                    ctx.lineTo(corner.position[0], corner.position[2]);
                }
                ctx.stroke();

                // Punti di svolta (corner points)
                ctx.fillStyle = 'rgba(100, 200, 100, 0.8)';
                for (const corner of agent.corners) {
                    ctx.beginPath();
                    ctx.arc(corner.position[0], corner.position[2], 0.15, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // --- Target dell'agente ---
            // Se l'agente ha un target valido, mostra una linea tratteggiata rossa
            // dalla posizione corrente al target, con un cerchio rosso al target.
            if (agent.targetState === crowd.AgentTargetState.VALID) {
                // Linea tratteggiata verso il target
                ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.lineWidth = 0.03;
                ctx.setLineDash([0.2, 0.2]);
                ctx.beginPath();
                ctx.moveTo(x, z);
                ctx.lineTo(agent.targetPosition[0], agent.targetPosition[2]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Marcatore del target (cerchio rosso semitrasparente)
                ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';
                ctx.beginPath();
                ctx.arc(agent.targetPosition[0], agent.targetPosition[2], 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ========================================================================
    // Game Loop principale
    // ========================================================================

    /**
     * Avvia il game loop dell'applicazione usando requestAnimationFrame.
     * Ad ogni frame:
     *   1. Calcola il delta time (limitato a 0.1s per evitare salti dopo pause)
     *   2. Aggiorna il contatore FPS (calcolato ogni 30 frame)
     *   3. Aggiorna la simulazione (crowd.update)
     *   4. Renderizza la scena
     *   5. Aggiorna la UI (contatori agenti, selezione, FPS)
     */
    startLoop() {
        const loop = (time) => {
            // Calcola delta time in secondi, con cap a 100ms per evitare
            // salti enormi dopo un tab switch o un freeze del browser
            const dt = Math.min((time - this.lastTime) / 1000, 0.1);
            this.lastTime = time;

            // Calcolo FPS: conta i frame e ogni 30 frame calcola la media
            this.frameCount++;
            if (this.frameCount >= 30) {
                this.fps = Math.round(this.frameCount / dt / 30);
                this.frameCount = 0;
            }

            // Update della simulazione → Rendering → Aggiornamento UI
            this.update(dt);
            this.render();
            this.updateUI();

            // Richiede il prossimo frame (target ~60fps)
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    /**
     * Aggiorna i contatori nella toolbar:
     *   - Agenti: numero totale di agenti nella simulazione
     *   - Selezionati: numero di agenti attualmente selezionati
     *   - FPS: frame al secondo correnti
     */
    updateUI() {
        const agentCount = this.crowdSim ? Object.keys(this.crowdSim.agents).length : 0;
        document.getElementById('agentCount').textContent = agentCount;
        document.getElementById('selectedCount').textContent = this.selectedAgents.size;
        document.getElementById('fps').textContent = this.fps;
    }

    /**
     * Imposta il testo della barra di stato in fondo alla pagina.
     * Usato per mostrare messaggi informativi all'utente (errori, azioni, stato).
     *
     * @param {string} text - testo da visualizzare nella status bar
     */
    setStatus(text) {
        document.getElementById('status').textContent = text;
    }
}

// ============================================================================
// Avvio dell'applicazione
// ============================================================================
// Aspetta che il DOM sia completamente caricato prima di creare l'applicazione.
// L'istanza viene salvata in window.app per consentire il debug da console.
window.addEventListener('DOMContentLoaded', () => {
    window.app = new CrowdSimulationApp();
});
