#!/bin/bash
# Build heightmap baker tool

echo "Building heightmap_baker..."
gcc -O2 -o heightmap_baker heightmap_baker.c -lm

if [ $? -eq 0 ]; then
    echo "Build successful!"
    echo ""
    echo "Usage:"
    echo "  ./heightmap_baker <input.obj> <output.png> [size] [world_size]"
    echo ""
    echo "Example:"
    echo "  ./heightmap_baker ../resources/levels/level1.obj ../resources/levels/level1_hm.png 1024 64.0"
    echo ""
    echo "After running, convert RAW to PNG with:"
    echo "  python3 -c \"import numpy as np; from PIL import Image; d=np.fromfile('OUTPUT.raw',dtype='<u2').reshape(SIZE,SIZE); Image.fromarray(d,mode='I;16').save('OUTPUT.png')\""
else
    echo "Build failed!"
    exit 1
fi
