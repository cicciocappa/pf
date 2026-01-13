/*
 * SKELETAL ANIMATION SYSTEM - Implementazione cglm nativa
 * ========================================================
 */

#include "skeletal.h"
#include "../gfx.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// ============================================================================
// SKELETON
// ============================================================================

bool skeleton_load(Skeleton* skel, const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) {
        printf("ERROR: Cannot open skeleton file: %s\n", path);
        return false;
    }
    
    // Leggi header
    char magic[4];
    fread(magic, 1, 4, f);
    if (memcmp(magic, "SKEL", 4) != 0) {
        printf("ERROR: Invalid skeleton file format\n");
        fclose(f);
        return false;
    }
    
    // Leggi bone count
    fread(&skel->boneCount, sizeof(int), 1, f);
    if (skel->boneCount > MAX_BONES) {
        printf("ERROR: Too many bones (%d > %d)\n", skel->boneCount, MAX_BONES);
        fclose(f);
        return false;
    }
    
    // Leggi bones
    for (int i = 0; i < skel->boneCount; i++) {
        Bone* b = &skel->bones[i];
        fread(b->name, 1, 32, f);
        fread(&b->parentIndex, sizeof(int), 1, f);
        fread(b->inverseBindPose, sizeof(float), 16, f);
        fread(b->localBind.position, sizeof(float), 3, f);
        fread(b->localBind.rotation, sizeof(float), 4, f);
        fread(b->localBind.scale, sizeof(float), 3, f);
    }
    
    // Leggi animation count
    fread(&skel->animationCount, sizeof(int), 1, f);
    if (skel->animationCount > MAX_ANIMATIONS) {
        printf("WARNING: Too many animations, loading first %d\n", MAX_ANIMATIONS);
        skel->animationCount = MAX_ANIMATIONS;
    }
    
    // Leggi animations
    for (int a = 0; a < skel->animationCount; a++) {
        Animation* anim = &skel->animations[a];
        fread(anim->name, 1, 32, f);
        fread(&anim->duration, sizeof(float), 1, f);
        fread(&anim->loop, sizeof(bool), 1, f);
        fread(&anim->keyframeCount, sizeof(int), 1, f);
        
        if (anim->keyframeCount > MAX_KEYFRAMES) {
            printf("WARNING: Animation '%s' has too many keyframes\n", anim->name);
            anim->keyframeCount = MAX_KEYFRAMES;
        }
        
        anim->keyframes = malloc(anim->keyframeCount * sizeof(Keyframe));
        
        for (int k = 0; k < anim->keyframeCount; k++) {
            Keyframe* kf = &anim->keyframes[k];
            fread(&kf->time, sizeof(float), 1, f);
            
            for (int b = 0; b < skel->boneCount; b++) {
                fread(kf->transforms[b].position, sizeof(float), 3, f);
                fread(kf->transforms[b].rotation, sizeof(float), 4, f);
                fread(kf->transforms[b].scale, sizeof(float), 3, f);
            }
        }
    }
    
    fclose(f);
    
    // Inizializza matrici a identity
    for (int i = 0; i < MAX_BONES; i++) {
        glm_mat4_identity(skel->globalTransforms[i]);
        glm_mat4_identity(skel->finalMatrices[i]);
    }
    
    printf("Loaded skeleton: %d bones, %d animations\n", skel->boneCount, skel->animationCount);
    
    // Debug: stampa i nomi di tutte le animazioni
    printf("Available animations:\n");
    for (int i = 0; i < skel->animationCount; i++) {
        printf("  [%d] \"%s\" (%.2fs, %s)\n",
               i,
               skel->animations[i].name,
               skel->animations[i].duration,
               skel->animations[i].loop ? "loop" : "once");
    }

    // Debug: stampa i nomi di tutte le ossa
    printf("Bone hierarchy:\n");
    for (int i = 0; i < skel->boneCount; i++) {
        const char* parentName = (skel->bones[i].parentIndex >= 0)
            ? skel->bones[skel->bones[i].parentIndex].name
            : "ROOT";
        printf("  [%2d] %-24s <- %s\n",
               i,
               skel->bones[i].name,
               parentName);
    }

    return true;
}

void skeleton_free(Skeleton* skel) {
    for (int i = 0; i < skel->animationCount; i++) {
        free(skel->animations[i].keyframes);
        skel->animations[i].keyframes = NULL;
    }
    skel->boneCount = 0;
    skel->animationCount = 0;
}

