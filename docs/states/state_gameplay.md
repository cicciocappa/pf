# Modulo: state_gameplay

## Descrizione
Gestisce la logica principale di gioco. Aggrega tutti i sistemi core: Level, Player, Camera, Pathfinding.

## Funzioni
### `gameplay_init`
- Carica il livello (`level2.lvl`) e gli asset necessari.
- Inizializza il player e la camera.
- Esegue un benchmark del pathfinding all'avvio.

### `gameplay_update`
- Gestisce l'input per mettere in pausa o uscire (ESC).
- Sincronizza la camera con il player.
- Gestisce l'input di gioco (movimento player).

### `gameplay_draw`
- Renderizza il livello e le entità.
- Disegna overlay di debug se attivati (F1/F2).

## Debug
- **F1**: Mostra/Nasconde la griglia di navigazione (PathGrid).
- **F2**: Mostra/Nasconde il percorso corrente del player.
