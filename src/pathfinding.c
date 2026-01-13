#include "pathfinding.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include <glad/glad.h>
#include "terrain.h"
#include "level.h"
#include "utils.h"

// Massimo 3x3 chunks, ogni chunk è 64x64
#define MAX_CHUNKS_X 3
#define MAX_CHUNKS_Z 3
#define TEMP_GRID_WIDTH (PATHGRID_SIZE * MAX_CHUNKS_X)   // 192
#define TEMP_GRID_HEIGHT (PATHGRID_SIZE * MAX_CHUNKS_Z)  // 192
#define MAX_GRID_CELLS (TEMP_GRID_WIDTH * TEMP_GRID_HEIGHT) // ~36k

// ============================================================================
// INTERNAL STRUCTURES
// ============================================================================

// Nodo per A*
typedef struct PathNode {
    int x, z;                // Coordinate griglia
    float g_cost;            // Costo dal punto di partenza
    float h_cost;            // Euristica al goal
    float f_cost;            // g + h
    struct PathNode* parent; // Puntatore al nodo genitore
    int heap_index;          // Indice nel binary heap
} PathNode;

// Binary heap per open set (min-heap basato su f_cost)
#define MAX_HEAP_SIZE 32768

typedef struct {
    PathNode** nodes;
    int size;
    int capacity;
} PriorityQueue;

// Pool di nodi preallocati per evitare malloc in loop A*
#define MAX_PATH_NODES 32768
static PathNode g_node_pool[MAX_PATH_NODES];
static int g_node_pool_used = 0;

// Statistiche performance
static struct {
    int total_paths_requested;
    int paths_found;
    int paths_failed;
    float total_time_ms;
    float max_time_ms;
} g_stats = {0};


// ============================================================================
// PRIORITY QUEUE (Binary Min-Heap)
// ============================================================================

static PriorityQueue* pq_create(int capacity) {
    PriorityQueue* pq = (PriorityQueue*)malloc(sizeof(PriorityQueue));
    pq->nodes = (PathNode**)malloc(capacity * sizeof(PathNode*));
    pq->size = 0;
    pq->capacity = capacity;
    return pq;
}

static void pq_destroy(PriorityQueue* pq) {
    if (!pq) return;
    free(pq->nodes);
    free(pq);
}

static void pq_swap(PriorityQueue* pq, int i, int j) {
    PathNode* temp = pq->nodes[i];
    pq->nodes[i] = pq->nodes[j];
    pq->nodes[j] = temp;
    pq->nodes[i]->heap_index = i;
    pq->nodes[j]->heap_index = j;
}

static void pq_heapify_up(PriorityQueue* pq, int index) {
    while (index > 0) {
        int parent = (index - 1) / 2;
        if (pq->nodes[index]->f_cost >= pq->nodes[parent]->f_cost) break;
        pq_swap(pq, index, parent);
        index = parent;
    }
}

static void pq_heapify_down(PriorityQueue* pq, int index) {
    while (true) {
        int smallest = index;
        int left = 2 * index + 1;
        int right = 2 * index + 2;

        if (left < pq->size && pq->nodes[left]->f_cost < pq->nodes[smallest]->f_cost) {
            smallest = left;
        }
        if (right < pq->size && pq->nodes[right]->f_cost < pq->nodes[smallest]->f_cost) {
            smallest = right;
        }

        if (smallest == index) break;

        pq_swap(pq, index, smallest);
        index = smallest;
    }
}

static void pq_push(PriorityQueue* pq, PathNode* node) {
    if (pq->size >= pq->capacity) {
        printf("[Pathfinding] ERROR: Priority queue overflow!\n");
        return;
    }
    node->heap_index = pq->size;
    pq->nodes[pq->size] = node;
    pq->size++;
    pq_heapify_up(pq, pq->size - 1);
}

static PathNode* pq_pop(PriorityQueue* pq) {
    if (pq->size == 0) return NULL;
    PathNode* min = pq->nodes[0];
    pq->nodes[0] = pq->nodes[pq->size - 1];
    pq->nodes[0]->heap_index = 0;
    pq->size--;
    if (pq->size > 0) {
        pq_heapify_down(pq, 0);
    }
    return min;
}

static void pq_update(PriorityQueue* pq, PathNode* node) {
    pq_heapify_up(pq, node->heap_index);
}

static bool pq_is_empty(PriorityQueue* pq) {
    return pq->size == 0;
}


