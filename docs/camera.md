# Modulo: camera

## Descrizione
Implementa un sistema di telecamera ibrido RTS/RPG.
Supporta tre modalità di funzionamento:
1.  **Follow**: La telecamera segue il target (giocatore) con un offset fluido.
2.  **Pan**: L'utente sposta la visuale manualmente (Middle Mouse Drag).
3.  **Peek** (Dinamico): Il cursore del mouse sposta leggermente la visuale ("peeking") per guardare oltre i bordi, utile per mirare.

Gestisce anche lo zoom (FOV + Distanza) e l'interpolazione fluida dei movimenti.

## Strutture

### `CameraMode` (Enum)
- `CAMERA_MODE_FOLLOW`: Segue il player.
- `CAMERA_MODE_PAN`: Spostamento manuale.
- `CAMERA_MODE_RETURNING`: Fase di transizione da Pan a Follow.

### `Camera`
Struttura principale.
- `position`, `target`: Coordinate view matrix.
- `focusPoint`: Punto osservato (Player + Offset).
- `panOffset`, `peekOffset`: Offset parziali.
- `distance`, `pitch`, `yaw`: Coordinate sferiche.
- `viewMatrix`, `projMatrix`: Cache matrici.

## Funzioni
### `camera_init`
- **Firma**: `void camera_init(Camera* cam)`
- **Descrizione**: Inizializza la camera con valori di default.

### `camera_set_player_position`
- **Firma**: `void camera_set_player_position(Camera* cam, vec3 playerPos)`
- **Descrizione**: Aggiorna la posizione nota del player.

### `camera_handle_input`
- **Firma**: `bool camera_handle_input(Camera* cam, Game* g, float dt)`
- **Descrizione**: Gestisce input mouse/tastiera (Zoom, Pan, Reset con SPAZIO). Restituisce `true` se l'input è stato consumato.

### `camera_update`
- **Firma**: `void camera_update(Camera* cam, float dt)`
- **Descrizione**: Calcola la fisica della camera (interpolazioni, calcolo matrici). Deve essere chiamata ogni frame.

### `camera_center_on_player`
- **Firma**: `void camera_center_on_player(Camera* cam)`
- **Descrizione**: Forza il ritorno immediato sul player, resettando il Pan.

### Getters Matriciali
- `camera_get_view_matrix`
- `camera_get_proj_matrix`
- `camera_get_view_proj_matrix`

## Utilizzo
- **state_gameplay.c**: Gestisce l'istanza principale della camera durante il gioco.
