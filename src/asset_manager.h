#ifndef ASSET_MANAGER_H
#define ASSET_MANAGER_H

/*
 * ASSET MANAGER
 * =============
 * Sistema centralizzato per il caricamento degli assets.
 * 
 * Due categorie:
 * - GLOBAL: Caricati all'avvio, mai scaricati (player, UI, suoni comuni)
 * - LEVEL:  Caricati prima di ogni livello, scaricati al cambio livello
 */

#include <glad/glad.h>
#include <stdbool.h>
#include "skeletal/skeletal.h"

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

#define MAX_LEVEL_TEXTURES 32
#define MAX_LEVEL_MESHES 16

// ============================================================================
// STRUTTURE DATI
// ============================================================================

// Assets del Player (globali, sempre in memoria)
typedef struct {
    Skeleton skeleton;
    SkinnedMesh mesh;
    
    // Indici animazioni (per accesso rapido)
    int animIdle;
    int animWalk;
    int animRun;
    int animAttack;
    int animDeath;
} PlayerAssets;

// Assets UI (globali)
typedef struct {
    GLuint texFontAtlas;
    GLuint texBtnNormal;
    GLuint texBtnHover;
    GLuint texBtnPressed;
    GLuint texCursor;
    GLuint texHealthBar;
    GLuint texManaBar;
    
    // Font data (da stb_truetype)
    void* fontData;  // stbtt_bakedchar array
} UIAssets;

// Assets Audio (globali)
typedef struct {
    // SFX comuni
    unsigned int sfxClick;
    unsigned int sfxHover;
    unsigned int sfxPlayerHit;
    unsigned int sfxPlayerDeath;
    unsigned int sfxFootstep;
    
    // Musica
    unsigned int musicMenu;
    unsigned int musicGameplay;
} AudioAssets;

// Assets di un singolo livello
typedef struct {
    // Terrain
    GLuint terrainMesh;      // VAO della mesh terreno
    GLuint terrainTexture;   // Texture diffuse
    GLuint terrainNormal;    // Normal map (opzionale)
    unsigned char* walkMask; // Maschera camminabilità
    int walkMaskWidth;
    int walkMaskHeight;
    
    // Props (alberi, rocce, etc.)
    int propCount;
    GLuint propMeshes[MAX_LEVEL_MESHES];
    GLuint propTextures[MAX_LEVEL_TEXTURES];
    
    // Metadata
    float worldSizeX;
    float worldSizeZ;
    
    bool loaded;
} LevelAssets;

// Container principale
typedef struct {
    PlayerAssets player;
    UIAssets ui;
    AudioAssets audio;
    LevelAssets currentLevel;
    
    bool globalAssetsLoaded;
} AssetManager;

// Istanza globale
extern AssetManager g_assets;

// ============================================================================
// API
// ============================================================================

// Inizializzazione sistema
void asset_manager_init(void);
void asset_manager_shutdown(void);

// Assets globali (chiamare una volta all'avvio)
bool asset_manager_load_global(void);
void asset_manager_unload_global(void);

// Assets livello (chiamare prima di ogni livello)
bool asset_manager_load_level(const char* levelName);
void asset_manager_unload_level(void);

// Utility
bool asset_manager_is_ready(void);

#endif // ASSET_MANAGER_H