typedef struct {
    // Griglia dati (walkability)
    uint8_t grid[MAX_GRID_CELLS];

    // Dati per A* (riutilizzati)
    // Invece di allocare g_costs e closed_set ogni volta:
    float g_costs[MAX_GRID_CELLS];
    int visited_tag[MAX_GRID_CELLS]; // Sostituisce il closed_set bitfield
    //PathNode* node_map[MAX_GRID_CELLS]; // Mappa rapida indice -> puntatore nodo

    // Search ID corrente
    int current_search_id;

    // Dimensioni attuali della finestra attiva
    int current_width;
    int current_height;
    float current_origin_x;
    float current_origin_z;
    float current_cell_size;

    // Binary Heap preallocato
    PriorityQueue* pq;

    // Puntatore al livello corrente (per accesso walkmap full-res)
    struct Level* current_level;

} PathfindingContext;
static PathfindingContext* g_ctx = NULL;


// ============================================================================
// PATHGRID MANAGEMENT
// ============================================================================

bool pathgrid_init(PathGrid* pg, int width, int height, float cell_size) {
    if (!pg) return false;

    pg->grid_width = width;
    pg->grid_height = height;
    pg->grid_cell_size = cell_size;
    pg->layer_id = 0;

    int grid_size = width * height;
    pg->grid = (uint8_t*)malloc(grid_size * sizeof(uint8_t));
    if (!pg->grid) {
        printf("[Pathfinding] ERROR: Failed to allocate pathgrid\n");
        return false;
    }

    // Inizializza tutto come walkable
    memset(pg->grid, 1, grid_size);

    return true;
}

void pathgrid_cleanup(PathGrid* pg) {
    if (!pg) return;
    if (pg->grid) {
        free(pg->grid);
        pg->grid = NULL;
    }
}

bool pathgrid_build(PathGrid* pg, unsigned char* walkmap, int walkmap_width, int walkmap_height) {
    if (!pg || !walkmap) return false;

    // Inizializza pathgrid 64x64
    if (!pathgrid_init(pg, PATHGRID_SIZE, PATHGRID_SIZE, 1.0f)) {
        return false;
    }

    // Downsampling con majority voting
    int sample_size = walkmap_width / PATHGRID_SIZE;
    if (sample_size < 1) sample_size = 1;

    float walkable_threshold = 0.90f;  // 90% dei sample devono essere walkable

    for (int gz = 0; gz < PATHGRID_SIZE; gz++) {
        for (int gx = 0; gx < PATHGRID_SIZE; gx++) {
            // Campiona blocco sample_size x sample_size dalla walkmap
            int walkable_count = 0;
            int total_samples = 0;

            for (int sy = 0; sy < sample_size; sy++) {
                for (int sx = 0; sx < sample_size; sx++) {
                    int hires_x = gx * sample_size + sx;
                    int hires_y = gz * sample_size + sy;

                    // Bounds check
                    if (hires_x >= walkmap_width || hires_y >= walkmap_height) {
                        continue;
                    }

                    int idx = hires_y * walkmap_width + hires_x;
                    if (walkmap[idx] > 128) {
                        walkable_count++;
                    }
                    total_samples++;
                }
            }

            // Majority vote con threshold
            float ratio = (total_samples > 0) ? (float)walkable_count / total_samples : 0.0f;
            int grid_idx = gz * PATHGRID_SIZE + gx;
            pg->grid[grid_idx] = (ratio >= walkable_threshold) ? 1 : 0;
        }
    }

    printf("[Pathfinding] Built pathgrid %dx%d from walkmap %dx%d\n",
           PATHGRID_SIZE, PATHGRID_SIZE, walkmap_width, walkmap_height);

    return true;
}

bool pathgrid_is_walkable(PathGrid* pg, int grid_x, int grid_z) {
    if (!pg || !pg->grid) return false;
    if (grid_x < 0 || grid_x >= pg->grid_width) return false;
    if (grid_z < 0 || grid_z >= pg->grid_height) return false;

    int idx = grid_z * pg->grid_width + grid_x;
    return pg->grid[idx] != 0;
}

// Converte coordinate world in coordinate della griglia statica attuale
static bool ctx_world_to_grid(vec3 world_pos, int* out_x, int* out_z) {
    // Calcola la posizione locale relativa all'origine della finestra attuale
    float localX = world_pos[0] - g_ctx->current_origin_x;
    float localZ = world_pos[2] - g_ctx->current_origin_z;

    // Calcola le dimensioni totali in unità world
    float totalWidth = g_ctx->current_width * g_ctx->current_cell_size;
    float totalHeight = g_ctx->current_height * g_ctx->current_cell_size;

    // Bounds check: se siamo fuori dalla finestra 3x3 (o 2x2, ecc), errore
    if (localX < 0.0f || localX >= totalWidth || localZ < 0.0f || localZ >= totalHeight) {
        return false;
    }

    // Conversione in indici griglia
    *out_x = (int)(localX / g_ctx->current_cell_size);
    *out_z = (int)(localZ / g_ctx->current_cell_size);

    // Clamp di sicurezza (per prevenire overflow di array per floating point error)
    if (*out_x >= g_ctx->current_width) *out_x = g_ctx->current_width - 1;
    if (*out_z >= g_ctx->current_height) *out_z = g_ctx->current_height - 1;

    return true;
}











