# Modulo: grid

## Descrizione
Modulo di debug che renderizza una griglia infinita (o limitata) sul piano XZ per aiutare la percezione dello spazio.

## Funzioni
### `grid_init`
- **Firma**: `void grid_init(int size, float step)`
- **Descrizione**: Crea il VAO/VBO per le linee della griglia.
- **Argomenti**:
    - `size`: Estensione della griglia (da -size a +size).
    - `step`: Passo tra le linee.

### `grid_draw`
- **Firma**: `void grid_draw(mat4 view_proj)`
- **Descrizione**: Disegna la griglia utilizzando lo shader interno.

### `grid_cleanup`
- **Firma**: `void grid_cleanup(void)`
- **Descrizione**: Libera le risorse OpenGL.

## Utilizzo
- **state_gameplay.c**: Inizializza e disegna la griglia nel mondo di gioco.
