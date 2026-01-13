#include "pathfinding_navmesh.h"
#include "level.h"
#include "terrain.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>
#include <glad/glad.h>

// ============================================================================
// INTERNAL STRUCTURES FOR A*
// ============================================================================

typedef struct NavNode {
    int triangle_index;      // Indice del triangolo
    float g_cost;            // Costo dal punto di partenza
    float h_cost;            // Euristica al goal
    float f_cost;            // g + h
    struct NavNode* parent;  // Puntatore al nodo genitore
    int heap_index;          // Indice nel binary heap
} NavNode;

// Binary heap per open set (riuso lo stesso del pathfinding a griglia)
#define MAX_NAV_HEAP_SIZE 8192

typedef struct {
    NavNode** nodes;
    int size;
    int capacity;
} NavPriorityQueue;

// Pool di nodi preallocati
#define MAX_NAV_NODES 8192
static NavNode g_nav_node_pool[MAX_NAV_NODES];
static int g_nav_node_pool_used = 0;

// Closed set per A*
static bool g_nav_closed[MAX_NAV_NODES];

// ============================================================================
// PRIORITY QUEUE IMPLEMENTATION
// ============================================================================

static NavPriorityQueue* nav_pq_create(int capacity) {
    NavPriorityQueue* pq = (NavPriorityQueue*)malloc(sizeof(NavPriorityQueue));
    pq->nodes = (NavNode**)malloc(capacity * sizeof(NavNode*));
    pq->size = 0;
    pq->capacity = capacity;
    return pq;
}

static void nav_pq_destroy(NavPriorityQueue* pq) {
    if (!pq) return;
    free(pq->nodes);
    free(pq);
}

static void nav_pq_swap(NavPriorityQueue* pq, int i, int j) {
    NavNode* temp = pq->nodes[i];
    pq->nodes[i] = pq->nodes[j];
    pq->nodes[j] = temp;
    pq->nodes[i]->heap_index = i;
    pq->nodes[j]->heap_index = j;
}

static void nav_pq_heapify_up(NavPriorityQueue* pq, int index) {
    while (index > 0) {
        int parent = (index - 1) / 2;
        if (pq->nodes[index]->f_cost >= pq->nodes[parent]->f_cost) break;
        nav_pq_swap(pq, index, parent);
        index = parent;
    }
}

static void nav_pq_heapify_down(NavPriorityQueue* pq, int index) {
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

        nav_pq_swap(pq, index, smallest);
        index = smallest;
    }
}

static void nav_pq_push(NavPriorityQueue* pq, NavNode* node) {
    if (pq->size >= pq->capacity) {
        printf("[NavMesh] ERROR: Priority queue overflow!\n");
        return;
    }
    node->heap_index = pq->size;
    pq->nodes[pq->size] = node;
    pq->size++;
    nav_pq_heapify_up(pq, pq->size - 1);
}

static NavNode* nav_pq_pop(NavPriorityQueue* pq) {
    if (pq->size == 0) return NULL;
    NavNode* min = pq->nodes[0];
    pq->nodes[0] = pq->nodes[pq->size - 1];
    pq->nodes[0]->heap_index = 0;
    pq->size--;
    if (pq->size > 0) {
        nav_pq_heapify_down(pq, 0);
    }
    return min;
}

static bool nav_pq_is_empty(NavPriorityQueue* pq) {
    return pq->size == 0;
}

// ============================================================================
// NAVMESH INITIALIZATION
// ============================================================================

bool navmesh_init(NavMesh* nm, int initial_tri_capacity) {
    if (!nm) return false;

    nm->vertices = (NavVertex*)malloc(initial_tri_capacity * 3 * sizeof(NavVertex));
    nm->triangles = (NavTriangle*)malloc(initial_tri_capacity * sizeof(NavTriangle));

    if (!nm->vertices || !nm->triangles) {
        printf("[NavMesh] ERROR: Failed to allocate memory\n");
        if (nm->vertices) free(nm->vertices);
        if (nm->triangles) free(nm->triangles);
        return false;
    }

    nm->vertex_count = 0;
    nm->vertex_capacity = initial_tri_capacity * 3;
    nm->triangle_count = 0;
    nm->triangle_capacity = initial_tri_capacity;
    nm->grid_cell_size = 1.0f;
    nm->layer_id = 0;

    glm_vec3_zero(nm->min_bounds);
    glm_vec3_zero(nm->max_bounds);

    return true;
}

