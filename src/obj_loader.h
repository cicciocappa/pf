#ifndef OBJ_LOADER_H
#define OBJ_LOADER_H

#include <stdbool.h>

// Struttura di un singolo vertice (Interleaved)
// Layout in memoria: [PX, PY, PZ,  NX, NY, NZ,  U, V]
typedef struct {
    float position[3];
    float normal[3];
    float texCoord[2];
} Vertex;

// La Mesh pronta per OpenGL
typedef struct {
    Vertex* vertices;       // Array dei vertici
    unsigned int vertexCount;
    // Per semplicità iniziale, questo loader non usa indici (glDrawArrays),
    // ma "srotola" i triangoli. È meno efficiente per la RAM ma banalissimo da usare.
} Mesh;

// Carica un file .obj
// Restituisce NULL se fallisce.
Mesh* obj_load(const char* filename);

// Libera la memoria
void obj_free(Mesh* mesh);

#endif