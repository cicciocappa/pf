#include "player.h"
#include "asset_manager.h"
#include <stdio.h>
#include <math.h>

/*

// =============================================================
// MINI DEBUG RENDERER (Core Profile Compatible)
// =============================================================
static GLuint debugVAO = 0;
static GLuint debugVBO = 0;
static GLuint debugShader = 0;
static GLint loc_debugVP = -1;
static GLint loc_debugModel = -1;
static GLint loc_debugColor = -1;

GLuint gfx_create_shader_source(const char *vs_src, const char *fs_src)
{

    GLint success;
    char infoLog[512];
    GLuint prog = 0;

    // Vertex Shader
    GLuint vs = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vs, 1, (const char **)&vs_src, NULL);
    glCompileShader(vs);
    glGetShaderiv(vs, GL_COMPILE_STATUS, &success);
    if (!success)
    {

        glDeleteShader(vs);
        return 0;
    }

    // Fragment Shader
    GLuint fs = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fs, 1, (const char **)&fs_src, NULL);
    glCompileShader(fs);
    glGetShaderiv(fs, GL_COMPILE_STATUS, &success);
    if (!success)
    {

        glDeleteShader(vs);
        glDeleteShader(fs);
        return 0;
    }

    // Linking
    prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glLinkProgram(prog);

    glGetProgramiv(prog, GL_LINK_STATUS, &success);
    if (!success)
    {
        glGetProgramInfoLog(prog, 512, NULL, infoLog);
        printf("SHADER LINK ERR: %s\n", infoLog);
        glDeleteProgram(prog);
        prog = 0;
    }

    // Cleanup

    glDeleteShader(vs);
    glDeleteShader(fs);

    return prog;
}

static void init_debug_renderer()
{
    // Shader minimale embedded
    const char *vs_src =
        "#version 330 core\n"
        "layout (location = 0) in vec3 aPos;\n"
        "uniform mat4 uVP;\n"
        "uniform mat4 uModel;\n"
        "void main() { gl_Position = uVP * uModel * vec4(aPos, 1.0); }";

    const char *fs_src =
        "#version 330 core\n"
        "out vec4 FragColor;\n"
        "uniform vec3 uColor;\n"
        "void main() { FragColor = vec4(uColor, 1.0); }";

    debugShader = gfx_create_shader_source(vs_src, fs_src); // Assumo tu abbia una funzione simile, altrimenti usa glCreateShader etc.
    // Se non hai gfx_create_shader_source, dimmelo e ti scrivo la versione GL cruda.

    loc_debugVP = glGetUniformLocation(debugShader, "uVP");
    loc_debugModel = glGetUniformLocation(debugShader, "uModel");
    loc_debugColor = glGetUniformLocation(debugShader, "uColor");

    // Cubo unitario (da -0.5 a 0.5)
    float vertices[] = {
        -0.5f, -0.5f, -0.5f, 0.5f, -0.5f, -0.5f, 0.5f, 0.5f, -0.5f, -0.5f, 0.5f, -0.5f, // Back
        -0.5f, -0.5f, 0.5f, 0.5f, -0.5f, 0.5f, 0.5f, 0.5f, 0.5f, -0.5f, 0.5f, 0.5f,     // Front
        -0.5f, 0.5f, 0.5f, -0.5f, 0.5f, -0.5f, -0.5f, -0.5f, -0.5f, -0.5f, -0.5f, 0.5f, // Left
        0.5f, 0.5f, 0.5f, 0.5f, 0.5f, -0.5f, 0.5f, -0.5f, -0.5f, 0.5f, -0.5f, 0.5f,     // Right
        -0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, -0.5f, -0.5f, 0.5f, -0.5f,     // Top
        -0.5f, -0.5f, 0.5f, 0.5f, -0.5f, 0.5f, 0.5f, -0.5f, -0.5f, -0.5f, -0.5f, -0.5f  // Bottom
    };

    // VBO/VAO setup
    glGenVertexArrays(1, &debugVAO);
    glGenBuffers(1, &debugVBO);

    glBindVertexArray(debugVAO);
    glBindBuffer(GL_ARRAY_BUFFER, debugVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);

    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void *)0);
    glEnableVertexAttribArray(0);

    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindVertexArray(0);
}

void draw_debug_cube(vec3 pos, vec3 color, float scale, mat4 viewProj)
{
    if (debugVAO == 0)
        init_debug_renderer();

    glUseProgram(debugShader);

    mat4 model;
    glm_mat4_identity(model);
    glm_translate(model, pos);
    glm_scale_uni(model, scale);

    glUniformMatrix4fv(loc_debugVP, 1, GL_FALSE, (float *)viewProj);
    glUniformMatrix4fv(loc_debugModel, 1, GL_FALSE, (float *)model);
    glUniform3fv(loc_debugColor, 1, (float *)color);

    glBindVertexArray(debugVAO);
    // Disegna come linee (wireframe) per vedere meglio
    // glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);
    // Disegna 6 facce * 2 triangoli = 12 triangoli? No, array sopra è GL_QUADS like ma OpenGL core vuole Triangles.
    // Per brevità uso GL_POINTS o GL_LINES con indici semplici, ma ecco un fix rapido:
    // Disegno Arrays come GL_LINE_LOOP per ogni faccia se voglio wireframe, ma GL_TRIANGLE_FAN è meglio per cubi solidi veloci.
    // Disegniamo 24 vertici come GL_POINTS per debug estremo o GL_QUADS (se supportato driver)
    // Meglio: facciamo un draw arrays GL_TRIANGLES assumendo indici corretti (sopra ho messo solo vertici raw).
    // Facciamo una draw call semplice che disegna punti grossi.

    // TRUCCO RAPIDO: Disegna punti grossi
    glPointSize(10.0f);
    glDrawArrays(GL_POINTS, 0, 24);
    glPointSize(1.0f);

    glBindVertexArray(0);
}

*/

