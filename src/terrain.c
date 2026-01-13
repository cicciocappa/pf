#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#include "terrain.h"
#include "obj_loader.h"
#include "gfx.h"

// Assicurati di definire STB_IMAGE_IMPLEMENTATION in un solo file .c del tuo progetto!
#include "stb_image.h" 

// ============================================================================
// UTILITY GEOMETRICHE
// ============================================================================

// Helper interno: Campiona la walk mask (se esiste)
static bool sample_walkability(Terrain* t, float u, float v) {
    // Se non abbiamo caricato la maschera, assumiamo che tutto sia camminabile
    if (!t->walkMap) return true; 
    
    // Clamp UV per sicurezza
    if (u < 0.0f) u = 0.0f; if (u > 1.0f) u = 1.0f;
    if (v < 0.0f) v = 0.0f; if (v > 1.0f) v = 1.0f;
    
    // Converti in coordinate pixel
    int x = (int)(u * (t->gridWidth - 1));
    int y = (int)(v * (t->gridHeight - 1));
    
    // Indice array 1D
    int idx = y * t->gridWidth + x;
    
    // Logica: > 128 (Grigio medio) significa "Camminabile" (Bianco)
    // < 128 (Nero) significa "Bloccato"
    return t->walkMap[idx] > 128;
}


void terrain_world_to_uv(Terrain* t, float worldX, float worldZ, float* u, float* v) {
    // Mappa coordinate World -> UV (0 ... 1)
    // Il chunk va da (offsetX, offsetZ) a (offsetX+worldSize, offsetZ+worldSize)
    *u = (worldX - t->offsetX) / t->worldSize;
    *v = (worldZ - t->offsetZ) / t->worldSize;
}

bool terrain_contains_point(Terrain* t, float worldX, float worldZ) {
    float localX = worldX - t->offsetX;
    float localZ = worldZ - t->offsetZ;
    return (localX >= 0.0f && localX < t->worldSize &&
            localZ >= 0.0f && localZ < t->worldSize);
}

void terrain_get_bounds(Terrain* t, vec3 outMin, vec3 outMax) {
    outMin[0] = t->offsetX;
    outMin[1] = t->minY;
    outMin[2] = t->offsetZ;
    outMax[0] = t->offsetX + t->worldSize;
    outMax[1] = t->maxY;
    outMax[2] = t->offsetZ + t->worldSize;
}

void terrain_get_normal(Terrain* t, float worldX, float worldZ, vec3 outNormal) {
    // Metodo delle differenze finite
    // Campioniamo 4 punti intorno al punto centrale per capire l'inclinazione
    
    float step = 0.5f; // Mezzo metro di offset per il campionamento
    
    float hL = terrain_get_height(t, worldX - step, worldZ); // Left
    float hR = terrain_get_height(t, worldX + step, worldZ); // Right
    float hD = terrain_get_height(t, worldX, worldZ - step); // Down (Z-)
    float hU = terrain_get_height(t, worldX, worldZ + step); // Up (Z+)
    
    // Costruiamo il vettore normale
    // X: Differenza tra sinistra e destra
    // Y: 2.0 * step (la distanza orizzontale tra i punti campionati)
    // Z: Differenza tra giù e su
    outNormal[0] = hL - hR;
    outNormal[1] = 2.0f * step;
    outNormal[2] = hD - hU;
    
    glm_vec3_normalize(outNormal);
}

