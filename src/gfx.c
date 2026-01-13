#include "gfx.h"
#include <stdio.h>
#include <stdlib.h>
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

char* gfx_read_file(const char* path) {
    FILE* f = fopen(path, "rb");
    if(!f) { printf("ERROR: File not found %s\n", path); return NULL; }
    fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
    char* buf = malloc(len+1); fread(buf, 1, len, f); buf[len]=0; fclose(f);
    return buf;
}

GLuint gfx_create_shader(const char* vs_path, const char* fs_path) {
    char* vs_src = gfx_read_file(vs_path);
    char* fs_src = gfx_read_file(fs_path);
    
    if (!vs_src || !fs_src) {
        free(vs_src);
        free(fs_src);
        printf("ERROR: Failed to load shader files: %s, %s\n", vs_path, fs_path);
        return 0;
    }

    GLint success; 
    char infoLog[512];
    GLuint prog = 0;

    // Vertex Shader
    GLuint vs = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vs, 1, (const char**)&vs_src, NULL);
    glCompileShader(vs);
    glGetShaderiv(vs, GL_COMPILE_STATUS, &success);
    if(!success) { 
        glGetShaderInfoLog(vs, 512, NULL, infoLog); 
        printf("VS ERR %s: %s\n", vs_path, infoLog);
        free(vs_src); free(fs_src);
        glDeleteShader(vs);
        return 0;
    }

    // Fragment Shader
    GLuint fs = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fs, 1, (const char**)&fs_src, NULL);
    glCompileShader(fs);
    glGetShaderiv(fs, GL_COMPILE_STATUS, &success);
    if(!success) { 
        glGetShaderInfoLog(fs, 512, NULL, infoLog); 
        printf("FS ERR %s: %s\n", fs_path, infoLog);
        free(vs_src); free(fs_src);
        glDeleteShader(vs);
        glDeleteShader(fs);
        return 0;
    }

    // Linking
    prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glLinkProgram(prog);
    
    glGetProgramiv(prog, GL_LINK_STATUS, &success);
    if(!success) {
        glGetProgramInfoLog(prog, 512, NULL, infoLog);
        printf("SHADER LINK ERR: %s\n", infoLog);
        glDeleteProgram(prog);
        prog = 0;
    }
    
    // Cleanup
    free(vs_src); 
    free(fs_src);
    glDeleteShader(vs); 
    glDeleteShader(fs);
    
    return prog;
}

GLuint gfx_load_texture_raw(const char* path, int w, int h, int channels) {
    char* data = gfx_read_file(path);
    if (!data) return 0;

    GLuint tex;
    glGenTextures(1, &tex);
    glBindTexture(GL_TEXTURE_2D, tex);
    
    GLenum format = (channels == 4) ? GL_RGBA : GL_RGB;
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB32F, w, h, 0, format, GL_FLOAT, data);
    
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    free(data);
    return tex;
}

GLuint gfx_load_texture(const char* path) {
    int w, h, nrChannels;
    
    unsigned char *data = stbi_load(path, &w, &h, &nrChannels, 0);
    if (!data) {
        printf("Failed to load texture: %s\n", path);
        return 0;
    }

    GLuint tex;
    glGenTextures(1, &tex);
    glBindTexture(GL_TEXTURE_2D, tex);
    
    GLenum format = (nrChannels == 4) ? GL_RGBA : GL_RGB;
    glTexImage2D(GL_TEXTURE_2D, 0, format, w, h, 0, format, GL_UNSIGNED_BYTE, data);
    glGenerateMipmap(GL_TEXTURE_2D);

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

    stbi_image_free(data);
    return tex;
}
