/*
 * HYBRID CAMERA SYSTEM - Implementation
 * ======================================
 */

#include "camera.h"
#include <math.h>
#include <stdio.h>

// ============================================================================
// UTILITY
// ============================================================================

static float clampf(float value, float min, float max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

static float lerpf(float a, float b, float t) {
    return a + (b - a) * t;
}

// Lerp per vec3
static void vec3_lerp_smooth(vec3 current, vec3 target, float speed, float dt, vec3 dest) {
    float t = 1.0f - powf(0.5f, dt * speed);
    glm_vec3_lerp(current, target, t, dest);
}

// ============================================================================
// INIZIALIZZAZIONE
// ============================================================================

void camera_init(Camera* cam) {
    // Posizione iniziale
    glm_vec3_zero(cam->position);
    glm_vec3_zero(cam->target);
    glm_vec3_zero(cam->focusPoint);
    glm_vec3_zero(cam->targetFocusPoint);
    glm_vec3_zero(cam->playerPosition);
    
    // Zoom
    cam->distance = CAMERA_DISTANCE_DEFAULT;
    cam->targetDistance = CAMERA_DISTANCE_DEFAULT;
    cam->pitch = CAMERA_PITCH_DEFAULT;
    cam->targetPitch = CAMERA_PITCH_DEFAULT;
    cam->yaw = 0.0f;  // Guardando verso -Z
    
    // Pan
    glm_vec2_zero(cam->panOffset);

    // --- NUOVO: Init Peeking ---
    glm_vec2_zero(cam->peekOffset);
    glm_vec2_zero(cam->targetPeekOffset);
    // ---------------------------
    
    // Stato
    cam->mode = CAMERA_MODE_FOLLOW;
    cam->isPanning = false;
    // cam->edgeScrolling = false; <-- RIMOSSO
    cam->lastMouseX = 0;
    cam->lastMouseY = 0;
    
    // Matrici
    glm_mat4_identity(cam->viewMatrix);
    glm_mat4_identity(cam->projMatrix);
    glm_mat4_identity(cam->viewProjMatrix);
    cam->matricesDirty = true;
    
    printf("[Camera] Initialized - Distance: %.1f, Pitch: %.1f\n", 
           cam->distance, cam->pitch);
}

// ============================================================================
// PLAYER TRACKING
// ============================================================================

void camera_set_player_position(Camera* cam, vec3 playerPos) {
    glm_vec3_copy(playerPos, cam->playerPosition);
}

void camera_on_player_move(Camera* cam) {
    // Quando il player si muove, torna in modalità follow
    if (cam->mode == CAMERA_MODE_PAN) {
        cam->mode = CAMERA_MODE_RETURNING;
    }
}

void camera_center_on_player(Camera* cam) {
    // Reset immediato sul player
    glm_vec2_zero(cam->panOffset);
    cam->mode = CAMERA_MODE_FOLLOW;
    
    // Snap immediato (opzionale - potremmo anche fare lerp veloce)
    glm_vec3_copy(cam->playerPosition, cam->focusPoint);
    glm_vec3_copy(cam->playerPosition, cam->targetFocusPoint);
    
    cam->matricesDirty = true;
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

bool camera_handle_input(Camera* cam, Game* g, float dt) {
    bool inputConsumed = false;
    
    // =========================================================================
    // ZOOM (Rotella mouse) - Sempre attivo
    // =========================================================================
    // Nota: GLFW gestisce lo scroll via callback, qui assumiamo che sia già
    // processato. Per ora usiamo +/- come fallback.
    
    if (glfwGetKey(g->window, GLFW_KEY_EQUAL) == GLFW_PRESS ||
        glfwGetKey(g->window, GLFW_KEY_KP_ADD) == GLFW_PRESS) {
        camera_zoom_in(cam, dt * 20.0f);
    }
    if (glfwGetKey(g->window, GLFW_KEY_MINUS) == GLFW_PRESS ||
        glfwGetKey(g->window, GLFW_KEY_KP_SUBTRACT) == GLFW_PRESS) {
        camera_zoom_out(cam, dt * 20.0f);
    }
    
    // =========================================================================
    // SPACE = Centra su player
    // =========================================================================
    static bool spaceWasPressed = false;
    bool spacePressed = glfwGetKey(g->window, GLFW_KEY_SPACE) == GLFW_PRESS;
    if (spacePressed && !spaceWasPressed) {
        camera_center_on_player(cam);
    }
    spaceWasPressed = spacePressed;
    
    // =========================================================================
    // MIDDLE MOUSE DRAG = Pan manuale
    // =========================================================================
    bool middleDown = glfwGetMouseButton(g->window, GLFW_MOUSE_BUTTON_MIDDLE) == GLFW_PRESS;
    
    if (middleDown) {
        if (!cam->isPanning) {
            // Inizio pan
            cam->isPanning = true;
            cam->lastMouseX = g->mouseX;
            cam->lastMouseY = g->mouseY;
            cam->mode = CAMERA_MODE_PAN;
        } else {
            // Continua pan
            double deltaX = g->mouseX - cam->lastMouseX;
            double deltaY = g->mouseY - cam->lastMouseY;
            
            // Converti movimento mouse in movimento world space
            // Nota: il movimento è invertito (drag left = camera moves right = view moves left)
            float panSpeed = cam->distance * 0.003f;  // Scala con lo zoom
            
            // Calcola direzione destra della camera
            float yawRad = glm_rad(cam->yaw);
            vec3 right = { cosf(yawRad), 0.0f, -sinf(yawRad) };
            vec3 forward = { sinf(yawRad), 0.0f, cosf(yawRad) };
            
            cam->panOffset[0] -= (float)deltaX * panSpeed * right[0] + (float)deltaY * panSpeed * forward[0];
            cam->panOffset[1] -= (float)deltaX * panSpeed * right[2] + (float)deltaY * panSpeed * forward[2];
            
            cam->lastMouseX = g->mouseX;
            cam->lastMouseY = g->mouseY;
            cam->matricesDirty = true;
        }
        inputConsumed = true;
    } else {
        cam->isPanning = false;
    }
    
    // =========================================================================
    // DYNAMIC PEEKING (Sostituisce Edge Scrolling)
    // =========================================================================
    
    // Calcoliamo dove "vuole" andare il peeking in base al mouse.
    // Lo facciamo sempre, a meno che non stiamo draggando manualmente.
    if (!cam->isPanning) {
        // 1. Converti Mouse in coordinate normalizzate (-1 a +1)
        // Nota: Assumo che g->width e g->height siano float o castati
        float ndcX = ((float)g->mouseX / (float)g->width) * 2.0f - 1.0f;
        float ndcY = ((float)g->mouseY / (float)g->height) * 2.0f - 1.0f;
        
        // Clamp per sicurezza (se il mouse esce dalla finestra)
        ndcX = clampf(ndcX, -1.0f, 1.0f);
        ndcY = clampf(ndcY, -1.0f, 1.0f);
        
        // 2. Calcola offset grezzo (Screen Space)
        // Invertiamo o meno gli assi in base a come vuoi il feeling.
        // Solitamente: Mouse Su (Y negativo in screen) -> Camera va in profondità (Z negativo)
        float rawOffsetX = ndcX * CAMERA_PEEK_RANGE;
        float rawOffsetZ = ndcY * CAMERA_PEEK_RANGE; 
        
        // 3. Ruota l'offset in base allo Yaw della camera (World Space alignment)
        // Questo è cruciale: se ruoti la camera, "su" deve seguire la direzione dello sguardo
        float yawRad = glm_rad(cam->yaw);
        float cosY = cosf(yawRad);
        float sinY = sinf(yawRad);
        
        // Rotazione 2D standard:
        // x' = x*cos - z*sin
        // z' = x*sin + z*cos
        cam->targetPeekOffset[0] = rawOffsetX * cosY - rawOffsetZ * sinY;
        cam->targetPeekOffset[1] = rawOffsetX * sinY + rawOffsetZ * cosY;
        
    } else {
        // Se stiamo draggando col tasto centrale, azzeriamo il peeking
        // per evitare conflitti e confusione
        glm_vec2_zero(cam->targetPeekOffset);
    }
    
    // =========================================================================
    // LEASH - Limita distanza dal player
    // =========================================================================
    float panDistSq = cam->panOffset[0] * cam->panOffset[0] + 
                      cam->panOffset[1] * cam->panOffset[1];
    float maxDistSq = CAMERA_LEASH_DISTANCE * CAMERA_LEASH_DISTANCE;
    
    if (panDistSq > maxDistSq) {
        float scale = sqrtf(maxDistSq / panDistSq);
        cam->panOffset[0] *= scale;
        cam->panOffset[1] *= scale;
        cam->matricesDirty = true;
    }
    
    return inputConsumed;
}

// ============================================================================
// ZOOM CONTROL
// ============================================================================

void camera_zoom_in(Camera* cam, float amount) {
    cam->targetDistance -= amount;
    cam->targetDistance = clampf(cam->targetDistance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    
    // Pitch più basso quando si zooma (vista più orizzontale)
    float t = (cam->targetDistance - CAMERA_DISTANCE_MIN) / (CAMERA_DISTANCE_MAX - CAMERA_DISTANCE_MIN);
    cam->targetPitch = lerpf(CAMERA_PITCH_MIN, CAMERA_PITCH_MAX, t);
    
    cam->matricesDirty = true;
}

void camera_zoom_out(Camera* cam, float amount) {
    camera_zoom_in(cam, -amount);
}

void camera_set_zoom(Camera* cam, float distance, float pitch) {
    cam->targetDistance = clampf(distance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    cam->targetPitch = clampf(pitch, CAMERA_PITCH_MIN, CAMERA_PITCH_MAX);
    cam->matricesDirty = true;
}

// ============================================================================
// UPDATE
// ============================================================================

void camera_update(Camera* cam, float dt) {
    // =========================================================================
    // Calcola target focus point
    // =========================================================================
    
    // In modalità RETURNING, riduci gradualmente il pan offset
    if (cam->mode == CAMERA_MODE_RETURNING) {
        float returnSpeed = CAMERA_FOLLOW_SPEED * 2.0f;
        float t = 1.0f - powf(0.5f, dt * returnSpeed);
        
        cam->panOffset[0] = lerpf(cam->panOffset[0], 0.0f, t);
        cam->panOffset[1] = lerpf(cam->panOffset[1], 0.0f, t);
        
        // Se abbastanza vicino, torna in FOLLOW
        if (fabsf(cam->panOffset[0]) < 0.1f && fabsf(cam->panOffset[1]) < 0.1f) {
            cam->panOffset[0] = 0.0f;
            cam->panOffset[1] = 0.0f;
            cam->mode = CAMERA_MODE_FOLLOW;
        }
    }
    
// 1. Aggiorna il Peeking (Interpolazione fluida)
    // Usiamo un lerp indipendente per il peeking (più reattivo del follow, meno del pan)
    float peekT = 1.0f - powf(0.5f, dt * CAMERA_PEEK_SMOOTH);
    cam->peekOffset[0] = lerpf(cam->peekOffset[0], cam->targetPeekOffset[0], peekT);
    cam->peekOffset[1] = lerpf(cam->peekOffset[1], cam->targetPeekOffset[1], peekT);
    
    // 2. Calcola il Target Focus finale
    // Target = Player + Manual Pan (Tasto centrale) + Dynamic Peek (Cursore)
    cam->targetFocusPoint[0] = cam->playerPosition[0] + cam->panOffset[0] + cam->peekOffset[0];
    cam->targetFocusPoint[1] = cam->playerPosition[1]; 
    cam->targetFocusPoint[2] = cam->playerPosition[2] + cam->panOffset[1] + cam->peekOffset[1];
    
    // =========================================================================
    // Smooth interpolation
    // =========================================================================
    
    // Focus point
    vec3_lerp_smooth(cam->focusPoint, cam->targetFocusPoint, CAMERA_FOLLOW_SPEED, dt, cam->focusPoint);
    
    // Distance e Pitch
    float zoomT = 1.0f - powf(0.5f, dt * CAMERA_ZOOM_SPEED);
    cam->distance = lerpf(cam->distance, cam->targetDistance, zoomT);
    cam->pitch = lerpf(cam->pitch, cam->targetPitch, zoomT);
    
    // =========================================================================
    // Calcola posizione camera
    // =========================================================================
    
    float pitchRad = glm_rad(cam->pitch);
    float yawRad = glm_rad(cam->yaw);
    
    // Posizione camera: focus + offset sferico
    cam->position[0] = cam->focusPoint[0] + cam->distance * cosf(pitchRad) * sinf(yawRad);
    cam->position[1] = cam->focusPoint[1] + cam->distance * sinf(pitchRad);
    cam->position[2] = cam->focusPoint[2] + cam->distance * cosf(pitchRad) * cosf(yawRad);
    
    // =========================================================================
    // Offset verticale (mago al 40% dello schermo invece che al centro)
    // =========================================================================
    
    // Sposta il target leggermente avanti rispetto al focus point
    // Questo fa sì che il player appaia più in basso sullo schermo
    float offsetAmount = cam->distance * (0.5f - CAMERA_VERTICAL_OFFSET) * 0.5f;
    
    cam->target[0] = cam->focusPoint[0] - sinf(yawRad) * offsetAmount;
    cam->target[1] = cam->focusPoint[1];
    cam->target[2] = cam->focusPoint[2] - cosf(yawRad) * offsetAmount;
    
    cam->matricesDirty = true;
}

// ============================================================================
// MATRIX GETTERS
// ============================================================================

void camera_get_view_matrix(Camera* cam, mat4 dest) {
    vec3 up = {0.0f, 1.0f, 0.0f};
    glm_lookat(cam->position, cam->target, up, dest);
    glm_mat4_copy(dest, cam->viewMatrix);
}

void camera_get_proj_matrix(Camera* cam, float aspectRatio, mat4 dest) {
    // FOV varia leggermente con lo zoom per effetto più cinematico
    float baseFOV = 45.0f;
    float fovAdjust = (cam->distance - CAMERA_DISTANCE_MIN) / 
                      (CAMERA_DISTANCE_MAX - CAMERA_DISTANCE_MIN) * 10.0f;
    float fov = baseFOV + fovAdjust;
    
    glm_perspective(glm_rad(fov), aspectRatio, 0.1f, 500.0f, dest);
    glm_mat4_copy(dest, cam->projMatrix);
}

void camera_get_view_proj_matrix(Camera* cam, float aspectRatio, mat4 dest) {
    mat4 view, proj;
    camera_get_view_matrix(cam, view);
    camera_get_proj_matrix(cam, aspectRatio, proj);
    glm_mat4_mul(proj, view, dest);
    glm_mat4_copy(dest, cam->viewProjMatrix);
}

void camera_get_position(Camera* cam, vec3 dest) {
    glm_vec3_copy(cam->position, dest);
}

void camera_get_forward(Camera* cam, vec3 dest) {
    glm_vec3_sub(cam->target, cam->position, dest);
    glm_vec3_normalize(dest);
}

// ============================================================================
// UTILITY GETTERS
// ============================================================================

bool camera_is_panning(Camera* cam) {
    return cam->mode == CAMERA_MODE_PAN;
}

float camera_get_distance(Camera* cam) {
    return cam->distance;
}
