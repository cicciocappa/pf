#ifndef AUDIO_H
#define AUDIO_H

#include <stdbool.h>

bool audio_init(void);
void audio_play_music(const char* path, bool loop);
void audio_stop_music(void);
void audio_set_volume(float volume);
void audio_cleanup(void);
void audio_play_sfx(const char* path);

#endif
