# ============================================================================
# MAKEFILE - Tower Defense Game (Linux)
# ============================================================================

CC = gcc
CFLAGS = -Iinclude -Isrc -O2 -Wall -Wextra -Wno-unused-parameter
LDFLAGS = -lglfw -lGL -lm -ldl -lpthread

# Per Windows (MinGW), usa queste:
#LDFLAGS = -Llib -lglfw3 -lgdi32 -lopengl32

BUILDDIR = build

# ============================================================================
# SOURCES
# ============================================================================

SRCS = src/main.c \
       src/glad.c \
       src/gfx.c \
       src/grid.c \
       src/terrain.c \
       src/level.c \
       src/audio.c \
       src/assets.c \
       src/player.c \
       src/camera.c \
       src/obj_loader.c \
       src/asset_manager.c \
       src/pathfinding.c \
       src/pathfinding_navmesh.c \
       src/skeletal/skeletal.c \
       src/ui/ui_renderer.c \
       src/states/state_loader.c \
       src/states/state_menu.c \
       src/states/state_gameplay.c
	   

OBJS = $(SRCS:%.c=$(BUILDDIR)/%.o)
TARGET = game

# ============================================================================
# RULES
# ============================================================================

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) -o $@ $^ $(LDFLAGS)
	@echo "Built: $(TARGET)"

$(BUILDDIR)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -rf $(BUILDDIR) $(TARGET)

# ============================================================================
# DEPENDENCIES CHECK
# ============================================================================

check-deps:
	@echo "Checking dependencies..."
	@pkg-config --exists glfw3 && echo "✓ GLFW found" || echo "✗ GLFW missing (apt install libglfw3-dev)"
	@test -f include/glad/glad.h && echo "✓ GLAD found" || echo "✗ GLAD missing"
	@test -f include/cglm/cglm.h && echo "✓ cglm found" || echo "✗ cglm missing"
	@test -f src/stb_image.h && echo "✓ stb_image found" || echo "✗ stb_image missing"

# ============================================================================
# HELP
# ============================================================================

help:
	@echo "Usage:"
	@echo "  make          - Build the game"
	@echo "  make clean    - Remove build files"
	@echo "  make check-deps - Check for required dependencies"
	@echo ""
	@echo "Required dependencies:"
	@echo "  - GLFW3 (apt install libglfw3-dev)"
	@echo "  - GLAD (download from glad.dav1d.de)"
	@echo "  - cglm (header-only, copy to include/)"
	@echo "  - stb_image.h (header-only)"
