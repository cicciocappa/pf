/*
 * HEIGHTMAP BAKER - Genera heightmap da OBJ
 * ==========================================
 *
 * Uso: ./heightmap_baker input.obj output.png [size] [world_size]
 *
 * Esempio: ./heightmap_baker level1.obj level1_hm.png 1024 64.0
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <float.h>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

// Range altezze (deve corrispondere a terrain.h!)
#define HEIGHT_MIN  -64.0f
#define HEIGHT_MAX   192.0f

// ============================================================================
// STRUTTURE DATI
// ============================================================================

typedef struct {
    float x, y, z;
} Vec3;

typedef struct {
    Vec3 v0, v1, v2;
    float minX, maxX, minZ, maxZ;  // Bounding box 2D per accelerazione
} Triangle;

typedef struct {
    Triangle* tris;
    int count;
    int capacity;

    // Bounds globali
    float minX, maxX;
    float minY, maxY;
    float minZ, maxZ;
} Mesh;

// ============================================================================
// MATH UTILITIES
// ============================================================================

static Vec3 vec3_sub(Vec3 a, Vec3 b) {
    return (Vec3){a.x - b.x, a.y - b.y, a.z - b.z};
}

static Vec3 vec3_cross(Vec3 a, Vec3 b) {
    return (Vec3){
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    };
}

static float vec3_dot(Vec3 a, Vec3 b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

// ============================================================================
// RAY-TRIANGLE INTERSECTION (Möller–Trumbore)
// ============================================================================

static int ray_triangle_intersect(
    Vec3 rayOrigin, Vec3 rayDir,
    Vec3 v0, Vec3 v1, Vec3 v2,
    float* outT
) {
    const float EPSILON = 1e-7f;

    Vec3 edge1 = vec3_sub(v1, v0);
    Vec3 edge2 = vec3_sub(v2, v0);

    Vec3 h = vec3_cross(rayDir, edge2);
    float a = vec3_dot(edge1, h);

    if (a > -EPSILON && a < EPSILON) return 0;  // Parallelo

    float f = 1.0f / a;
    Vec3 s = vec3_sub(rayOrigin, v0);
    float u = f * vec3_dot(s, h);

    if (u < 0.0f || u > 1.0f) return 0;

    Vec3 q = vec3_cross(s, edge1);
    float v = f * vec3_dot(rayDir, q);

    if (v < 0.0f || u + v > 1.0f) return 0;

    float t = f * vec3_dot(edge2, q);

    if (t > EPSILON) {
        *outT = t;
        return 1;
    }

    return 0;
}

// ============================================================================
// OBJ LOADER (Semplificato)
// ============================================================================

static void mesh_init(Mesh* m) {
    m->capacity = 1024;
    m->tris = malloc(m->capacity * sizeof(Triangle));
    m->count = 0;
    m->minX = m->minY = m->minZ = FLT_MAX;
    m->maxX = m->maxY = m->maxZ = -FLT_MAX;
}

static void mesh_add_triangle(Mesh* m, Vec3 v0, Vec3 v1, Vec3 v2) {
    if (m->count >= m->capacity) {
        m->capacity *= 2;
        m->tris = realloc(m->tris, m->capacity * sizeof(Triangle));
    }

    Triangle* t = &m->tris[m->count++];
    t->v0 = v0;
    t->v1 = v1;
    t->v2 = v2;

    // Calcola bounding box 2D (XZ)
    t->minX = fminf(fminf(v0.x, v1.x), v2.x);
    t->maxX = fmaxf(fmaxf(v0.x, v1.x), v2.x);
    t->minZ = fminf(fminf(v0.z, v1.z), v2.z);
    t->maxZ = fmaxf(fmaxf(v0.z, v1.z), v2.z);

    // Aggiorna bounds globali
    m->minX = fminf(m->minX, t->minX);
    m->maxX = fmaxf(m->maxX, t->maxX);
    m->minY = fminf(m->minY, fminf(fminf(v0.y, v1.y), v2.y));
    m->maxY = fmaxf(m->maxY, fmaxf(fmaxf(v0.y, v1.y), v2.y));
    m->minZ = fminf(m->minZ, t->minZ);
    m->maxZ = fmaxf(m->maxZ, t->maxZ);
}

static void mesh_free(Mesh* m) {
    free(m->tris);
}

static int load_obj(const char* path, Mesh* mesh) {
    FILE* f = fopen(path, "r");
    if (!f) {
        printf("ERROR: Cannot open %s\n", path);
        return 0;
    }

    mesh_init(mesh);

    // Array dinamico per vertici
    Vec3* verts = malloc(65536 * sizeof(Vec3));
    int vertCount = 0;
    int vertCapacity = 65536;

    char line[512];
    while (fgets(line, sizeof(line), f)) {
        if (line[0] == 'v' && line[1] == ' ') {
            // Vertice
            if (vertCount >= vertCapacity) {
                vertCapacity *= 2;
                verts = realloc(verts, vertCapacity * sizeof(Vec3));
            }
            sscanf(line + 2, "%f %f %f", &verts[vertCount].x, &verts[vertCount].y, &verts[vertCount].z);
            vertCount++;
        }
        else if (line[0] == 'f' && line[1] == ' ') {
            // Faccia - supporta f v, f v/t, f v/t/n, f v//n
            int indices[16];
            int indexCount = 0;

            char* ptr = line + 2;
            while (*ptr && indexCount < 16) {
                while (*ptr == ' ') ptr++;
                if (*ptr == '\0' || *ptr == '\n') break;

                int vi = 0;
                sscanf(ptr, "%d", &vi);
                if (vi < 0) vi = vertCount + vi + 1;  // Indici negativi
                indices[indexCount++] = vi - 1;  // OBJ è 1-based

                // Salta fino al prossimo spazio
                while (*ptr && *ptr != ' ' && *ptr != '\n') ptr++;
            }

            // Triangola la faccia (fan triangulation)
            for (int i = 1; i < indexCount - 1; i++) {
                int i0 = indices[0];
                int i1 = indices[i];
                int i2 = indices[i + 1];

                if (i0 >= 0 && i0 < vertCount &&
                    i1 >= 0 && i1 < vertCount &&
                    i2 >= 0 && i2 < vertCount) {
                    mesh_add_triangle(mesh, verts[i0], verts[i1], verts[i2]);
                }
            }
        }
    }

    free(verts);
    fclose(f);

    printf("Loaded OBJ: %d triangles\n", mesh->count);
    printf("Bounds: X[%.2f, %.2f] Y[%.2f, %.2f] Z[%.2f, %.2f]\n",
           mesh->minX, mesh->maxX, mesh->minY, mesh->maxY, mesh->minZ, mesh->maxZ);

    return mesh->count > 0;
}

// ============================================================================
// HEIGHTMAP GENERATION
// ============================================================================

static float sample_height(Mesh* mesh, float worldX, float worldZ) {
    // Raggio dall'alto verso il basso
    Vec3 rayOrigin = {worldX, mesh->maxY + 10.0f, worldZ};
    Vec3 rayDir = {0.0f, -1.0f, 0.0f};

    float closestT = FLT_MAX;
    int hit = 0;

    // Testa tutti i triangoli (con culling basato su bounding box)
    for (int i = 0; i < mesh->count; i++) {
        Triangle* tri = &mesh->tris[i];

        // Skip se fuori dal bounding box 2D
        if (worldX < tri->minX || worldX > tri->maxX ||
            worldZ < tri->minZ || worldZ > tri->maxZ) {
            continue;
        }

        float t;
        if (ray_triangle_intersect(rayOrigin, rayDir, tri->v0, tri->v1, tri->v2, &t)) {
            if (t < closestT) {
                closestT = t;
                hit = 1;
            }
        }
    }

    if (hit) {
        return rayOrigin.y - closestT;  // Altezza Y del punto di intersezione
    }

    return HEIGHT_MIN;  // Nessuna intersezione
}

static void generate_heightmap(Mesh* mesh, unsigned short* pixels, int size, float worldSize) {
    float halfSize = worldSize / 2.0f;

    printf("Generating %dx%d heightmap (world size: %.1f)...\n", size, size, worldSize);

    int lastPercent = -1;

    for (int y = 0; y < size; y++) {
        int percent = (y * 100) / size;
        if (percent != lastPercent) {
            printf("\r  Progress: %d%%", percent);
            fflush(stdout);
            lastPercent = percent;
        }

        for (int x = 0; x < size; x++) {
            // Converti pixel -> coordinate world
            // x=0 -> -halfSize, x=size-1 -> +halfSize
            float u = (float)x / (float)(size - 1);
            float v = (float)y / (float)(size - 1);

            float worldX = (u - 0.5f) * worldSize;
            float worldZ = (v - 0.5f) * worldSize;

            // Campiona altezza
            float height = sample_height(mesh, worldX, worldZ);

            // Converti in 16-bit [0, 65535]
            float normalized = (height - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN);
            normalized = fmaxf(0.0f, fminf(1.0f, normalized));

            pixels[y * size + x] = (unsigned short)(normalized * 65535.0f);
        }
    }

    printf("\r  Progress: 100%%\n");
}

// ============================================================================
// MAIN
// ============================================================================

int main(int argc, char* argv[]) {
    if (argc < 3) {
        printf("HEIGHTMAP BAKER\n");
        printf("===============\n");
        printf("Usage: %s <input.obj> <output.png> [size] [world_size]\n", argv[0]);
        printf("\n");
        printf("Arguments:\n");
        printf("  input.obj   - Input mesh file\n");
        printf("  output.png  - Output heightmap (16-bit grayscale)\n");
        printf("  size        - Resolution (default: 1024)\n");
        printf("  world_size  - World size in meters (default: 64.0)\n");
        printf("\n");
        printf("Height range: %.1f to %.1f meters\n", HEIGHT_MIN, HEIGHT_MAX);
        return 1;
    }

    const char* inputPath = argv[1];
    const char* outputPath = argv[2];
    int size = (argc > 3) ? atoi(argv[3]) : 1024;
    float worldSize = (argc > 4) ? atof(argv[4]) : 64.0f;

    printf("Input:  %s\n", inputPath);
    printf("Output: %s\n", outputPath);
    printf("Size:   %dx%d\n", size, size);
    printf("World:  %.1f x %.1f meters\n", worldSize, worldSize);
    printf("Height: %.1f to %.1f meters\n", HEIGHT_MIN, HEIGHT_MAX);
    printf("\n");

    // Carica OBJ
    Mesh mesh;
    if (!load_obj(inputPath, &mesh)) {
        return 1;
    }

    // Alloca heightmap
    unsigned short* pixels = malloc(size * size * sizeof(unsigned short));

    // Genera heightmap
    generate_heightmap(&mesh, pixels, size, worldSize);

    // Salva come RAW 16-bit (poi convertire con ImageMagick)
    char rawPath[512];
    snprintf(rawPath, sizeof(rawPath), "%s.raw", outputPath);

    printf("Saving %s (raw 16-bit)...\n", rawPath);
    FILE* outFile = fopen(rawPath, "wb");
    if (!outFile) {
        printf("ERROR: Cannot create output file\n");
        free(pixels);
        mesh_free(&mesh);
        return 1;
    }
    fwrite(pixels, sizeof(unsigned short), size * size, outFile);
    fclose(outFile);

    printf("\nTo convert to 16-bit PNG, run:\n");
    printf("  convert -size %dx%d -depth 16 gray:%s %s\n", size, size, rawPath, outputPath);
    printf("\nOr use Python:\n");
    printf("  python3 -c \"import numpy as np; from PIL import Image; d=np.fromfile('%s',dtype=np.uint16).reshape(%d,%d); Image.fromarray(d).save('%s')\"\n",
           rawPath, size, size, outputPath);

    printf("Done!\n");

    free(pixels);
    mesh_free(&mesh);
    return 0;
}
