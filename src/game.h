#ifndef GAME_H
#define GAME_H

// --- ORDINE DI INCLUSIONE CRITICO ---
// GLAD deve essere SEMPRE incluso prima di GLFW o qualsiasi altro file OpenGL
#include <glad/glad.h>  
#include <GLFW/glfw3.h>
#include <cglm/cglm.h>
// ------------------------------------

// Definizione degli Stati
typedef enum {
    STATE_LOADER,
    STATE_MENU,
    STATE_LEVEL_SELECT,
    STATE_GAMEPLAY,
    STATE_GAME_OVER,
    STATE_VICTORY
} GameStateID;

// Dati persistenti del giocatore
typedef struct {
    int mana;
    int maxMana;
    int levelsUnlocked;
    float powerMultiplier;
} PlayerStats;

// Contesto Globale
typedef struct {
    GLFWwindow* window;
    int width, height;
    
    GameStateID currentState;
    GameStateID nextState; // Per gestire il cambio stato in sicurezza
    
    PlayerStats player;
    
    // Input stato corrente
    double mouseX, mouseY;
    int mouseLeftDown;
    int mouseRightDown;
} Game;

// Funzioni globali per cambio stato
void game_change_state(Game* game, GameStateID newState);

#endif