// ============================================================================
// PATH SMOOTHING (String Pulling)
// ============================================================================

// Helper: Controlla Line of Sight tra due vec3 usando la walkmap a piena risoluzione
static bool check_world_visibility(vec3 start_pos, vec3 end_pos) {
    if (!g_ctx->current_level) return false;

    // Calcola direzione e distanza
    float dx = end_pos[0] - start_pos[0];
    float dz = end_pos[2] - start_pos[2];
    float distance = sqrtf(dx * dx + dz * dz);

    // Se i punti sono molto vicini, sono visibili
    if (distance < 0.1f) return true;

    // Step size: abbastanza piccolo da non saltare ostacoli nella walkmap
    // La walkmap tipicamente ha risoluzione ~6cm per pixel (64m / 1024px)
    // Usiamo 0.1m (10cm) come step per sicurezza
    float step_size = 0.2f;
    int num_steps = (int)(distance / step_size) + 1;

    // Raymarching lungo la linea
    for (int i = 0; i <= num_steps; i++) {
        float t = (float)i / (float)num_steps;
        float checkX = start_pos[0] + dx * t;
        float checkZ = start_pos[2] + dz * t;

        // Controlla walkability sulla walkmap a piena risoluzione
        if (!level_is_walkable(g_ctx->current_level, checkX, checkZ)) {
            return false; // Ostacolo trovato!
        }
    }

    return true;
}



Path* path_create(int initial_capacity) {
    Path* path = (Path*)malloc(sizeof(Path));
    if (!path) return NULL;

    path->waypoint_count = 0;
    path->capacity = initial_capacity;
    path->layer_id = 0;
    path->waypoints = (vec3*)malloc(initial_capacity * sizeof(vec3));

    if (!path->waypoints) {
        free(path);
        return NULL;
    }

    return path;
}


void pathfinding_init(void) {
    g_ctx = (PathfindingContext*)calloc(1, sizeof(PathfindingContext));
    
    // Prealloca la Priority Queue al massimo
    g_ctx->pq = pq_create(MAX_HEAP_SIZE);
    
    // Inizializza il search ID
    g_ctx->current_search_id = 0;
    
    // Inizializza array visited a 0
    memset(g_ctx->visited_tag, 0, sizeof(g_ctx->visited_tag));

    // Aumenta il pool di nodi! 
    // NOTA: 8192 nodi sono pochi per una griglia 192x192 (36k celle).
    // Se il percorso è complesso, A* potrebbe esplorare quasi tutte le celle.
    // Suggerisco di aumentare MAX_PATH_NODES almeno a 16384 o 32768
    
    printf("[Pathfinding] Static context initialized (Max grid: %dx%d)\n", 
           TEMP_GRID_WIDTH, TEMP_GRID_HEIGHT);
}