bool terrain_is_walkable(Terrain* t, float worldX, float worldZ) {
    float u, v;
    terrain_world_to_uv(t, worldX, worldZ, &u, &v);

    // 1. Check Bounds (con piccola tolleranza per errori floating point)
    const float eps = 0.001f;
    if (u < -eps || u > 1.0f + eps || v < -eps || v > 1.0f + eps) {
        return false;
    }
    // Clamp per sample_walkability
    if (u < 0.0f) u = 0.0f;
    if (u > 1.0f) u = 1.0f;
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;

    // 2. Check Walk Mask (Immagine BW)
    // Attualmente ritorna sempre TRUE se la maschera è NULL
    if (!sample_walkability(t, u, v)) {
        return false;
    }
    /*
    // 3. Check Pendenza (Fisica)
    // Calcoliamo la normale per vedere se è troppo ripido
    vec3 normal;
    terrain_get_normal(t, worldX, worldZ, normal);
    
    // normal[1] è la componente Y (Up).
    // 1.0 = Piatto, 0.0 = Verticale.
    // TERRAIN_MAX_SLOPE (es. 0.7) definisce l'angolo massimo.
    if (normal[1] < 0.7f) { // Hardcoded o usa TERRAIN_MAX_SLOPE se definito in .h
        return false;
    }
    */
    return true;
}



// ============================================================================
// CARICAMENTO
// ============================================================================

// Helper interno per caricare la Mesh dell'OBJ su GPU
static void setup_terrain_gpu(Terrain* t, Mesh* mesh) {
    t->vertexCount = mesh->vertexCount;

    glGenVertexArrays(1, &t->vao);
    glGenBuffers(1, &t->vbo);

    glBindVertexArray(t->vao);
    glBindBuffer(GL_ARRAY_BUFFER, t->vbo);

    // Carichiamo l'intero buffer di vertici (struct Vertex è compatta: Pos + Norm + UV)
    glBufferData(GL_ARRAY_BUFFER, sizeof(Vertex) * mesh->vertexCount, mesh->vertices, GL_STATIC_DRAW);

    // Configura Attributi (Layout deve combaciare con obj_loader.h)
    // 0: Position (3 float)
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)0);

    // 1: Normal (3 float)
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, normal));

    // 2: TexCoord (2 float)
    glEnableVertexAttribArray(2);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void*)offsetof(Vertex, texCoord));

    glBindVertexArray(0);
    
    // Inizializza matrice identità (o posiziona il chunk dove vuoi)
    glm_mat4_identity(t->modelMatrix);
}

static void init_shader(Terrain* t) {
    t->shader = gfx_create_shader("shaders/terrain.vs", "shaders/terrain.fs");
    
    t->loc_uVP = glGetUniformLocation(t->shader, "uVP");
    t->loc_uModel = glGetUniformLocation(t->shader, "uModel");
    t->loc_uTexture = glGetUniformLocation(t->shader, "uTexture");
    t->loc_uLightDir = glGetUniformLocation(t->shader, "uLightDir");
    t->loc_uAmbient = glGetUniformLocation(t->shader, "uAmbient");
    
    glm_mat4_identity(t->modelMatrix);
}

