#version 330 core

out vec4 FragColor;

in vec3 FragPos;
in vec3 FragNormal;
in vec2 FragUV;

uniform sampler2D uTexture;

const vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
const vec3 lightColor = vec3(1.0, 0.95, 0.9);
const vec3 ambientColor = vec3(0.3, 0.35, 0.4);

void main() {
    vec4 texColor = texture(uTexture, FragUV);
    
    if (texColor.a < 0.1) {
        discard;
    }
    
    vec3 normal = normalize(FragNormal);
    float diff = max(dot(normal, lightDir), 0.0);
    
    vec3 lighting = ambientColor + lightColor * diff;
    vec3 finalColor = texColor.rgb * lighting;
    
    FragColor = vec4(finalColor, texColor.a);
}
