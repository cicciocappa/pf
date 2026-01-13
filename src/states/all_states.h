#ifndef ALL_STATES_H
#define ALL_STATES_H

#include "../game.h"

// --- LOADER STATE ---
void loader_init(Game* g);
void loader_update(Game* g, float dt);
void loader_draw(Game* g);

// --- MENU STATE ---
void menu_init(Game* g);
void menu_update(Game* g, float dt);
void menu_draw(Game* g);
void menu_cleanup(void);

// --- GAMEPLAY STATE ---
void gameplay_init(Game* g);
void gameplay_update(Game* g, float dt);
void gameplay_draw(Game* g);
void gameplay_cleanup(void);

#endif