bool terrain_init_hybrid(Terrain* t, const char* objPath, const char* heightMapPath, const char* walkMaskPath, float worldSize, float offsetX, float offsetZ) {
    // Azzera la struct
    t->heightMap = NULL;
    t->walkMap = NULL;
    t->worldSize = worldSize;
    t->halfSize = worldSize / 2.0f;
    t->offsetX = offsetX;
    t->offsetZ = offsetZ;
    t->minY = 0.0f;
    t->maxY = 0.0f;

// 1. CARICAMENTO VISUALE (Mesh)
    Mesh* mesh = obj_load(objPath);
    if (!mesh) {
        printf("[Terrain] ERRORE: OBJ non trovato %s\n", objPath);
        return false;
    }
    
    // Spedisci a GPU
    setup_terrain_gpu(t, mesh);
    
    // Libera la RAM CPU della mesh (i dati sono ora in VRAM)
    obj_free(mesh);

    // Carica Texture Diffuse
    t->texture = gfx_load_texture("resources/levels/level1_diffuse.png"); // Usa la tua funzione esistente
    
    // Carica Shader (assicurati che supporti i layout 0,1,2)
    // Puoi riusare lo stesso shader di prima se gli attributi coincidono
    init_shader(t);


    // 1. CARICAMENTO HEIGHTMAP 16-BIT
    int w, h, channels;
    
    // Forza 1 canale (Grigio). Restituisce unsigned short (0-65535)
    unsigned short* raw16 = stbi_load_16(heightMapPath, &w, &h, &channels, 1);
    
    if (!raw16) {
        printf("[Terrain] ERRORE: Impossibile caricare heightmap 16-bit: %s\n", heightMapPath);
        return false;
    }

    t->gridWidth = w;
    t->gridHeight = h;
    
    // Allocazione array float finale
    t->heightMap = (float*)malloc(w * h * sizeof(float));
    
    // Conversione: [0..65535] -> [MIN..MAX]
    float range = TERRAIN_BAKE_MAX_HEIGHT - TERRAIN_BAKE_MIN_HEIGHT;
    
    for (int i = 0; i < w * h; i++) {
        // Normalizza 0.0 -> 1.0
        float normalized = (float)raw16[i] / 65535.0f;
        // Mappa ai metri reali
        t->heightMap[i] = TERRAIN_BAKE_MIN_HEIGHT + (normalized * range);
    }
    
    // Libera l'immagine raw temporanea
    stbi_image_free(raw16);
    
    printf("[Terrain] Caricata Heightmap 16-bit: %dx%d. Range [%.1fm, %.1fm]\n",
           w, h, TERRAIN_BAKE_MIN_HEIGHT, TERRAIN_BAKE_MAX_HEIGHT);

    // Calcola bounds Y per frustum culling
    {
        float minH = t->heightMap[0], maxH = t->heightMap[0];
        for (int i = 0; i < w * h; i++) {
            if (t->heightMap[i] < minH) minH = t->heightMap[i];
            if (t->heightMap[i] > maxH) maxH = t->heightMap[i];
        }
        t->minY = minH;
        t->maxY = maxH;
        printf("[Terrain] Altezze chunk: min=%.2f, max=%.2f\n", minH, maxH);
    }

    // Imposta modelMatrix per posizionare il chunk
    // La mesh OBJ è centrata in (0,0), quindi dobbiamo traslare al centro del chunk
    glm_mat4_identity(t->modelMatrix);
    vec3 translation = {offsetX + t->halfSize, 0.0f, offsetZ + t->halfSize};
    glm_translate(t->modelMatrix, translation);

    // 2. CARICAMENTO WALK MASK 8-BIT (Standard)
    int w2, h2, ch2;
    if (walkMaskPath) {
        t->walkMap = stbi_load(walkMaskPath, &w2, &h2, &ch2, 1);
    } else {
        t->walkMap = NULL;  // Trigger fallback below
    }

    if (!t->walkMap) {
        printf("[Terrain] WARNING: Walkmask non trovata, creo maschera vuota.\n");
        // Fallback: tutto camminabile
        t->walkMap = (unsigned char*)malloc(w * h);
        for(int i=0; i<w*h; i++) t->walkMap[i] = 255;
    } else {
        // Controllo coerenza dimensioni
        if (w2 != w || h2 != h) {
            printf("[Terrain] WARNING: Dimensioni Walkmask diverse da Heightmap!\n");
        }
    }

    // 3. COSTRUZIONE PATHFINDING GRID
    if (t->walkMap && t->gridWidth > 0 && t->gridHeight > 0) {
        if (!pathgrid_build(&t->pathgrid, t->walkMap, t->gridWidth, t->gridHeight)) {
            printf("[Terrain] WARNING: Failed to build pathfinding grid\n");
        }
    } else {
        printf("[Terrain] WARNING: No walkmap available, pathfinding grid not built\n");
    }

    return true;
}

// ============================================================================
// FISICA E INTERPOLAZIONE
// ============================================================================