int skeleton_find_animation(Skeleton* skel, const char* name) {
    for (int i = 0; i < skel->animationCount; i++) {
        if (strcmp(skel->animations[i].name, name) == 0) {
            return i;
        }
    }
    return -1;
}

int skeleton_find_bone(Skeleton* skel, const char* name) {
    for (int i = 0; i < skel->boneCount; i++) {
        if (strcmp(skel->bones[i].name, name) == 0) {
            return i;
        }
    }
    return -1;
}

// ============================================================================
// ANIMATOR
// ============================================================================

void animator_init(Animator* anim, Skeleton* skeleton) {
    anim->skeleton = skeleton;
    anim->currentAnim = -1;
    anim->currentTime = 0.0f;
    anim->speed = 1.0f;
    anim->blendAnim = -1;
    anim->blendAnimTime = 0.0f;
    anim->blendTime = 0.0f;
    anim->blendDuration = 0.0f;
    anim->playing = false;
    anim->finished = false;
}

void animator_play(Animator* anim, int animIndex, float blendTime) {
    if (animIndex < 0 || animIndex >= anim->skeleton->animationCount) {
        printf("ERROR: Invalid animation index %d\n", animIndex);
        return;
    }
    
    if (anim->currentAnim >= 0 && blendTime > 0.0f) {
        anim->blendAnim = anim->currentAnim;
        anim->blendAnimTime = anim->currentTime;
        anim->blendTime = 0.0f;
        anim->blendDuration = blendTime;
    } else {
        anim->blendAnim = -1;
    }
    
    anim->currentAnim = animIndex;
    anim->currentTime = 0.0f;
    anim->playing = true;
    anim->finished = false;
}

void animator_play_name(Animator* anim, const char* name, float blendTime) {
    int idx = skeleton_find_animation(anim->skeleton, name);
    if (idx >= 0) {
        animator_play(anim, idx, blendTime);
    } else {
        printf("WARNING: Animation '%s' not found\n", name);
    }
}

void animator_stop(Animator* anim) {
    anim->playing = false;
}

void animator_set_speed(Animator* anim, float speed) {
    anim->speed = speed;
}

static void sample_animation(Skeleton* skel, Animation* anim, float time, BoneTransform* outTransforms) {
    int kf0 = 0;
    int kf1 = 0;
    
    for (int i = 0; i < anim->keyframeCount - 1; i++) {
        if (time >= anim->keyframes[i].time && time < anim->keyframes[i + 1].time) {
            kf0 = i;
            kf1 = i + 1;
            break;
        }
    }
    
    if (time >= anim->keyframes[anim->keyframeCount - 1].time) {
        kf0 = kf1 = anim->keyframeCount - 1;
    }
    
    float t = 0.0f;
    if (kf0 != kf1) {
        float t0 = anim->keyframes[kf0].time;
        float t1 = anim->keyframes[kf1].time;
        t = (time - t0) / (t1 - t0);
    }
    
    Keyframe* frame0 = &anim->keyframes[kf0];
    Keyframe* frame1 = &anim->keyframes[kf1];
    
    for (int i = 0; i < skel->boneCount; i++) {
        bone_transform_lerp(&frame0->transforms[i], &frame1->transforms[i], t, &outTransforms[i]);
    }
}

static void calculate_bone_matrices(Skeleton* skel, BoneTransform* transforms) {
    for (int i = 0; i < skel->boneCount; i++) {
        mat4 localMatrix;
        bone_transform_to_mat4(&transforms[i], localMatrix);
        
        int parentIdx = skel->bones[i].parentIndex;
        if (parentIdx >= 0) {
            glm_mat4_mul(skel->globalTransforms[parentIdx], localMatrix, skel->globalTransforms[i]);
        } else {
            glm_mat4_copy(localMatrix, skel->globalTransforms[i]);
        }
        
        glm_mat4_mul(skel->globalTransforms[i], skel->bones[i].inverseBindPose, skel->finalMatrices[i]);
    }
}

// Recalculate bone matrices (same as calculate_bone_matrices but exposed for IK)
static void recalculate_bone_matrices(Skeleton* skel, BoneTransform* transforms) {
    for (int i = 0; i < skel->boneCount; i++) {
        mat4 localMatrix;
        bone_transform_to_mat4(&transforms[i], localMatrix);

        int parentIdx = skel->bones[i].parentIndex;
        if (parentIdx >= 0) {
            glm_mat4_mul(skel->globalTransforms[parentIdx], localMatrix, skel->globalTransforms[i]);
        } else {
            glm_mat4_copy(localMatrix, skel->globalTransforms[i]);
        }

        glm_mat4_mul(skel->globalTransforms[i], skel->bones[i].inverseBindPose, skel->finalMatrices[i]);
    }
}

