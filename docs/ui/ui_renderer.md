# Modulo: ui

## Descrizione
Renderer 2D immediato (Immediate Mode) ottimizzato con batch geometry.
Progettato per disegnare interfacce utente (menu, HUD) sopra la scena 3D.

## Strutture

### `UIRenderer`
Contesto di rendering UI.
- `batchBuffer`: Buffer CPU per accumulare vertici (quads).
- `whiteTexture`: Texture 1x1 bianca per disegnare rettangoli solidi colorati.
- `projection`: Matrice ortografica (schermo 2D).

## Funzioni
### Ciclo di Rendering
- `ui_init`: Inizializza shader e buffers.
- `ui_begin`: Prepara lo stato OpenGL (disabilita Depth Test, abilita Blending).
- `ui_end`: Invia i comandi di disegno accumulati (flush).
- `ui_resize`: Aggiorna la matrice di proiezione quando la finestra cambia dimensioni.

### Primitive
- `ui_draw_rect`: Aggiunge un rettangolo colorato al batch.
- `ui_draw_image`: Aggiunge un rettangolo texturizzato.
- `ui_draw_text`: **Placeholder**. Attualmente disegna una serie di piccoli rettangoli per simulare il testo.

## Shader
Utilizza `ui.vs` e `ui.fs`. Supporta colorazione vertex-based e texturing.

## Utilizzo
- **state_menu.c**: Disegna i pulsanti e il titolo.
