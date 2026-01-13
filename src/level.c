#include "level.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// ============================================================================
// FRUSTUM CULLING
// ============================================================================

void frustum_extract_planes(mat4 viewProj, vec4 planes[6]) {
    // Estrae i 6 piani del frustum dalla matrice viewProj
    // Metodo: i piani sono combinazioni delle righe della matrice

    float* m = (float*)viewProj;

    // Left plane: row3 + row0
    planes[0][0] = m[3] + m[0];
    planes[0][1] = m[7] + m[4];
    planes[0][2] = m[11] + m[8];
    planes[0][3] = m[15] + m[12];

    // Right plane: row3 - row0
    planes[1][0] = m[3] - m[0];
    planes[1][1] = m[7] - m[4];
    planes[1][2] = m[11] - m[8];
    planes[1][3] = m[15] - m[12];

    // Bottom plane: row3 + row1
    planes[2][0] = m[3] + m[1];
    planes[2][1] = m[7] + m[5];
    planes[2][2] = m[11] + m[9];
    planes[2][3] = m[15] + m[13];

    // Top plane: row3 - row1
    planes[3][0] = m[3] - m[1];
    planes[3][1] = m[7] - m[5];
    planes[3][2] = m[11] - m[9];
    planes[3][3] = m[15] - m[13];

    // Near plane: row3 + row2
    planes[4][0] = m[3] + m[2];
    planes[4][1] = m[7] + m[6];
    planes[4][2] = m[11] + m[10];
    planes[4][3] = m[15] + m[14];

    // Far plane: row3 - row2
    planes[5][0] = m[3] - m[2];
    planes[5][1] = m[7] - m[6];
    planes[5][2] = m[11] - m[10];
    planes[5][3] = m[15] - m[14];

    // Normalizza i piani
    for (int i = 0; i < 6; i++) {
        float len = sqrtf(planes[i][0]*planes[i][0] +
                         planes[i][1]*planes[i][1] +
                         planes[i][2]*planes[i][2]);
        if (len > 0.0001f) {
            planes[i][0] /= len;
            planes[i][1] /= len;
            planes[i][2] /= len;
            planes[i][3] /= len;
        }
    }
}

bool frustum_test_aabb(vec4 planes[6], vec3 min, vec3 max) {
    // Test AABB contro frustum
    // Ritorna false se completamente fuori, true se almeno parzialmente dentro

    for (int i = 0; i < 6; i++) {
        // Trova il punto "più positivo" dell'AABB rispetto al piano
        vec3 p;
        p[0] = (planes[i][0] >= 0) ? max[0] : min[0];
        p[1] = (planes[i][1] >= 0) ? max[1] : min[1];
        p[2] = (planes[i][2] >= 0) ? max[2] : min[2];

        // Se questo punto è dietro al piano, l'AABB è fuori
        float dist = planes[i][0] * p[0] +
                     planes[i][1] * p[1] +
                     planes[i][2] * p[2] +
                     planes[i][3];

        if (dist < 0) {
            return false;
        }
    }

    return true;
}

// ============================================================================
// HELPER: Trova chunk dalle coordinate
// ============================================================================

Terrain* level_get_chunk_at(Level* lvl, float worldX, float worldZ) {
    if (!lvl->chunks) return NULL;

    // Converti world coords in coordinate locali (relative all'origine del livello)
    float localX = worldX - lvl->originX;
    float localZ = worldZ - lvl->originZ;

    // Se siamo fuori dai bounds del livello, ritorna NULL
    if (localX < 0.0f || localX >= lvl->totalSizeX ||
        localZ < 0.0f || localZ >= lvl->totalSizeZ) {
        return NULL;
    }

    // Calcola indici chunk
    int cx = (int)(localX / lvl->chunkSize);
    int cz = (int)(localZ / lvl->chunkSize);

    // Clamp per sicurezza (edge case: localX == totalSizeX)
    if (cx >= lvl->chunksCountX) cx = lvl->chunksCountX - 1;
    if (cz >= lvl->chunksCountZ) cz = lvl->chunksCountZ - 1;

    return &lvl->chunks[cz * lvl->chunksCountX + cx];
}

