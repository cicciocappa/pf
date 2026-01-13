#version 330 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTexCoord;
layout (location = 3) in ivec4 aBoneIDs;
layout (location = 4) in vec4 aBoneWeights;

uniform mat4 uVP;
uniform mat4 uModel;
uniform mat4 uBoneMatrices[64];

out vec3 FragPos;
out vec3 FragNormal;
out vec2 FragUV;

void main() {
    mat4 boneTransform = mat4(0.0);
    
    for (int i = 0; i < 4; i++) {
        if (aBoneWeights[i] > 0.0) {
            int boneID = aBoneIDs[i];
            if (boneID >= 0 && boneID < 64) {
                boneTransform += uBoneMatrices[boneID] * aBoneWeights[i];
            }
        }
    }
    
    if (aBoneWeights[0] == 0.0 && aBoneWeights[1] == 0.0 && 
        aBoneWeights[2] == 0.0 && aBoneWeights[3] == 0.0) {
        boneTransform = mat4(1.0);
    }
    
    vec4 skinnedPos = boneTransform * vec4(aPosition, 1.0);
    vec4 worldPos = uModel * skinnedPos;
    FragPos = worldPos.xyz;
    
    mat3 normalMatrix = mat3(uModel) * mat3(boneTransform);
    FragNormal = normalize(normalMatrix * aNormal);
    
    FragUV = aTexCoord;
    
    gl_Position = uVP * worldPos;
}