float terrain_get_height(Terrain* t, float worldX, float worldZ) {
    if (!t->heightMap) return 0.0f;

    // 1. Converti coordinate World -> UV (0.0 -> 1.0)
    // Il chunk va da (offsetX, offsetZ) a (offsetX+worldSize, offsetZ+worldSize)
    float u = (worldX - t->offsetX) / t->worldSize;
    float v = (worldZ - t->offsetZ) / t->worldSize;

    // Check bounds
    if (u < 0.0f || u > 1.0f || v < 0.0f || v > 1.0f) {
        return -100.0f; // Abisso fuori mappa
    }

    float gridX = u * (t->gridWidth - 1);
    float gridY = v * (t->gridHeight - 1);

    // 2. Indici della cella
    int x0 = (int)gridX;
    int y0 = (int)gridY;
    int x1 = x0 + 1;
    int y1 = y0 + 1;

    // Clamp per sicurezza (evita crash sui bordi estremi)
    if (x1 >= t->gridWidth) x1 = t->gridWidth - 1;
    if (y1 >= t->gridHeight) y1 = t->gridHeight - 1;

    // 3. Pesi per l'interpolazione (la parte decimale)
    float tx = gridX - x0;
    float ty = gridY - y0;

    // 4. Lettura delle 4 altezze vicine (float)
    // Nota: Usiamo l'array heightMap già convertito in metri
    float h00 = t->heightMap[y0 * t->gridWidth + x0];
    float h10 = t->heightMap[y0 * t->gridWidth + x1];
    float h01 = t->heightMap[y1 * t->gridWidth + x0];
    float h11 = t->heightMap[y1 * t->gridWidth + x1];

    // 5. Interpolazione Bilineare
    float hTop = h00 + (h10 - h00) * tx;
    float hBot = h01 + (h11 - h01) * tx;
    
    return hTop + (hBot - hTop) * ty;
}

// ============================================================================
// RENDERING
// ============================================================================


void terrain_draw(Terrain* t, mat4 viewProj) {
    if (t->shader == 0) return;

    glUseProgram(t->shader);

    // Invia Uniforms
    glUniformMatrix4fv(t->loc_uVP, 1, GL_FALSE, (float*)viewProj);
    glUniformMatrix4fv(t->loc_uModel, 1, GL_FALSE, (float*)t->modelMatrix);

    // Luce base
    glUniform3f(t->loc_uLightDir, 0.5f, 1.0f, 0.3f);  // Direzione luce (dall'alto-destra)
    glUniform1f(t->loc_uAmbient, 0.3f);                // 30% luce ambiente
    
    // 3. Texture Bind
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, t->texture);
    glUniform1i(t->loc_uTexture, 0);

    // 4. Draw Call
    glBindVertexArray(t->vao);
    
    // NOTA: Usiamo GL_TRIANGLES e glDrawArrays perché l'obj_loader
    // ha srotolato gli indici creando una lista sequenziale di vertici.
    glDrawArrays(GL_TRIANGLES, 0, t->vertexCount);
    
    glBindVertexArray(0);
}

void terrain_cleanup(Terrain* t) {
    if (t->heightMap) free(t->heightMap);
    if (t->walkMap) free(t->walkMap);
    pathgrid_cleanup(&t->pathgrid);
    // free mesh...
}

// ============================================================================
// DEBUG: Visualizzazione heightmap come nuvola di punti
// ============================================================================

static GLuint debug_vao = 0;
static GLuint debug_vbo = 0;
static GLuint debug_shader = 0;
static GLint debug_loc_uVP = -1;
static GLint debug_loc_uColor = -1;
static int debug_point_count = 0;

// Per walkmap/pathgrid con colori per vertice
static GLuint debug_colored_vao = 0;
static GLuint debug_colored_vbo = 0;
static GLuint debug_colored_shader = 0;
static GLint debug_colored_loc_uVP = -1;
static int debug_colored_point_count = 0;

// Cache per evitare ricalcoli
static int debug_cached_step = 0;
static Terrain* debug_cached_terrain = NULL;

