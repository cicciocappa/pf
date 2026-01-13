#version 330 core

out vec4 FragColor;

in vec3 FragPos;
in vec3 FragNormal;
in vec2 FragUV;

uniform sampler2D uTexture;
uniform vec3 uLightDir;
uniform float uAmbient;

void main() {
    // 1. Campionamento Texture
    // NOTA: Se usi una texture "unica" per tutto il chunk (esportata da Blender), usa FragUV.
    // Se usi una texture piccola (es. erba seamless) che vuoi ripetere, 
    // usa texture(uTexture, FragUV * 10.0);
    vec4 texColor = texture(uTexture, FragUV);
    
    // 2. Illuminazione (Lambert Diffuse)
    vec3 normal = normalize(FragNormal);
    // Assicuriamoci che la luce sia normalizzata
    vec3 lightDir = normalize(uLightDir);
    
    // Calcolo intensità luce (dot product)
    // max(..., 0.0) evita luce negativa sulle facce in ombra
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Combina luce ambiente e diffusa
    vec3 lighting = vec3(uAmbient) + vec3(1.0 - uAmbient) * diff;
    
    // 3. Colore Base
    vec3 finalColor = texColor.rgb * lighting;
    
    // 4. Nebbia (Fog) - Opzionale ma utile per la profondità
    // Parametri hardcoded per ora (puoi passarli come uniform)
    float fogStart = 80.0;
    float fogEnd = 150.0;
    float dist = length(FragPos); // Distanza dalla camera
    
    float fogFactor = clamp((dist - fogStart) / (fogEnd - fogStart), 0.0, 0.5);
    vec3 fogColor = vec3(0.5, 0.55, 0.6); // Grigio-azzurro
    
    // Mix finale
    finalColor = mix(finalColor, fogColor, fogFactor);
    
    FragColor = vec4(finalColor, 1.0);
}