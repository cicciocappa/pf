# Modulo: debug

## Descrizione
Header `debug.h` che fornisce macro e funzioni di utilità per il debug OpenGL. Include la gestione degli errori tramite `glGetError`.

## Macro
### `GL_CHECK_ERROR`
- Esegue `gl_check_error` solo se `NDEBUG` non è definito (build di debug). Altrimenti non fa nulla.

## Funzioni
### `gl_check_error`
- **Firma**: `static inline void gl_check_error(const char* file, int line)`
- **Descrizione**: Controlla i flag di errore OpenGL (in loop) e stampa eventuali errori su console con file e riga di chiamata.

### `gl_init_debug`
- **Firma**: `static inline void gl_init_debug(void)`
- **Descrizione**: Stampa messaggi informativi sull'attivazione del debug (stub per compatibilità con GL 3.3).

## Utilizzo
- **gl_init_debug**: Chiamato in `main.c`.
- **GL_CHECK_ERROR**: Macro disponibile per l'uso nei moduli di rendering (es. `gfx.c`, `ui_renderer.c`, etc.).