// Restituisce true se successo, false se errore
static bool setup_static_grid(struct Level* lvl, vec3 start, vec3 goal) {
        // Calcola bounding box in coordinate world
    float minX = fminf(start[0], goal[0]);
    float maxX = fmaxf(start[0], goal[0]);
    float minZ = fminf(start[2], goal[2]);
    float maxZ = fmaxf(start[2], goal[2]);

    // Espandi ai bordi dei chunk (arrotonda ai chunk interi)
    float chunkSize = lvl->chunkSize;

    // Trova indici chunk
    int startChunkX = (int)floorf((minX - lvl->originX) / chunkSize);
    int startChunkZ = (int)floorf((minZ - lvl->originZ) / chunkSize);
    int endChunkX = (int)floorf((maxX - lvl->originX) / chunkSize);
    int endChunkZ = (int)floorf((maxZ - lvl->originZ) / chunkSize);
    
    // ... clamp indici chunk ...

    int chunksX = endChunkX - startChunkX + 1;
    int chunksZ = endChunkZ - startChunkZ + 1;
    if (chunksX > MAX_CHUNKS_X) chunksX = MAX_CHUNKS_X;
    if (chunksZ > MAX_CHUNKS_Z) chunksZ = MAX_CHUNKS_Z;

    // Imposta metadati nel contesto statico
    g_ctx->current_width = chunksX * PATHGRID_SIZE;
    g_ctx->current_height = chunksZ * PATHGRID_SIZE;
    g_ctx->current_origin_x = lvl->originX + startChunkX * lvl->chunkSize;
    g_ctx->current_origin_z = lvl->originZ + startChunkZ * lvl->chunkSize;
    g_ctx->current_cell_size = lvl->chunkSize / PATHGRID_SIZE;

    // Incrementa Search ID per invalidare i dati della ricerca precedente
    g_ctx->current_search_id++;
    if (g_ctx->current_search_id == 0) {
        // Gestione overflow (rarissimo): resetta tutto
        memset(g_ctx->visited_tag, 0, sizeof(g_ctx->visited_tag));
        g_ctx->current_search_id = 1;
    }

    // Copia i dati dai chunk alla grid statica
    // NOTA: Qui non serve memset a 0 della grid se copiamo tutto, 
    // ma se ci sono "buchi" (chunk mancanti) bisogna fare attenzione.
    
    for (int cz = 0; cz < chunksZ; cz++) {
        for (int cx = 0; cx < chunksX; cx++) {
             int chunkIdxX = startChunkX + cx;
            int chunkIdxZ = startChunkZ + cz;

            // Bounds check
            if (chunkIdxX < 0 || chunkIdxX >= lvl->chunksCountX ||
                chunkIdxZ < 0 || chunkIdxZ >= lvl->chunksCountZ) {
                continue;
            }

            
            struct Terrain* chunk = &lvl->chunks[chunkIdxZ * lvl->chunksCountX + chunkIdxX];
            
            // Calcola offset nella griglia statica (larga TEMP_GRID_WIDTH)
            int destOffsetX = cx * PATHGRID_SIZE;
            int destOffsetZ = cz * PATHGRID_SIZE;

            if (chunk && chunk->pathgrid.grid) {
                // Copia riga per riga per mantenere la continuità
                for (int z = 0; z < PATHGRID_SIZE; z++) {
                     // Calcola puntatori per memcpy veloce
                     uint8_t* dest = &g_ctx->grid[(destOffsetZ + z) * TEMP_GRID_WIDTH + destOffsetX];
                     uint8_t* src = &chunk->pathgrid.grid[z * PATHGRID_SIZE];
                     memcpy(dest, src, PATHGRID_SIZE);
                }
            } else {
                // Chunk non caricato? Segna come non camminabile
                for (int z = 0; z < PATHGRID_SIZE; z++) {
                    uint8_t* dest = &g_ctx->grid[(destOffsetZ + z) * TEMP_GRID_WIDTH + destOffsetX];
                    memset(dest, 0, PATHGRID_SIZE);
                }
            }
        }
    }
    
    return true;
}



static float heuristic_euclidean(int x1, int z1, int x2, int z2) {
    int dx = x2 - x1;
    int dz = z2 - z1;
    return sqrtf(dx * dx + dz * dz);
}

static PathNode* get_node_from_pool(int x, int z) {
    if (g_node_pool_used >= MAX_PATH_NODES) {
        printf("[Pathfinding] ERROR: Node pool exhausted!\n");
        return NULL;
    }
    PathNode* node = &g_node_pool[g_node_pool_used++];
    node->x = x;
    node->z = z;
    node->g_cost = FLT_MAX;
    node->h_cost = 0.0f;
    node->f_cost = FLT_MAX;
    node->parent = NULL;
    node->heap_index = -1;
    return node;
}

// Converte coordinate della griglia statica in coordinate World
static void ctx_grid_to_world(int grid_x, int grid_z, struct Level* lvl, vec3 out_world) {
    // Calcola X e Z usando l'origine e la cell_size memorizzate nel contesto
    out_world[0] = g_ctx->current_origin_x + (grid_x + 0.5f) * g_ctx->current_cell_size;
    out_world[2] = g_ctx->current_origin_z + (grid_z + 0.5f) * g_ctx->current_cell_size;
    
    // Calcola Y usando l'heightmap del livello
    out_world[1] = level_get_height(lvl, out_world[0], out_world[2]);
}

static Path* reconstruct_path_static(PathNode* goal_node, struct Level* lvl) {
    // 1. Conta i nodi risalendo i parent
    int count = 0;
    PathNode* node = goal_node;
    while (node != NULL) {
        count++;
        node = node->parent;
    }

    if (count == 0) return NULL;

    // 2. Crea l'oggetto Path finale
    Path* path = path_create(count);
    if (!path) return NULL;

    // Impostiamo subito il count finale, così possiamo accedere all'array direttamente
    path->waypoint_count = count;

    // 3. Riempi i waypoint direttamente in ordine inverso
    // (Dal Goal allo Start, ma scrivendo dall'ultimo indice al primo)
    int i = count - 1;
    node = goal_node;
    
    while (node != NULL) {
        // Scriviamo direttamente nella memoria del Path finale
        // Nota: path->waypoints[i] è un vec3, che è un array float[3]
        ctx_grid_to_world(node->x, node->z, lvl, path->waypoints[i]);
        
        i--;
        node = node->parent;
    }

    return path;
}


