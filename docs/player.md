# Modulo: player

## Descrizione
Gestisce l'entità Giocatore, includendo movimento, fisica, interazione con il terreno e animazioni scheletriche.
Implementa un controller "Click-to-Move" che utilizza il pathfinding per navigare nel livello.

## Strutture

### `PlayerState` (Enum)
Stati della macchina a stati del giocatore:
- `IDLE`, `WALKING`, `RUNNING`, `ATTACKING`, `DEAD`.

### `Player`
Struttura principale.
- **Trasformazione**: `position`, `rotation` (con smoothing).
- **Stato**: `state` corrente, flags `isRunning`, `hasDestination`.
- **Navigazione**: `current_path`, `current_waypoint`.
- **Animazione**: `Animator` (collegato allo scheletro globale).
- **Statistiche**: `hp`, `mana`.

## Funzioni
### `player_init`
- **Firma**: `void player_init(Player* p)`
- **Descrizione**: Inizializza il giocatore e collega l'animator allo scheletro globale (`g_assets.player.skeleton`).

### `player_handle_input`
- **Firma**: `void player_handle_input(Player* p, Game* g, mat4 view, mat4 proj, Level* level)`
- **Descrizione**: Gestisce i click del mouse.
    - **Click Sinistro**: Esegue raycast sul terreno. Se camminabile, calcola un percorso tramite A* e assegna il path.
    - **Shift**: Abilita la corsa.

### `player_update`
- **Firma**: `void player_update(Player* p, float dt, Level* level)`
- **Descrizione**: Logica principale.
    - Segue i waypoint del percorso attivo.
    - Gestisce la rotazione fluida verso la direzione di movimento.
    - Adegua l'altezza Y al terreno.
    - Applica fisica della pendenza (rallenta in salita, accelera in discesa).
    - Aggiorna l'animator.

### `player_draw`
- **Firma**: `void player_draw(Player* p, mat4 viewProj)`
- **Descrizione**: Renderizza la mesh del giocatore utilizzando il sistema di animazione scheletrica.

### Pathfinding
- `player_set_path`: Assegna un nuovo percorso.
- `player_clear_path`: Interrompe il movimento corrente.

## Utilizzo
- **state_gameplay.c**: Gestisce l'istanza principale del giocatore.
