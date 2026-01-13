#ifndef ASSETS_H
#define ASSETS_H

#include <glad/glad.h>

// Placeholder for stbtt data
typedef struct {
    float x0, y0, x1, y1;
    float s0, t0, s1, t1;
    float xadvance;
} SimpleBakedChar;

typedef struct {
    GLuint texBtnNormal;
    GLuint texBtnHover;
    GLuint texFontAtlas;
    SimpleBakedChar cdata[96];
} GlobalAssets;

extern GlobalAssets assets;

void assets_init(void);
void assets_cleanup(void);

#endif
