#include "assets.h"
#include "gfx.h"
#include <stdio.h>
#include <stdlib.h>

GlobalAssets assets;

void assets_init(void) {
    printf("[Assets] Loading legacy assets...\n");
    
    // Create placeholder white textures for buttons
    glGenTextures(1, &assets.texBtnNormal);
    glBindTexture(GL_TEXTURE_2D, assets.texBtnNormal);
    unsigned char grayPixel[4] = {100, 100, 100, 255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, grayPixel);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    
    glGenTextures(1, &assets.texBtnHover);
    glBindTexture(GL_TEXTURE_2D, assets.texBtnHover);
    unsigned char lightPixel[4] = {150, 150, 150, 255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, lightPixel);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    
    // Placeholder font atlas (white texture)
    glGenTextures(1, &assets.texFontAtlas);
    glBindTexture(GL_TEXTURE_2D, assets.texFontAtlas);
    unsigned char whitePixel[4] = {255, 255, 255, 255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, whitePixel);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    
    printf("[Assets] Legacy assets loaded (placeholders)\n");
}

void assets_cleanup(void) {
    glDeleteTextures(1, &assets.texBtnNormal);
    glDeleteTextures(1, &assets.texBtnHover);
    glDeleteTextures(1, &assets.texFontAtlas);
}