// ============================================================================
// UTILITY: RAY-TERRAIN INTERSECTION
// ============================================================================

// Raycast iterativo contro heightmap terreno
// Marcia lungo il raggio e trova dove attraversa la superficie
static bool ray_level_intersect(Level *level, vec3 rayOrigin, vec3 rayDir,
                                vec3 outHitPoint)
{
    if (!level)
    {
        // Fallback: intersezione con piano Y=0
        if (fabsf(rayDir[1]) < 0.0001f)
            return false;
        float t = -rayOrigin[1] / rayDir[1];
        if (t < 0.0f)
            return false;

        outHitPoint[0] = rayOrigin[0] + rayDir[0] * t;
        outHitPoint[1] = 0.0f;
        outHitPoint[2] = rayOrigin[2] + rayDir[2] * t;
        return true;
    }

    // Ray marching con step adattivi
    float maxDist = 500.0f;
    float stepSize = 1.0f;

    vec3 pos;
    glm_vec3_copy(rayOrigin, pos);

    float prevY = pos[1];
    float prevTerrainY = level_get_height(level, pos[0], pos[2]);
    bool wasAbove = prevY > prevTerrainY;

    for (float t = 0.0f; t < maxDist; t += stepSize)
    {
        pos[0] = rayOrigin[0] + rayDir[0] * t;
        pos[1] = rayOrigin[1] + rayDir[1] * t;
        pos[2] = rayOrigin[2] + rayDir[2] * t;

        float terrainY = level_get_height(level, pos[0], pos[2]);
        bool isAbove = pos[1] > terrainY;

        // Se attraversiamo la superficie
        if (wasAbove && !isAbove)
        {
            // Raffina con binary search
            float tLow = t - stepSize;
            float tHigh = t;

            for (int i = 0; i < 8; i++)
            {
                float tMid = (tLow + tHigh) * 0.5f;
                pos[0] = rayOrigin[0] + rayDir[0] * tMid;
                pos[1] = rayOrigin[1] + rayDir[1] * tMid;
                pos[2] = rayOrigin[2] + rayDir[2] * tMid;

                float midTerrainY = level_get_height(level, pos[0], pos[2]);

                if (pos[1] > midTerrainY)
                {
                    tLow = tMid;
                }
                else
                {
                    tHigh = tMid;
                }
            }

            // Risultato finale
            float tFinal = (tLow + tHigh) * 0.5f;
            outHitPoint[0] = rayOrigin[0] + rayDir[0] * tFinal;
            outHitPoint[2] = rayOrigin[2] + rayDir[2] * tFinal;
            outHitPoint[1] = level_get_height(level, outHitPoint[0], outHitPoint[2]);

            return true;
        }

        wasAbove = isAbove;
    }

    return false;
}

