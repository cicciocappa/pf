#include "audio.h"
#include <stdio.h>

// STUB implementation - replace with miniaudio later
static bool initialized = false;

bool audio_init(void) {
    printf("[Audio] Initialized (stub)\n");
    initialized = true;
    return true;
}

void audio_play_music(const char* path, bool loop) {
    if (!initialized) return;
    printf("[Audio] Play music: %s (loop=%d) [stub]\n", path, loop);
}

void audio_play_sfx(const char* path) {
    if (!initialized) return;
    // Silently ignore in stub
}

void audio_stop_music(void) {
    if (!initialized) return;
    printf("[Audio] Stop music [stub]\n");
}

void audio_set_volume(float volume) {
    if (!initialized) return;
}

void audio_cleanup(void) {
    if (!initialized) return;
    printf("[Audio] Cleanup [stub]\n");
    initialized = false;
}
