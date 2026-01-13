# Tower Defense Game

## Descrizione Tecnica (Per Claude nelle prossime sessioni)

Gioco Tower Defense 3D in C puro con OpenGL 3.3 Core Profile. Il gioco usa un sistema di stati (Loader -> Menu -> Gameplay) e include:

### Architettura Principale
- **State Machine**: `main.c` gestisce stati (STATE_LOADER, STATE_MENU, STATE_GAMEPLAY) con transizioni tramite `game_change_state()`
- **Asset Manager** (`asset_manager.c`): Carica assets globali (player skeleton/mesh) e per-livello. Usa formato binario custom (.skel, .smsh)
- **Player Controller** (`player.c`): Click-to-move con ray casting sul terreno, FSM per animazioni (Idle/Walk/Run), rotazione smooth
- **Skeletal Animation** (`skeletal/skeletal.c`): Sistema completo con bone hierarchy, keyframe interpolation, animation blending, e opzionale Two-Bone IK per i piedi
- **Level System** (`level.c`): Sistema multi-chunk che gestisce griglia NxM di terrain chunks con frustum culling
- **Terrain** (`terrain.c`): Singolo chunk con mesh OBJ per rendering + heightmap 16-bit per fisica + walk mask per aree bloccate
- **Camera** (`camera.c`): Sistema ibrido follow/pan con zoom, edge peeking dinamico, leash distance dal player

### Flusso di Inizializzazione
1. `main()`: GLFW/GLAD init, audio, assets vecchio sistema, asset_manager_init, asset_manager_load_global (player)
2. `loader_init()`: Transizione immediata a gameplay (per test)
3. `gameplay_init()`: grid_init, level_load (carica .lvl config), asset_manager_load_level, camera_init, player_init

### Strutture Dati Chiave
- `Game` (game.h): Contesto globale con window, stati, input mouse
- `Player` (player.h): Posizione, rotazione, stato, Animator, FootIKConfig
- `Skeleton` (skeletal.h): Bones[], Animations[], globalTransforms[], finalMatrices[]
- `Level` (level.h): Array di Terrain chunks, dimensioni griglia, origine centrata, frustum culling
- `Terrain` (terrain.h): Singolo chunk con heightMap (float*), walkMap (byte*), offsetX/Z, VAO/VBO

### Librerie Esterne
- **GLFW**: Windowing e input
- **GLAD**: OpenGL loader
- **cglm**: Math library (vettori, matrici, quaternioni)
- **stb_image.h**: Caricamento texture
- **stb_truetype.h**: Font rendering
- **miniaudio.h**: Audio (stub attuale)

## Struttura del Progetto

```
game/
├── src/
│   ├── main.c              # Entry point
│   ├── game.h              # Game context e stati
│   ├── gfx.c/h             # Graphics utilities
│   ├── asset_manager.c/h   # Sistema di caricamento assets
│   ├── player.c/h          # Controller player con click-to-move
│   ├── level.c/h           # Sistema multi-chunk terrain
│   ├── terrain.c/h         # Singolo chunk terreno
│   ├── grid.c/h            # Griglia debug
│   ├── audio.c/h           # Audio (stub)
│   ├── assets.c/h          # Legacy assets
│   ├── debug.h             # OpenGL debug
│   ├── skeletal/           # Sistema animazione scheletrica
│   │   ├── skeletal.c
│   │   └── skeletal.h
│   ├── ui/                 # UI rendering
│   │   ├── ui_renderer.c
│   │   └── ui_renderer.h
│   └── states/             # Game states
│       ├── all_states.h
│       ├── state_loader.c
│       ├── state_menu.c
│       └── state_gameplay.c
├── shaders/
│   ├── grid.vs/fs
│   ├── terrain.vs/fs
│   ├── skinned.vs/fs
│   └── ui.vs/fs
├── include/                # Headers esterni
│   ├── glad/
│   ├── GLFW/
│   └── cglm/
├── resources/
│   ├── player/
│   │   ├── player.skel     # Skeleton + animazioni
│   │   ├── player.smsh     # Skinned mesh
│   │   └── player_diffuse.png
│   └── levels/
│       ├── level2.lvl      # Config livello (griglia chunk)
│       ├── level2.obj      # Mesh chunk
│       └── level2_hm.png   # Heightmap 16-bit
└── Makefile
```

## Dipendenze

1. **GLFW3**: `apt install libglfw3-dev`
2. **GLAD**: Scarica da https://glad.dav1d.de (OpenGL 3.3 Core)
3. **cglm**: `git clone https://github.com/recp/cglm` (header-only)
4. **stb_image.h**: Scarica da https://github.com/nothings/stb

## Setup

```bash
# Installa GLFW
sudo apt install libglfw3-dev

# Copia le dipendenze header-only in include/
mkdir -p include/glad include/cglm
# Copia glad.h, khrplatform.h, cglm headers...

# Copia stb_image.h in src/
wget -O src/stb_image.h https://raw.githubusercontent.com/nothings/stb/master/stb_image.h

# Compila
make
```

## Controlli

- **Click sinistro**: Muovi il player verso il punto cliccato
- **Shift + Click**: Corri verso il punto
- **S**: Stop immediato
- **ESC**: Torna al menu

## Asset Files Format

### player.skel (Skeleton Binary)
```
Header: "SKEL" (4 bytes)
Bone count: int32
For each bone:
  - name: char[32]
  - parentIndex: int32
  - inverseBindPose: float[16]
  - localBind: position(3) + rotation(4) + scale(3)
Animation count: int32
For each animation:
  - name: char[32]
  - duration: float
  - loop: bool
  - keyframeCount: int32
  - keyframes: [time + transforms per bone]
```

### player.smsh (Skinned Mesh Binary)
```
Header: "SMSH" (4 bytes)
Vertex count: int32
Index count: int32
Vertices: [position(3) + normal(3) + uv(2) + boneIDs(4) + weights(4)]
Indices: uint16[]
```

### level.lvl (Level Config - Text)
```
# Header
chunks_x 2              # Numero chunk in X
chunks_z 2              # Numero chunk in Z
chunk_size 64.0         # Dimensione chunk in metri

# Chunk list: index_x index_z obj_path heightmap_path [walkmask_path]
# Indici relativi al centro: con 2x2, vanno da -1 a 0
-1 -1 chunk_sw.obj chunk_sw_hm.png
-1  0 chunk_nw.obj chunk_nw_hm.png
 0 -1 chunk_se.obj chunk_se_hm.png
 0  0 chunk_ne.obj chunk_ne_hm.png chunk_ne_walk.png
```

L'origine del livello è centrata: con 2x2 chunk da 64m, il livello va da (-64,-64) a (64,64).

## Note Sviluppo

Il sistema è strutturato in modo modulare:
- **AssetManager**: Gestisce assets globali (player, UI) e per-livello (terrain)
- **Level**: Gestisce griglia di chunk con frustum culling, delega fisica ai singoli Terrain
- **Player**: FSM con stati Idle/Walking/Running, integrato con skeletal animation
- **Skeletal**: Sistema completo con blending tra animazioni

## TODO Prossime Sessioni

- **Pathfinding**: Implementare A* o navigation mesh per movimento intelligente del player e nemici
- **Nemici/Torrette**: Sistema entità con AI base
- **Wave System**: Spawning nemici a ondate
