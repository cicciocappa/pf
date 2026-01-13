#version 330 core

// Layout deve coincidere con il tuo obj_loader e terrain_gpu_setup
layout (location = 0) in vec3 aPos;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTexCoord;

uniform mat4 uVP;    // View * Projection
uniform mat4 uModel; // Trasformazione del chunk

out vec3 FragPos;
out vec3 FragNormal;
out vec2 FragUV;

void main() {
    // Calcola posizione nel mondo
    vec4 worldPos = uModel * vec4(aPos, 1.0);
    FragPos = worldPos.xyz;
    
    // Calcola normale nel mondo (ruotata correttamente)
    FragNormal = mat3(uModel) * aNormal;
    
    // Passa le UV
    // IMPORTANTE: Se la texture risulta capovolta verticalmente,
    // de-commenta la riga sotto invece di quella standard:
    // FragUV = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    FragUV = aTexCoord;
    
    gl_Position = uVP * worldPos;
}