// Converte coordinate mouse in un raggio world-space
static void screen_to_world_ray(Game *g, mat4 view, mat4 proj,
                                vec3 outOrigin, vec3 outDir)
{
    // 1. Normalizza le coordinate mouse da [0, width] a [-1, 1] (NDC)
    float ndcX = (2.0f * (float)g->mouseX) / (float)g->width - 1.0f;

    // Inversione Y: il mouse (0,0) è in alto a sinistra, l'NDC (0,0) è al centro.
    float ndcY = 1.0f - (2.0f * (float)g->mouseY) / (float)g->height;

    // 2. Prepara i punti per il Near Plane (Z=-1) e Far Plane (Z=1)
    vec4 rayClipNear = {ndcX, ndcY, -1.0f, 1.0f};
    vec4 rayClipFar = {ndcX, ndcY, 1.0f, 1.0f};

    // 3. Inverti la Projection Matrix: Clip Space -> Eye Space
    mat4 invProj;
    glm_mat4_inv(proj, invProj);

    vec4 rayEyeNear, rayEyeFar;
    glm_mat4_mulv(invProj, rayClipNear, rayEyeNear);
    glm_mat4_mulv(invProj, rayClipFar, rayEyeFar);

    // Divisione prospettica
    if (fabsf(rayEyeNear[3]) > 0.0001f)
    {
        glm_vec4_scale(rayEyeNear, 1.0f / rayEyeNear[3], rayEyeNear);
    }
    if (fabsf(rayEyeFar[3]) > 0.0001f)
    {
        glm_vec4_scale(rayEyeFar, 1.0f / rayEyeFar[3], rayEyeFar);
    }

    // 4. Inverti la View Matrix: Eye Space -> World Space
    mat4 invView;
    glm_mat4_inv(view, invView);

    vec4 rayWorldNear, rayWorldFar;
    glm_mat4_mulv(invView, rayEyeNear, rayWorldNear);
    glm_mat4_mulv(invView, rayEyeFar, rayWorldFar);

    // 5. Calcola Origine e Direzione
    // Metodo Robusto: L'origine è la posizione della Camera in World Space.
    // L'origine della camera in Eye Space è (0,0,0,1).
    vec4 cameraOriginEye = {0.0f, 0.0f, 0.0f, 1.0f};
    vec4 cameraWorldPos4;
    glm_mat4_mulv(invView, cameraOriginEye, cameraWorldPos4);

    glm_vec3_copy(cameraWorldPos4, outOrigin);

    // La direzione è il vettore che va da un punto all'altro del raggio (es. Near -> Far)
    vec3 worldDir;
    glm_vec3_sub(rayWorldFar, rayWorldNear, worldDir);
    glm_vec3_normalize_to(worldDir, outDir);
}

// ============================================================================
// INIZIALIZZAZIONE
// ============================================================================

void player_init(Player *p)
{
    // Posizione iniziale
    glm_vec3_zero(p->position);
    p->position[0] = -12.0;
    p->position[2] = -22.0;
    glm_vec3_zero(p->targetPosition);
    p->rotation = 0.0f;
    p->targetRotation = 0.0f;

    // Parametri movimento
    p->walkSpeed = 3.0f;         // m/s
    p->runSpeed = 8.0f;          // m/s
    p->rotationSpeed = 10.0f;    // rad/s (molto veloce per responsive feel)
    p->arrivalThreshold = 0.05f; // 5cm - ridotto per evitare snap visibile

    // Stato
    p->state = PLAYER_STATE_IDLE;
    p->previousState = PLAYER_STATE_IDLE;
    p->hasDestination = false;
    p->isRunning = false;

    // Pathfinding
    p->current_path = NULL;
    p->current_waypoint = 0;

    // Stats
    p->hp = 100;
    p->maxHp = 100;
    p->mana = 50;
    p->maxMana = 50;

    // Animator - collegato allo skeleton globale
    printf("[Player] Initializing animator...\n");
    printf("[Player] g_assets.player.skeleton address: %p\n", (void *)&g_assets.player.skeleton);
    printf("[Player] g_assets.player.skeleton.boneCount: %d\n", g_assets.player.skeleton.boneCount);
    printf("[Player] g_assets.player.skeleton.animationCount: %d\n", g_assets.player.skeleton.animationCount);

    animator_init(&p->animator, &g_assets.player.skeleton);

    printf("[Player] animator.skeleton address: %p\n", (void *)p->animator.skeleton);

    // Avvia animazione Idle
    if (g_assets.player.animIdle >= 0)
    {
        printf("[Player] Playing Idle animation (index %d)...\n", g_assets.player.animIdle);
        animator_play(&p->animator, g_assets.player.animIdle, 0.0f);
        printf("[Player] After play: playing=%d, currentAnim=%d\n",
               p->animator.playing, p->animator.currentAnim);
    }
    else
    {
        printf("[Player] WARNING: No Idle animation found!\n");
    }

    printf("[Player] Initialized at (%.1f, %.1f, %.1f)\n",
           p->position[0], p->position[1], p->position[2]);
}