static Path* astar_static_context(vec3 start, vec3 goal, struct Level* lvl) {
    // Reset pool nodi e heap
    g_node_pool_used = 0;
    g_ctx->pq->size = 0; 

    int start_x, start_z, goal_x, goal_z;

    // 1. Converti coordinate World -> Grid
    if (!ctx_world_to_grid(start, &start_x, &start_z)) {
        printf("[Pathfinding] Start position outside active window (%.2f, %.2f)\n", start[0], start[2]);
        return NULL;
    }

    if (!ctx_world_to_grid(goal, &goal_x, &goal_z)) {
        printf("[Pathfinding] Goal position outside active window (%.2f, %.2f)\n", goal[0], goal[2]);
        return NULL;
    }

    // 2. Calcola indici lineari (UNA VOLTA SOLA)
    // Nota: Usiamo sempre TEMP_GRID_WIDTH (192) per l'indicizzazione dell'array statico
    int start_idx = start_z * TEMP_GRID_WIDTH + start_x;
    int goal_idx = goal_z * TEMP_GRID_WIDTH + goal_x;

    // 3. Verifica walkability immediata (Fail-Fast)
    if (g_ctx->grid[start_idx] == 0) {
         //printf("[Pathfinding] Start position is not walkable\n");
         return NULL;
    }
    if (g_ctx->grid[goal_idx] == 0) {
         //printf("[Pathfinding] Goal position is not walkable\n");
         return NULL;
    }

    // 4. Setup nodo start
    PathNode* start_node = get_node_from_pool(start_x, start_z);
    if (!start_node) return NULL; // Safety check se il pool esplode

    start_node->g_cost = 0.0f;
    // Assicurati che heuristic sia definita (es. heuristic_euclidean)
    start_node->h_cost = heuristic_euclidean(start_x, start_z, goal_x, goal_z);
    start_node->f_cost = start_node->h_cost;
    
    // 5. Inseriamo nell'array "visited" e "g_costs"
    // CORREZIONE: Qui usiamo start_idx già calcolato sopra, senza "int" davanti
    g_ctx->visited_tag[start_idx] = g_ctx->current_search_id; 
    g_ctx->g_costs[start_idx] = 0.0f;
    
    pq_push(g_ctx->pq, start_node);

    // Direzioni: 8-connected
    int dx[] = {0, 0, 1, -1, 1, -1, 1, -1};
    int dz[] = {1, -1, 0, 0, 1, 1, -1, -1};
    float costs[] = {1.0f, 1.0f, 1.0f, 1.0f, 1.414f, 1.414f, 1.414f, 1.414f};

    // 6. Loop A* principale
    while (!pq_is_empty(g_ctx->pq)) {
        PathNode* current = pq_pop(g_ctx->pq);

        if (current->x == goal_x && current->z == goal_z) {
            return reconstruct_path_static(current, lvl);
        }

        // Espansione vicini
        for (int i = 0; i < 8; i++) {
            int nx = current->x + dx[i];
            int nz = current->z + dz[i];

            // Bounds check usando le dimensioni ATTUALI della finestra (non 192, ma la larghezza reale caricata)
            if (nx < 0 || nx >= g_ctx->current_width || nz < 0 || nz >= g_ctx->current_height) continue;

            int n_idx = nz * TEMP_GRID_WIDTH + nx;

            // Walkability check su static grid
            if (g_ctx->grid[n_idx] == 0) continue;

            float new_g = current->g_cost + costs[i];

            // Check se già visitato in QUESTO search ID
            bool visited_in_this_search = (g_ctx->visited_tag[n_idx] == g_ctx->current_search_id);
            
            // Se visitato e il costo non è migliore, skip
            if (visited_in_this_search && new_g >= g_ctx->g_costs[n_idx]) {
                continue;
            }

            // Trovato percorso migliore o nuovo nodo
            PathNode* neighbor = get_node_from_pool(nx, nz);
            if (!neighbor) return NULL; // Pool esaurito, path fallito

            neighbor->g_cost = new_g;
            neighbor->h_cost = heuristic_euclidean(nx, nz, goal_x, goal_z);
            neighbor->f_cost = new_g + neighbor->h_cost;
            neighbor->parent = current;

            // Aggiorna tag e costi
            g_ctx->visited_tag[n_idx] = g_ctx->current_search_id;
            g_ctx->g_costs[n_idx] = new_g;
            
            pq_push(g_ctx->pq, neighbor);
        }
    }
    
    return NULL;
}


