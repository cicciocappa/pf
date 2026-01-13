● Ecco una spiegazione completa del sistema di coordinate del gioco:

  Sistema di Coordinate

  Il gioco usa un sistema di coordinate right-handed con Y-up:
  - X: asse orizzontale (sinistra/destra)
  - Y: asse verticale (alto/basso) - l'altezza
  - Z: asse di profondità (avanti/indietro)

  ---
  Gerarchia: Level → Terrain (Chunk)

  Level (level.h/c)

  Il livello è una griglia di chunk (Terrain):

  Level
  ├── originX, originZ     (angolo min del livello, CENTRATO: -totalSize/2)
  ├── totalSizeX, totalSizeZ (dimensioni totali in metri)
  ├── chunkSize            (dimensione singolo chunk, es. 64m)
  └── chunks[]             (array row-major di Terrain)

  Origine centrata: il livello è centrato sull'origine (0,0,0). Per esempio con 4x4 chunk da 64m:
  - totalSizeX = 256m
  - originX = -128m (quindi va da -128 a +128)

  La funzione level_get_chunk_at() in level.c:96-118 converte world coords → indice chunk:
  float localX = worldX - lvl->originX;  // Coordinate relative all'origine
  int cx = (int)(localX / lvl->chunkSize);  // Indice chunk

  ---
  Terrain (Chunk) (terrain.h/c)

  Ogni chunk ha:
  - offsetX, offsetZ: posizione dell'angolo del chunk nel mondo
  - worldSize: dimensione del chunk in metri (es. 64m)
  - heightMap[]: griglia di altezze (float, metri reali)
  - walkMap[]: maschera camminabilità (0-255)

  Conversione World → UV (0-1)

  In terrain.c:38-43:
  void terrain_world_to_uv(Terrain* t, float worldX, float worldZ, float* u, float* v) {
      *u = (worldX - t->offsetX) / t->worldSize;
      *v = (worldZ - t->offsetZ) / t->worldSize;
  }

  Quindi per un chunk con offsetX=-32, offsetZ=-32, worldSize=64:
  - Punto (-32, -32) → UV (0, 0) (angolo)
  - Punto (32, 32) → UV (1, 1) (angolo opposto)

  Lettura altezza con interpolazione bilineare

  In terrain.c:288-330:
  1. Converte worldX, worldZ → UV (u, v)
  2. Mappa UV → coordinate griglia: gridX = u * (gridWidth-1)
  3. Legge 4 altezze vicine dalla heightMap[]
  4. Interpola bilinearmente per ottenere l'altezza esatta

  Heightmap 16-bit

  Le altezze sono salvate come PNG 16-bit e convertite in metri (terrain.c:201-232):
  #define TERRAIN_BAKE_MIN_HEIGHT  -64.0f  
  #define TERRAIN_BAKE_MAX_HEIGHT   192.0f

  float normalized = (float)raw16[i] / 65535.0f;
  t->heightMap[i] = TERRAIN_BAKE_MIN_HEIGHT + (normalized * range);

  ---
  Player (player.h/c)

  Il player opera interamente in world coordinates:
  - position[3]: posizione (X, Y, Z) in metri
  - rotation: rotazione attorno all'asse Y (radianti)

  Movimento

  In player_update() (player.c:486-716):
  1. La posizione Y viene sempre aggiornata dal terreno: p->position[1] = level_get_height(level, x, z)
  2. La rotazione è calcolata con atan2(direction[0], direction[2]) - verso dove sta andando
  3. Prima di muoversi verifica level_is_walkable() per evitare ostacoli

  Ray Casting (click → mondo)

  In player.c:243-295 e 163-240:
  1. screen_to_world_ray(): converte click mouse → raggio in world space
  2. ray_level_intersect(): ray-marching lungo il raggio finché non attraversa la heightmap
  3. Binary search per raffinare il punto di intersezione

  ---
  Riepilogo delle Trasformazioni

  Screen (pixel)
      ↓ screen_to_world_ray()
  World Space (metri)
      ↓ level_get_chunk_at()
  Chunk locale
      ↓ terrain_world_to_uv()
  UV (0-1)
      ↓ * (gridWidth-1)
  Grid Index (pixel heightmap)
      ↓ bilinear interpolation
  Altezza Y (metri)

