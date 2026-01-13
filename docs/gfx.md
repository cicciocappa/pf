# Modulo: gfx

## Descrizione
Wrapper di basso livello per operazioni OpenGL comuni e caricamento risorse grafiche. Usa `stb_image` per le texture.

## Funzioni
### `gfx_create_shader`
- **Firma**: `GLuint gfx_create_shader(const char* vs_path, const char* fs_path)`
- **Descrizione**: Carica, compila e linka un Vertex Shader e un Fragment Shader. Restituisce l'ID del Programma.

### `gfx_read_file`
- **Firma**: `char* gfx_read_file(const char* path)`
- **Descrizione**: Legge interamente un file di testo in memoria. Il chiamante deve fare `free()`.

### `gfx_load_texture`
- **Firma**: `GLuint gfx_load_texture(const char* path)`
- **Descrizione**: Carica una texture immagine (png, jpg) da disco. Genera mipmaps e imposta il filtro trilineare.

### `gfx_load_texture_raw`
- **Firma**: `GLuint gfx_load_texture_raw(const char* path, int w, int h, int channels)`
- **Descrizione**: Carica una texture da dati raw (usato ad esempio per heightmaps raw o dati procedurali salvati).

## Utilizzo
- Utilizzato da quasi tutti i moduli che gestiscono grafica (`grid`, `ui`, `asset_manager`, `terrain`).