// ============================================================================
// CAMBIO STATO
// ============================================================================

void player_change_state(Player *p, PlayerState newState)
{
    if (p->state == newState)
        return;

    p->previousState = p->state;
    p->state = newState;

    // Gestione transizioni animazioni
    float blendTime = 0.2f; // 200ms blend di default

    switch (newState)
    {
    case PLAYER_STATE_IDLE:
        if (g_assets.player.animIdle >= 0)
        {
            animator_play(&p->animator, g_assets.player.animIdle, blendTime);
        }
        break;

    case PLAYER_STATE_WALKING:
        if (g_assets.player.animWalk >= 0)
        {
            animator_play(&p->animator, g_assets.player.animWalk, blendTime);
        }
        break;

    case PLAYER_STATE_RUNNING:
        if (g_assets.player.animRun >= 0)
        {
            animator_play(&p->animator, g_assets.player.animRun, blendTime);
        }
        else if (g_assets.player.animWalk >= 0)
        {
            // Fallback a walk se non c'è run
            animator_play(&p->animator, g_assets.player.animWalk, blendTime);
            animator_set_speed(&p->animator, 1.5f); // Più veloce
        }
        break;

    case PLAYER_STATE_ATTACKING:
        if (g_assets.player.animAttack >= 0)
        {
            animator_play(&p->animator, g_assets.player.animAttack, 0.1f);
        }
        break;

    case PLAYER_STATE_DEAD:
        if (g_assets.player.animDeath >= 0)
        {
            animator_play(&p->animator, g_assets.player.animDeath, 0.1f);
        }
        break;
    }

    printf("[Player] State: %d -> %d\n", p->previousState, newState);
}

// ============================================================================
// INPUT
// ============================================================================

void player_handle_input(Player *p, Game *g, mat4 view, mat4 proj, Level *level)
{
    // Controlla se stiamo correndo (Shift)
    p->isRunning = (glfwGetKey(g->window, GLFW_KEY_LEFT_SHIFT) == GLFW_PRESS);

    // Click sinistro: movimento
    if (g->mouseLeftDown)
    {
        g->mouseLeftDown = 0; // Consuma il click

        // Ray casting
        vec3 rayOrigin, rayDir;
        screen_to_world_ray(g, view, proj, rayOrigin, rayDir);

        // Intersezione con terreno
        vec3 hitPoint;
        if (ray_level_intersect(level, rayOrigin, rayDir, hitPoint))
        {
            // Verifica se il punto è camminabile
            if (!level || level_is_walkable(level, hitPoint[0], hitPoint[2]))
            {
                // Richiedi path tramite pathfinding
                Path* path = pathfinding_find_path(level, p->position, hitPoint, -1);

                if (path && path->waypoint_count > 0) {
                    player_set_path(p, path);
                    printf("[Player] Pathfinding: Found path with %d waypoints to (%.1f, %.1f, %.1f)\n",
                           path->waypoint_count, hitPoint[0], hitPoint[1], hitPoint[2]);
                } else {
                    printf("[Player] Pathfinding: No path found to target!\n");
                    // Libera path se allocation fallita
                    if (path) path_free(path);
                }
            }
            else
            {
                printf("[Player] Target not walkable!\n");
            }
        }
    }

    // Click destro: attacco (futuro)
    if (g->mouseRightDown)
    {
        g->mouseRightDown = 0;
        printf("[Player] Attack!\n");
        // TODO: Implementare
    }

    // Tasto S: Stop immediato
    if (glfwGetKey(g->window, GLFW_KEY_S) == GLFW_PRESS)
    {
        player_stop(p);
    }
}

