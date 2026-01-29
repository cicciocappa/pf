# Piano d'Azione - Confronto Implementazione Crowd Simulation

## Obiettivo
Confrontare sezione per sezione l'implementazione attuale con quella di navcat per eliminare le differenze e risolvere i problemi residui:
- Agenti che seguono percorsi sbagliati in situazioni di affollamento
- Agenti che rimangono bloccati nei muri e diventano non comandabili

---

## FASE 0: Fix Controlli Mouse ✅ COMPLETATA

**Problema**: Lo spawn degli agenti avviene con click destro invece che sinistro.

**Modifica richiesta**:
- Click sinistro: spawn nuovo agente (se non si sta facendo drag per selezione)
- Click sinistro + drag: selezione rettangolare
- Click destro: muovi agenti selezionati verso il punto cliccato

**File da modificare**: `app.js` - metodi `onMouseDown` e `onMouseUp`

**Modifiche effettuate**:
- Click sinistro su spazio vuoto: spawna agente
- Click sinistro su agente: seleziona
- Click sinistro + drag: selezione rettangolare
- Click destro: muovi agenti selezionati

---

## FASE 1: Confronto Struttura Agente ✅ COMPLETATA

**File navcat**: `blocks/agents/crowd.ts`
**File locale**: `app.js` - classe `Agent`

### Checklist:
- [x] Verificare che tutti i parametri dell'agente siano presenti (radius, height, maxAcceleration, maxSpeed, collisionQueryRange, pathOptimizationRange, separationWeight)
- [x] Verificare la struttura degli stati (AgentState, AgentTargetState)
- [x] Confrontare i flag di update (ANTICIPATE_TURNS, OBSTACLE_AVOIDANCE, SEPARATION, OPTIMIZE_VIS, OPTIMIZE_TOPO)

**Modifiche effettuate**:
- Aggiunti stati AgentTargetState mancanti (WAITING_FOR_QUEUE, WAITING_FOR_PATH, VELOCITY)
- Aggiunto CrowdUpdateFlags con tutti i flag (ANTICIPATE_TURNS, OBSTACLE_AVOIDANCE, SEPARATION, OPTIMIZE_VIS, OPTIMIZE_TOPO)
- Aggiunto campo `updateFlags` all'Agent con tutti i flag attivi di default
- Aggiunto campo `desiredSpeed` per la velocità desiderata
- Aggiunto campo `corners` per i waypoint calcolati
- Implementato `calcSmoothSteerDirection` per ANTICIPATE_TURNS
- Implementato `applySeparation` per SEPARATION
- Tutti i flag vengono ora controllati nelle rispettive funzioni

---

## FASE 2: Confronto Ciclo di Update Principale ✅ COMPLETATA

**File navcat**: `blocks/agents/crowd.ts` - funzione `update()`
**File locale**: `app.js` - metodo `Crowd.update()`

### Checklist:
- [x] Verificare l'ordine delle fasi di update
- [x] Confrontare: `checkPathValidity`
- [x] Confrontare: `updateTopologyOptimization`
- [x] Confrontare: `updateNeighbours` (Proximity Grid)
- [x] Confrontare: `updateLocalBoundaries`
- [x] Confrontare: `updateSteering`
- [x] Confrontare: `updateVelocityPlanning` (Obstacle Avoidance)
- [x] Confrontare: `integrate`
- [x] Confrontare: `handleCollisions`
- [x] Confrontare: `updateCorridors` / `constrainToNavMesh`

**Modifiche effettuate**:
- Riordinato ciclo update per seguire ordine navcat
- Aggiunto throttling a `updateTopologyOptimization` (OPT_TIME_THR = 0.5s, OPT_MAX_AGENTS = 1)
- Aggiunto threshold di movimento a `updateLocalBoundaries` (collisionQueryRange * 0.25)
- Corretto slowDownRadius a `agent.radius * 2`

---

## FASE 3: Confronto Obstacle Avoidance (Velocity Sampling) ✅ COMPLETATA

**File navcat**: `blocks/agents/obstacle-avoidance.ts`
**File locale**: `app.js` - classe `ObstacleAvoidanceQuery`

### Checklist:
- [x] Confrontare i parametri di default (velBias, weightDesVel, weightCurVel, weightSide, weightToi, horizTime)
- [x] Confrontare `sampleVelocityAdaptive` - generazione pattern di campionamento
- [x] Confrontare `evaluateVelocity` - calcolo della penalità
- [x] Confrontare `timeToCollisionCircle` - collisione con altri agenti
- [x] Confrontare `timeToCollisionSegment` - collisione con muri