void animator_update(Animator* anim, float dt) {
    // Debug: stampa stato animator ogni tanto
    static int debugCounter = 0;
    /*    
    if (debugCounter++ % 60 == 0) {
        printf("[Animator] playing=%d, currentAnim=%d, time=%.2f, speed=%.2f\n",
               anim->playing, anim->currentAnim, anim->currentTime, anim->speed);
    }
    */
    if (!anim->playing || anim->currentAnim < 0) {
        /*        
        if (debugCounter % 60 == 1) {
            printf("[Animator] SKIPPING update (not playing or no anim)\n");
        }
        */
        return;
    }
    
    Skeleton* skel = anim->skeleton;
    Animation* currentAnimation = &skel->animations[anim->currentAnim];
    
    anim->currentTime += dt * anim->speed;
    
    if (anim->currentTime >= currentAnimation->duration) {
        if (currentAnimation->loop) {
            anim->currentTime = fmodf(anim->currentTime, currentAnimation->duration);
        } else {
            anim->currentTime = currentAnimation->duration;
            anim->finished = true;
            anim->playing = false;
        }
    }
    
    BoneTransform currentTransforms[MAX_BONES];
    sample_animation(skel, currentAnimation, anim->currentTime, currentTransforms);
    
    if (anim->blendAnim >= 0 && anim->blendDuration > 0.0f) {
        anim->blendTime += dt;
        float blendFactor = anim->blendTime / anim->blendDuration;
        
        if (blendFactor >= 1.0f) {
            anim->blendAnim = -1;
        } else {
            BoneTransform prevTransforms[MAX_BONES];
            Animation* prevAnimation = &skel->animations[anim->blendAnim];
            
            float prevTime = anim->blendAnimTime;
            
            if (prevAnimation->loop) {
                prevTime += anim->blendTime * anim->speed;
                prevTime = fmodf(prevTime, prevAnimation->duration);
            }
            
            sample_animation(skel, prevAnimation, prevTime, prevTransforms);
            
            for (int i = 0; i < skel->boneCount; i++) {
                bone_transform_lerp(&prevTransforms[i], &currentTransforms[i], blendFactor, &currentTransforms[i]);
            }
        }
    }
    
    calculate_bone_matrices(skel, currentTransforms);
    
    // Debug: stampa prima matrice finale per verificare che non sia identity o NaN
    /*    
    if (debugCounter % 60 == 0 && skel->boneCount > 0) {
        mat4* m = &skel->finalMatrices[0];
        printf("[Animator] finalMatrix[0] diagonal: %.3f, %.3f, %.3f, %.3f\n",
               (*m)[0][0], (*m)[1][1], (*m)[2][2], (*m)[3][3]);
    }
    */
}

void animator_get_bone_matrix(Animator* anim, int boneIndex, mat4 dest) {
    if (boneIndex < 0 || boneIndex >= anim->skeleton->boneCount) {
        glm_mat4_identity(dest);
        return;
    }
    glm_mat4_copy(anim->skeleton->globalTransforms[boneIndex], dest);
}

// ============================================================================
// SKINNED MESH
// ============================================================================