// ============================================================================
// UPDATE
// ============================================================================

void player_update(Player *p, float dt, Level *level)
{
    // Se non abbiamo path o waypoint, resta in idle
    if (!p->current_path || p->current_waypoint >= p->current_path->waypoint_count)
    {
        if (p->state != PLAYER_STATE_IDLE && p->state != PLAYER_STATE_DEAD)
        {
            player_change_state(p, PLAYER_STATE_IDLE);
        }
        // Aggiorna comunque l'altezza Y
        if (level)
        {
            p->position[1] = level_get_height(level, p->position[0], p->position[2]);
        }
        // Update animazione DOPO il possibile cambio stato
        animator_update(&p->animator, dt);
        return;
    }

    // Prendi il prossimo waypoint come target
    vec3* waypoint = &p->current_path->waypoints[p->current_waypoint];

    // Calcola vettore verso waypoint corrente (solo XZ)
    vec3 toTarget;
    toTarget[0] = (*waypoint)[0] - p->position[0];
    toTarget[1] = 0.0f;
    toTarget[2] = (*waypoint)[2] - p->position[2];

    float distance = sqrtf(toTarget[0] * toTarget[0] + toTarget[2] * toTarget[2]);

    // Siamo arrivati al waypoint corrente?
    if (distance < p->arrivalThreshold)
    {
        // Passa al prossimo waypoint
        p->current_waypoint++;

        // Se era l'ultimo waypoint, fermati
        if (p->current_waypoint >= p->current_path->waypoint_count) {
            p->hasDestination = false;
            player_clear_path(p);
            // Aggiorna altezza Y
            if (level)
            {
                p->position[1] = level_get_height(level, p->position[0], p->position[2]);
            }
            // Update animazione DOPO il cambio stato per iniziare il blend subito
            animator_update(&p->animator, dt);
            return;
        }

        // Aggiorna altezza Y e continua verso il prossimo waypoint
        if (level)
        {
            p->position[1] = level_get_height(level, p->position[0], p->position[2]);
        }
        // Non return, continua il movimento verso il prossimo waypoint nello stesso frame

        // Ricalcola verso il nuovo waypoint
        waypoint = &p->current_path->waypoints[p->current_waypoint];
        toTarget[0] = (*waypoint)[0] - p->position[0];
        toTarget[1] = 0.0f;
        toTarget[2] = (*waypoint)[2] - p->position[2];
        distance = sqrtf(toTarget[0] * toTarget[0] + toTarget[2] * toTarget[2]);
    }

    // Normalizza direzione
    vec3 direction;
    direction[0] = toTarget[0] / distance;
    direction[1] = 0.0f;
    direction[2] = toTarget[2] / distance;

    // Calcola rotazione target (atan2 per Y-up)
    p->targetRotation = atan2f(direction[0], direction[2]);

    // Smooth rotation (interpola verso target)
    float rotDiff = p->targetRotation - p->rotation;

    // Normalizza differenza angolare a [-PI, PI]
    while (rotDiff > GLM_PI)
        rotDiff -= 2.0f * GLM_PI;
    while (rotDiff < -GLM_PI)
        rotDiff += 2.0f * GLM_PI;

    float maxRotation = p->rotationSpeed * dt;
    if (fabsf(rotDiff) < maxRotation)
    {
        p->rotation = p->targetRotation;
    }
    else
    {
        p->rotation += (rotDiff > 0 ? maxRotation : -maxRotation);
    }

    // Normalizza rotazione a [0, 2*PI]
    while (p->rotation < 0)
        p->rotation += 2.0f * GLM_PI;
    while (p->rotation >= 2.0f * GLM_PI)
        p->rotation -= 2.0f * GLM_PI;

    // Scegli velocità base
    float baseSpeed = p->isRunning ? p->runSpeed : p->walkSpeed;

    // Modifica velocità in base alla pendenza (opzionale)
    float currentSpeed = baseSpeed;
    // Dentro player_update o dove gestisci il movimento
    if (level)
    {
        vec3 normal;
        level_get_normal(level, p->position[0], p->position[2], normal);

        // Proiezione del vettore movimento sulla normale del terreno
        // slopeFactor < 0: SALITA (Normale punta contro il movimento)
        // slopeFactor > 0: DISCESA (Normale punta verso il movimento)
        // slopeFactor ~ 0: PIANURA
        float slopeFactor = direction[0] * normal[0] + direction[2] * normal[2];

        // --- DEBUG SETTINGS (ESAGERATI) ---
        // Valori bilanciati per Gameplay Strategico
        float uphillPenalty = 0.8f; // Rallenta, ma non ferma
        float downhillBonus = 0.4f; // Accelera leggermente, mantiene controllo

        // Limiti (Clamps)
        float minSpeedClamp = 0.6f;  // Mai sotto il 60% della velocità (evita frustrazione)
        float maxSpeedClamp = 1.25f; // Mai sopra il 125% (evita animazioni "pazze")

        float speedMultiplier = 1.0f;

        if (slopeFactor < 0)
        {
            // SALITA: slopeFactor è negativo (es. -0.5).
            // Moltiplichiamo per penalty: 1.0 + (-0.5 * 2.0) = 0.0 (Fermo!)
            speedMultiplier = 1.0f + (slopeFactor * uphillPenalty);
        }
        else
        {
            // Discesa
            if (slopeFactor > 0.6f)
            {
                // Discesa troppo ripida! Rallenta per sicurezza (frena)
                speedMultiplier = 1.0f - ((slopeFactor - 0.6f) * 2.0f);
            }
            else
            {
                // Discesa dolce: corri
                speedMultiplier = 1.0f + (slopeFactor * downhillBonus);
            }
        }

        // Clamp di sicurezza per il debug
        // Non permettiamo al player di fermarsi del tutto (0.1) o volare via (3.0)
        if (speedMultiplier < minSpeedClamp)
            speedMultiplier = minSpeedClamp;
        if (speedMultiplier > maxSpeedClamp)
            speedMultiplier = maxSpeedClamp;

        currentSpeed = baseSpeed * speedMultiplier;

        // Stampa di debug per vedere i numeri in tempo reale
        if (p->state == PLAYER_STATE_WALKING)
        {
            printf("[PHYSICS] Slope: %.2f | SpeedMult: %.2f | State: %s\n",
                   slopeFactor,
                   speedMultiplier,
                   (slopeFactor < -0.1f) ? "UPHILL" : (slopeFactor > 0.1f) ? "DOWNHILL"
                                                                           : "FLAT");
        }
    }

    // Muovi
    float moveDistance = currentSpeed * dt;
    if (moveDistance > distance)
    {
        moveDistance = distance; // Non superare la destinazione
    }

    // Nuova posizione XZ
    float newX = p->position[0] + direction[0] * moveDistance;
    float newZ = p->position[2] + direction[2] * moveDistance;

    // Verifica walkability prima di muovere
    if (level)
    {
        if (level_is_walkable(level, newX, newZ))
        {
            p->position[0] = newX;
            p->position[2] = newZ;
            p->position[1] = level_get_height(level, newX, newZ);
        }
        else
        {
            // Bloccato! Cerca di scivolare lungo l'ostacolo
            // Prova solo X
            if (level_is_walkable(level, newX, p->position[2]))
            {
                p->position[0] = newX;
                p->position[1] = level_get_height(level, p->position[0], p->position[2]);
            }
            // Prova solo Z
            else if (level_is_walkable(level, p->position[0], newZ))
            {
                p->position[2] = newZ;
                p->position[1] = level_get_height(level, p->position[0], p->position[2]);
            }
            // Completamente bloccato - fermati
            else
            {
                p->hasDestination = false;
                player_change_state(p, PLAYER_STATE_IDLE);
                animator_update(&p->animator, dt);
                return;
            }
        }
    }
    else
    {
        p->position[0] = newX;
        p->position[2] = newZ;
        p->position[1] = 0.0f;
    }

    // Aggiorna stato animazione
    PlayerState targetState = p->isRunning ? PLAYER_STATE_RUNNING : PLAYER_STATE_WALKING;
    if (p->state != targetState)
    {
        player_change_state(p, targetState);
    }

    // Update animazione DOPO eventuali cambi stato
    animator_update(&p->animator, dt);
}