void navmesh_cleanup(NavMesh* nm) {
    if (!nm) return;
    if (nm->vertices) {
        free(nm->vertices);
        nm->vertices = NULL;
    }
    if (nm->triangles) {
        free(nm->triangles);
        nm->triangles = NULL;
    }
    nm->vertex_count = 0;
    nm->triangle_count = 0;
}

// ============================================================================
// NAVMESH LOADING
// ============================================================================

bool navmesh_load_from_file(NavMesh* nm, const char* filepath) {
    FILE* f = fopen(filepath, "r");
    if (!f) {
        printf("[NavMesh] ERROR: Cannot open file: %s\n", filepath);
        return false;
    }

    // Formato semplice:
    // Linea 1: num_vertices num_triangles
    // Seguono num_vertices linee: x y z
    // Seguono num_triangles linee: v0 v1 v2

    int num_verts, num_tris;
    if (fscanf(f, "%d %d\n", &num_verts, &num_tris) != 2) {
        printf("[NavMesh] ERROR: Invalid file format\n");
        fclose(f);
        return false;
    }

    if (!navmesh_init(nm, num_tris)) {
        fclose(f);
        return false;
    }

    // Leggi vertici
    for (int i = 0; i < num_verts; i++) {
        float x, y, z;
        if (fscanf(f, "%f %f %f\n", &x, &y, &z) != 3) {
            printf("[NavMesh] ERROR: Failed to read vertex %d\n", i);
            fclose(f);
            navmesh_cleanup(nm);
            return false;
        }

        nm->vertices[i].position[0] = x;
        nm->vertices[i].position[1] = y;
        nm->vertices[i].position[2] = z;
        nm->vertices[i].index = i;
    }
    nm->vertex_count = num_verts;

    // Leggi triangoli
    for (int i = 0; i < num_tris; i++) {
        int v0, v1, v2;
        if (fscanf(f, "%d %d %d\n", &v0, &v1, &v2) != 3) {
            printf("[NavMesh] ERROR: Failed to read triangle %d\n", i);
            fclose(f);
            navmesh_cleanup(nm);
            return false;
        }

        nm->triangles[i].vertices[0] = v0;
        nm->triangles[i].vertices[1] = v1;
        nm->triangles[i].vertices[2] = v2;
        nm->triangles[i].walkable = true;

        // Inizializza neighbors a -1 (saranno calcolati dopo)
        nm->triangles[i].neighbors[0] = -1;
        nm->triangles[i].neighbors[1] = -1;
        nm->triangles[i].neighbors[2] = -1;
    }
    nm->triangle_count = num_tris;

    fclose(f);

    // Calcola metadati
    navmesh_calculate_metadata(nm);

    printf("[NavMesh] Loaded: %d vertices, %d triangles from %s\n",
           num_verts, num_tris, filepath);

    return true;
}

