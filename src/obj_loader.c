#include "obj_loader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Buffer temporanei per la lettura (ridimensionabili a piacere)
#define MAX_TEMP_VERTICES 16384
#define MAX_TEMP_UVS      16384
#define MAX_TEMP_NORMALS  16384
#define MAX_FACES         16384

Mesh* obj_load(const char* filename) {
    FILE* file = fopen(filename, "r");
    if (!file) {
        printf("[OBJ] Errore: Impossibile aprire %s\n", filename);
        return NULL;
    }

    // Array temporanei per i dati grezzi dal file
    // (In un engine pro useresti vettori dinamici, qui usiamo stack/static per semplicità)
    float temp_pos[MAX_TEMP_VERTICES][3];
    float temp_uv[MAX_TEMP_UVS][2];
    float temp_norm[MAX_TEMP_NORMALS][3];

    int pos_count = 0;
    int uv_count = 0;
    int norm_count = 0;
    
    // Lista dei triangoli (facce)
    // Ogni faccia ha 3 vertici, ogni vertice ha 3 indici (pos/uv/norm)
    int vertex_indices[MAX_FACES * 3];
    int uv_indices[MAX_FACES * 3];
    int norm_indices[MAX_FACES * 3];
    int face_vert_count = 0; // Totale vertici finali

    char line[128];
    while (fgets(line, sizeof(line), file)) {
        // 1. Vertice Posizione (v x y z)
        if (strncmp(line, "v ", 2) == 0) {
            sscanf(line, "v %f %f %f", 
                   &temp_pos[pos_count][0], 
                   &temp_pos[pos_count][1], 
                   &temp_pos[pos_count][2]);
            pos_count++;
        }
        // 2. Texture Coordinate (vt u v)
        else if (strncmp(line, "vt ", 3) == 0) {
            sscanf(line, "vt %f %f", 
                   &temp_uv[uv_count][0], 
                   &temp_uv[uv_count][1]);
            uv_count++;
        }
        // 3. Normale (vn x y z)
        else if (strncmp(line, "vn ", 3) == 0) {
            sscanf(line, "vn %f %f %f", 
                   &temp_norm[norm_count][0], 
                   &temp_norm[norm_count][1], 
                   &temp_norm[norm_count][2]);
            norm_count++;
        }
        // 4. Faccia (f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3)
        else if (strncmp(line, "f ", 2) == 0) {
            int v[3], vt[3], vn[3];
            // Questo pattern legge il formato standard "Pos/UV/Norm"
            int matches = sscanf(line, "f %d/%d/%d %d/%d/%d %d/%d/%d",
                                 &v[0], &vt[0], &vn[0],
                                 &v[1], &vt[1], &vn[1],
                                 &v[2], &vt[2], &vn[2]);

            if (matches != 9) {
                printf("[OBJ] Errore parsing faccia (assicurati di triangolare e includere UV/Normals): %s\n", filename);
                continue;
            }

            // Aggiungi i 3 vertici alla lista finale
            for (int i = 0; i < 3; i++) {
                vertex_indices[face_vert_count] = v[i] - 1; // OBJ parte da 1, C da 0
                uv_indices[face_vert_count]     = vt[i] - 1;
                norm_indices[face_vert_count]   = vn[i] - 1;
                face_vert_count++;
            }
        }
    }
    fclose(file);

    // Costruzione della Mesh finale
    Mesh* mesh = (Mesh*)malloc(sizeof(Mesh));
    mesh->vertexCount = face_vert_count;
    mesh->vertices = (Vertex*)malloc(sizeof(Vertex) * mesh->vertexCount);

    // "Appiattimento" dei dati: Combiniamo gli indici in un unico array di Vertex
    for (int i = 0; i < mesh->vertexCount; i++) {
        int pi = vertex_indices[i]; // Position Index
        int ui = uv_indices[i];     // UV Index
        int ni = norm_indices[i];   // Normal Index

        // Copia Posizione
        mesh->vertices[i].position[0] = temp_pos[pi][0];
        mesh->vertices[i].position[1] = temp_pos[pi][1];
        mesh->vertices[i].position[2] = temp_pos[pi][2];

        // Copia Normale
        mesh->vertices[i].normal[0] = temp_norm[ni][0];
        mesh->vertices[i].normal[1] = temp_norm[ni][1];
        mesh->vertices[i].normal[2] = temp_norm[ni][2];

        // Copia UV
        mesh->vertices[i].texCoord[0] = temp_uv[ui][0];
        mesh->vertices[i].texCoord[1] = temp_uv[ui][1]; // Inverti qui se la texture è capovolta (1.0 - v)
    }

    printf("[OBJ] Caricato %s: %d vertici\n", filename, mesh->vertexCount);
    return mesh;
}

void obj_free(Mesh* mesh) {
    if (mesh) {
        free(mesh->vertices);
        free(mesh);
    }
}