// ============================================================================
// WRAPPER FUNCTIONS
// ============================================================================

float level_get_height(Level* lvl, float worldX, float worldZ) {
    Terrain* chunk = level_get_chunk_at(lvl, worldX, worldZ);
    if (!chunk) return 0.0f;
    return terrain_get_height(chunk, worldX, worldZ);
}

void level_get_normal(Level* lvl, float worldX, float worldZ, vec3 outNormal) {
    Terrain* chunk = level_get_chunk_at(lvl, worldX, worldZ);
    if (!chunk) {
        glm_vec3_copy((vec3){0.0f, 1.0f, 0.0f}, outNormal);
        return;
    }
    terrain_get_normal(chunk, worldX, worldZ, outNormal);
}

bool level_is_walkable(Level* lvl, float worldX, float worldZ) {
    Terrain* chunk = level_get_chunk_at(lvl, worldX, worldZ);
    if (!chunk) return false;
    return terrain_is_walkable(chunk, worldX, worldZ);
}

// ============================================================================
// CARICAMENTO LIVELLO
// ============================================================================

bool level_load(Level* lvl, const char* configPath) {
    FILE* f = fopen(configPath, "r");
    if (!f) {
        printf("[Level] ERROR: Cannot open config file: %s\n", configPath);
        return false;
    }

    // Inizializza
    memset(lvl, 0, sizeof(Level));

    char line[512];
    int chunksRead = 0;

    // Prima passata: leggi header
    while (fgets(line, sizeof(line), f)) {
        // Salta commenti e righe vuote
        if (line[0] == '#' || line[0] == '\n' || line[0] == '\r') continue;

        char key[64];
        if (sscanf(line, "%63s", key) != 1) continue;

        if (strcmp(key, "chunks_x") == 0) {
            sscanf(line, "%*s %d", &lvl->chunksCountX);
        } else if (strcmp(key, "chunks_z") == 0) {
            sscanf(line, "%*s %d", &lvl->chunksCountZ);
        } else if (strcmp(key, "chunk_size") == 0) {
            sscanf(line, "%*s %f", &lvl->chunkSize);
        }
    }

    // Valida header
    if (lvl->chunksCountX <= 0 || lvl->chunksCountZ <= 0 || lvl->chunkSize <= 0) {
        printf("[Level] ERROR: Invalid header in %s\n", configPath);
        fclose(f);
        return false;
    }

    // Calcola bounds e origine (centrato)
    lvl->totalSizeX = lvl->chunksCountX * lvl->chunkSize;
    lvl->totalSizeZ = lvl->chunksCountZ * lvl->chunkSize;
    lvl->originX = -lvl->totalSizeX / 2.0f;
    lvl->originZ = -lvl->totalSizeZ / 2.0f;
    lvl->totalChunks = lvl->chunksCountX * lvl->chunksCountZ;

    printf("[Level] Loading: %dx%d chunks, %.1fm each, total %.1fx%.1fm\n",
           lvl->chunksCountX, lvl->chunksCountZ, lvl->chunkSize,
           lvl->totalSizeX, lvl->totalSizeZ);

    // Alloca array chunk
    lvl->chunks = (Terrain*)calloc(lvl->totalChunks, sizeof(Terrain));
    if (!lvl->chunks) {
        printf("[Level] ERROR: Failed to allocate chunks array\n");
        fclose(f);
        return false;
    }

    // Estrai directory base dal path del config
    char baseDir[256] = "";
    const char* lastSlash = strrchr(configPath, '/');
    if (lastSlash) {
        size_t len = lastSlash - configPath + 1;
        strncpy(baseDir, configPath, len);
        baseDir[len] = '\0';
    }

    // Seconda passata: leggi chunk
    rewind(f);
    while (fgets(line, sizeof(line), f)) {
        // Salta commenti, righe vuote, e header
        if (line[0] == '#' || line[0] == '\n' || line[0] == '\r') continue;

        char key[64];
        if (sscanf(line, "%63s", key) != 1) continue;
        if (strcmp(key, "chunks_x") == 0 ||
            strcmp(key, "chunks_z") == 0 ||
            strcmp(key, "chunk_size") == 0) continue;

        // Formato: indice_x indice_z path_obj path_heightmap [path_walkmask]
        int ix, iz;
        char objPath[256], hmPath[256], wmPath[256] = "";

        int parsed = sscanf(line, "%d %d %255s %255s %255s", &ix, &iz, objPath, hmPath, wmPath);
        if (parsed < 4) continue;

        // Converti indici relativi al centro in indici array
        // Se chunks_x=4, indici vanno da -2 a +1, mappati a 0..3
        int arrayX = ix + lvl->chunksCountX / 2;
        int arrayZ = iz + lvl->chunksCountZ / 2;

        if (arrayX < 0 || arrayX >= lvl->chunksCountX ||
            arrayZ < 0 || arrayZ >= lvl->chunksCountZ) {
            printf("[Level] WARNING: Chunk index out of range: %d,%d\n", ix, iz);
            continue;
        }

        int idx = arrayZ * lvl->chunksCountX + arrayX;

        // Calcola offset world del chunk
        float offsetX = lvl->originX + arrayX * lvl->chunkSize;
        float offsetZ = lvl->originZ + arrayZ * lvl->chunkSize;

        // Costruisci path completi
        char fullObjPath[512], fullHmPath[512], fullWmPath[512];
        snprintf(fullObjPath, sizeof(fullObjPath), "%s%s", baseDir, objPath);
        snprintf(fullHmPath, sizeof(fullHmPath), "%s%s", baseDir, hmPath);

        const char* wmPathPtr = NULL;
        if (wmPath[0]) {
            snprintf(fullWmPath, sizeof(fullWmPath), "%s%s", baseDir, wmPath);
            wmPathPtr = fullWmPath;
        }

        printf("[Level] Loading chunk [%d,%d] at (%.1f, %.1f)...\n", ix, iz, offsetX, offsetZ);

        if (!terrain_init_hybrid(&lvl->chunks[idx], fullObjPath, fullHmPath, wmPathPtr,
                                  lvl->chunkSize, offsetX, offsetZ)) {
            printf("[Level] WARNING: Failed to load chunk %d,%d\n", ix, iz);
        } else {
            chunksRead++;
        }
    }

    fclose(f);

    printf("[Level] Loaded %d/%d chunks\n", chunksRead, lvl->totalChunks);
    return chunksRead > 0;
}

