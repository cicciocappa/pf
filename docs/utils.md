# Modulo: utils

## Descrizione
Libreria di utilità generiche. Attualmente fornisce funzioni per la gestione del tempo ad alta risoluzione.

## Funzioni
### `get_time_ms`
- **Firma**: `static double get_time_ms()`
- **Descrizione**: Restituisce il tempo corrente in millisecondi. Supporta sia Windows (QueryPerformanceCounter) che POSIX (clock_gettime).

## Utilizzo
- **pathfinding.c**: Utilizzato per misurare le performance dell'algoritmo di pathfinding A*.