// Cache per pathgrid debug
static Terrain* debug_pathgrid_cached_terrain = NULL;
static bool debug_pathgrid_initialized = false;

void terrain_debug_init(Terrain* t) {
    // Carica shader (riusa quello del grid)
    if (debug_shader == 0) {
        debug_shader = gfx_create_shader("shaders/grid.vs", "shaders/grid.fs");
        debug_loc_uVP = glGetUniformLocation(debug_shader, "uVP");
        debug_loc_uColor = glGetUniformLocation(debug_shader, "uColor");
    }

    // Crea VAO/VBO vuoti, verranno riempiti in debug_draw
    if (debug_vao == 0) {
        glGenVertexArrays(1, &debug_vao);
        glGenBuffers(1, &debug_vbo);
    }

    debug_cached_terrain = t;
    debug_cached_step = 0;  // Forza ricalcolo al primo draw
}

void terrain_debug_draw(Terrain* t, mat4 viewProj, int step) {
    if (!t->heightMap || debug_shader == 0) return;
    if (step < 1) step = 1;

    // Ricalcola i punti solo se necessario (step cambiato o primo draw)
    if (step != debug_cached_step || t != debug_cached_terrain) {
        debug_cached_step = step;
        debug_cached_terrain = t;

        // Calcola quanti punti avremo
        int pointsX = (t->gridWidth + step - 1) / step;
        int pointsZ = (t->gridHeight + step - 1) / step;
        debug_point_count = pointsX * pointsZ;

        // Alloca buffer temporaneo per i vertici (x, y, z per punto)
        float* vertices = malloc(debug_point_count * 3 * sizeof(float));

        int idx = 0;
        for (int gz = 0; gz < t->gridHeight; gz += step) {
            for (int gx = 0; gx < t->gridWidth; gx += step) {
                // Converti coordinate griglia in coordinate world
                float u = (float)gx / (float)(t->gridWidth - 1);
                float v = (float)gz / (float)(t->gridHeight - 1);

                float worldX = (u - 0.5f) * t->worldSize;
                float worldZ = (v - 0.5f) * t->worldSize;

                // Leggi altezza dalla heightmap
                int hmIdx = gz * t->gridWidth + gx;
                float worldY = t->heightMap[hmIdx];

                vertices[idx++] = worldX;
                vertices[idx++] = worldY;
                vertices[idx++] = worldZ;
            }
        }

        // Upload a GPU
        glBindVertexArray(debug_vao);
        glBindBuffer(GL_ARRAY_BUFFER, debug_vbo);
        glBufferData(GL_ARRAY_BUFFER, debug_point_count * 3 * sizeof(float), vertices, GL_DYNAMIC_DRAW);

        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
        glEnableVertexAttribArray(0);

        glBindVertexArray(0);
        free(vertices);

        //printf("[TerrainDebug] Created %d points (step=%d, grid=%dx%d)\n",
        //       debug_point_count, step, t->gridWidth, t->gridHeight);
    }

    // Disegna i punti
    glUseProgram(debug_shader);
    glUniformMatrix4fv(debug_loc_uVP, 1, GL_FALSE, (float*)viewProj);
    glUniform3f(debug_loc_uColor, 1.0f, 0.0f, 0.0f);  // Rosso

    glBindVertexArray(debug_vao);
    glPointSize(4.0f);
    glDrawArrays(GL_POINTS, 0, debug_point_count);
    glPointSize(1.0f);
    glBindVertexArray(0);
}

