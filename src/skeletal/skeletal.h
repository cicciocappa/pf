#ifndef SKELETAL_CGLM_H
#define SKELETAL_CGLM_H

/*
 * SKELETAL ANIMATION SYSTEM - Versione cglm nativa
 * =================================================
 */

#include <glad/glad.h>
#include <cglm/cglm.h>
#include <stdbool.h>

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

#define MAX_BONES 64
#define MAX_BONE_INFLUENCE 4
#define MAX_KEYFRAMES 256
#define MAX_ANIMATIONS 64

// ============================================================================
// STRUTTURE DATI
// ============================================================================

// Trasformazione di un osso
typedef struct {
    vec3 position;
    versor rotation;    // cglm usa 'versor' per quaternion
    vec3 scale;
} BoneTransform;

// Singolo osso
typedef struct {
    char name[32];
    int parentIndex;
    mat4 inverseBindPose;
    BoneTransform localBind;
} Bone;

// Keyframe
typedef struct {
    float time;
    BoneTransform transforms[MAX_BONES];
} Keyframe;

// Animazione
typedef struct {
    char name[32];
    float duration;
    bool loop;
    int keyframeCount;
    Keyframe* keyframes;
} Animation;

// Skeleton
typedef struct {
    int boneCount;
    Bone bones[MAX_BONES];
    
    int animationCount;
    Animation animations[MAX_ANIMATIONS];
    
    mat4 globalTransforms[MAX_BONES];
    mat4 finalMatrices[MAX_BONES];
} Skeleton;

// Animator
typedef struct {
    Skeleton* skeleton;
    
    int currentAnim;
    float currentTime;
    float speed;
    
    int blendAnim;
    float blendAnimTime;
    float blendTime;
    float blendDuration;
    
    bool playing;
    bool finished;
} Animator;

// Skinned Vertex
typedef struct {
    vec3 position;
    vec3 normal;
    vec2 texCoord;
    int boneIDs[4];
    float boneWeights[4];
} SkinnedVertex;

// Skinned Mesh
typedef struct {
    GLuint vao, vbo, ebo;
    int indexCount;
    
    GLuint shader;
    GLuint texture;
    
    GLint loc_uVP;
    GLint loc_uModel;
    GLint loc_uBoneMatrices;
    GLint loc_uTexture;
} SkinnedMesh;

// ============================================================================
// FOOT IK CONFIGURATION
// ============================================================================

// ============================================================================
// TWO-BONE IK STRUCTURE (per-leg)
// ============================================================================

typedef struct {
    int hipIdx;
    int kneeIdx;
    int footIdx;

    float lenUpper;     // Lunghezza coscia (hip -> knee)
    float lenLower;     // Lunghezza tibia (knee -> foot)

    vec3 poleVector;    // Direzione preferita per il ginocchio (model space)
    vec3 footTarget;    // Target del piede (model space)

    float weight;       // Blend 0..1 (0 = pure animation, 1 = full IK)
    bool initialized;   // true dopo che le lunghezze sono state calcolate
} TwoBoneIK;

typedef struct {
    bool enabled;

    // Two-Bone IK chains for each leg
    TwoBoneIK leftLeg;
    TwoBoneIK rightLeg;

    // Target positions (world space) - set each frame before applying IK
    vec3 leftFootTarget;
    vec3 rightFootTarget;

    // Offset from raycast hit to foot bone position
    float footHeightOffset;

    // Legacy indices (kept for compatibility)
    int leftThighIdx;
    int leftShinIdx;
    int leftFootIdx;
    int rightThighIdx;
    int rightShinIdx;
    int rightFootIdx;

    // How much IK is blended in (0.0 = pure animation, 1.0 = full IK)
    float ikBlend;
} FootIKConfig;

// ============================================================================
// API SKELETON
// ============================================================================

bool skeleton_load(Skeleton* skel, const char* path);
void skeleton_free(Skeleton* skel);
int skeleton_find_animation(Skeleton* skel, const char* name);
int skeleton_find_bone(Skeleton* skel, const char* name);

// ============================================================================
// API ANIMATOR
// ============================================================================

void animator_init(Animator* anim, Skeleton* skeleton);
void animator_play(Animator* anim, int animIndex, float blendTime);
void animator_play_name(Animator* anim, const char* name, float blendTime);
void animator_update(Animator* anim, float dt);
void animator_stop(Animator* anim);
void animator_set_speed(Animator* anim, float speed);
void animator_get_bone_matrix(Animator* anim, int boneIndex, mat4 dest);

// ============================================================================
// API FOOT IK
// ============================================================================

// Initialize foot IK config and find bone indices by name
// Returns true if all bones were found
bool foot_ik_config_setup(FootIKConfig* ik, Skeleton* skel,
                          const char* leftThigh, const char* leftShin, const char* leftFoot,
                          const char* rightThigh, const char* rightShin, const char* rightFoot);

// Apply foot IK after animator_update
// modelMatrix is needed to convert foot targets from world space to model space
// Aggiungi playerForward
void animator_apply_foot_ik(Animator* anim, FootIKConfig* ik, mat4 modelMatrix, vec3 playerForward);

// Initialize bone lengths for TwoBoneIK (call once after skeleton is loaded)
void two_bone_ik_init(TwoBoneIK* ik, Skeleton* skel, int hipIdx, int kneeIdx, int footIdx);

// Set pole vector direction for knee bending (model space)
void two_bone_ik_set_pole(TwoBoneIK* ik, vec3 poleDir);

// Solve 2-bone IK and apply to local transforms
// Returns true if successfully solved
bool two_bone_ik_solve(TwoBoneIK* ik, Skeleton* skel, BoneTransform* localTransforms);

// ============================================================================
// API SKINNED MESH
// ============================================================================

bool skinned_mesh_load(SkinnedMesh* mesh, const char* meshPath, const char* texturePath);
void skinned_mesh_init_shader(SkinnedMesh* mesh);
void skinned_mesh_render(SkinnedMesh* mesh, Skeleton* skeleton, mat4 model, mat4 viewProj);
void skinned_mesh_free(SkinnedMesh* mesh);

// ============================================================================
// UTILITY
// ============================================================================

static inline void bone_transform_lerp(BoneTransform* a, BoneTransform* b, float t, BoneTransform* dest) {
    glm_vec3_lerp(a->position, b->position, t, dest->position);
    glm_quat_slerp(a->rotation, b->rotation, t, dest->rotation);
    glm_vec3_lerp(a->scale, b->scale, t, dest->scale);
}

static inline void bone_transform_to_mat4(BoneTransform* t, mat4 dest) {
    mat4 rot, scale_mat;
    
    glm_quat_mat4(t->rotation, rot);
    
    glm_mat4_identity(scale_mat);
    scale_mat[0][0] = t->scale[0];
    scale_mat[1][1] = t->scale[1];
    scale_mat[2][2] = t->scale[2];
    
    glm_mat4_mul(rot, scale_mat, dest);
    
    glm_vec3_copy(t->position, dest[3]);
}

#endif // SKELETAL_CGLM_H
