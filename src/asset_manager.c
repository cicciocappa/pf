#include "asset_manager.h"
#include "gfx.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Istanza globale
AssetManager g_assets = {0};

// ============================================================================
// INIZIALIZZAZIONE
// ============================================================================

void asset_manager_init(void) {
    memset(&g_assets, 0, sizeof(AssetManager));
    printf("[AssetManager] Initialized\n");
}

void asset_manager_shutdown(void) {
    asset_manager_unload_level();
    asset_manager_unload_global();
    printf("[AssetManager] Shutdown complete\n");
}

// ============================================================================
// ASSETS GLOBALI
// ============================================================================

static bool load_player_assets(void) {
    printf("[AssetManager] Loading player assets...\n");
    
    // Carica skeleton (contiene bones + animazioni)
    if (!skeleton_load(&g_assets.player.skeleton, "resources/player/player.skel")) {
        printf("[AssetManager] ERROR: Failed to load player skeleton\n");
        return false;
    }
    
    // Carica mesh skinnata
    if (!skinned_mesh_load(&g_assets.player.mesh, 
                           "resources/player/player.smsh",
                           "resources/player/player_diffuse.png")) {
        printf("[AssetManager] ERROR: Failed to load player mesh\n");
        skeleton_free(&g_assets.player.skeleton);
        return false;
    }
    
    // Cache indici animazioni (per accesso O(1))
    g_assets.player.animIdle = skeleton_find_animation(&g_assets.player.skeleton, "standing_idle");
    g_assets.player.animWalk = skeleton_find_animation(&g_assets.player.skeleton, "Standing_Walk_Forward");
    g_assets.player.animRun = skeleton_find_animation(&g_assets.player.skeleton, "Standing_Run_Forward");
    g_assets.player.animAttack = skeleton_find_animation(&g_assets.player.skeleton, "CharacterArmature|Sword_Slash");
    g_assets.player.animDeath = skeleton_find_animation(&g_assets.player.skeleton, "CharacterArmature|Death");
    
    printf("[AssetManager] Player animations: Idle=%d, Walk=%d, Run=%d\n",
           g_assets.player.animIdle, g_assets.player.animWalk, g_assets.player.animRun);
    
    return true;
}

static bool load_ui_assets(void) {
    printf("[AssetManager] Loading UI assets...\n");
    
    g_assets.ui.texBtnNormal = gfx_load_texture("resources/ui/btn_normal.png");
    g_assets.ui.texBtnHover = gfx_load_texture("resources/ui/btn_hover.png");
    
    // Font verrà caricato dal vecchio sistema assets.c per ora
    // TODO: Migrare qui
    
    return true;
}

bool asset_manager_load_global(void) {
    if (g_assets.globalAssetsLoaded) {
        printf("[AssetManager] Global assets already loaded\n");
        return true;
    }
    
    printf("[AssetManager] === Loading Global Assets ===\n");
    
    // Player
    if (!load_player_assets()) {
        return false;
    }
    
    // UI
    if (!load_ui_assets()) {
        return false;
    }
    
    // Audio (TODO: implementare)
    
    g_assets.globalAssetsLoaded = true;
    printf("[AssetManager] === Global Assets Loaded ===\n");
    return true;
}

void asset_manager_unload_global(void) {
    if (!g_assets.globalAssetsLoaded) return;
    
    printf("[AssetManager] Unloading global assets...\n");
    
    skeleton_free(&g_assets.player.skeleton);
    skinned_mesh_free(&g_assets.player.mesh);
    
    if (g_assets.ui.texBtnNormal) glDeleteTextures(1, &g_assets.ui.texBtnNormal);
    if (g_assets.ui.texBtnHover) glDeleteTextures(1, &g_assets.ui.texBtnHover);
    
    g_assets.globalAssetsLoaded = false;
}

// ============================================================================
// ASSETS LIVELLO
// ============================================================================

bool asset_manager_load_level(const char* levelName) {
    // Scarica livello precedente se presente
    if (g_assets.currentLevel.loaded) {
        asset_manager_unload_level();
    }
    
    printf("[AssetManager] === Loading Level: %s ===\n", levelName);
    
    char pathBuffer[256];
    
    // Per ora creiamo un terreno piatto procedurale
    // TODO: Caricare da file
    g_assets.currentLevel.worldSizeX = 100.0f;
    g_assets.currentLevel.worldSizeZ = 100.0f;
    
    // Maschera camminabilità (tutto camminabile per ora)
    int maskSize = 256;
    g_assets.currentLevel.walkMaskWidth = maskSize;
    g_assets.currentLevel.walkMaskHeight = maskSize;
    g_assets.currentLevel.walkMask = (unsigned char*)malloc(maskSize * maskSize);
    memset(g_assets.currentLevel.walkMask, 255, maskSize * maskSize); // Tutto bianco = camminabile
    
    g_assets.currentLevel.loaded = true;
    printf("[AssetManager] === Level Loaded ===\n");
    return true;
}

void asset_manager_unload_level(void) {
    if (!g_assets.currentLevel.loaded) return;
    
    printf("[AssetManager] Unloading current level...\n");
    
    if (g_assets.currentLevel.walkMask) {
        free(g_assets.currentLevel.walkMask);
        g_assets.currentLevel.walkMask = NULL;
    }
    
    // TODO: Liberare mesh e texture terreno
    // TODO: Liberare props
    
    g_assets.currentLevel.loaded = false;
}

// ============================================================================
// UTILITY
// ============================================================================

bool asset_manager_is_ready(void) {
    return g_assets.globalAssetsLoaded;
}