// ============================================================================
// PATHFINDING
// ============================================================================

void player_set_path(Player* p, Path* path) {
    if (!p) return;

    // Libera path precedente se esiste
    if (p->current_path) {
        path_free(p->current_path);
    }

    // Imposta nuovo path
    p->current_path = path;
    p->current_waypoint = 0;
    p->hasDestination = (path != NULL && path->waypoint_count > 0);

    if (p->hasDestination) {
        printf("[Player] Path set: %d waypoints\n", path->waypoint_count);
    }
}

void player_clear_path(Player* p) {
    if (!p) return;

    if (p->current_path) {
        path_free(p->current_path);
        p->current_path = NULL;
    }

    p->current_waypoint = 0;
    p->hasDestination = false;

    // Ferma il player
    player_change_state(p, PLAYER_STATE_IDLE);
}

// ============================================================================
// RENDERING
// ============================================================================

void player_draw(Player *p, mat4 viewProj)
{
    // Debug: stampa posizione ogni tanto
    static int frameCount = 0;
    if (frameCount++ % 120 == 0)
    { // Ogni ~2 secondi a 60fps
        printf("[Player] Pos: (%.2f, %.2f, %.2f) State: %d\n",
               p->position[0], p->position[1], p->position[2], p->state);
    }

    // Costruisci model matrix
    mat4 model;
    glm_mat4_identity(model);

    // Traslazione
    glm_translate(model, p->position);

    // Rotazione Y
    glm_rotate_y(model, p->rotation, model);

    // Scala - Il modello è stato esportato in centimetri (scala ~0.01 nelle bone matrices)
    // Quindi dobbiamo scalare di 100x per avere dimensioni corrette in metri
    // float scale = 100.0f;
    // glm_scale_uni(model, scale);

    // Render con skeletal system
    skinned_mesh_render(&g_assets.player.mesh,
                        &g_assets.player.skeleton,
                        model, viewProj);
}