**Modifiche effettuate**:
- Implementato RVO (Reciprocal Velocity Obstacles): `vab = vcand * 2 - vel - cir.vel`
- Implementato side bias sofisticato con `dp` (direzione ostacolo) e `np` (normale)
- Aggiunto early out con `tThreshold`
- Gestione caso `touch` per segmenti molto vicini
- Preparazione ostacoli prima del sampling con `prepareObstacles`
- Implementato `sweepCircleCircle` e `intersectRaySegment` fedeli a navcat

---

## FASE 4: Confronto Path Corridor ✅ COMPLETATA

**File navcat**: `blocks/agents/path-corridor.ts`
**File locale**: `app.js` - classe `PathCorridor`

### Checklist:
- [x] Confrontare la struttura del corridoio
- [x] Confrontare `optimizePathTopology`
- [x] Confrontare la gestione dei corner/waypoint
- [x] Verificare come viene aggiornato il corridoio durante il movimento

**Modifiche effettuate**:
- Aggiunto campo `position` per la posizione vincolata nel corridor
- Aggiunto campo `target` come alias di `targetPos`
- Implementato `isValid(maxLookAhead, navMesh)` per verificare validità
- Migliorato `optimizePathTopology` con ricerca scorciatoie
- Aggiunto `optimizePathVisibility` per ottimizzazione con raycast
- Modificato `reset(nodeRef, position)` per accettare parametri iniziali

---

## FASE 5: Confronto Local Boundary ✅ COMPLETATA

**File navcat**: `blocks/agents/local-boundary.ts`
**File locale**: `app.js` - classe `LocalBoundary`

### Checklist:
- [x] Confrontare come vengono raccolti i segmenti dei muri
- [x] Verificare il range di query
- [x] Confrontare la logica di caching/aggiornamento

**Modifiche effettuate**:
- Aggiunto limite MAX_LOCAL_SEGS = 8 per i segmenti
- Aggiunto limite MAX_LOCAL_POLYS = 16 per i poligoni
- I segmenti sono ora ordinati per distanza (i più vicini prima)
- Aggiunto campo `polys` per tracciare i poligoni trovati
- Aggiunto campo `dist` a ogni segmento per l'ordinamento
- Implementato `addSegment` con inserimento ordinato
- Implementato `isValid(navMesh)` per verificare validità
- Implementato `reset()` per reinizializzare il boundary

---

## FASE 6: Confronto Collision Resolution ✅ COMPLETATA

**File navcat**: `blocks/agents/crowd.ts` - sezione collisioni
**File locale**: `app.js` - metodo `Crowd.handleCollisions()`

### Checklist:
- [x] Confrontare il numero di iterazioni
- [x] Confrontare la formula di risoluzione overlap
- [x] Verificare se navcat usa un approccio diverso (displacement vs push diretto)

**Modifiche effettuate**:
- Implementato sistema a due passaggi (calcola displacement, poi applica)
- Aggiunto COLLISION_RESOLVE_FACTOR = 0.7
- Implementata gestione caso agenti sovrapposti (dist < 0.0001)
- Normalizzazione displacement con peso medio

---

## FASE 7: Confronto Constraint to NavMesh ✅ COMPLETATA

**File navcat**: `blocks/agents/crowd.ts` - sezione corridors
**File locale**: `app.js` - metodo `Crowd.constrainToNavMesh()`

### Checklist:
- [x] Confrontare come viene riproiettato un agente sulla navmesh
- [x] Verificare la gestione degli agenti che escono dalla navmesh
- [x] Confrontare la validazione del poligono corrente

**Modifiche effettuate**:
- Implementato `moveAlongSurface` semplificato che:
  - Verifica poligono corrente e adiacenti (2 hop)
  - Traccia i poligoni visitati
  - Proietta sul bordo più vicino se fuori navmesh
- Implementato `mergeCorridorPath` per unire i poligoni visitati al corridor

---

## FASE 8: Test con NavMesh Complesse

### Test da eseguire:
- [ ] Caricare navmesh con corridoi stretti
- [ ] Caricare navmesh con molti poligoni piccoli
- [ ] Caricare navmesh con forme irregolari
- [ ] Testare con 10, 50, 100, 200 agenti
- [ ] Testare percorsi lunghi attraverso molti poligoni
- [ ] Testare situazioni di "imbuto" (molti agenti verso un passaggio stretto)

---

## FASE 9: Debug e Visualizzazione

### Miglioramenti opzionali per il debug:
- [ ] Aggiungere visualizzazione dei segmenti LocalBoundary
- [ ] Aggiungere visualizzazione della velocità desiderata vs velocità effettiva
- [ ] Aggiungere visualizzazione del poligono corrente di ogni agente
- [ ] Aggiungere indicatore visivo per agenti in stato "bloccato"

---

## FASE 10: Connessioni Off-Mesh

