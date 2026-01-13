# Modulo: terrain

## Descrizione
Gestisce il singolo "Chunk" di terreno. Utilizza un approccio ibrido:
- **Visuale**: Mesh 3D caricata da OBJ (per controllo preciso della topologia).
- **Fisica**: Heightmap 16-bit (per calcolo altezze preciso).
- **Logica**: Walkmask 8-bit (per definire aree camminabili) e Pathgrid (per A*).

## Strutture

### `Terrain`
Rappresenta un blocco di mondo (es. 64x64m).
- `heightMap`, `walkMap`: Dati raw CPU.
- `pathgrid`: Griglia di navigazione pre-calcolata.
- `texture`: Texture diffuse.
- `worldSize`, `offsetX`, `offsetZ`: Posizionamento nel mondo.

## Funzioni
### `terrain_init_hybrid`
- **Firma**: `bool terrain_init_hybrid(Terrain* t, ...)`
- **Descrizione**: Carica i dati del terreno.
    - Carica OBJ e mesh GPU.
    - Carica heightmap 16-bit e la normalizza in metri.
    - Costruisce la pathgrid dalla walkmask.

### `terrain_get_height`
- **Firma**: `float terrain_get_height(Terrain* t, float worldX, float worldZ)`
- **Descrizione**: Restituisce l'altezza Y interpolata (bilineare) in un punto (X, Z).

### `terrain_get_normal`
- **Firma**: `void terrain_get_normal(Terrain* t, float worldX, float worldZ, vec3 outNormal)`
- **Descrizione**: Calcola la normale della superficie (utile per calcolo pendenza movimento player).

### `terrain_draw`
- **Firma**: `void terrain_draw(Terrain* t, mat4 viewProj)`
- **Descrizione**: Disegna il chunk.

## Debug
- `terrain_debug_draw`: Visualizza la geometria fisica (heightmap) come punti rossi.
- `terrain_debug_draw_pathgrid`: Visualizza le celle camminabili/bloccate dell'A*.

## Utilizzo
- **level.c**: Aggrega multipli Terrain per formare il livello completo.
