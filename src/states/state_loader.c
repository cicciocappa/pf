#include "all_states.h"
#include <stdio.h>

void loader_init(Game* g) {
    printf("[Loader] Init\n");
    // Skip direttamente al gameplay per test
    game_change_state(g, STATE_GAMEPLAY);
}

void loader_update(Game* g, float dt) {}
void loader_draw(Game* g) {}
