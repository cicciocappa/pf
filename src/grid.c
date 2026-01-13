#include "grid.h"
#include "gfx.h"
#include <glad/glad.h>
#include <stdlib.h>

static GLuint vao, vbo;
static GLuint shader;
static int vertex_count;
static GLint loc_uVP;
static GLint loc_uColor;

void grid_init(int size, float step) {
    shader = gfx_create_shader("shaders/grid.vs", "shaders/grid.fs");

    int lines_per_axis = (size * 2) / step; 
    vertex_count = (lines_per_axis + 1) * 2 * 2;
    
    float* vertices = malloc(vertex_count * 3 * sizeof(float));
    int i = 0;
    
    for(float x = -size; x <= size; x += step) {
        vertices[i++] = x; vertices[i++] = 0; vertices[i++] = -size;
        vertices[i++] = x; vertices[i++] = 0; vertices[i++] = size;
    }
    for(float z = -size; z <= size; z += step) {
        vertices[i++] = -size; vertices[i++] = 0; vertices[i++] = z;
        vertices[i++] = size;  vertices[i++] = 0; vertices[i++] = z;
    }

    glGenVertexArrays(1, &vao);
    glGenBuffers(1, &vbo);
    glBindVertexArray(vao);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, vertex_count * 3 * sizeof(float), vertices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);
    glBindVertexArray(0);
    
    free(vertices);
    
    loc_uVP = glGetUniformLocation(shader, "uVP");
    loc_uColor = glGetUniformLocation(shader, "uColor");
}

void grid_draw(mat4 view_proj) {
    glUseProgram(shader);
    glUniformMatrix4fv(loc_uVP, 1, GL_FALSE, (float*)view_proj);
    glUniform3f(loc_uColor, 0.4f, 0.4f, 0.4f);
    
    glBindVertexArray(vao);
    glDrawArrays(GL_LINES, 0, vertex_count);
    glBindVertexArray(0);
}

void grid_cleanup(void) {
    glDeleteBuffers(1, &vbo);
    glDeleteVertexArrays(1, &vao);
    glDeleteProgram(shader);
}