bool skinned_mesh_load(SkinnedMesh* mesh, const char* meshPath, const char* texturePath) {
    FILE* f = fopen(meshPath, "rb");
    if (!f) {
        printf("ERROR: Cannot open mesh file: %s\n", meshPath);
        return false;
    }
    
    char magic[4];
    fread(magic, 1, 4, f);
    if (memcmp(magic, "SMSH", 4) != 0) {
        printf("ERROR: Invalid skinned mesh format\n");
        fclose(f);
        return false;
    }
    
    int vertexCount, indexCount;
    fread(&vertexCount, sizeof(int), 1, f);
    fread(&indexCount, sizeof(int), 1, f);
    
    SkinnedVertex* vertices = malloc(vertexCount * sizeof(SkinnedVertex));
    for (int i = 0; i < vertexCount; i++) {
        SkinnedVertex* v = &vertices[i];
        fread(v->position, sizeof(float), 3, f);
        fread(v->normal, sizeof(float), 3, f);
        fread(v->texCoord, sizeof(float), 2, f);
        fread(v->boneIDs, sizeof(int), MAX_BONE_INFLUENCE, f);
        fread(v->boneWeights, sizeof(float), MAX_BONE_INFLUENCE, f);
    }
    
    unsigned short* indices = malloc(indexCount * sizeof(unsigned short));
    fread(indices, sizeof(unsigned short), indexCount, f);
    
    fclose(f);
    
    mesh->indexCount = indexCount;
    
    glGenVertexArrays(1, &mesh->vao);
    glGenBuffers(1, &mesh->vbo);
    glGenBuffers(1, &mesh->ebo);
    
    glBindVertexArray(mesh->vao);
    
    glBindBuffer(GL_ARRAY_BUFFER, mesh->vbo);
    glBufferData(GL_ARRAY_BUFFER, vertexCount * sizeof(SkinnedVertex), vertices, GL_STATIC_DRAW);
    
    // Position
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(SkinnedVertex), 
                          (void*)offsetof(SkinnedVertex, position));
    glEnableVertexAttribArray(0);
    
    // Normal
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(SkinnedVertex), 
                          (void*)offsetof(SkinnedVertex, normal));
    glEnableVertexAttribArray(1);
    
    // TexCoord
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(SkinnedVertex), 
                          (void*)offsetof(SkinnedVertex, texCoord));
    glEnableVertexAttribArray(2);
    
    // BoneIDs
    glVertexAttribIPointer(3, 4, GL_INT, sizeof(SkinnedVertex), 
                           (void*)offsetof(SkinnedVertex, boneIDs));
    glEnableVertexAttribArray(3);
    
    // BoneWeights
    glVertexAttribPointer(4, 4, GL_FLOAT, GL_FALSE, sizeof(SkinnedVertex), 
                          (void*)offsetof(SkinnedVertex, boneWeights));
    glEnableVertexAttribArray(4);
    
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, mesh->ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, indexCount * sizeof(unsigned short), indices, GL_STATIC_DRAW);
    
    glBindVertexArray(0);
    
    free(vertices);
    free(indices);
    
    mesh->texture = gfx_load_texture(texturePath);
    skinned_mesh_init_shader(mesh);
    
    printf("Loaded skinned mesh: %d vertices, %d indices\n", vertexCount, indexCount);
    printf("  VAO: %u, VBO: %u, EBO: %u\n", mesh->vao, mesh->vbo, mesh->ebo);
    printf("  Shader: %u, Texture: %u\n", mesh->shader, mesh->texture);
    return true;
}

void skinned_mesh_init_shader(SkinnedMesh* mesh) {
    mesh->shader = gfx_create_shader("shaders/skinned.vs", "shaders/skinned.fs");
    
    mesh->loc_uVP = glGetUniformLocation(mesh->shader, "uVP");
    mesh->loc_uModel = glGetUniformLocation(mesh->shader, "uModel");
    mesh->loc_uBoneMatrices = glGetUniformLocation(mesh->shader, "uBoneMatrices");
    mesh->loc_uTexture = glGetUniformLocation(mesh->shader, "uTexture");
}

void skinned_mesh_render(SkinnedMesh* mesh, Skeleton* skeleton, mat4 model, mat4 viewProj) {
    if (mesh->shader == 0 || mesh->vao == 0) {
        printf("[SkinnedMesh] Cannot render: shader=%u, vao=%u\n", mesh->shader, mesh->vao);
        return;
    }
    
    glUseProgram(mesh->shader);
    
    glUniformMatrix4fv(mesh->loc_uVP, 1, GL_FALSE, (float*)viewProj);
    glUniformMatrix4fv(mesh->loc_uModel, 1, GL_FALSE, (float*)model);
    glUniformMatrix4fv(mesh->loc_uBoneMatrices, skeleton->boneCount, GL_FALSE, 
                       (float*)skeleton->finalMatrices);
    
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, mesh->texture);
    glUniform1i(mesh->loc_uTexture, 0);
    
    glBindVertexArray(mesh->vao);
    glDrawElements(GL_TRIANGLES, mesh->indexCount, GL_UNSIGNED_SHORT, 0);
    glBindVertexArray(0);
}

