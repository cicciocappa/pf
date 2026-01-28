# Piano d'Azione - Confronto Implementazione Crowd Simulation

## Obiettivo
Confrontare sezione per sezione l'implementazione attuale con quella di navcat per eliminare le differenze e risolvere i problemi residui:
- Agenti che seguono percorsi sbagliati in situazioni di affollamento
- Agenti che rimangono bloccati nei muri e diventano non comandabili

---

## FASE 0: Fix Controlli Mouse

**Problema**: Lo spawn degli agenti avviene con click destro invece che sinistro.

**Modifica richiesta**:
- Click sinistro: spawn nuovo agente (se non si sta facendo drag per selezione)
- Click sinistro + drag: selezione rettangolare
- Click destro: muovi agenti selezionati verso il punto cliccato

**File da modificare**: `app.js` - metodi `onMouseDown` e `onMouseUp`

---

## FASE 1: Confronto Struttura Agente

**File navcat**: `blocks/agents/crowd.ts`
**File locale**: `app.js` - classe `Agent`

### Checklist:
- [ ] Verificare che tutti i parametri dell'agente siano presenti (radius, height, maxAcceleration, maxSpeed, collisionQueryRange, pathOptimizationRange, separationWeight)
- [ ] Verificare la struttura degli stati (AgentState, AgentTargetState)
- [ ] Confrontare i flag di update (ANTICIPATE_TURNS, OBSTACLE_AVOIDANCE, SEPARATION, OPTIMIZE_VIS, OPTIMIZE_TOPO)

---

## FASE 2: Confronto Ciclo di Update Principale

**File navcat**: `blocks/agents/crowd.ts` - funzione `update()`
**File locale**: `app.js` - metodo `Crowd.update()`

### Checklist:
- [ ] Verificare l'ordine delle fasi di update
- [ ] Confrontare: `checkPathValidity`
- [ ] Confrontare: `updateTopologyOptimization`
- [ ] Confrontare: `updateNeighbours` (Proximity Grid)
- [ ] Confrontare: `updateLocalBoundaries`
- [ ] Confrontare: `updateSteering`
- [ ] Confrontare: `updateVelocityPlanning` (Obstacle Avoidance)
- [ ] Confrontare: `integrate`
- [ ] Confrontare: `handleCollisions`
- [ ] Confrontare: `updateCorridors` / `constrainToNavMesh`

---

## FASE 3: Confronto Obstacle Avoidance (Velocity Sampling)

**File navcat**: `blocks/agents/obstacle-avoidance.ts`
**File locale**: `app.js` - classe `ObstacleAvoidanceQuery`

### Checklist:
- [ ] Confrontare i parametri di default (velBias, weightDesVel, weightCurVel, weightSide, weightToi, horizTime)
- [ ] Confrontare `sampleVelocityAdaptive` - generazione pattern di campionamento
- [ ] Confrontare `evaluateVelocity` - calcolo della penalità
- [ ] Confrontare `timeToCollisionCircle` - collisione con altri agenti
- [ ] Confrontare `timeToCollisionSegment` - collisione con muri

---

## FASE 4: Confronto Path Corridor

**File navcat**: `blocks/agents/path-corridor.ts`
**File locale**: `app.js` - classe `PathCorridor`

### Checklist:
- [ ] Confrontare la struttura del corridoio
- [ ] Confrontare `optimizePathTopology`
- [ ] Confrontare la gestione dei corner/waypoint
- [ ] Verificare come viene aggiornato il corridoio durante il movimento

---

## FASE 5: Confronto Local Boundary

**File navcat**: `blocks/agents/local-boundary.ts`
**File locale**: `app.js` - classe `LocalBoundary`

### Checklist:
- [ ] Confrontare come vengono raccolti i segmenti dei muri
- [ ] Verificare il range di query
- [ ] Confrontare la logica di caching/aggiornamento

---

## FASE 6: Confronto Collision Resolution

**File navcat**: `blocks/agents/crowd.ts` - sezione collisioni
**File locale**: `app.js` - metodo `Crowd.handleCollisions()`

### Checklist:
- [ ] Confrontare il numero di iterazioni
- [ ] Confrontare la formula di risoluzione overlap
- [ ] Verificare se navcat usa un approccio diverso (displacement vs push diretto)

---

## FASE 7: Confronto Constraint to NavMesh

**File navcat**: `blocks/agents/crowd.ts` - sezione corridors
**File locale**: `app.js` - metodo `Crowd.constrainToNavMesh()`

### Checklist:
- [ ] Confrontare come viene riproiettato un agente sulla navmesh
- [ ] Verificare la gestione degli agenti che escono dalla navmesh
- [ ] Confrontare la validazione del poligono corrente

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