void terrain_debug_draw_walkmap(Terrain* t, mat4 viewProj, int step) {
    if (!t->walkMap || !t->heightMap) {
        //printf("[TerrainDebug] No walkmap or heightmap available\n");
        return;
    }
    if (step < 1) step = 1;

    // Inizializza shader colored se necessario
    if (debug_colored_shader == 0) {
        debug_colored_shader = gfx_create_shader("shaders/debug_colored.vs", "shaders/debug_colored.fs");
        debug_colored_loc_uVP = glGetUniformLocation(debug_colored_shader, "uVP");
    }

    // Crea VAO/VBO se necessario
    if (debug_colored_vao == 0) {
        glGenVertexArrays(1, &debug_colored_vao);
        glGenBuffers(1, &debug_colored_vbo);
    }

    // Calcola quanti punti avremo
    int pointsX = (t->gridWidth + step - 1) / step;
    int pointsZ = (t->gridHeight + step - 1) / step;
    debug_colored_point_count = pointsX * pointsZ;

    // Alloca buffer temporaneo per vertici (x, y, z, r, g, b per punto)
    float* vertices = malloc(debug_colored_point_count * 6 * sizeof(float));

    int idx = 0;
    for (int gz = 0; gz < t->gridHeight; gz += step) {
        for (int gx = 0; gx < t->gridWidth; gx += step) {
            // Converti coordinate griglia in coordinate world
            float u = (float)gx / (float)(t->gridWidth - 1);
            float v = (float)gz / (float)(t->gridHeight - 1);

            float worldX = t->offsetX + u * t->worldSize;
            float worldZ = t->offsetZ + v * t->worldSize;

            // Leggi altezza dalla heightmap
            int hmIdx = gz * t->gridWidth + gx;
            float worldY = t->heightMap[hmIdx];

            // Leggi walkability dalla walkmap
            bool walkable = t->walkMap[hmIdx] > 128;

            // Posizione
            vertices[idx++] = worldX;
            vertices[idx++] = worldY;
            vertices[idx++] = worldZ;

            // Colore: Verde se walkable, Rosso se bloccato
            if (walkable) {
                vertices[idx++] = 0.0f; // R
                vertices[idx++] = 1.0f; // G
                vertices[idx++] = 0.0f; // B
            } else {
                vertices[idx++] = 1.0f; // R
                vertices[idx++] = 0.0f; // G
                vertices[idx++] = 0.0f; // B
            }
        }
    }

    // Upload a GPU
    glBindVertexArray(debug_colored_vao);
    glBindBuffer(GL_ARRAY_BUFFER, debug_colored_vbo);
    glBufferData(GL_ARRAY_BUFFER, debug_colored_point_count * 6 * sizeof(float), vertices, GL_DYNAMIC_DRAW);

    // Attributo 0: posizione (xyz)
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    // Attributo 1: colore (rgb)
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)(3 * sizeof(float)));
    glEnableVertexAttribArray(1);

    glBindVertexArray(0);
    free(vertices);

    //printf("[TerrainDebug] Created walkmap visualization: %d points (step=%d)\n",
    //       debug_colored_point_count, step);

    // Disegna i punti
    glUseProgram(debug_colored_shader);
    glUniformMatrix4fv(debug_colored_loc_uVP, 1, GL_FALSE, (float*)viewProj);

    glBindVertexArray(debug_colored_vao);
    glPointSize(4.0f);
    glDrawArrays(GL_POINTS, 0, debug_colored_point_count);
    glPointSize(1.0f);
    glBindVertexArray(0);
}

