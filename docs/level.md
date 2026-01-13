# Modulo: level

## Descrizione
Gestisce la struttura di alto livello del mondo di gioco, organizzata in Chunk di terreno (griglia).
Supporta il caricamento da file di configurazione (`.lvl`), il Frustum Culling per l'ottimizzazione del rendering e fornisce API per query geometriche sul mondo (altezza, normali, camminabilità).

## Strutture

### `Level`
Contenitore principale.
- `chunks`: Array di `Terrain`.
- `chunksCountX/Z`: Dimensioni griglia chunk.
- `chunkSize`: Dimensione lato chunk (metri).
- `originX/Z`: Coordinate mondo dell'angolo top-left (min X, min Z).
- `chunksRendered`: Statistica debug.

## Funzioni
### `level_load`
- **Firma**: `bool level_load(Level* lvl, const char* configPath)`
- **Descrizione**: Carica configurazione livello e inizializza i chunk specificati. Supporta caricamento ibrido (OBJ + Heightmap + Walkmask).

### `level_cleanup`
- **Firma**: `void level_cleanup(Level* lvl)`
- **Descrizione**: Dealloca tutti i chunk e le risorse del livello.

### `level_draw`
- **Firma**: `void level_draw(Level* lvl, mat4 viewProj)`
- **Descrizione**: Renderizza i chunk visibili. Esegue il Frustum Culling per scartare i chunk fuori dalla visuale.

### Query World-Space
Delegati ai chunk sottostanti:
- `level_get_height`
- `level_get_normal`
- `level_is_walkable`
- `level_get_chunk_at`: Trova il chunk contenente le coordinate date.

### Frustum Culling
- `frustum_extract_planes`: Estrae i 6 piani camera.
- `frustum_test_aabb`: Test intersezione Box-Frustum.

## Utilizzo
- **state_gameplay.c**: Carica, aggiorna e disegna il livello.