**File navcat**:
- `blocks/agents/crowd.ts` - sezioni `updateOffMeshConnectionTriggers`, `offMeshConnectionUpdate`, `completeOffMeshConnection`
- `blocks/agents/path-corridor.ts` - `moveOverOffMeshConnection`
- Strutture dati in `src/nav-mesh.ts`

### Descrizione:
Le connessioni off-mesh permettono agli agenti di attraversare aree non collegate direttamente dalla navmesh, come:
- **Salti** tra piattaforme
- **Scale/rampe** speciali
- **Teletrasporti** o porte
- **Arrampicate** su muri

### Checklist:
- [ ] Studiare la struttura `OffMeshConnection` in navcat
- [ ] Implementare la struttura dati per le connessioni off-mesh
- [ ] Implementare `updateOffMeshConnectionTriggers` - rileva quando un agente è vicino a una connessione
- [ ] Implementare `moveOverOffMeshConnection` nel PathCorridor
- [ ] Implementare `offMeshConnectionUpdate` - animazione/movimento durante la transizione
- [ ] Implementare `completeOffMeshConnection` - per animazioni custom
- [ ] Aggiungere stato `AgentState.OFFMESH` e campo `offMeshAnimation`
- [ ] Supportare connessioni bidirezionali e unidirezionali
- [ ] Aggiungere API per creare/rimuovere connessioni a runtime

### API prevista:
```javascript
// Aggiungere una connessione off-mesh
crowd.addOffMeshConnection({
    start: { x: 0, y: 0, z: 0 },
    end: { x: 5, y: 2, z: 0 },
    radius: 0.5,
    bidirectional: true,
    duration: 0.5  // tempo di attraversamento
});

// Rimuovere una connessione
crowd.removeOffMeshConnection(connectionId);
```

---

## FASE 11: NavMesh Tiled

**File navcat**:
- `src/generate/nav-mesh-tile.ts`
- `src/nav-mesh.ts` - gestione tile
- `src/query/nav-mesh-api.ts` - query cross-tile

### Descrizione:
Le navmesh tiled permettono di gestire mappe molto grandi suddividendole in "tile" (piastrelle) che possono essere:
- **Caricate/scaricate dinamicamente** (streaming)
- **Generate indipendentemente** (multithread)
- **Modificate singolarmente** senza rigenerare l'intera mappa

### Checklist:
- [ ] Studiare la struttura tile in navcat
- [ ] Implementare `NavMeshTile` - singola piastrella della navmesh
- [ ] Implementare `TiledNavMesh` - container per più tile
- [ ] Gestire i collegamenti tra tile adiacenti (portali cross-tile)
- [ ] Modificare il pathfinding per cercare attraverso più tile
- [ ] Implementare caricamento/scaricamento dinamico dei tile
- [ ] Implementare `addTile(x, y, tileData)` e `removeTile(x, y)`
- [ ] Gestire gli agenti quando un tile viene rimosso (riproiezione)
- [ ] Ottimizzare le query spaziali per tile

### API prevista:
```javascript
// Creare una navmesh tiled
const tiledNavMesh = new TiledNavMesh(tileSize);

// Aggiungere un tile
tiledNavMesh.addTile(0, 0, tileData);
tiledNavMesh.addTile(1, 0, tileData);

// Rimuovere un tile (streaming out)
tiledNavMesh.removeTile(0, 0);

// Usare con il crowd
crowd.setNavMesh(tiledNavMesh);
```

### Note implementative:
- Ogni tile ha coordinate (x, y) nella griglia
- I poligoni hanno riferimenti locali al tile + offset globale
- I portali tra tile sono gestiti come collegamenti speciali
- Il pathfinding deve attraversare i confini dei tile in modo trasparente

---

## Ordine di Esecuzione Consigliato

1. **FASE 0** - Fix controlli mouse (rapido, migliora l'usabilità)
2. **FASE 6** - Collision Resolution (probabile causa degli agenti bloccati)
3. **FASE 7** - Constraint to NavMesh (probabile causa degli agenti nei muri)
4. **FASE 3** - Obstacle Avoidance (probabile causa dei percorsi sbagliati in affollamento)
5. **FASE 2** - Ciclo Update (verifica ordine operazioni)
6. **FASE 4** - Path Corridor
7. **FASE 5** - Local Boundary
8. **FASE 1** - Struttura Agente
9. **FASE 8** - Test estensivi
10. **FASE 9** - Debug (se necessario)

---

## Note

- Il codice sorgente di navcat è disponibile in: `/home/france/Scrivania/progetti/pf/prototype/prova/crowd-simulation/navcat/`
- File principali da consultare:
  - `blocks/agents/crowd.ts`
  - `blocks/agents/obstacle-avoidance.ts`
  - `blocks/agents/path-corridor.ts`
  - `blocks/agents/local-boundary.ts`
  - `src/query/find-straight-path.ts`
  - `src/geometry.ts`
