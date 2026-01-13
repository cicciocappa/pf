#include "ui_renderer.h"
#include "../gfx.h"
#include "../assets.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STRIDE (8 * sizeof(float))
#define FLOATS_PER_VERT 8
#define FLOATS_PER_QUAD (6 * FLOATS_PER_VERT)

void ui_init(UIRenderer* ui, int w, int h) {
    ui->shader = gfx_create_shader("shaders/ui.vs", "shaders/ui.fs");
    
    ui->loc_uProjection = glGetUniformLocation(ui->shader, "uProjection");
    ui->loc_uTex = glGetUniformLocation(ui->shader, "uTex");
    ui->loc_uIsText = glGetUniformLocation(ui->shader, "uIsText");

    ui_resize(ui, w, h);

    glGenTextures(1, &ui->whiteTexture);
    glBindTexture(GL_TEXTURE_2D, ui->whiteTexture);
    unsigned char whitePixel[4] = {255, 255, 255, 255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, whitePixel);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

    glGenVertexArrays(1, &ui->vao);
    glGenBuffers(1, &ui->vbo);

    glBindVertexArray(ui->vao);
    glBindBuffer(GL_ARRAY_BUFFER, ui->vbo);
    
    ui->batchCapacity = MAX_BATCH_VERTS * FLOATS_PER_VERT;
    ui->batchBuffer = (float*)malloc(ui->batchCapacity * sizeof(float));

    glBufferData(GL_ARRAY_BUFFER, ui->batchCapacity * sizeof(float), NULL, GL_DYNAMIC_DRAW);

    glVertexAttribPointer(0, 4, GL_FLOAT, GL_FALSE, STRIDE, (void*)0);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 4, GL_FLOAT, GL_FALSE, STRIDE, (void*)(4 * sizeof(float)));
    glEnableVertexAttribArray(1);

    glBindVertexArray(0);
}

void ui_resize(UIRenderer* ui, int w, int h) {
    ui->screenW = w;
    ui->screenH = h;
    glm_ortho(0.0f, (float)w, (float)h, 0.0f, -1.0f, 1.0f, ui->projection);
}

void ui_begin(UIRenderer* ui) {
    glDisable(GL_DEPTH_TEST);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    
    glUseProgram(ui->shader);
    glUniformMatrix4fv(ui->loc_uProjection, 1, GL_FALSE, (float*)ui->projection);
    
    glBindVertexArray(ui->vao);
    glBindBuffer(GL_ARRAY_BUFFER, ui->vbo);
}

void ui_end(UIRenderer* ui) {
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindVertexArray(0);
    glDisable(GL_BLEND);
    glEnable(GL_DEPTH_TEST);
}

void ui_cleanup(UIRenderer* ui) {
    if (ui->batchBuffer) free(ui->batchBuffer);
    glDeleteVertexArrays(1, &ui->vao);
    glDeleteBuffers(1, &ui->vbo);
    glDeleteTextures(1, &ui->whiteTexture);
    glDeleteProgram(ui->shader);
}

static void push_quad(UIRenderer* ui, int* idx, 
                      float x, float y, float w, float h, 
                      float u0, float v0, float u1, float v1, 
                      float r, float g, float b, float a) {
    if (*idx + FLOATS_PER_QUAD > ui->batchCapacity) return;

    int i = *idx;
    float* buf = ui->batchBuffer;

    // BL
    buf[i++] = x; buf[i++] = y + h; buf[i++] = u0; buf[i++] = v1;
    buf[i++] = r; buf[i++] = g; buf[i++] = b; buf[i++] = a;
    // TR
    buf[i++] = x + w; buf[i++] = y; buf[i++] = u1; buf[i++] = v0;
    buf[i++] = r; buf[i++] = g; buf[i++] = b; buf[i++] = a;
    // TL
    buf[i++] = x; buf[i++] = y; buf[i++] = u0; buf[i++] = v0;
    buf[i++] = r; buf[i++] = g; buf[i++] = b; buf[i++] = a;
    // BL
    buf[i++] = x; buf[i++] = y + h; buf[i++] = u0; buf[i++] = v1;
    buf[i++] = r; buf[i++] = g; buf[i++] = b; buf[i++] = a;
    // BR
    buf[i++] = x + w; buf[i++] = y + h; buf[i++] = u1; buf[i++] = v1;
    buf[i++] = r; buf[i++] = g; buf[i++] = b; buf[i++] = a;
    // TR
    buf[i++] = x + w; buf[i++] = y; buf[i++] = u1; buf[i++] = v0;
    buf[i++] = r; buf[i++] = g; buf[i++] = b; buf[i++] = a;

    *idx = i;
}

void ui_draw_rect(UIRenderer* ui, float x, float y, float w, float h, float r, float g, float b, float a) {
    glUniform1i(ui->loc_uIsText, 0);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, ui->whiteTexture);
    glUniform1i(ui->loc_uTex, 0);

    int idx = 0;
    push_quad(ui, &idx, x, y, w, h, 0, 0, 1, 1, r, g, b, a);

    glBufferSubData(GL_ARRAY_BUFFER, 0, idx * sizeof(float), ui->batchBuffer);
    glDrawArrays(GL_TRIANGLES, 0, 6);
}

void ui_draw_image(UIRenderer* ui, GLuint texID, float x, float y, float w, float h) {
    glUniform1i(ui->loc_uIsText, 0);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, texID);
    glUniform1i(ui->loc_uTex, 0);

    int idx = 0;
    push_quad(ui, &idx, x, y, w, h, 0, 0, 1, 1, 1, 1, 1, 1);

    glBufferSubData(GL_ARRAY_BUFFER, 0, idx * sizeof(float), ui->batchBuffer);
    glDrawArrays(GL_TRIANGLES, 0, 6);
}

void ui_draw_text_colored(UIRenderer* ui, const char* text, float x, float y, float scale, float r, float g, float b, float a) {
    // Simplified - just draw placeholder rectangles
    if (!text || !*text) return;
    
    glUniform1i(ui->loc_uIsText, 0);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, ui->whiteTexture);
    glUniform1i(ui->loc_uTex, 0);

    int idx = 0;
    float charW = 12.0f * scale;
    float charH = 20.0f * scale;
    
    while (*text) {
        if (*text >= 32) {
            push_quad(ui, &idx, x, y - charH, charW * 0.8f, charH, 0, 0, 1, 1, r, g, b, a);
            x += charW;
        }
        text++;
    }

    if (idx > 0) {
        glBufferSubData(GL_ARRAY_BUFFER, 0, idx * sizeof(float), ui->batchBuffer);
        glDrawArrays(GL_TRIANGLES, 0, idx / FLOATS_PER_VERT);
    }
}

void ui_draw_text(UIRenderer* ui, const char* text, float x, float y, float scale) {
    ui_draw_text_colored(ui, text, x, y, scale, 1.0f, 1.0f, 1.0f, 1.0f);
}
