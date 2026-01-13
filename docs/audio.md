# Modulo: audio

## Descrizione
Gestione dell'audio (musica e effetti sonori).
Attualmente l'implementazione è uno **STUB** (segnaposto) e non riproduce audio reale. È predisposto per l'integrazione con librerie come `miniaudio`.

## Funzioni
### `audio_init`
- **Firma**: `bool audio_init(void)`
- **Descrizione**: Inizializza il sistema audio.

### `audio_play_music`
- **Firma**: `void audio_play_music(const char* path, bool loop)`
- **Descrizione**: Avvia la riproduzione di una traccia musicale.
- **Argomenti**:
    - `path`: Percorso del file audio.
    - `loop`: Se `true`, riproduce in loop.

### `audio_stop_music`
- **Firma**: `void audio_stop_music(void)`
- **Descrizione**: Ferma la musica corrente.

### `audio_set_volume`
- **Firma**: `void audio_set_volume(float volume)`
- **Descrizione**: Imposta il volume globale.

### `audio_play_sfx`
- **Firma**: `void audio_play_sfx(const char* path)`
- **Descrizione**: Riproduce un effetto sonoro "fire-and-forget".

### `audio_cleanup`
- **Firma**: `void audio_cleanup(void)`
- **Descrizione**: Chiude il sistema audio e libera le risorse.

## Utilizzo
- **main.c**: Inizializza e chiude il sistema.
- Al momento le funzioni di riproduzione non sembrano essere chiamate nel codice sorgente analizzato.
