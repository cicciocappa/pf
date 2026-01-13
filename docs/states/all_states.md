# Modulo: states

## Descrizione
Contiene l'implementazione dei vari stati di gioco (schermate), gestiti dalla state machine definita in `main.c`.

## Moduli
### `state_loader`
- **Descrizione**: Schermata di caricamento iniziale. Attualmente un pass-through che va subito al Gameplay.

### `state_menu`
- **Descrizione**: Menu principale.
- **Funzionalità**:
    - Disegna titolo e bottoni usando `ui_renderer`.
    - Gestisce input tastiera (ENTER) e mouse per avviare il gioco.

### `state_gameplay`
- **Descrizione**: Lo stato di gioco vero e proprio.
- **Funzionalità**:
    - Inizializza `Level`, `Player`, `Camera`, `Grid`.
    - Loop Update:
        - Gestisce input Player e Camera.
        - Aggiorna fisica e logica.
    - Loop Draw:
        - Renderizza scene 3D (terreno, player, debug).
    - Debug: Supporta toggle visualizzazione pathgrid (F1) e path player (F2).

## API Comune
Ogni stato implementa:
- `init(Game* g)`
- `update(Game* g, float dt)`
- `draw(Game* g)`
- `cleanup()` (opzionale se gestito globalmente)
