# Formato NavMesh

## Descrizione

Il sistema di pathfinding basato su navmesh richiede un file di testo semplice che descrive la geometria della navmesh.

## Formato File

```
<numero_vertici> <numero_triangoli>
<x> <y> <z>    # Vertice 0
<x> <y> <z>    # Vertice 1
...
<v0> <v1> <v2> # Triangolo 0 (indici dei vertici)
<v0> <v1> <v2> # Triangolo 1
...
```

## Esempio

```
6 4
0.0 0.0 0.0
10.0 0.0 0.0
10.0 0.0 10.0
0.0 0.0 10.0
5.0 2.0 5.0
15.0 0.0 5.0
0 1 4
1 2 4
2 3 4
3 0 4
```

Questo esempio descrive una piramide con 6 vertici e 4 triangoli.

## Come Generare una NavMesh

### Opzione 1: Blender
1. Crea/importa il terreno in Blender
2. Semplifica la mesh (decimation, retopology)
3. Esporta come OBJ
4. Usa uno script Python per convertire in formato navmesh

### Opzione 2: Script da PathGrid
Puoi usare il pathfinding a griglia esistente per generare una navmesh:
- Identifica regioni walkable contigue
- Crea un poligono convesso per ogni regione
- Triangola i poligoni
- Esporta in formato navmesh

### Opzione 3: Recast Navigation
Usa la libreria Recast per generare automaticamente navmesh da mesh 3D.

## Note Importanti

1. **Coordinate**: Usa le stesse coordinate world del tuo gioco
2. **Orientazione**: I triangoli devono avere normale verso l'alto (Y+)
3. **Adiacenza**: Il sistema calcola automaticamente i triangoli adiacenti
4. **Walkability**: Tutti i triangoli sono considerati walkable di default
