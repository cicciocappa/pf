# Modulo: main

## Descrizione
Il modulo `main.c` contiene il punto di ingresso dell'applicazione (`main`), la gestione del ciclo principale di gioco (game loop), l'inizializzazione dei sottosistemi (GLFW, OpenGL/GLAD, Audio, Assets) e la gestione ad alto livello della macchina a stati.

Gestisce inoltre i callback di GLFW per input e ridimensionamento finestra.

## Funzioni
### `main`
- **Firma**: `int main(int argc, char* argv[])`
- **Descrizione**: Punto di ingresso. Inizializza la finestra, il contesto OpenGL, i sottosistemi e avvia il loop principale.
- **Argomenti**: Argomenti standard da riga di comando (non utilizzati).

### `error_callback`
- **Firma**: `static void error_callback(int error, const char* description)`
- **Descrizione**: Callback per la gestione degli errori GLFW. Stampa l'errore su `stderr`.

### `framebuffer_size_callback`
- **Firma**: `static void framebuffer_size_callback(GLFWwindow* window, int width, int height)`
- **Descrizione**: Callback per il ridimensionamento della finestra. Aggiorna la viewport OpenGL e le dimensioni nel contesto `Game`.

### `cursor_pos_callback`
- **Firma**: `static void cursor_pos_callback(GLFWwindow* window, double xpos, double ypos)`
- **Descrizione**: Callback per la posizione del mouse. Aggiorna `mouseX` e `mouseY` nel contesto globabl `game`.

### `mouse_button_callback`
- **Firma**: `static void mouse_button_callback(GLFWwindow* window, int button, int action, int mods)`
- **Descrizione**: Callback per i click del mouse. Aggiorna lo stato dei pulsanti nel contesto `game`.

### `game_change_state`
- **Firma**: `void game_change_state(Game* g, GameStateID newState)`
- **Descrizione**: Imposta il prossimo stato del gioco. Il cambio effettivo avviene all'inizio del frame successivo.
- **Argomenti**:
    - `g`: Puntatore al contesto `Game`.
    - `newState`: ID del nuovo stato da caricare.

### `apply_state_change`
- **Firma**: `static void apply_state_change(Game* g)`
- **Descrizione**: Esegue la transizione di stato se `nextState` è diverso da `currentState`. Chiama le funzioni di `cleanup` dello stato precedente e `init` del nuovo.

### `update_current_state`
- **Firma**: `static void update_current_state(Game* g, float dt)`
- **Descrizione**: Chiama la funzione di aggiornamento specifica per lo stato corrente.

### `draw_current_state`
- **Firma**: `static void draw_current_state(Game* g)`
- **Descrizione**: Chiama la funzione di disegno specifica per lo stato corrente.

## Strutture
Nessuna struttura pubblica definita (la struttura `Game` è definita in `game.h`). Viene definita un'istanza statica `static Game game`.

## Utilizzo
- **game_change_state**: Utilizzata da `state_loader.c`, `state_menu.c`, `state_gameplay.c` per navigare tra le schermate.
