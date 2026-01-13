#version 330 core

layout (location = 0) in vec4 vertex; 
layout (location = 1) in vec4 color;

out vec2 FragUV;
out vec4 FragColor;

uniform mat4 uProjection;

void main() {
    FragUV = vertex.zw;
    FragColor = color;
    gl_Position = uProjection * vec4(vertex.xy, 0.0, 1.0);
}
