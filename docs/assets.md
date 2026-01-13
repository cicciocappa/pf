# Modulo: assets (Legacy)

## Descrizione
Vecchio sistema di gestione assets, mantenuto parzialmente per compatibilità (es. caricamento texture procedurali di placeholder). Si consiglia di utilizzare `asset_manager` per il nuovo codice.

## Strutture

### `SimpleBakedChar`
Struttura dati per font (stb_truetype placeholder).

### `GlobalAssets`
Contenitore per texture globali caricate via legacy system.
- `texBtnNormal`, `texBtnHover`: Texture bottoni UI.
- `texFontAtlas`: Texture font.
- `cdata`: Dati caratteri font.

## Variabili Globali
- `extern GlobalAssets assets`: Istanza globale accessibile ovunque.

## Funzioni
### `assets_init`
- **Firma**: `void assets_init(void)`
- **Descrizione**: Genera texture procedurali 1x1 (bianche/grigie) da usare come placeholder per UI e font.

### `assets_cleanup`
- **Firma**: `void assets_cleanup(void)`
- **Descrizione**: Elimina le texture OpenGL create.

## Utilizzo
- **main.c**: Inizializzazione e cleanup.
