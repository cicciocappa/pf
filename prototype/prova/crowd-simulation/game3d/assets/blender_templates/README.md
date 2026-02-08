# Building Footprint Templates for Blender

Questi file OBJ contengono i footprint degli edifici usati nell'editor del gioco.
Importali in Blender come riferimento per modellare gli edifici con le proporzioni corrette.

## Scala

- **I template sono GIA SCALATI x5** (scala default dell'editor)
- **1 unita Blender = 1 unita gioco**
- **Altezza di riferimento: 5 unita** - regolala secondo le tue esigenze

### Esempio pratico
La GUARD_TOWER ha footprint circa 10x10 unita nel file OBJ.
Nel gioco con scala editor 5 (default), apparira esattamente di queste dimensioni.

## Come usare in Blender

1. **File > Import > Wavefront (.obj)**
2. Seleziona il file del template desiderato
3. Il template apparira come un prisma basso
4. Modella il tuo edificio sopra/attorno al footprint
5. Quando hai finito, **elimina il template** e tieni solo il tuo modello
6. **Esporta come GLB**: File > Export > glTF 2.0 (.glb)

## Struttura export

Esporta i modelli nella struttura:
```
game3d/assets/buildings/
  guard_tower/
    intact.glb      <- modello intatto
    damaged.glb     <- opzionale
    critical.glb    <- opzionale
    destroyed.glb   <- opzionale
  ballista_tower/
    intact.glb
    ...
```

## Tipi di edificio

| File | Forma | Dimensioni (unita) | Altezza ref |
|------|-------|-------------------|-------------|
| GUARD_TOWER.obj | Ottagono | ~10 x 10 | 5 |
| BALLISTA_TOWER.obj | Ottagono grande | ~12 x 12 | 5 |
| BARRACKS.obj | Rettangolo | 15 x 8 | 5 |
| TEMPLE.obj | Pentagono | ~12 x 12.5 | 5 |
| TREASURY.obj | Esagono | ~8.7 x 10 | 5 |
| GATEHOUSE.obj | Rettangolo | 15 x 10 | 5 |

## Note

- L'asse Y e verso l'alto (altezza)
- L'origine (0,0,0) e al centro del footprint, a livello del suolo
- I modelli devono avere l'origine a terra per il corretto posizionamento nel gioco
- Usa materiali semplici - il gioco supporta materiali PBR base dal GLTF