// ============================================================================
// UTILITY
// ============================================================================

void player_set_position(Player *p, float x, float z)
{
    p->position[0] = x;
    p->position[1] = 0.0f; // Sarà aggiornata in update con terrain
    p->position[2] = z;
    p->hasDestination = false;
}

void player_move_to(Player *p, float x, float z)
{
    p->targetPosition[0] = x;
    p->targetPosition[1] = 0.0f; // Sarà aggiornata nel picking
    p->targetPosition[2] = z;
    p->hasDestination = true;
}

void player_stop(Player *p)
{
    p->hasDestination = false;
    glm_vec3_copy(p->position, p->targetPosition);
}

bool player_is_moving(Player *p)
{
    return p->hasDestination &&
           (p->state == PLAYER_STATE_WALKING || p->state == PLAYER_STATE_RUNNING);
}

// ============================================================================
// FOOT IK
// ============================================================================

bool player_setup_foot_ik(Player *p,
                          const char *leftThigh, const char *leftShin, const char *leftFoot,
                          const char *rightThigh, const char *rightShin, const char *rightFoot)
{
    bool success = foot_ik_config_setup(&p->footIK, &g_assets.player.skeleton,
                                        leftThigh, leftShin, leftFoot,
                                        rightThigh, rightShin, rightFoot);

    if (success)
    {
        // Set reasonable defaults
        p->footIK.footHeightOffset = 0.05f; // 5cm above ground for ankle bone
        p->footIK.ikBlend = 1.0f;
        p->footIK.enabled = false; // Disabled by default, user must enable
        printf("[Player] Foot IK configured successfully\n");
    }

    return success;
}

void player_set_foot_ik_enabled(Player *p, bool enabled)
{
    p->footIK.enabled = enabled;
    printf("[Player] Foot IK %s\n", enabled ? "enabled" : "disabled");
}

void player_draw_with_ik(Player *p, mat4 viewProj, Level *level)
{
    (void)level;
    player_draw(p, viewProj);
}
