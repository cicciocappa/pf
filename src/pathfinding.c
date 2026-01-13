#include "pathfinding.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include <glad/glad.h>
#include "terrain.h"
#include "level.h"

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
#define MAX_HEAP_SIZE 4096

typedef struct {
    PathNode** nodes;
    int size;
    int capacity;
} PriorityQueue;

// Pool di nodi preallocati per evitare malloc in loop A*
#define MAX_PATH_NODES 8192
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

// ============================================================================
// PATHFINDING INITIALIZATION
// ============================================================================

void pathfinding_init(void) {
    g_node_pool_used = 0;
    memset(&g_stats, 0, sizeof(g_stats));
    printf("[Pathfinding] System initialized\n");
}

void pathfinding_cleanup(void) {
    printf("[Pathfinding] System cleanup\n");
}

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

    float walkable_threshold = 0.75f;  // 75% dei sample devono essere walkable

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

// ============================================================================
// PATH MANAGEMENT
// ============================================================================

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

Path* path_clone(Path* path) {
    if (!path) return NULL;

    Path* clone = path_create(path->capacity);
    if (!clone) return NULL;

    for (int i = 0; i < path->waypoint_count; i++) {
        path_add_waypoint(clone, path->waypoints[i]);
    }
    clone->layer_id = path->layer_id;

    return clone;
}

// ============================================================================
// COORDINATE CONVERSION
// ============================================================================

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

void grid_to_world(struct Terrain* chunk, int grid_x, int grid_z, vec3 out_world) {
    if (!chunk) return;

    // Grid → UV (centro della cella)
    float u = (grid_x + 0.5f) / PATHGRID_SIZE;
    float v = (grid_z + 0.5f) / PATHGRID_SIZE;

    // UV → World
    out_world[0] = chunk->offsetX + u * chunk->worldSize;
    out_world[2] = chunk->offsetZ + v * chunk->worldSize;

    // Y da heightmap
    out_world[1] = terrain_get_height(chunk, out_world[0], out_world[2]);
}

// ============================================================================
// A* PATHFINDING
// ============================================================================

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




// ============================================================================
// MULTI-CHUNK PATHFINDING (Griglia temporanea a finestra)
// ============================================================================

// Struttura per griglia temporanea multi-chunk
typedef struct {
    uint8_t* grid;
    int width, height;      // Dimensioni in celle
    float originX, originZ; // Origine world (angolo min)
    float cellSize;         // Dimensione cella in world units
    int chunksX, chunksZ;   // Numero di chunk coperti
} TempPathGrid;

// Converte coordinate world in coordinate griglia temporanea
static bool temp_world_to_grid(TempPathGrid* tpg, vec3 world_pos, int* out_x, int* out_z) {
    float localX = world_pos[0] - tpg->originX;
    float localZ = world_pos[2] - tpg->originZ;

    // Bounds check
    float totalWidth = tpg->width * tpg->cellSize;
    float totalHeight = tpg->height * tpg->cellSize;
    if (localX < 0.0f || localX >= totalWidth || localZ < 0.0f || localZ >= totalHeight) {
        return false;
    }

    *out_x = (int)(localX / tpg->cellSize);
    *out_z = (int)(localZ / tpg->cellSize);

    // Clamp per sicurezza
    if (*out_x >= tpg->width) *out_x = tpg->width - 1;
    if (*out_z >= tpg->height) *out_z = tpg->height - 1;

    return true;
}

// Converte coordinate griglia temporanea in world (centro della cella)
static void temp_grid_to_world(TempPathGrid* tpg, int grid_x, int grid_z, struct Level* lvl, vec3 out_world) {
    out_world[0] = tpg->originX + (grid_x + 0.5f) * tpg->cellSize;
    out_world[2] = tpg->originZ + (grid_z + 0.5f) * tpg->cellSize;
    out_world[1] = level_get_height(lvl, out_world[0], out_world[2]);
}

// Verifica se una cella è walkable nella griglia temporanea
static bool temp_is_walkable(TempPathGrid* tpg, int x, int z) {
    if (x < 0 || x >= tpg->width || z < 0 || z >= tpg->height) return false;
    return tpg->grid[z * tpg->width + x] != 0;
}