void skinned_mesh_free(SkinnedMesh* mesh) {
    glDeleteVertexArrays(1, &mesh->vao);
    glDeleteBuffers(1, &mesh->vbo);
    glDeleteBuffers(1, &mesh->ebo);
    glDeleteTextures(1, &mesh->texture);
    glDeleteProgram(mesh->shader);
}

// ============================================================================
// FOOT IK SYSTEM
// ============================================================================

bool foot_ik_config_setup(FootIKConfig* ik, Skeleton* skel,
                          const char* leftThigh, const char* leftShin, const char* leftFoot,
                          const char* rightThigh, const char* rightShin, const char* rightFoot) {
    memset(ik, 0, sizeof(FootIKConfig));

    ik->leftThighIdx = skeleton_find_bone(skel, leftThigh);
    ik->leftShinIdx = skeleton_find_bone(skel, leftShin);
    ik->leftFootIdx = skeleton_find_bone(skel, leftFoot);
    ik->rightThighIdx = skeleton_find_bone(skel, rightThigh);
    ik->rightShinIdx = skeleton_find_bone(skel, rightShin);
    ik->rightFootIdx = skeleton_find_bone(skel, rightFoot);

    ik->footHeightOffset = 0.0f;
    ik->ikBlend = 1.0f;
    ik->enabled = false;

    bool allFound = (ik->leftThighIdx >= 0 && ik->leftShinIdx >= 0 && ik->leftFootIdx >= 0 &&
                     ik->rightThighIdx >= 0 && ik->rightShinIdx >= 0 && ik->rightFootIdx >= 0);

    if (allFound) {
        printf("[FootIK] Bones found: L(%d,%d,%d) R(%d,%d,%d)\n",
               ik->leftThighIdx, ik->leftShinIdx, ik->leftFootIdx,
               ik->rightThighIdx, ik->rightShinIdx, ik->rightFootIdx);

        // Initialize TwoBoneIK chains with cached bone lengths
        two_bone_ik_init(&ik->leftLeg, skel, ik->leftThighIdx, ik->leftShinIdx, ik->leftFootIdx);
        two_bone_ik_init(&ik->rightLeg, skel, ik->rightThighIdx, ik->rightShinIdx, ik->rightFootIdx);

        printf("[FootIK] Left leg initialized\n");
        printf("[FootIK] Right leg initialized\n");
    } else {
        printf("[FootIK] WARNING: Some bones not found!\n");
        printf("  Left:  Thigh=%d, Shin=%d, Foot=%d\n",
               ik->leftThighIdx, ik->leftShinIdx, ik->leftFootIdx);
        printf("  Right: Thigh=%d, Shin=%d, Foot=%d\n",
               ik->rightThighIdx, ik->rightShinIdx, ik->rightFootIdx);
    }

    return allFound;
}

// ============================================================================
// NEW TWO-BONE IK SYSTEM (Robust Geometric Approach)
// ============================================================================

void two_bone_ik_init(TwoBoneIK* ik, Skeleton* skel, int hipIdx, int kneeIdx, int footIdx) {
    memset(ik, 0, sizeof(TwoBoneIK));

    ik->hipIdx = hipIdx;
    ik->kneeIdx = kneeIdx;
    ik->footIdx = footIdx;
    ik->weight = 1.0f;
    ik->initialized = false;

    // Default pole vector (Z forward - Mixamo standard)
    glm_vec3_copy((vec3){0.0f, 1.0f, 0.0f}, ik->poleVector);

    if (hipIdx < 0 || kneeIdx < 0 || footIdx < 0) {
        printf("[TwoBoneIK] ERROR: Invalid bone indices (hip=%d, knee=%d, foot=%d)\n",
               hipIdx, kneeIdx, footIdx);
        return;
    }

    // Calcola le lunghezze dalla bind pose
    // Prima calcoliamo le globalTransforms dalla bind pose
    mat4 bindGlobals[MAX_BONES];
    for (int i = 0; i < skel->boneCount; i++) {
        mat4 localMatrix;
        bone_transform_to_mat4(&skel->bones[i].localBind, localMatrix);

        int parentIdx = skel->bones[i].parentIndex;
        if (parentIdx >= 0) {
            glm_mat4_mul(bindGlobals[parentIdx], localMatrix, bindGlobals[i]);
        } else {
            glm_mat4_copy(localMatrix, bindGlobals[i]);
        }
    }

    // Estrai posizioni dalla bind pose globale
    vec3 hipPos, kneePos, footPos;
    glm_vec3_copy(bindGlobals[hipIdx][3], hipPos);
    glm_vec3_copy(bindGlobals[kneeIdx][3], kneePos);
    glm_vec3_copy(bindGlobals[footIdx][3], footPos);

    ik->lenUpper = glm_vec3_distance(hipPos, kneePos);
    ik->lenLower = glm_vec3_distance(kneePos, footPos);
    ik->initialized = true;

    // Debug: calcola la direzione dell'osso nella bind pose
    vec3 thighDir, shinDir;
    glm_vec3_sub(kneePos, hipPos, thighDir);
    glm_vec3_sub(footPos, kneePos, shinDir);
    glm_vec3_normalize(thighDir);
    glm_vec3_normalize(shinDir);

    printf("[TwoBoneIK] Initialized: lenUpper=%.4f, lenLower=%.4f (total reach=%.4f)\n",
           ik->lenUpper, ik->lenLower, ik->lenUpper + ik->lenLower);
    printf("[TwoBoneIK] Bind pose thigh direction: (%.3f, %.3f, %.3f)\n",
           thighDir[0], thighDir[1], thighDir[2]);
    printf("[TwoBoneIK] Bind pose shin direction:  (%.3f, %.3f, %.3f)\n",
           shinDir[0], shinDir[1], shinDir[2]);
}