bool path_add_waypoint(Path* path, vec3 waypoint) {
    if (!path) return false;

    // Espandi se necessario
    if (path->waypoint_count >= path->capacity) {
        int new_capacity = path->capacity * 2;
        vec3* new_waypoints = (vec3*)realloc(path->waypoints, new_capacity * sizeof(vec3));
        if (!new_waypoints) return false;
        path->waypoints = new_waypoints;
        path->capacity = new_capacity;
    }

    glm_vec3_copy(waypoint, path->waypoints[path->waypoint_count]);
    path->waypoint_count++;
    return true;
}

void path_free(Path* path) {
    if (!path) return;
    if (path->waypoints) {
        free(path->waypoints);
    }
    free(path);
}

bool world_to_grid(struct Terrain* chunk, vec3 world_pos, int* out_x, int* out_z) {
    if (!chunk || !out_x || !out_z) return false;

    // Converti world → UV (0.0 a 1.0)
    float u = (world_pos[0] - chunk->offsetX) / chunk->worldSize;
    float v = (world_pos[2] - chunk->offsetZ) / chunk->worldSize;

    // Bounds check
    if (u < 0.0f || u > 1.0f || v < 0.0f || v > 1.0f) {
        return false;
    }

    // UV → Grid coords (ogni cella copre 1/PATHGRID_SIZE dello spazio UV)
    *out_x = (int)(u * PATHGRID_SIZE);
    *out_z = (int)(v * PATHGRID_SIZE);

    // Clamp per sicurezza (u=1.0 esatto va a cella 64, che non esiste)
    if (*out_x >= PATHGRID_SIZE) *out_x = PATHGRID_SIZE - 1;
    if (*out_z >= PATHGRID_SIZE) *out_z = PATHGRID_SIZE - 1;

    return true;
}

// Algoritmo di Bresenham o raymarching sulla griglia per vedere se la linea è libera
bool pathgrid_line_of_sight(PathGrid* pg, int x0, int z0, int x1, int z1) {
    int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    int dz = abs(z1 - z0), sz = z0 < z1 ? 1 : -1; 
    int err = (dx > dz ? dx : -dz) / 2, e2;
 
    while (true) {
        if (!pathgrid_is_walkable(pg, x0, z0)) return false;
        if (x0 == x1 && z0 == z1) break;
        e2 = err;
        if (e2 > -dx) { err -= dz; x0 += sx; }
        if (e2 < dz) { err += dx; z0 += sz; }
    }
    return true;
}

void path_smooth(Path* path) {
    if (!path || path->waypoint_count <= 2) return;

    // Creiamo un nuovo path temporaneo per i punti ottimizzati
    // Nel caso peggiore avrà la stessa dimensione dell'originale
    vec3* new_waypoints = (vec3*)malloc(path->capacity * sizeof(vec3));
    int new_count = 0;

    // Aggiungi sempre il primo punto (Start)
    glm_vec3_copy(path->waypoints[0], new_waypoints[0]);
    new_count++;

    int current_idx = 0;

    while (current_idx < path->waypoint_count - 1) {
        // Cerca il punto più lontano visibile dal corrente
        // Partiamo dalla fine e torniamo indietro verso current
        bool found_shortcut = false;
        
        for (int check_idx = path->waypoint_count - 1; check_idx > current_idx + 1; check_idx--) {
            if (check_world_visibility(path->waypoints[current_idx], path->waypoints[check_idx])) {
                // Trovato shortcut! Il punto check_idx diventa il prossimo nel path
                current_idx = check_idx;
                glm_vec3_copy(path->waypoints[current_idx], new_waypoints[new_count]);
                new_count++;
                found_shortcut = true;
                break;
            }
        }

        // Se non trovo scorciatoie lunghe, devo per forza andare al punto successivo
        if (!found_shortcut) {
            current_idx++;
            glm_vec3_copy(path->waypoints[current_idx], new_waypoints[new_count]);
            new_count++;
        }
    }

    // Sostituisci i waypoint vecchi con quelli nuovi
    free(path->waypoints);
    path->waypoints = new_waypoints;
    path->waypoint_count = new_count;
    
  
}