void navmesh_calculate_metadata(NavMesh* nm) {
    if (!nm || nm->triangle_count == 0) return;

    // Calcola bounds
    glm_vec3_copy(nm->vertices[0].position, nm->min_bounds);
    glm_vec3_copy(nm->vertices[0].position, nm->max_bounds);

    for (int i = 1; i < nm->vertex_count; i++) {
        glm_vec3_minv(nm->min_bounds, nm->vertices[i].position, nm->min_bounds);
        glm_vec3_maxv(nm->max_bounds, nm->vertices[i].position, nm->max_bounds);
    }

    // Calcola centri e aree dei triangoli
    for (int i = 0; i < nm->triangle_count; i++) {
        NavTriangle* tri = &nm->triangles[i];
        vec3* v0 = &nm->vertices[tri->vertices[0]].position;
        vec3* v1 = &nm->vertices[tri->vertices[1]].position;
        vec3* v2 = &nm->vertices[tri->vertices[2]].position;

        // Centro = media dei 3 vertici
        tri->center[0] = ((*v0)[0] + (*v1)[0] + (*v2)[0]) / 3.0f;
        tri->center[1] = ((*v0)[1] + (*v1)[1] + (*v2)[1]) / 3.0f;
        tri->center[2] = ((*v0)[2] + (*v1)[2] + (*v2)[2]) / 3.0f;

        // Area = 0.5 * |cross(v1-v0, v2-v0)|
        vec3 edge1, edge2, cross;
        glm_vec3_sub(*v1, *v0, edge1);
        glm_vec3_sub(*v2, *v0, edge2);
        glm_vec3_cross(edge1, edge2, cross);
        tri->area = glm_vec3_norm(cross) * 0.5f;
    }

    // Calcola adiacenze tra triangoli (condividono un edge?)
    for (int i = 0; i < nm->triangle_count; i++) {
        for (int j = i + 1; j < nm->triangle_count; j++) {
            NavTriangle* tri_a = &nm->triangles[i];
            NavTriangle* tri_b = &nm->triangles[j];

            // Controlla se condividono 2 vertici (= un edge)
            int shared_verts = 0;
            for (int va = 0; va < 3; va++) {
                for (int vb = 0; vb < 3; vb++) {
                    if (tri_a->vertices[va] == tri_b->vertices[vb]) {
                        shared_verts++;
                    }
                }
            }

            // Se condividono esattamente 2 vertici, sono adiacenti
            if (shared_verts == 2) {
                // Trova lo slot libero in tri_a
                for (int k = 0; k < 3; k++) {
                    if (tri_a->neighbors[k] == -1) {
                        tri_a->neighbors[k] = j;
                        break;
                    }
                }
                // Trova lo slot libero in tri_b
                for (int k = 0; k < 3; k++) {
                    if (tri_b->neighbors[k] == -1) {
                        tri_b->neighbors[k] = i;
                        break;
                    }
                }
            }
        }
    }

    printf("[NavMesh] Metadata calculated. Bounds: (%.1f,%.1f,%.1f) to (%.1f,%.1f,%.1f)\n",
           nm->min_bounds[0], nm->min_bounds[1], nm->min_bounds[2],
           nm->max_bounds[0], nm->max_bounds[1], nm->max_bounds[2]);
}

// ============================================================================
// NAVMESH QUERIES
// ============================================================================

// Test se un punto (x,z) è dentro un triangolo (2D, ignora Y)
bool navmesh_point_in_triangle(NavMesh* nm, int tri_index, float x, float z) {
    if (tri_index < 0 || tri_index >= nm->triangle_count) return false;

    NavTriangle* tri = &nm->triangles[tri_index];
    vec3* v0 = &nm->vertices[tri->vertices[0]].position;
    vec3* v1 = &nm->vertices[tri->vertices[1]].position;
    vec3* v2 = &nm->vertices[tri->vertices[2]].position;

    // Barycentric coordinates method
    float denom = ((*v1)[2] - (*v2)[2]) * ((*v0)[0] - (*v2)[0]) +
                  ((*v2)[0] - (*v1)[0]) * ((*v0)[2] - (*v2)[2]);

    if (fabsf(denom) < 0.0001f) return false; // Triangolo degenere

    float a = (((*v1)[2] - (*v2)[2]) * (x - (*v2)[0]) +
               ((*v2)[0] - (*v1)[0]) * (z - (*v2)[2])) / denom;
    float b = (((*v2)[2] - (*v0)[2]) * (x - (*v2)[0]) +
               ((*v0)[0] - (*v2)[0]) * (z - (*v2)[2])) / denom;
    float c = 1.0f - a - b;

    return (a >= 0.0f && b >= 0.0f && c >= 0.0f);
}

int navmesh_find_triangle(NavMesh* nm, float world_x, float world_z) {
    if (!nm) return -1;

    // Brute force per ora (per ottimizzare: spatial hash, BVH, etc.)
    for (int i = 0; i < nm->triangle_count; i++) {
        if (!nm->triangles[i].walkable) continue;
        if (navmesh_point_in_triangle(nm, i, world_x, world_z)) {
            return i;
        }
    }

    return -1; // Non trovato
}

