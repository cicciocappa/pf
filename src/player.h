#ifndef PLAYER_H
#define PLAYER_H

/*
 * PLAYER CONTROLLER
 * =================
 * 
 * Sistema di controllo del giocatore con:
 * - Click-to-move (ray casting verso terreno)
 * - State machine per animazioni (Idle, Walk, Run)
 * - Integrazione con skeletal animation system
 * - Supporto terreno con altezze variabili
 */

#include "game.h"
#include "skeletal/skeletal.h"
#include "level.h"
#include "pathfinding.h"
#include <cglm/cglm.h>

// ============================================================================
// STATI DEL PLAYER
// ============================================================================

typedef enum {
    PLAYER_STATE_IDLE,
    PLAYER_STATE_WALKING,
    PLAYER_STATE_RUNNING,
    PLAYER_STATE_ATTACKING,
    PLAYER_STATE_DEAD
} PlayerState;

// ============================================================================
// STRUTTURA PLAYER
// ============================================================================

typedef struct {
    // Trasformazione
    vec3 position;
    vec3 targetPosition;
    float rotation;          // Rotazione Y in radianti
    float targetRotation;    // Per smooth rotation

    // Movimento
    float walkSpeed;
    float runSpeed;
    float rotationSpeed;     // Velocità rotazione (rad/s)
    float arrivalThreshold;  // Distanza per considerarsi "arrivato"

    // Stato
    PlayerState state;
    PlayerState previousState;
    bool hasDestination;
    bool isRunning;          // Shift premuto

    // Pathfinding
    Path* current_path;      // Path corrente da seguire
    int current_waypoint;    // Indice del prossimo waypoint

    // Animazione (riferimento a skeleton globale)
    Animator animator;

    // Foot IK
    FootIKConfig footIK;

    // Stats
    int hp;
    int maxHp;
    int mana;
    int maxMana;

} Player;

// ============================================================================
// API
// ============================================================================

// Inizializzazione (richiede che g_assets.player sia già caricato!)
void player_init(Player* p);

// Input handling - processa click per movimento
// level può essere NULL per retrocompatibilità (usa piano Y=0)
void player_handle_input(Player* p, Game* g, mat4 view, mat4 proj, Level* level);

// Update logica + animazioni
// level può essere NULL per retrocompatibilità (usa piano Y=0)
void player_update(Player* p, float dt, Level* level);

// Rendering
void player_draw(Player* p, mat4 viewProj);

// Utility
void player_set_position(Player* p, float x, float z);
void player_move_to(Player* p, float x, float z);
void player_stop(Player* p);
bool player_is_moving(Player* p);

// Pathfinding
void player_set_path(Player* p, Path* path);
void player_clear_path(Player* p);

// Cambio stato (gestisce transizioni animazioni)
void player_change_state(Player* p, PlayerState newState);

// Foot IK - setup bones by name (call after player_init)
// Returns true if all bones were found
bool player_setup_foot_ik(Player* p,
                          const char* leftThigh, const char* leftShin, const char* leftFoot,
                          const char* rightThigh, const char* rightShin, const char* rightFoot);

// Enable/disable foot IK
void player_set_foot_ik_enabled(Player* p, bool enabled);

// Rendering with terrain IK (updates foot targets based on terrain height)
void player_draw_with_ik(Player* p, mat4 viewProj, Level* level);

#endif // PLAYER_H