void two_bone_ik_set_pole(TwoBoneIK* ik, vec3 poleDir) {
    glm_vec3_copy(poleDir, ik->poleVector);
    glm_vec3_normalize(ik->poleVector);
}

// Core geometric 2-bone IK solver
// Calcola la posizione del ginocchio data la posizione dell'anca e il target del piede
static void solve_two_bone_positions(
    vec3 hipPos,
    float lenA,         // lunghezza coscia
    float lenB,         // lunghezza tibia
    vec3 target,
    vec3 poleDir,       // direzione preferita del ginocchio
    vec3 outKneePos     // output: posizione del ginocchio
) {
    vec3 hipToTarget;
    glm_vec3_sub(target, hipPos, hipToTarget);
    float dist = glm_vec3_norm(hipToTarget);

    // Clamp distanza al range raggiungibile
    float maxReach = lenA + lenB - 0.001f;  // piccolo epsilon per stabilità
    float minReach = fabsf(lenA - lenB) + 0.001f;

    if (dist > maxReach) {
        dist = maxReach;
    } else if (dist < minReach) {
        dist = minReach;
    }

    // Normalizza la direzione hip->target
    vec3 targetDir;
    glm_vec3_scale(hipToTarget, 1.0f / glm_vec3_norm(hipToTarget), targetDir);

    // Legge dei coseni per trovare l'angolo all'anca
    // cosA = (a² + c² - b²) / (2ac)  dove a=lenA, b=lenB, c=dist
    float cosAngleA = (lenA * lenA + dist * dist - lenB * lenB) / (2.0f * lenA * dist);
    cosAngleA = glm_clamp(cosAngleA, -1.0f, 1.0f);

    // Calcola la proiezione del ginocchio lungo la direzione target
    float projLen = lenA * cosAngleA;

    // Calcola l'altezza (distanza perpendicolare) del ginocchio
    float height = sqrtf(fmaxf(0.0f, lenA * lenA - projLen * projLen));

    // Calcola l'asse ortogonale per il piano del ginocchio
    // Questo è il prodotto vettoriale tra la direzione target e il pole vector
    vec3 orthoAxis;
    glm_vec3_cross(targetDir, poleDir, orthoAxis);
    float orthoLen = glm_vec3_norm(orthoAxis);

    if (orthoLen < 0.001f) {
        // Se target e pole sono paralleli, usa un asse alternativo
        glm_vec3_cross(targetDir, (vec3){0.0f, 1.0f, 0.0f}, orthoAxis);
        orthoLen = glm_vec3_norm(orthoAxis);
        if (orthoLen < 0.001f) {
            glm_vec3_cross(targetDir, (vec3){1.0f, 0.0f, 0.0f}, orthoAxis);
        }
    }
    glm_vec3_normalize(orthoAxis);

    // La direzione del ginocchio nel piano
    // Ortogonale a orthoAxis e targetDir
    vec3 kneeDir;
    glm_vec3_cross(orthoAxis, targetDir, kneeDir);
    glm_vec3_normalize(kneeDir);

    // Posizione del ginocchio = hip + targetDir * projLen + kneeDir * height
    glm_vec3_scale(targetDir, projLen, outKneePos);
    glm_vec3_add(outKneePos, hipPos, outKneePos);

    vec3 heightOffset;
    glm_vec3_scale(kneeDir, height, heightOffset);
    glm_vec3_add(outKneePos, heightOffset, outKneePos);
}

