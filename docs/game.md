# Modulo: game

## Descrizione
Il modulo `game.h` definisce le strutture dati fondamentali e i tipi enumerativi utilizzati in tutto il gioco per mantenere lo stato globale e le informazioni del giocatore.

## Funzioni
### `game_change_state`
- **Firma**: `void game_change_state(Game* game, GameStateID newState)`
- **Descrizione**: Dichiarazione della funzione per cambiare lo stato del gioco. L'implementazione risiede in `main.c`.

## Strutture e Tipi

### `GameStateID` (Enum)
Identificatori per i vari stati del gioco.
- `STATE_LOADER`: Caricamento iniziale.
- `STATE_MENU`: Menu principale.
- `STATE_LEVEL_SELECT`: Selezione livello (non ancora impl?).
- `STATE_GAMEPLAY`: Fase di gioco attiva.
- `STATE_GAME_OVER`
- `STATE_VICTORY`

### `PlayerStats`
Dati persistenti del giocatore.
- `mana`: Quantità attuale di mana.
- `maxMana`: Capacità massima mana.
- `levelsUnlocked`: Progresso livelli.
- `powerMultiplier`: Moltiplicatore potenza.

### `Game`
Contesto globale del gioco.
- `window`: Puntatore alla finestra GLFW.
- `width`, `height`: Dimensioni finestra.
- `currentState`, `nextState`: Gestione stati.
- `player`: Istanza di `PlayerStats`.
- `mouseX`, `mouseY`: Posizione mouse.
- `mouseLeftDown`, `mouseRightDown`: Stato input mouse.

## Utilizzo
Questo file è incluso da `main.c` e da tutti i moduli di stato (`states/*.c`) per accedere al contesto globale.