float navmesh_get_height_on_triangle(NavMesh* nm, int tri_index, float x, float z) {
    if (tri_index < 0 || tri_index >= nm->triangle_count) return 0.0f;

    NavTriangle* tri = &nm->triangles[tri_index];
    vec3* v0 = &nm->vertices[tri->vertices[0]].position;
    vec3* v1 = &nm->vertices[tri->vertices[1]].position;
    vec3* v2 = &nm->vertices[tri->vertices[2]].position;

    // Calcola coordinate baricentriche
    float denom = ((*v1)[2] - (*v2)[2]) * ((*v0)[0] - (*v2)[0]) +
                  ((*v2)[0] - (*v1)[0]) * ((*v0)[2] - (*v2)[2]);

    if (fabsf(denom) < 0.0001f) return (*v0)[1]; // Fallback

    float a = (((*v1)[2] - (*v2)[2]) * (x - (*v2)[0]) +
               ((*v2)[0] - (*v1)[0]) * (z - (*v2)[2])) / denom;
    float b = (((*v2)[2] - (*v0)[2]) * (x - (*v2)[0]) +
               ((*v0)[0] - (*v2)[0]) * (z - (*v2)[2])) / denom;
    float c = 1.0f - a - b;

    // Interpola l'altezza Y
    return a * (*v0)[1] + b * (*v1)[1] + c * (*v2)[1];
}

// ============================================================================
// A* PATHFINDING ON NAVMESH
// ============================================================================

static float nav_heuristic(vec3 a, vec3 b) {
    float dx = b[0] - a[0];
    float dz = b[2] - a[2];
    return sqrtf(dx * dx + dz * dz);
}

static NavNode* get_nav_node_from_pool(int triangle_index) {
    if (g_nav_node_pool_used >= MAX_NAV_NODES) {
        printf("[NavMesh] ERROR: Node pool exhausted!\n");
        return NULL;
    }
    NavNode* node = &g_nav_node_pool[g_nav_node_pool_used++];
    node->triangle_index = triangle_index;
    node->g_cost = FLT_MAX;
    node->h_cost = 0.0f;
    node->f_cost = FLT_MAX;
    node->parent = NULL;
    node->heap_index = -1;
    return node;
}