void terrain_debug_draw_pathgrid(Terrain* t, mat4 viewProj) {
    if (!t->pathgrid.grid) {
        return;
    }

    // Inizializza shader colored se necessario
    if (debug_colored_shader == 0) {
        debug_colored_shader = gfx_create_shader("shaders/debug_colored.vs", "shaders/debug_colored.fs");
        debug_colored_loc_uVP = glGetUniformLocation(debug_colored_shader, "uVP");
    }

    // Crea VAO/VBO se necessario
    if (debug_colored_vao == 0) {
        glGenVertexArrays(1, &debug_colored_vao);
        glGenBuffers(1, &debug_colored_vbo);
    }

    // Ricalcola solo se necessario (primo draw o terrain cambiato)
    if (!debug_pathgrid_initialized || t != debug_pathgrid_cached_terrain) {
        debug_pathgrid_cached_terrain = t;
        debug_pathgrid_initialized = true;

        // Pathgrid è sempre 64x64
        int gridSize = t->pathgrid.grid_width;
        debug_colored_point_count = gridSize * gridSize;

        // Alloca buffer temporaneo per vertici (x, y, z, r, g, b per punto)
        float* vertices = malloc(debug_colored_point_count * 6 * sizeof(float));

        int idx = 0;
        for (int gz = 0; gz < gridSize; gz++) {
            for (int gx = 0; gx < gridSize; gx++) {
                // Converti coordinate griglia in coordinate world (centro della cella)
                float u = (gx + 0.5f) / gridSize;
                float v = (gz + 0.5f) / gridSize;

                float worldX = t->offsetX + u * t->worldSize;
                float worldZ = t->offsetZ + v * t->worldSize;

                // Leggi altezza dal terrain
                float worldY = terrain_get_height(t, worldX, worldZ);

                // Leggi walkability dal pathgrid
                int gridIdx = gz * gridSize + gx;
                bool walkable = t->pathgrid.grid[gridIdx] != 0;

                // Posizione
                vertices[idx++] = worldX;
                vertices[idx++] = worldY + 0.5f; // Alza leggermente per visibilità
                vertices[idx++] = worldZ;

                // Colore: Verde brillante se walkable, Rosso se bloccato
                if (walkable) {
                    vertices[idx++] = 0.0f;  // R
                    vertices[idx++] = 1.0f;  // G
                    vertices[idx++] = 0.0f;  // B
                } else {
                    vertices[idx++] = 1.0f;  // R
                    vertices[idx++] = 0.0f;  // G
                    vertices[idx++] = 0.0f;  // B
                }
            }
        }

        // Upload a GPU
        glBindVertexArray(debug_colored_vao);
        glBindBuffer(GL_ARRAY_BUFFER, debug_colored_vbo);
        glBufferData(GL_ARRAY_BUFFER, debug_colored_point_count * 6 * sizeof(float), vertices, GL_STATIC_DRAW);

        // Attributo 0: posizione (xyz)
        glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)0);
        glEnableVertexAttribArray(0);

        // Attributo 1: colore (rgb)
        glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)(3 * sizeof(float)));
        glEnableVertexAttribArray(1);

        glBindVertexArray(0);
        free(vertices);

        //printf("[TerrainDebug] Created pathgrid visualization: %d points\n", debug_colored_point_count);
    }

    // Disegna i punti
    glUseProgram(debug_colored_shader);
    glUniformMatrix4fv(debug_colored_loc_uVP, 1, GL_FALSE, (float*)viewProj);

    glBindVertexArray(debug_colored_vao);
    glPointSize(8.0f);  // Più grandi per pathgrid
    glDrawArrays(GL_POINTS, 0, debug_colored_point_count);
    glPointSize(1.0f);
    glBindVertexArray(0);
}

void terrain_debug_cleanup(void) {
    if (debug_vbo) glDeleteBuffers(1, &debug_vbo);
    if (debug_vao) glDeleteVertexArrays(1, &debug_vao);
    if (debug_shader) glDeleteProgram(debug_shader);

    if (debug_colored_vbo) glDeleteBuffers(1, &debug_colored_vbo);
    if (debug_colored_vao) glDeleteVertexArrays(1, &debug_colored_vao);
    if (debug_colored_shader) glDeleteProgram(debug_colored_shader);

    debug_vbo = 0;
    debug_vao = 0;
    debug_shader = 0;
    debug_colored_vbo = 0;
    debug_colored_vao = 0;
    debug_colored_shader = 0;
    debug_point_count = 0;
    debug_colored_point_count = 0;
    debug_cached_step = 0;
    debug_cached_terrain = NULL;
    debug_pathgrid_cached_terrain = NULL;
    debug_pathgrid_initialized = false;
}