#ifndef UI_RENDERER_H
#define UI_RENDERER_H

#include <glad/glad.h>
#include <cglm/cglm.h>

#define MAX_BATCH_VERTS 6000

typedef struct {
    GLuint shader;
    GLuint vao, vbo;
    GLuint whiteTexture;
    
    mat4 projection;
    int screenW, screenH;
    
    float* batchBuffer;      
    int batchCapacity;

    GLint loc_uProjection;
    GLint loc_uTex;
    GLint loc_uIsText; 
} UIRenderer;

void ui_init(UIRenderer* ui, int screenWidth, int screenHeight);
void ui_resize(UIRenderer* ui, int screenWidth, int screenHeight);
void ui_begin(UIRenderer* ui);
void ui_end(UIRenderer* ui);
void ui_cleanup(UIRenderer* ui);

void ui_draw_rect(UIRenderer* ui, float x, float y, float w, float h, float r, float g, float b, float a);
void ui_draw_image(UIRenderer* ui, GLuint texID, float x, float y, float w, float h);
void ui_draw_text_colored(UIRenderer* ui, const char* text, float x, float y, float scale, float r, float g, float b, float a);
void ui_draw_text(UIRenderer* ui, const char* text, float x, float y, float scale);

#endif