Path* navmesh_find_path(struct Level* lvl, NavMesh* nm, vec3 start, vec3 goal) {
    (void)lvl; // Potrebbe servire per height queries

    if (!nm || nm->triangle_count == 0) {
        printf("[NavMesh] ERROR: Invalid navmesh\n");
        return NULL;
    }

    // 1. Trova triangoli start e goal
    int start_tri = navmesh_find_triangle(nm, start[0], start[2]);
    int goal_tri = navmesh_find_triangle(nm, goal[0], goal[2]);

    if (start_tri < 0) {
        printf("[NavMesh] Start position not on navmesh\n");
        return NULL;
    }
    if (goal_tri < 0) {
        printf("[NavMesh] Goal position not on navmesh\n");
        return NULL;
    }

    // 2. Se start e goal sono nello stesso triangolo, path diretto
    if (start_tri == goal_tri) {
        Path* path = path_create(2);
        path_add_waypoint(path, start);
        path_add_waypoint(path, goal);
        return path;
    }

    // 3. Reset pool e closed set
    g_nav_node_pool_used = 0;
    memset(g_nav_closed, 0, sizeof(g_nav_closed));

    NavPriorityQueue* pq = nav_pq_create(MAX_NAV_HEAP_SIZE);

    // 4. Crea nodo start
    NavNode* start_node = get_nav_node_from_pool(start_tri);
    if (!start_node) {
        nav_pq_destroy(pq);
        return NULL;
    }

    start_node->g_cost = 0.0f;
    start_node->h_cost = nav_heuristic(nm->triangles[start_tri].center,
                                        nm->triangles[goal_tri].center);
    start_node->f_cost = start_node->h_cost;

    nav_pq_push(pq, start_node);

    NavNode* goal_node = NULL;

    // 5. A* loop
    while (!nav_pq_is_empty(pq)) {
        NavNode* current = nav_pq_pop(pq);

        // Marca come visitato
        g_nav_closed[current->triangle_index] = true;

        // Trovato il goal?
        if (current->triangle_index == goal_tri) {
            goal_node = current;
            break;
        }

        // Espandi i vicini
        NavTriangle* tri = &nm->triangles[current->triangle_index];
        for (int i = 0; i < 3; i++) {
            int neighbor_idx = tri->neighbors[i];
            if (neighbor_idx < 0) continue; // Bordo
            if (!nm->triangles[neighbor_idx].walkable) continue;
            if (g_nav_closed[neighbor_idx]) continue;

            // Calcola costo per raggiungere il vicino
            float edge_cost = nav_heuristic(tri->center,
                                           nm->triangles[neighbor_idx].center);
            float new_g = current->g_cost + edge_cost;

            // Crea o aggiorna nodo vicino
            NavNode* neighbor_node = get_nav_node_from_pool(neighbor_idx);
            if (!neighbor_node) {
                nav_pq_destroy(pq);
                return NULL;
            }

            if (new_g < neighbor_node->g_cost) {
                neighbor_node->g_cost = new_g;
                neighbor_node->h_cost = nav_heuristic(nm->triangles[neighbor_idx].center,
                                                     nm->triangles[goal_tri].center);
                neighbor_node->f_cost = new_g + neighbor_node->h_cost;
                neighbor_node->parent = current;
                nav_pq_push(pq, neighbor_node);
            }
        }
    }

    nav_pq_destroy(pq);

    // 6. Ricostruisci path
    if (!goal_node) {
        printf("[NavMesh] No path found!\n");
        return NULL;
    }

    // Conta quanti triangoli attraversiamo
    int tri_count = 0;
    NavNode* node = goal_node;
    while (node != NULL) {
        tri_count++;
        node = node->parent;
    }

    // Crea path con i centri dei triangoli + start e goal
    Path* path = path_create(tri_count + 2);

    // Aggiungi start
    path_add_waypoint(path, start);

    // Aggiungi centri dei triangoli (in ordine inverso)
    NavNode** tri_path = (NavNode**)malloc(tri_count * sizeof(NavNode*));
    node = goal_node;
    for (int i = tri_count - 1; i >= 0; i--) {
        tri_path[i] = node;
        node = node->parent;
    }

    // Aggiungi waypoint per ogni triangolo (skippiamo start e goal tri)
    for (int i = 1; i < tri_count - 1; i++) {
        vec3 waypoint;
        glm_vec3_copy(nm->triangles[tri_path[i]->triangle_index].center, waypoint);
        path_add_waypoint(path, waypoint);
    }

    free(tri_path);

    // Aggiungi goal
    path_add_waypoint(path, goal);

    printf("[NavMesh] Path found: %d triangles, %d waypoints\n",
           tri_count, path->waypoint_count);

    return path;
}

// ============================================================================
// FUNNEL ALGORITHM (Simple String Pulling)
// ============================================================================

void navmesh_smooth_path(Path* path, NavMesh* nm) {
    (void)nm; // Per ora non serve, ma servirà per il vero funnel algorithm

    if (!path || path->waypoint_count <= 2) return;

    // Simple string pulling (line of sight test)
    // Questo è un placeholder - il vero funnel algorithm è più complesso

    vec3* new_waypoints = (vec3*)malloc(path->capacity * sizeof(vec3));
    int new_count = 0;

    // Aggiungi sempre il primo punto
    glm_vec3_copy(path->waypoints[0], new_waypoints[0]);
    new_count++;

    int current_idx = 0;

    while (current_idx < path->waypoint_count - 1) {
        // Cerca il punto più lontano visibile
        bool found_shortcut = false;

        for (int check_idx = path->waypoint_count - 1; check_idx > current_idx + 1; check_idx--) {
            // TODO: implementare line of sight su navmesh
            // Per ora assumiamo che possiamo sempre fare shortcut
            found_shortcut = true;
            current_idx = check_idx;
            glm_vec3_copy(path->waypoints[current_idx], new_waypoints[new_count]);
            new_count++;
            break;
        }

        if (!found_shortcut) {
            current_idx++;
            glm_vec3_copy(path->waypoints[current_idx], new_waypoints[new_count]);
            new_count++;
        }
    }

    // Sostituisci
    free(path->waypoints);
    path->waypoints = new_waypoints;
    path->waypoint_count = new_count;
}