Path* pathfinding_find_path(struct Level* lvl, vec3 start, vec3 goal, int zone_id) {
    (void)zone_id; // Non usato per ora

    if (!lvl) return NULL;

    // 1. Identifica i chunk di partenza e arrivo per validazione di base
    struct Terrain* start_chunk = level_get_chunk_at(lvl, start[0], start[2]);
    struct Terrain* goal_chunk = level_get_chunk_at(lvl, goal[0], goal[2]);

    if (!start_chunk) {
        printf("[Pathfinding] Start position outside level\n");
        return NULL;
    }
    if (!goal_chunk) {
        printf("[Pathfinding] Goal position outside level\n");
        return NULL;
    }

    // 2. OTTIMIZZAZIONE: Line of Sight (Raycast)
    // Se siamo nello stesso chunk, prova prima a tracciare una linea retta.
    // Se la linea è libera, evita completamente il costo di setup_static_grid e A*.
    if (start_chunk == goal_chunk) {
        int sx, sz, gx, gz;
        // Nota: qui usiamo la funzione locale del chunk, non quella globale del contesto
        if (world_to_grid(start_chunk, start, &sx, &sz) && 
            world_to_grid(start_chunk, goal, &gx, &gz)) {
            
            // Supponendo tu abbia implementato pathgrid_line_of_sight come discusso prima
            if (pathgrid_line_of_sight(&start_chunk->pathgrid, sx, sz, gx, gz)) {
                 Path* simple_path = path_create(2);
                 path_add_waypoint(simple_path, start); // Start
                 path_add_waypoint(simple_path, goal);  // End
                 return simple_path;
            }
        }
    }

    // ========================================================================
    // 3. PREPARAZIONE CONTESTO (Il punto che chiedevi)
    // ========================================================================
    // Qui popoliamo g_ctx->grid copiando i dati dai chunk necessari (max 3x3).
    // Questo sovrascrive i dati della richiesta precedente nel buffer statico.
    if (!setup_static_grid(lvl, start, goal)) {
        printf("[Pathfinding] Failed to build static grid context\n");
        return NULL;
    }

    // ========================================================================
    // 4. ESECUZIONE A*
    // ========================================================================
    // Ora che g_ctx è pronto, lanciamo l'algoritmo.
    // Non passiamo più griglie temporanee, perché A* leggerà da g_ctx globale.
    Path* path = astar_static_context(start, goal, lvl);
     
    // 5. SMOOTHING (usa walkmap a piena risoluzione per line-of-sight)
    if (path) {
        // Salva il puntatore al livello per check_world_visibility
        g_ctx->current_level = lvl;
        path_smooth(path);
        g_ctx->current_level = NULL; // Cleanup
    }
    
    return path;
}
// ============================================================================
// DEBUG UTILITIES
// ============================================================================

// VAO/VBO per debug path rendering
static GLuint path_debug_vao = 0;
static GLuint path_debug_vbo = 0;
static GLuint path_debug_shader = 0;
static GLint path_debug_loc_uVP = -1;
static GLint path_debug_loc_uColor = -1;

static void init_path_debug_renderer(void) {
    if (path_debug_shader != 0) return;

    // Shader minimale embedded
    const char* vs_src =
        "#version 330 core\n"
        "layout (location = 0) in vec3 aPos;\n"
        "uniform mat4 uVP;\n"
        "void main() { gl_Position = uVP * vec4(aPos, 1.0); }";

    const char* fs_src =
        "#version 330 core\n"
        "out vec4 FragColor;\n"
        "uniform vec3 uColor;\n"
        "void main() { FragColor = vec4(uColor, 1.0); }";

    // Compila shader inline
    GLint success;
    GLuint vs = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vs, 1, &vs_src, NULL);
    glCompileShader(vs);
    glGetShaderiv(vs, GL_COMPILE_STATUS, &success);
    if (!success) {
        printf("[Pathfinding Debug] Vertex shader compile error\n");
        glDeleteShader(vs);
        return;
    }

    GLuint fs = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fs, 1, &fs_src, NULL);
    glCompileShader(fs);
    glGetShaderiv(fs, GL_COMPILE_STATUS, &success);
    if (!success) {
        printf("[Pathfinding Debug] Fragment shader compile error\n");
        glDeleteShader(vs);
        glDeleteShader(fs);
        return;
    }

    path_debug_shader = glCreateProgram();
    glAttachShader(path_debug_shader, vs);
    glAttachShader(path_debug_shader, fs);
    glLinkProgram(path_debug_shader);

    glDeleteShader(vs);
    glDeleteShader(fs);

    path_debug_loc_uVP = glGetUniformLocation(path_debug_shader, "uVP");
    path_debug_loc_uColor = glGetUniformLocation(path_debug_shader, "uColor");

    // Crea VAO/VBO
    glGenVertexArrays(1, &path_debug_vao);
    glGenBuffers(1, &path_debug_vbo);
}

