#ifndef GFX_H
#define GFX_H
#include <glad/glad.h>

// Compila vertex e fragment shader da file
GLuint gfx_create_shader(const char* vs_path, const char* fs_path);
// Legge un file in una stringa (ricordati di fare free)
char* gfx_read_file(const char* path);
// Carica una texture RAW (float) con dimensioni specifiche.
// channels: 3 per RGB, 4 per RGBA.
GLuint gfx_load_texture_raw(const char* path, int w, int h, int channels);

// Carica una texture PNG standard
GLuint gfx_load_texture(const char* path);

#endif
