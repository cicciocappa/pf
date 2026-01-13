#include "all_states.h"
#include "../ui/ui_renderer.h"
#include "../audio.h"
#include <glad/glad.h>
#include <stdio.h>

static UIRenderer ui;

void menu_init(Game* g) {
    ui_init(&ui, g->width, g->height);
    glfwSetInputMode(g->window, GLFW_CURSOR, GLFW_CURSOR_NORMAL);
    printf("[Menu] Initialized\n");
}

void menu_update(Game* g, float dt) {
    // Press ENTER or click to start
    if (glfwGetKey(g->window, GLFW_KEY_ENTER) == GLFW_PRESS ||
        glfwGetKey(g->window, GLFW_KEY_SPACE) == GLFW_PRESS ||
        g->mouseLeftDown) {
        g->mouseLeftDown = 0;
        game_change_state(g, STATE_GAMEPLAY);
    }
    
    if (glfwGetKey(g->window, GLFW_KEY_ESCAPE) == GLFW_PRESS) {
        glfwSetWindowShouldClose(g->window, 1);
    }
}

void menu_draw(Game* g) {
    glClearColor(0.1f, 0.1f, 0.15f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    ui_resize(&ui, g->width, g->height);
    ui_begin(&ui);

    // Title
    float titleX = g->width / 2.0f - 200.0f;
    float titleY = g->height / 3.0f;
    ui_draw_text(&ui, "TOWER DEFENSE", titleX, titleY, 2.0f);
    
    // Instructions
    float instrX = g->width / 2.0f - 150.0f;
    float instrY = g->height / 2.0f;
    ui_draw_text(&ui, "Press ENTER to start", instrX, instrY, 1.0f);
    
    // Simple button area
    float btnX = g->width / 2.0f - 100.0f;
    float btnY = g->height * 0.6f;
    ui_draw_rect(&ui, btnX, btnY, 200.0f, 50.0f, 0.3f, 0.3f, 0.4f, 1.0f);
    ui_draw_text(&ui, "PLAY", btnX + 70.0f, btnY + 35.0f, 1.0f);

    ui_end(&ui);
}

void menu_cleanup(void) {
    ui_cleanup(&ui);
    printf("[Menu] Cleanup\n");
}
