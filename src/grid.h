#ifndef GRID_H
#define GRID_H

#include <cglm/cglm.h>

void grid_init(int size, float step);
void grid_draw(mat4 view_proj);
void grid_cleanup(void);

#endif