// ============================================================================
// DEBUG RENDERING
// ============================================================================

static GLuint navmesh_debug_vao = 0;
static GLuint navmesh_debug_vbo = 0;
static GLuint navmesh_debug_shader = 0;
static GLint navmesh_debug_loc_uVP = -1;
static GLint navmesh_debug_loc_uColor = -1;

static void init_navmesh_debug_renderer(void) {
    if (navmesh_debug_shader != 0) return;

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

    GLint success;
    GLuint vs = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vs, 1, &vs_src, NULL);
    glCompileShader(vs);
    glGetShaderiv(vs, GL_COMPILE_STATUS, &success);
    if (!success) {
        glDeleteShader(vs);
        return;
    }

    GLuint fs = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fs, 1, &fs_src, NULL);
    glCompileShader(fs);
    glGetShaderiv(fs, GL_COMPILE_STATUS, &success);
    if (!success) {
        glDeleteShader(vs);
        glDeleteShader(fs);
        return;
    }

    navmesh_debug_shader = glCreateProgram();
    glAttachShader(navmesh_debug_shader, vs);
    glAttachShader(navmesh_debug_shader, fs);
    glLinkProgram(navmesh_debug_shader);

    glDeleteShader(vs);
    glDeleteShader(fs);

    navmesh_debug_loc_uVP = glGetUniformLocation(navmesh_debug_shader, "uVP");
    navmesh_debug_loc_uColor = glGetUniformLocation(navmesh_debug_shader, "uColor");

    glGenVertexArrays(1, &navmesh_debug_vao);
    glGenBuffers(1, &navmesh_debug_vbo);
}

void navmesh_debug_draw(NavMesh* nm, mat4 viewProj, vec3 color) {
    if (!nm || nm->triangle_count == 0) return;

    init_navmesh_debug_renderer();
    if (navmesh_debug_shader == 0) return;

    // Crea buffer di linee (ogni triangolo = 3 linee = 6 vertici)
    int line_count = nm->triangle_count * 3;
    int vertex_count = line_count * 2;
    float* vertices = (float*)malloc(vertex_count * 3 * sizeof(float));

    int idx = 0;
    for (int i = 0; i < nm->triangle_count; i++) {
        NavTriangle* tri = &nm->triangles[i];

        for (int e = 0; e < 3; e++) {
            int v0_idx = tri->vertices[e];
            int v1_idx = tri->vertices[(e + 1) % 3];

            vec3* v0 = &nm->vertices[v0_idx].position;
            vec3* v1 = &nm->vertices[v1_idx].position;

            // Alza leggermente per visibilità
            vertices[idx++] = (*v0)[0];
            vertices[idx++] = (*v0)[1] + 0.1f;
            vertices[idx++] = (*v0)[2];

            vertices[idx++] = (*v1)[0];
            vertices[idx++] = (*v1)[1] + 0.1f;
            vertices[idx++] = (*v1)[2];
        }
    }

    // Upload a GPU
    glBindVertexArray(navmesh_debug_vao);
    glBindBuffer(GL_ARRAY_BUFFER, navmesh_debug_vbo);
    glBufferData(GL_ARRAY_BUFFER, vertex_count * 3 * sizeof(float), vertices, GL_DYNAMIC_DRAW);

    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    free(vertices);

    // Disegna
    glUseProgram(navmesh_debug_shader);
    glUniformMatrix4fv(navmesh_debug_loc_uVP, 1, GL_FALSE, (float*)viewProj);
    glUniform3fv(navmesh_debug_loc_uColor, 1, color);

    glLineWidth(2.0f);
    glDrawArrays(GL_LINES, 0, vertex_count);
    glLineWidth(1.0f);

    glBindVertexArray(0);
}