bool two_bone_ik_solve(TwoBoneIK* ik, Skeleton* skel, BoneTransform* localTransforms) {
    if (!ik->initialized || ik->weight <= 0.0f) {
        return false;
    }

    int hipIdx = ik->hipIdx;
    int kneeIdx = ik->kneeIdx;
    int footIdx = ik->footIdx;

    // ========================================
    // 1. Ottieni le posizioni ATTUALI (dopo animazione) dalle globalTransforms
    // ========================================
    vec3 hipPos, kneePos, footPos;
    glm_vec3_copy(skel->globalTransforms[hipIdx][3], hipPos);
    glm_vec3_copy(skel->globalTransforms[kneeIdx][3], kneePos);
    glm_vec3_copy(skel->globalTransforms[footIdx][3], footPos);

    // Target del piede (già in model space)
    vec3 target;
    glm_vec3_copy(ik->footTarget, target);

    // ========================================
    // 2. Calcola la NUOVA posizione del ginocchio
    // ========================================
    vec3 newKneePos;
    solve_two_bone_positions(hipPos, ik->lenUpper, ik->lenLower, target, ik->poleVector, newKneePos);

    // ========================================
    // 3. COSCIA: Applica delta rotazione in WORLD space
    // ========================================

    // Direzione ATTUALE della coscia (dall'animazione)
    vec3 currentThighDir;
    glm_vec3_sub(kneePos, hipPos, currentThighDir);
    glm_vec3_normalize(currentThighDir);

    // Direzione DESIDERATA della coscia (verso nuovo ginocchio)
    vec3 desiredThighDir;
    glm_vec3_sub(newKneePos, hipPos, desiredThighDir);
    glm_vec3_normalize(desiredThighDir);

    // Delta rotazione in WORLD space (da attuale a desiderata)
    versor thighDeltaWorld;
    glm_quat_from_vecs(currentThighDir, desiredThighDir, thighDeltaWorld);

    // Rotazione WORLD attuale della coscia
    versor thighCurrentWorld;
    glm_mat4_quat(skel->globalTransforms[hipIdx], thighCurrentWorld);

    // Nuova rotazione WORLD = delta * attuale
    versor thighNewWorld;
    glm_quat_mul(thighDeltaWorld, thighCurrentWorld, thighNewWorld);

    // Converti in LOCAL: newLocal = inverse(parentWorld) * newWorld
    int thighParentIdx = skel->bones[hipIdx].parentIndex;
    versor thighNewLocal;
    if (thighParentIdx >= 0) {
        versor parentWorld;
        glm_mat4_quat(skel->globalTransforms[thighParentIdx], parentWorld);
        versor parentInv;
        glm_quat_inv(parentWorld, parentInv);
        glm_quat_mul(parentInv, thighNewWorld, thighNewLocal);
    } else {
        glm_quat_copy(thighNewWorld, thighNewLocal);
    }

    // Blend e applica
    glm_quat_slerp(localTransforms[hipIdx].rotation, thighNewLocal, ik->weight, localTransforms[hipIdx].rotation);

    // Aggiorna globalTransform della coscia per il passo successivo
    {
        mat4 localMatrix;
        bone_transform_to_mat4(&localTransforms[hipIdx], localMatrix);
        if (thighParentIdx >= 0) {
            glm_mat4_mul(skel->globalTransforms[thighParentIdx], localMatrix, skel->globalTransforms[hipIdx]);
        } else {
            glm_mat4_copy(localMatrix, skel->globalTransforms[hipIdx]);
        }
    }

    // Ricalcola la posizione del ginocchio dopo aver applicato la rotazione della coscia
    // (la posizione del ginocchio è nella colonna 3 della globalTransform del ginocchio)
    // Ma prima dobbiamo aggiornare la globalTransform del ginocchio
    {
        mat4 kneeLocalMatrix;
        bone_transform_to_mat4(&localTransforms[kneeIdx], kneeLocalMatrix);
        glm_mat4_mul(skel->globalTransforms[hipIdx], kneeLocalMatrix, skel->globalTransforms[kneeIdx]);
    }
    vec3 updatedKneePos;
    glm_vec3_copy(skel->globalTransforms[kneeIdx][3], updatedKneePos);

    // ========================================
    // 4. TIBIA: Applica delta rotazione in WORLD space
    // ========================================

    // Direzione ATTUALE della tibia
    vec3 currentShinDir;
    glm_vec3_sub(footPos, kneePos, currentShinDir);
    glm_vec3_normalize(currentShinDir);

    // Direzione DESIDERATA della tibia (dal ginocchio aggiornato al target)
    vec3 desiredShinDir;
    glm_vec3_sub(target, updatedKneePos, desiredShinDir);
    glm_vec3_normalize(desiredShinDir);

    // Delta rotazione in WORLD space
    versor shinDeltaWorld;
    glm_quat_from_vecs(currentShinDir, desiredShinDir, shinDeltaWorld);

    // Rotazione WORLD attuale della tibia
    versor shinCurrentWorld;
    glm_mat4_quat(skel->globalTransforms[kneeIdx], shinCurrentWorld);

    // Nuova rotazione WORLD = delta * attuale
    versor shinNewWorld;
    glm_quat_mul(shinDeltaWorld, shinCurrentWorld, shinNewWorld);

    // Converti in LOCAL (parent = coscia aggiornata)
    versor shinNewLocal;
    {
        versor thighWorld;
        glm_mat4_quat(skel->globalTransforms[hipIdx], thighWorld);
        versor thighInv;
        glm_quat_inv(thighWorld, thighInv);
        glm_quat_mul(thighInv, shinNewWorld, shinNewLocal);
    }

    // Blend e applica
    glm_quat_slerp(localTransforms[kneeIdx].rotation, shinNewLocal, ik->weight, localTransforms[kneeIdx].rotation);

    return true;
}

