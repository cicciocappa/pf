#include "all_states.h"
#include "../level.h"
#include "../player.h"
#include "../asset_manager.h"
#include "../grid.h"
#include "../camera.h"
#include "../pathfinding.h"
#include <math.h>
#include <stdio.h>

// ============================================================================
// VARIABILI STATICHE
// ============================================================================

static Level level;
static Player player;
static Camera camera;

// Cache matrici (calcolate dalla camera)
static mat4 cached_view;
static mat4 cached_proj;
static mat4 cached_vp;

// Debug visualization toggle
static bool show_pathgrid = false;
static bool show_player_path = false;
static bool f1_was_pressed = false;
static bool f2_was_pressed = false;

// ============================================================================
// SCROLL CALLBACK per Zoom
// ============================================================================

static Camera* scrollCallbackCamera = NULL;

static void scroll_callback(GLFWwindow* window, double xoffset, double yoffset) {
    (void)window;
    (void)xoffset;
    
    if (scrollCallbackCamera) {
        if (yoffset > 0) {
            camera_zoom_in(scrollCallbackCamera, (float)yoffset * 5.0f);
        } else if (yoffset < 0) {
            camera_zoom_out(scrollCallbackCamera, (float)(-yoffset) * 5.0f);
        }
    }
}

// ============================================================================
// INIT
// ============================================================================

void gameplay_init(Game* g) {
    printf("[Gameplay] Initializing...\n");

    // Griglia di debug
    grid_init(100, 5.0f);

    // Carica livello multi-chunk
    if (!level_load(&level, "resources/levels/level2.lvl")) {
        printf("[Gameplay] WARNING: Failed to load level config, using fallback\n");
    }

    // Carica assets livello
    if (!asset_manager_load_level("level_01")) {
        printf("[Gameplay] ERROR: Failed to load level\n");
    }
    
    // Inizializza camera
    camera_init(&camera);
    
    // Registra callback per scroll (zoom)
    scrollCallbackCamera = &camera;
    glfwSetScrollCallback(g->window, scroll_callback);
    
    // Inizializza player (richiede assets globali già caricati)
    if (asset_manager_is_ready()) {
        player_init(&player);
        player_set_position(&player, 0.0f, 0.0f);
        
        // Sincronizza camera con posizione iniziale player
        camera_set_player_position(&camera, player.position);
        camera_center_on_player(&camera);
    } else {
        printf("[Gameplay] WARNING: Global assets not loaded!\n");
    }
    
    // Cursore visibile
    glfwSetInputMode(g->window, GLFW_CURSOR, GLFW_CURSOR_NORMAL);
    
    printf("[Gameplay] Ready!\n");
}

// ============================================================================
// UPDATE
// ============================================================================

void gameplay_update(Game* g, float dt) {
    // ESC -> Menu
    if (glfwGetKey(g->window, GLFW_KEY_ESCAPE) == GLFW_PRESS) {
        game_change_state(g, STATE_MENU);
        return;
    }

    // F1 -> Toggle pathgrid visualization
    bool f1_pressed = (glfwGetKey(g->window, GLFW_KEY_F1) == GLFW_PRESS);
    if (f1_pressed && !f1_was_pressed) {
        show_pathgrid = !show_pathgrid;
        printf("[Gameplay] Pathgrid visualization: %s\n", show_pathgrid ? "ON" : "OFF");
    }
    f1_was_pressed = f1_pressed;

    // F2 -> Toggle player path visualization
    bool f2_pressed = (glfwGetKey(g->window, GLFW_KEY_F2) == GLFW_PRESS);
    if (f2_pressed && !f2_was_pressed) {
        show_player_path = !show_player_path;
        printf("[Gameplay] Player path visualization: %s\n", show_player_path ? "ON" : "OFF");
    }
    f2_was_pressed = f2_pressed;

    // =========================================================================
    // CAMERA INPUT & UPDATE
    // =========================================================================
    
    // Passa posizione player alla camera (per leash e follow)
    camera_set_player_position(&camera, player.position);
    
    // Gestisci input camera (edge scroll, pan, zoom)
    bool cameraConsumedInput = camera_handle_input(&camera, g, dt);
    
    // Update camera (smooth follow, interpolazioni)
    camera_update(&camera, dt);
    
    // =========================================================================
    // CALCOLA MATRICI VIEW/PROJECTION
    // =========================================================================
    
    float aspectRatio = (float)g->width / (float)g->height;
    camera_get_view_matrix(&camera, cached_view);
    camera_get_proj_matrix(&camera, aspectRatio, cached_proj);
    glm_mat4_mul(cached_proj, cached_view, cached_vp);
    
    // =========================================================================
    // PLAYER INPUT & UPDATE
    // =========================================================================
    
    // Salva posizione precedente per rilevare movimento
    vec3 prevPos;
    glm_vec3_copy(player.position, prevPos);
    
    // Input player (solo se camera non sta consumando input)
    if (!cameraConsumedInput) {
        player_handle_input(&player, g, cached_view, cached_proj, &level);
    }

    // Update player
    player_update(&player, dt, &level);
    
    // Se il player si è mosso, notifica la camera (per auto-return)
    float movedDist = glm_vec3_distance(prevPos, player.position);
    if (movedDist > 0.01f) {
        camera_on_player_move(&camera);
    }
}

// ============================================================================
// DRAW
// ============================================================================

void gameplay_draw(Game* g) {
    // Clear
    glClearColor(0.1f, 0.12f, 0.15f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    
    // Abilita depth test
    glEnable(GL_DEPTH_TEST);
    
    // Terreno (tutti i chunk visibili con frustum culling)
    level_draw(&level, cached_vp);

    // Player (with foot IK for terrain adaptation)
    if (asset_manager_is_ready()) {
        player_draw_with_ik(&player, cached_vp, &level);
    }

    // Debug: Visualizzazione pathgrid (Toggle con F1)
    if (show_pathgrid && level.totalChunks > 0) {
        // Visualizza pathgrid per tutti i chunk visibili
        for (int i = 0; i < level.totalChunks; i++) {
            terrain_debug_draw_pathgrid(&level.chunks[i], cached_vp);
        }
    }

    // Debug: Visualizzazione path del player (Toggle con F2)
    if (show_player_path && player.current_path) {
        vec3 path_color = {1.0f, 1.0f, 0.0f}; // Giallo
        pathfinding_debug_draw_path(player.current_path, cached_vp, path_color);
    }

    // Griglia di debug (commenta per release)
    // grid_draw(cached_vp);
    
    // =========================================================================
    // DEBUG: Visualizza stato camera
    // =========================================================================
    #if 0
    static int debugFrame = 0;
    if (debugFrame++ % 120 == 0) {
        printf("[Camera] Mode: %d, Distance: %.1f, Pitch: %.1f, Pan: (%.1f, %.1f)\n",
               camera.mode, camera.distance, camera.pitch,
               camera.panOffset[0], camera.panOffset[1]);
    }
    #endif
}

// ============================================================================
// CLEANUP
// ============================================================================

void gameplay_cleanup(void) {
    printf("[Gameplay] Cleanup...\n");

    // Rimuovi callback scroll
    scrollCallbackCamera = NULL;

    level_cleanup(&level);
    grid_cleanup();
    asset_manager_unload_level();
}