void pathfinding_debug_draw_grid(struct Level* lvl, int chunk_idx, mat4 viewProj) {
    (void)lvl;
    (void)chunk_idx;
    (void)viewProj;
    // Usa terrain_debug_draw_pathgrid invece
}

void pathfinding_debug_draw_path(Path* path, mat4 viewProj, vec3 color) {
    if (!path || path->waypoint_count < 2) return;

    init_path_debug_renderer();
    if (path_debug_shader == 0) return;

    // Costruisci buffer vertici (linee tra waypoints)
    int vertex_count = path->waypoint_count;
    float* vertices = (float*)malloc(vertex_count * 3 * sizeof(float));

    for (int i = 0; i < path->waypoint_count; i++) {
        vertices[i * 3 + 0] = path->waypoints[i][0];
        vertices[i * 3 + 1] = path->waypoints[i][1] + 0.3f; // Alza per visibilità
        vertices[i * 3 + 2] = path->waypoints[i][2];
    }

    // Upload a GPU
    glBindVertexArray(path_debug_vao);
    glBindBuffer(GL_ARRAY_BUFFER, path_debug_vbo);
    glBufferData(GL_ARRAY_BUFFER, vertex_count * 3 * sizeof(float), vertices, GL_DYNAMIC_DRAW);

    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    free(vertices);

    // Disegna linea
    glUseProgram(path_debug_shader);
    glUniformMatrix4fv(path_debug_loc_uVP, 1, GL_FALSE, (float*)viewProj);
    glUniform3fv(path_debug_loc_uColor, 1, color);

    glLineWidth(3.0f);
    glDrawArrays(GL_LINE_STRIP, 0, vertex_count);

    // Disegna punti sui waypoint
    glPointSize(10.0f);
    glDrawArrays(GL_POINTS, 0, vertex_count);

    glLineWidth(1.0f);
    glPointSize(1.0f);
    glBindVertexArray(0);
}

void pathfinding_print_stats(void) {
    printf("[Pathfinding] Stats:\n");
    printf("  Total requests: %d\n", g_stats.total_paths_requested);
    printf("  Found: %d\n", g_stats.paths_found);
    printf("  Failed: %d\n", g_stats.paths_failed);
    printf("  Avg time: %.2fms\n", g_stats.total_paths_requested > 0 ?
           g_stats.total_time_ms / g_stats.total_paths_requested : 0.0f);
    printf("  Max time: %.2fms\n", g_stats.max_time_ms);
}

void pathfinding_reset_stats(void) {
    memset(&g_stats, 0, sizeof(g_stats));
}

void pathfinding_run_benchmark(struct Level* lvl) {
    int iterations = 1000; // Numero di path da calcolare
    int found_count = 0;
    
    printf("=== PATHFINDING BENCHMARK (%d iterations) ===\n", iterations);
    
    // Seed random fisso per ripetibilità (stessi path su Old vs New)
    srand(12345); 

    double start_time = get_time_ms();

    for (int i = 0; i < iterations; i++) {
        // Genera due punti casuali nel mondo
        // Assumiamo che il mondo sia grosso modo entro i bound del livello
        float margin = 10.0f;
        float minX = lvl->originX + margin;
        float maxX = lvl->originX + (lvl->chunksCountX * lvl->chunkSize) - margin;
        float minZ = lvl->originZ + margin;
        float maxZ = lvl->originZ + (lvl->chunksCountZ * lvl->chunkSize) - margin;

        float r1 = (float)rand() / RAND_MAX;
        float r2 = (float)rand() / RAND_MAX;
        float r3 = (float)rand() / RAND_MAX;
        float r4 = (float)rand() / RAND_MAX;

        vec3 start = { minX + r1 * (maxX - minX), 0, minZ + r2 * (maxZ - minZ) };
        vec3 goal  = { minX + r3 * (maxX - minX), 0, minZ + r4 * (maxZ - minZ) };

        // Aggiorna Y (opzionale, se il pathfinding lo richiede per start/goal)
        start[1] = level_get_height(lvl, start[0], start[2]);
        goal[1]  = level_get_height(lvl, goal[0], goal[2]);

        // Chiama il pathfinding
        Path* p = pathfinding_find_path(lvl, start, goal, 0);
        
        if (p) {
            found_count++;
            path_free(p); // Importante: libera subito per non finire la RAM nel test
        }
    }

    double end_time = get_time_ms();
    double total_time = end_time - start_time;
    double avg_time = total_time / iterations;

    printf("Total Time: %.2f ms\n", total_time);
    printf("Avg Time per Path: %.4f ms\n", avg_time);
    printf("Paths Found: %d/%d\n", found_count, iterations);
    printf("=============================================\n");
}