// ============================================================================
// END NEW TWO-BONE IK SYSTEM
// ============================================================================

void animator_apply_foot_ik(Animator* anim, FootIKConfig* ik, mat4 modelMatrix, vec3 unused_forward) {
    (void)unused_forward; // Non usato, lavoriamo in Model Space

    if (!ik->enabled) return;
    if (anim->currentAnim < 0) return;
    if (!ik->leftLeg.initialized || !ik->rightLeg.initialized) return;

    Skeleton* skel = anim->skeleton;
    Animation* currentAnimation = &skel->animations[anim->currentAnim];
    BoneTransform localTransforms[MAX_BONES];

    // 1. CAMPIONAMENTO ANIMAZIONE
    // Ottieni i transform locali dell'animazione corrente
    sample_animation(skel, currentAnimation, anim->currentTime, localTransforms);

    // 2. CALCOLO GLOBALI ORIGINALI
    // Calcoliamo le matrici globali basate sull'animazione pura (senza IK)
    recalculate_bone_matrices(skel, localTransforms);

    // 3. CONVERSIONE TARGETS WORLD -> MODEL
    mat4 invModel;
    glm_mat4_inv(modelMatrix, invModel);

    vec4 leftWorld4 = {ik->leftFootTarget[0], ik->leftFootTarget[1], ik->leftFootTarget[2], 1.0f};
    vec4 rightWorld4 = {ik->rightFootTarget[0], ik->rightFootTarget[1], ik->rightFootTarget[2], 1.0f};

    vec4 leftModel4, rightModel4;
    glm_mat4_mulv(invModel, leftWorld4, leftModel4);
    glm_mat4_mulv(invModel, rightWorld4, rightModel4);

    // 4. IMPOSTA I TARGET NEI TwoBoneIK (in model space)
    glm_vec3_copy(leftModel4, ik->leftLeg.footTarget);
    glm_vec3_copy(rightModel4, ik->rightLeg.footTarget);

    // Imposta il peso dell'IK
    ik->leftLeg.weight = ik->ikBlend;
    ik->rightLeg.weight = ik->ikBlend;

    // 5. RISOLVI IK PER ENTRAMBE LE GAMBE
    // Il nuovo solver modifica localTransforms e aggiorna parzialmente globalTransforms
    two_bone_ik_solve(&ik->leftLeg, skel, localTransforms);
    two_bone_ik_solve(&ik->rightLeg, skel, localTransforms);

    // 6. RICALCOLA TUTTE LE MATRICI FINALI
    // Dopo aver modificato le rotazioni locali, ricalcoliamo tutte le globali
    recalculate_bone_matrices(skel, localTransforms);
}
