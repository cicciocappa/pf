/*
 * TOWER DEFENSE GAME - Main Entry Point
 * ======================================
 */

#include <stdio.h>
#include <stdlib.h>

#include "game.h"
#include "debug.h"
#include "audio.h"
#include "assets.h"
#include "asset_manager.h"
#include "pathfinding.h"
#include "states/all_states.h"

// ============================================================================
// GLOBALS
// ============================================================================

static Game game;

// ============================================================================
// CALLBACKS
// ============================================================================

static void error_callback(int error, const char* description) {
    fprintf(stderr, "GLFW Error %d: %s\n", error, description);
}

static void framebuffer_size_callback(GLFWwindow* window, int width, int height) {
    glViewport(0, 0, width, height);
    game.width = width;
    game.height = height;
}

static void cursor_pos_callback(GLFWwindow* window, double xpos, double ypos) {
    game.mouseX = xpos;
    game.mouseY = ypos;
}

static void mouse_button_callback(GLFWwindow* window, int button, int action, int mods) {
    if (action == GLFW_PRESS) {
        if (button == GLFW_MOUSE_BUTTON_LEFT) game.mouseLeftDown = 1;
        if (button == GLFW_MOUSE_BUTTON_RIGHT) game.mouseRightDown = 1;
    }
}

// ============================================================================
// STATE MACHINE
// ============================================================================

void game_change_state(Game* g, GameStateID newState) {
    g->nextState = newState;
}

static void apply_state_change(Game* g) {
    if (g->nextState == g->currentState) return;
    
    // Cleanup stato precedente
    switch (g->currentState) {
        case STATE_MENU:
            menu_cleanup();
            break;
        case STATE_GAMEPLAY:
            gameplay_cleanup();
            break;
        default:
            break;
    }
    
    g->currentState = g->nextState;
    
    // Init nuovo stato
    switch (g->currentState) {
        case STATE_LOADER:
            loader_init(g);
            break;
        case STATE_MENU:
            menu_init(g);
            break;
        case STATE_GAMEPLAY:
            gameplay_init(g);
            break;
        default:
            break;
    }
}

static void update_current_state(Game* g, float dt) {
    switch (g->currentState) {
        case STATE_LOADER:
            loader_update(g, dt);
            break;
        case STATE_MENU:
            menu_update(g, dt);
            break;
        case STATE_GAMEPLAY:
            gameplay_update(g, dt);
            break;
        default:
            break;
    }
}

static void draw_current_state(Game* g) {
    switch (g->currentState) {
        case STATE_LOADER:
            loader_draw(g);
            break;
        case STATE_MENU:
            menu_draw(g);
            break;
        case STATE_GAMEPLAY:
            gameplay_draw(g);
            break;
        default:
            break;
    }
}

// ============================================================================
// MAIN
// ============================================================================

int main(int argc, char* argv[]) {
    printf("=== Tower Defense Game ===\n");
    printf("Starting...\n");
    
    // =========================================================================
    // GLFW INIT
    // =========================================================================
    
    glfwSetErrorCallback(error_callback);
    
    if (!glfwInit()) {
        fprintf(stderr, "Failed to initialize GLFW\n");
        return -1;
    }
    
    // OpenGL 3.3 Core Profile
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    
#ifdef __APPLE__
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);
#endif
    
    // Nota: Debug context (GL 4.3+) non disponibile con GL 3.3
    
    // Crea finestra
    game.width = 1280;
    game.height = 720;
    game.window = glfwCreateWindow(game.width, game.height, "Tower Defense", NULL, NULL);
    
    if (!game.window) {
        fprintf(stderr, "Failed to create GLFW window\n");
        glfwTerminate();
        return -1;
    }
    
    glfwMakeContextCurrent(game.window);
    glfwSwapInterval(1); // V-Sync
    
    // Callbacks
    glfwSetFramebufferSizeCallback(game.window, framebuffer_size_callback);
    glfwSetCursorPosCallback(game.window, cursor_pos_callback);
    glfwSetMouseButtonCallback(game.window, mouse_button_callback);
    
    // =========================================================================
    // GLAD INIT
    // =========================================================================
    
    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) {
        fprintf(stderr, "Failed to initialize GLAD\n");
        glfwTerminate();
        return -1;
    }
    
    printf("OpenGL Version: %s\n", glGetString(GL_VERSION));
    printf("Renderer: %s\n", glGetString(GL_RENDERER));
    
    // Debug context
    gl_init_debug();
    
    // =========================================================================
    // SUBSYSTEMS INIT
    // =========================================================================
    
    // Audio
    if (!audio_init()) {
        printf("WARNING: Audio initialization failed\n");
    }
    
    // Assets vecchio sistema (per UI/font - temporaneo)
    assets_init();
    
    // Asset Manager nuovo
    asset_manager_init();
    
    // Carica assets globali (player, UI, etc.)
    printf("\n=== Loading Global Assets ===\n");
    if (!asset_manager_load_global()) {
        printf("WARNING: Some global assets failed to load\n");
        printf("Player skeletal animation may not work.\n");
        printf("Make sure player files exist in resources/player/\n");
    }

    pathfinding_init();
    
    // =========================================================================
    // GAME INIT
    // =========================================================================
    
    game.currentState = STATE_LOADER;
    game.nextState = STATE_LOADER;
    game.player.mana = 100;
    game.player.maxMana = 100;
    game.player.levelsUnlocked = 1;
    game.player.powerMultiplier = 1.0f;
    
    // Prima inizializzazione stato
    loader_init(&game);
    
    // =========================================================================
    // MAIN LOOP
    // =========================================================================
    
    double lastTime = glfwGetTime();
    
    while (!glfwWindowShouldClose(game.window)) {
        // Delta time
        double currentTime = glfwGetTime();
        float dt = (float)(currentTime - lastTime);
        lastTime = currentTime;
        
        // Clamp dt per evitare physics explosion
        if (dt > 0.1f) dt = 0.1f;

        //dt = dt/4.0;
        
        // Poll events
        glfwPollEvents();
        
        // State machine
        apply_state_change(&game);
        
        // Update
        update_current_state(&game, dt);
        
        // Draw
        draw_current_state(&game);
        
        // Swap buffers
        glfwSwapBuffers(game.window);
        
        // Reset input per-frame
        // (mouseLeftDown viene resettato in handle_input dopo consumo)
    }
    
    // =========================================================================
    // CLEANUP
    // =========================================================================
    
    printf("\n=== Shutting Down ===\n");
    
    // Cleanup stato corrente
    switch (game.currentState) {
        case STATE_MENU:
            menu_cleanup();
            break;
        case STATE_GAMEPLAY:
            gameplay_cleanup();
            break;
        default:
            break;
    }
    
    asset_manager_shutdown();
    assets_cleanup();
    audio_cleanup();
    
    glfwDestroyWindow(game.window);
    glfwTerminate();
    
    printf("Goodbye!\n");
    return 0;
}