void navmesh_debug_draw_path(Path* path, mat4 viewProj, vec3 color) {
    // Riusa la funzione del pathfinding normale
    extern void pathfinding_debug_draw_path(Path* path, mat4 viewProj, vec3 color);
    pathfinding_debug_draw_path(path, viewProj, color);
}

// ============================================================================
// STATS & BENCHMARK
// ============================================================================

void navmesh_print_stats(NavMesh* nm) {
    if (!nm) return;

    printf("[NavMesh] Statistics:\n");
    printf("  Vertices: %d\n", nm->vertex_count);
    printf("  Triangles: %d\n", nm->triangle_count);
    printf("  Bounds: (%.1f, %.1f, %.1f) to (%.1f, %.1f, %.1f)\n",
           nm->min_bounds[0], nm->min_bounds[1], nm->min_bounds[2],
           nm->max_bounds[0], nm->max_bounds[1], nm->max_bounds[2]);

    // Conta quanti triangoli hanno 0, 1, 2, 3 vicini
    int neighbor_count[4] = {0, 0, 0, 0};
    for (int i = 0; i < nm->triangle_count; i++) {
        int count = 0;
        for (int j = 0; j < 3; j++) {
            if (nm->triangles[i].neighbors[j] >= 0) count++;
        }
        neighbor_count[count]++;
    }

    printf("  Triangle connectivity:\n");
    printf("    0 neighbors (isolated): %d\n", neighbor_count[0]);
    printf("    1 neighbor (edge): %d\n", neighbor_count[1]);
    printf("    2 neighbors (corner): %d\n", neighbor_count[2]);
    printf("    3 neighbors (internal): %d\n", neighbor_count[3]);
}

void navmesh_run_benchmark(struct Level* lvl, NavMesh* nm, int iterations) {
    printf("=== NAVMESH PATHFINDING BENCHMARK (%d iterations) ===\n", iterations);

    if (!nm || !lvl) {
        printf("ERROR: Invalid navmesh or level\n");
        return;
    }

    srand(12345);
    int found_count = 0;
    double total_time = 0.0;

    for (int i = 0; i < iterations; i++) {
        // Genera due punti casuali
        float minX = nm->min_bounds[0] + 5.0f;
        float maxX = nm->max_bounds[0] - 5.0f;
        float minZ = nm->min_bounds[2] + 5.0f;
        float maxZ = nm->max_bounds[2] - 5.0f;

        float r1 = (float)rand() / RAND_MAX;
        float r2 = (float)rand() / RAND_MAX;
        float r3 = (float)rand() / RAND_MAX;
        float r4 = (float)rand() / RAND_MAX;

        vec3 start = { minX + r1 * (maxX - minX), 0, minZ + r2 * (maxZ - minZ) };
        vec3 goal  = { minX + r3 * (maxX - minX), 0, minZ + r4 * (maxZ - minZ) };

        // Trova triangoli per validare i punti
        int start_tri = navmesh_find_triangle(nm, start[0], start[2]);
        int goal_tri = navmesh_find_triangle(nm, goal[0], goal[2]);

        if (start_tri < 0 || goal_tri < 0) continue; // Skip se fuori navmesh

        // Imposta Y corretto
        start[1] = navmesh_get_height_on_triangle(nm, start_tri, start[0], start[2]);
        goal[1] = navmesh_get_height_on_triangle(nm, goal_tri, goal[0], goal[2]);

        double start_time = glfwGetTime() * 1000.0;
        Path* p = navmesh_find_path(lvl, nm, start, goal);
        double end_time = glfwGetTime() * 1000.0;

        if (p) {
            found_count++;
            total_time += (end_time - start_time);
            path_free(p);
        }
    }

    double avg_time = (found_count > 0) ? total_time / found_count : 0.0;

    printf("Total Time: %.2f ms\n", total_time);
    printf("Avg Time per Path: %.4f ms\n", avg_time);
    printf("Paths Found: %d/%d\n", found_count, iterations);
    printf("=============================================\n");
}