// Costruisce la griglia temporanea copiando dai chunk coinvolti
static TempPathGrid* build_temp_grid(struct Level* lvl, vec3 start, vec3 goal) {
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

    // Clamp agli indici validi
    if (startChunkX < 0) startChunkX = 0;
    if (startChunkZ < 0) startChunkZ = 0;
    if (endChunkX >= lvl->chunksCountX) endChunkX = lvl->chunksCountX - 1;
    if (endChunkZ >= lvl->chunksCountZ) endChunkZ = lvl->chunksCountZ - 1;

    // Numero di chunk da coprire
    int chunksX = endChunkX - startChunkX + 1;
    int chunksZ = endChunkZ - startChunkZ + 1;

    // Limita a 3x3 max
    if (chunksX > 3) chunksX = 3;
    if (chunksZ > 3) chunksZ = 3;

    // Calcola dimensioni griglia temporanea
    int gridWidth = chunksX * PATHGRID_SIZE;
    int gridHeight = chunksZ * PATHGRID_SIZE;

    // Alloca struttura
    TempPathGrid* tpg = (TempPathGrid*)malloc(sizeof(TempPathGrid));
    if (!tpg) return NULL;

    tpg->grid = (uint8_t*)malloc(gridWidth * gridHeight * sizeof(uint8_t));
    if (!tpg->grid) {
        free(tpg);
        return NULL;
    }

    tpg->width = gridWidth;
    tpg->height = gridHeight;
    tpg->chunksX = chunksX;
    tpg->chunksZ = chunksZ;
    tpg->originX = lvl->originX + startChunkX * chunkSize;
    tpg->originZ = lvl->originZ + startChunkZ * chunkSize;
    tpg->cellSize = chunkSize / PATHGRID_SIZE;

    // Inizializza tutto come non-walkable
    memset(tpg->grid, 0, gridWidth * gridHeight);

    // Copia dati dai chunk
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
            if (!chunk->pathgrid.grid) continue;

            // Copia pathgrid del chunk nella posizione corretta
            int destOffsetX = cx * PATHGRID_SIZE;
            int destOffsetZ = cz * PATHGRID_SIZE;

            for (int z = 0; z < PATHGRID_SIZE; z++) {
                for (int x = 0; x < PATHGRID_SIZE; x++) {
                    int srcIdx = z * PATHGRID_SIZE + x;
                    int destIdx = (destOffsetZ + z) * gridWidth + (destOffsetX + x);
                    tpg->grid[destIdx] = chunk->pathgrid.grid[srcIdx];
                }
            }
        }
    }

    printf("[Pathfinding] Built temp grid %dx%d (%dx%d chunks) at (%.1f, %.1f)\n",
           gridWidth, gridHeight, chunksX, chunksZ, tpg->originX, tpg->originZ);

    return tpg;
}

static void free_temp_grid(TempPathGrid* tpg) {
    if (!tpg) return;
    if (tpg->grid) free(tpg->grid);
    free(tpg);
}

// Ricostruisce path dalla griglia temporanea
static Path* reconstruct_path_temp(PathNode* goal_node, TempPathGrid* tpg, struct Level* lvl) {
    // Conta nodi
    int count = 0;
    PathNode* node = goal_node;
    while (node != NULL) {
        count++;
        node = node->parent;
    }

    // Crea path
    Path* path = path_create(count);
    if (!path) return NULL;

    // Riempi waypoints in ordine inverso
    vec3* waypoints_temp = (vec3*)malloc(count * sizeof(vec3));
    int i = count - 1;
    node = goal_node;
    while (node != NULL) {
        temp_grid_to_world(tpg, node->x, node->z, lvl, waypoints_temp[i]);
        i--;
        node = node->parent;
    }

    // Aggiungi al path
    for (i = 0; i < count; i++) {
        path_add_waypoint(path, waypoints_temp[i]);
    }

    free(waypoints_temp);
    return path;
}

