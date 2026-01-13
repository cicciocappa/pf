# Modulo: asset_manager

## Descrizione
Nuovo sistema centralizzato per la gestione degli assets. Divide le risorse in:
- **Globali**: Caricate all'avvio e sempre residenti (Player, UI, Audio comune).
- **Livello**: Caricate al caricamento di un livello e scaricate al termine.

Gestisce caricamento di texture, mesh, scheletri e animazioni (via modulo `skeletal`).

## Strutture

### `PlayerAssets`
Risorse grafiche del giocatore.
- `skeleton`: Dati scheletro e animazioni (`Skeleton`).
- `mesh`: Mesh skinnata (`SkinnedMesh`).
- Indici animazioni (`animIdle`, `animWalk`, ecc.) per accesso rapido.

### `UIAssets`
Texture per l'interfaccia utente (pulsanti, barre, icone).

### `AudioAssets`
ID delle risorse audio (SFX e Musica).

### `LevelAssets`
Risorse specifiche del livello corrente.
- `terrainMesh`, `terrainTexture`: Dati del terreno.
- `walkMask`: Maschera bitmap per la camminabilità.
- `propMeshes`, `propTextures`: Oggetti di scena.
- `loaded`: Flag di stato.

### `AssetManager`
Struttura principale (Singleton).
- Contiene `player`, `ui`, `audio`, `currentLevel`.
- `globalAssetsLoaded`: Flag stato globale.

## Variabili Globali
- `extern AssetManager g_assets`: Istanza globale.

## Funzioni
### `asset_manager_init`
- **Firma**: `void asset_manager_init(void)`
- **Descrizione**: Azzera la struttura dati globale.

### `asset_manager_shutdown`
- **Firma**: `void asset_manager_shutdown(void)`
- **Descrizione**: Scarica tutto (livello + globali).

### `asset_manager_load_global`
- **Firma**: `bool asset_manager_load_global(void)`
- **Descrizione**: Carica assets comuni (Player, UI). Chiama internamente loader specifici.

### `asset_manager_unload_global`
- **Firma**: `void asset_manager_unload_global(void)`
- **Descrizione**: Libera memoria assets globali.

### `asset_manager_load_level`
- **Firma**: `bool asset_manager_load_level(const char* levelName)`
- **Descrizione**: Carica assets per un livello specifico.
    - Gestisce lo scaricamento automatico del livello precedente se presente.
    - Attualmente genera un terreno procedurale (stub).

### `asset_manager_unload_level`
- **Firma**: `void asset_manager_unload_level(void)`
- **Descrizione**: Libera risorse del livello corrente.

## Utilizzo
- **main.c**: Gestione ciclo di vita assets globali.
- **state_gameplay.c**: Chiama `asset_manager_load_level` all'ingresso nello stato di gioco.
