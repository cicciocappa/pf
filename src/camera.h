#ifndef CAMERA_H
#define CAMERA_H

#include <cglm/cglm.h>
#include <stdbool.h>
#include "game.h"

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

// Follow behavior
#define CAMERA_FOLLOW_SPEED         8.0f    
#define CAMERA_VERTICAL_OFFSET      0.4f    

// Pan Manuale (Middle Mouse)
#define CAMERA_PAN_SPEED            30.0f   
#define CAMERA_LEASH_DISTANCE       20.0f   

// --- NUOVO: Dynamic Peeking ---
// Rimuovi le costanti EDGE_SCROLL e aggiungi queste:
#define CAMERA_PEEK_RANGE           15.0f   // Quanto lontano la camera guarda verso il mouse (metri)
#define CAMERA_PEEK_SMOOTH          4.0f    // Velocità di interpolazione del peeking (più basso = più morbido)
// ------------------------------

// Zoom
#define CAMERA_ZOOM_SPEED           3.0f    
#define CAMERA_DISTANCE_MIN         10.0f   
#define CAMERA_DISTANCE_MAX         60.0f   
#define CAMERA_DISTANCE_DEFAULT     30.0f
#define CAMERA_PITCH_MIN            25.0f   
#define CAMERA_PITCH_MAX            70.0f   
#define CAMERA_PITCH_DEFAULT        45.0f

// ============================================================================
// STRUTTURE
// ============================================================================

typedef enum {
    CAMERA_MODE_FOLLOW,     
    CAMERA_MODE_PAN,        
    CAMERA_MODE_RETURNING   
} CameraMode;

typedef struct {
    // Posizione e orientamento attuali
    vec3 position;          
    vec3 target;            
    vec3 focusPoint;        
    
    // Target values 
    vec3 targetFocusPoint;  
    float targetDistance;   
    float targetPitch;      
    
    // Valori attuali 
    float distance;         
    float pitch;            
    float yaw;              
    
    // Offsets separati
    vec2 panOffset;         // Offset manuale (Middle Mouse)
    
    // --- NUOVO: Peeking State ---
    vec2 peekOffset;        // Offset attuale del cursore (interpolato)
    vec2 targetPeekOffset;  // Dove vuole andare il peeking in base al mouse
    // ----------------------------
    
    // Stato
    CameraMode mode;
    bool isPanning;         
    // bool edgeScrolling;  <-- RIMOSSO
    double lastMouseX;      
    double lastMouseY;
    
    // Cache matrici
    mat4 viewMatrix;
    mat4 projMatrix;
    mat4 viewProjMatrix;
    bool matricesDirty;
    
    vec3 playerPosition;
    
} Camera;

// ... (Il resto delle API rimane uguale)
void camera_init(Camera* cam);
void camera_set_player_position(Camera* cam, vec3 playerPos);
bool camera_handle_input(Camera* cam, Game* g, float dt);
void camera_update(Camera* cam, float dt);
void camera_on_player_move(Camera* cam);
void camera_center_on_player(Camera* cam);
void camera_zoom_in(Camera* cam, float amount);
void camera_zoom_out(Camera* cam, float amount);
void camera_set_zoom(Camera* cam, float distance, float pitch);
void camera_get_view_matrix(Camera* cam, mat4 dest);
void camera_get_proj_matrix(Camera* cam, float aspectRatio, mat4 dest);
void camera_get_view_proj_matrix(Camera* cam, float aspectRatio, mat4 dest);
void camera_get_position(Camera* cam, vec3 dest);
void camera_get_forward(Camera* cam, vec3 dest);
bool camera_is_panning(Camera* cam);
float camera_get_distance(Camera* cam);

#endif // CAMERA_H