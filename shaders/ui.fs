#version 330 core
out vec4 FinalColor;

in vec2 FragUV;
in vec4 FragColor;

uniform sampler2D uTex;
uniform int uIsText;

void main() {
    vec4 texColor = texture(uTex, FragUV);
    
    if (uIsText == 1) {
        float alpha = texColor.r * FragColor.a;
        FinalColor = vec4(FragColor.rgb, alpha);
    } else {
        FinalColor = texColor * FragColor;
    }
}