void level_cleanup(Level* lvl) {
    if (lvl->chunks) {
        for (int i = 0; i < lvl->totalChunks; i++) {
            terrain_cleanup(&lvl->chunks[i]);
        }
        free(lvl->chunks);
        lvl->chunks = NULL;
    }
    lvl->totalChunks = 0;
}

// ============================================================================
// RENDERING
// ============================================================================

void level_draw(Level* lvl, mat4 viewProj) {
    if (!lvl->chunks) return;

    // Estrai frustum
    vec4 frustum[6];
    frustum_extract_planes(viewProj, frustum);

    lvl->chunksRendered = 0;

    for (int z = 0; z < lvl->chunksCountZ; z++) {
        for (int x = 0; x < lvl->chunksCountX; x++) {
            Terrain* chunk = &lvl->chunks[z * lvl->chunksCountX + x];

            // Skip chunk non inizializzati
            if (!chunk->heightMap) continue;

            // Frustum culling
            vec3 bmin, bmax;
            terrain_get_bounds(chunk, bmin, bmax);

            if (!frustum_test_aabb(frustum, bmin, bmax)) {
                continue;  // Chunk fuori dal frustum, skip
            }

            terrain_draw(chunk, viewProj);
            lvl->chunksRendered++;
        }
    }
}