// A* sulla griglia temporanea
static Path* astar_on_temp_grid(TempPathGrid* tpg, struct Level* lvl, vec3 start, vec3 goal) {
    // Reset node pool
    g_node_pool_used = 0;

    // Converti start/goal in grid coords
    int start_x, start_z, goal_x, goal_z;
    if (!temp_world_to_grid(tpg, start, &start_x, &start_z)) {
        printf("[Pathfinding] Start position outside temp grid\n");
        return NULL;
    }
    if (!temp_world_to_grid(tpg, goal, &goal_x, &goal_z)) {
        printf("[Pathfinding] Goal position outside temp grid\n");
        return NULL;
    }

    // Verifica walkability
    if (!temp_is_walkable(tpg, start_x, start_z)) {
        printf("[Pathfinding] Start position not walkable (%d, %d)\n", start_x, start_z);
        return NULL;
    }
    if (!temp_is_walkable(tpg, goal_x, goal_z)) {
        printf("[Pathfinding] Goal position not walkable (%d, %d)\n", goal_x, goal_z);
        return NULL;
    }

    // Inizializza A*
    PriorityQueue* open_set = pq_create(MAX_HEAP_SIZE);

    // Closed set come bitfield dinamico
    int bitfield_size = (tpg->width * tpg->height + 63) / 64;
    uint64_t* closed_set = (uint64_t*)calloc(bitfield_size, sizeof(uint64_t));

    // g_costs array dinamico
    float* g_costs = (float*)malloc(tpg->width * tpg->height * sizeof(float));
    for (int i = 0; i < tpg->width * tpg->height; i++) {
        g_costs[i] = FLT_MAX;
    }

    // Crea start node
    PathNode* start_node = get_node_from_pool(start_x, start_z);
    if (!start_node) {
        pq_destroy(open_set);
        free(closed_set);
        free(g_costs);
        return NULL;
    }
    start_node->g_cost = 0.0f;
    start_node->h_cost = heuristic_euclidean(start_x, start_z, goal_x, goal_z);
    start_node->f_cost = start_node->h_cost;
    g_costs[start_z * tpg->width + start_x] = 0.0f;

    pq_push(open_set, start_node);

    // Direzioni: 8-connected
    int dx[] = {0, 0, 1, -1, 1, -1, 1, -1};
    int dz[] = {1, -1, 0, 0, 1, 1, -1, -1};
    float costs[] = {1.0f, 1.0f, 1.0f, 1.0f, 1.414f, 1.414f, 1.414f, 1.414f};

    PathNode* goal_node = NULL;

    // A* loop
    while (!pq_is_empty(open_set)) {
        PathNode* current = pq_pop(open_set);

        // Goal raggiunto?
        if (current->x == goal_x && current->z == goal_z) {
            goal_node = current;
            break;
        }

        // Aggiungi a closed set
        int bit_idx = current->z * tpg->width + current->x;
        closed_set[bit_idx / 64] |= (1ULL << (bit_idx % 64));

        // Espandi vicini
        for (int i = 0; i < 8; i++) {
            int nx = current->x + dx[i];
            int nz = current->z + dz[i];

            // Bounds check
            if (nx < 0 || nx >= tpg->width || nz < 0 || nz >= tpg->height) {
                continue;
            }

            // Walkability check
            if (!temp_is_walkable(tpg, nx, nz)) {
                continue;
            }

            // Closed check
            int n_bit_idx = nz * tpg->width + nx;
            if (closed_set[n_bit_idx / 64] & (1ULL << (n_bit_idx % 64))) {
                continue;
            }

            // Calcola costi
            float new_g = current->g_cost + costs[i];

            // Se abbiamo già un g_cost migliore, skip
            if (new_g >= g_costs[n_bit_idx]) {
                continue;
            }

            // Crea neighbor node
            PathNode* neighbor = get_node_from_pool(nx, nz);
            if (!neighbor) break;

            neighbor->g_cost = new_g;
            neighbor->h_cost = heuristic_euclidean(nx, nz, goal_x, goal_z);
            neighbor->f_cost = neighbor->g_cost + neighbor->h_cost;
            neighbor->parent = current;

            g_costs[n_bit_idx] = new_g;
            pq_push(open_set, neighbor);
        }
    }

    // Ricostruisci path se trovato
    Path* result = NULL;
    if (goal_node) {
        result = reconstruct_path_temp(goal_node, tpg, lvl);
        printf("[Pathfinding] Path found: %d waypoints\n", result ? result->waypoint_count : 0);
    } else {
        printf("[Pathfinding] No path found\n");
    }

    pq_destroy(open_set);
    free(closed_set);
    free(g_costs);
    return result;
}

Path* pathfinding_find_path(struct Level* lvl, vec3 start, vec3 goal, int zone_id) {
    (void)zone_id; // Non usato per ora

    if (!lvl) return NULL;

    // Verifica che start e goal siano nel livello
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

    // Costruisci griglia temporanea che copre i chunk coinvolti
    TempPathGrid* tpg = build_temp_grid(lvl, start, goal);
    if (!tpg) {
        printf("[Pathfinding] Failed to build temp grid\n");
        return NULL;
    }

    // Esegui A* sulla griglia temporanea
    Path* path = astar_on_temp_grid(tpg, lvl, start, goal);

    // Libera griglia temporanea
    free_temp_grid(tpg);

    return path;
}

// ============================================================================
// PATH SMOOTHING
// ============================================================================

void path_smooth(Path* path, struct Level* lvl) {
    // TODO: Implementare string-pulling
    // Per ora no-op
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
