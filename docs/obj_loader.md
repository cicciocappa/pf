# Modulo: obj_loader

## Descrizione
Loader minimale per file 3D in formato Wavefront OBJ.
Legge posizioni, UV e normali. Non supporta indici (srotola i triangoli per `glDrawArrays`), materiali o gruppi complessi.

## Strutture

### `Vertex`
Struttura interleaved `P3-N3-T2` (Posizione, Normale, TexCoord).

### `Mesh`
Container per dati OpenGL.
- `vertices`: Array di `Vertex`.
- `vertexCount`: Numero totale vertici.

## Funzioni
### `obj_load`
- **Firma**: `Mesh* obj_load(const char* filename)`
- **Descrizione**: Parsa un file .obj e restituisce una Mesh pronta per l'uso.
- **Note**: Supporta solo facce triangolari (`f v/vt/vn ...`).

### `obj_free`
- **Firma**: `void obj_free(Mesh* mesh)`
- **Descrizione**: Libera la memoria allocata.

## Utilizzo
- **terrain.c**: Utilizzato per caricare la mesh base del terreno se presente (modalità ibrida).
