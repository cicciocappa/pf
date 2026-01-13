# Modulo: pathfinding

## Descrizione
Implementazione dell'algoritmo A* per la ricerca percorsi su griglia.
Caratteristiche:
- Griglia statica multi-chunk (gestisce percorsi attraverso chunk diversi).
- Priority Queue (Min-Heap) ottimizzata.
- Path Smoothing (String Pulling) per rendere i percorsi più naturali.
- Pooling dei nodi per evitare allocazioni frequenti.

## Strutture

### `PathGrid`
Rappresentazione della griglia di navigabilità di un singolo Chunk.
- `grid`: Array byte (0=bloccato, 1=walkable).
- `grid_width/height`: Dimensioni (default 64x64).

### `Path`
Risultato della ricerca.
- `waypoints`: Array di posizioni `vec3` (punti di passaggio).
- `waypoint_count`: Numero punti.

## Funzioni
### `pathfinding_init`
- **Firma**: `void pathfinding_init(void)`
- **Descrizione**: Inizializza il contesto globale (pool nodi, heap, buffer statici).

### `pathfinding_find_path`
- **Firma**: `Path* pathfinding_find_path(struct Level* lvl, vec3 start, vec3 goal, int zone_id)`
- **Descrizione**: Calcola il percorso ottimale tra `start` e `goal`.
    - Controlla la line-of-sight diretta (ottimizzazione).
    - Se necessario, costruisce una griglia statica unendo i dati dei chunk coinvolti.
    - Esegue A*.
    - Esegue il post-processing (smoothing).

### `path_free`
- **Firma**: `void path_free(Path* path)`
- **Descrizione**: Libera la memoria del percorso.

### `pathgrid_build`
- **Firma**: `bool pathgrid_build(PathGrid* pg, unsigned char* walkmap, ...)`
- **Descrizione**: Genera la griglia di navigazione campionando una walkmask ad alta risoluzione (downsampling co maggioranza).

## Debug
- `pathfinding_debug_draw_grid`: Visualizza l'overlay della griglia di navigazione.
- `pathfinding_debug_draw_path`: Disegna il percorso trovato come linea in-world.

## Utilizzo
- **player.c**: Utilizzato per il movimento point-and-click del personaggio.
