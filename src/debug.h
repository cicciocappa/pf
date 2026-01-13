#ifndef DEBUG_H
#define DEBUG_H

#include <glad/glad.h>
#include <stdio.h>

/*
 * DEBUG UTILITIES
 * ===============
 * Nota: Le funzioni di debug avanzate (glDebugMessageCallback, ecc.)
 * richiedono OpenGL 4.3+. Per OpenGL 3.3 usiamo solo glGetError().
 */

#ifndef NDEBUG
#define GL_DEBUG_ENABLED 1
#else
#define GL_DEBUG_ENABLED 0
#endif

#if GL_DEBUG_ENABLED
#define GL_CHECK_ERROR() gl_check_error(__FILE__, __LINE__)
#else
#define GL_CHECK_ERROR() ((void)0)
#endif

static inline void gl_check_error(const char* file, int line) {
    GLenum err;
    while ((err = glGetError()) != GL_NO_ERROR) {
        const char* error_str;
        switch (err) {
            case GL_INVALID_ENUM:      error_str = "INVALID_ENUM"; break;
            case GL_INVALID_VALUE:     error_str = "INVALID_VALUE"; break;
            case GL_INVALID_OPERATION: error_str = "INVALID_OPERATION"; break;
            case GL_OUT_OF_MEMORY:     error_str = "OUT_OF_MEMORY"; break;
            default:                   error_str = "UNKNOWN"; break;
        }
        printf("GL ERROR [%s:%d]: %s (0x%x)\n", file, line, error_str, err);
    }
}

// Stub per compatibilità - il debug context richiede OpenGL 4.3+
static inline void gl_init_debug(void) {
#if GL_DEBUG_ENABLED
    printf("[Debug] OpenGL error checking enabled (glGetError)\n");
    printf("[Debug] Note: Advanced debug callbacks require OpenGL 4.3+\n");
#endif
}

#endif
