# PIANO - Tower Attack 3D

## Stato attuale (v0.1 - Fondamenta)
- [x] Setup Three.js con camera ortografica
- [x] Caricamento mesh 3D dall'editor (via localStorage)
- [x] Rendering livello: ground, buildings, walls come prismi lowpoly
- [x] NavMesh generation dalla mesh combinata
- [x] Crowd system (navcat) per pathfinding + collision avoidance
- [x] Mago (sfera blu) posizionato alla startingPosition
- [x] Click destro: muovi il mago
- [x] HUD minimale (HP, Mana, FPS)
- [x] Game loop con update + render

---

## Fase 1 - Gameplay Core

### 1.1 Creature ed evocazione
- [ ] Sistema evocazione creature (G = Gigante, L = Larve, E = Elementale)
- [ ] Creature seguono il mago o attaccano bersagli
- [ ] Ogni creatura e' una sfera colorata con dimensione proporzionale al radius
- [ ] Creature hanno HP, danno, range d'attacco, cooldown

### 1.1b Cerchio di evocazione (summon targeting)
Trasformare l'evocazione da azione istantanea a flusso in due step:
1. Premi G/L/E → entra in "summon mode" (cerchio raggio attorno al mago)
2. Click dentro il cerchio → evoca li' + auto-select. Premi di nuovo lo stesso tasto → evoca attorno al mago. Click fuori o ESC → annulla.

**File da modificare:**
- `src/config.js`: aggiungere `summonRange: 5.0` a WizardStats
- `src/Game.js`:
  - Stato: `this.summonMode = null` (null o `{ creatureType }`)
  - Mesh cerchio: `this.summonCircle` (RingGeometry in entityGroup, visibile solo in summon mode)
  - `enterSummonMode(creatureType)`: se stesso tipo → evoca attorno al mago; se diverso/nuovo → entra in summon mode, mostra cerchio. Check mana senza spendere.
  - `summonAt(x, z)`: se dentro raggio → evoca, spendi mana, auto-select, esci. Se fuori → annulla.
  - `cancelSummon()`: nasconde cerchio, `summonMode = null`
  - Refactor `onSummonCreature(type)` → `_spawnCreatures(type, cx, cz)` (logica pura riusata)
  - Update loop: aggiornare posizione cerchio per seguire il mago
- `src/InputManager.js`:
  - G/L/E → `game.enterSummonMode(type)` invece di `game.onSummonCreature()`
  - mousedown button 0: se `game.summonMode`, intercettare click PRIMA di spell/drag, chiamare `game.summonAt()`
  - ESC → `game.cancelSummon()`

**Cerchio di evocazione (Three.js):**
- `THREE.RingGeometry(innerRadius, outerRadius, 64)` sul piano XZ (rotation.x = -PI/2)
- Colore semitrasparente legato al tipo di creatura (color dalla config)
- Position.y = 0.03 (sopra ground, sotto unita')
- Centrato su wizard.x, wizard.z (aggiornato ogni frame)
- Creato una volta sola, riusato (cambia solo colore e visibility)

**Flusso:**
```
Premi G → summonMode = {creatureType: 'GIANT'}, cerchio visibile, cursor = 'crosshair'
  Click dentro cerchio → spawn giganti li', auto-select, cerchio scompare
  Premi G di nuovo → spawn giganti attorno al mago, cerchio scompare
  Premi L → switch a LARVA, cerchio cambia colore
  Click fuori cerchio → annulla, cerchio scompare
  ESC → annulla, cerchio scompare
```

### 1.2 Torri nemiche
- [ ] Definire posizioni torri nel JSON dell'editor (nuovo tool "Tower")
- [ ] Oppure: posizionare torri a mano nel livello JSON
- [ ] Torri Guard, Ballista, Alchemical con stats dal config
- [ ] AI torri: selezione bersaglio (proximity, priority, high_value)
- [ ] Torri sparano proiettili ai nemici in range

### 1.3 Proiettili
- [ ] Proiettili 3D (piccole sfere che volano verso il bersaglio)
- [ ] Collisione → danno al target
- [ ] Proiettili AoE (torre alchemica, palla di fuoco)

### 1.4 Incantesimi
- [ ] Palla di Fuoco: [1] + click → proiettile AoE
- [ ] Cooldown visuale nell'HUD
- [ ] Effetto esplosione 3D (flash + particle?)

### 1.5 Condizioni vittoria/sconfitta
- [ ] Posizione tesoro definita nell'editor o nel livello
- [ ] Mago raggiunge tesoro → Vittoria
- [ ] HP mago a 0 → Game Over
- [ ] Schermate vittoria/sconfitta

---

## Fase 2 - Input, Camera e Selezione

### 2.1 Camera ortografica
- [x] Camera ortografica isometrica (45 gradi)
- [x] Zoom con rotella
- [x] Pan con WASD / frecce
- [x] Camera segue il mago (con offset regolabile)
- [x] Smooth camera follow con lerp

### 2.2 Sistema di selezione RTS
- [x] Selezione rettangolare (click sinistro + drag)
- [x] Click sinistro su creatura: seleziona singola
- [x] Shift+click: aggiungi/rimuovi dalla selezione
- [x] Doppio click su creatura: seleziona tutte dello stesso tipo
- [x] ESC: deseleziona tutto (torna al controllo del mago)
- [x] Cerchio di selezione verde sotto le unita' selezionate
- [x] Click destro con selezione: muove solo le unita' selezionate
- [x] Click destro senza selezione: muove il mago
- [x] Formazione a cerchi concentrici per movimenti di gruppo
- [x] Transizione automatica MOVING → IDLE all'arrivo a destinazione
- [x] Mago selezionabile insieme alle creature (click, drag, shift)
- [x] Rettangolo di selezione overlay (verde semitrasparente)

### 2.3 Input avanzato
- [x] Click sinistro su torre nemica: ordina attacco creature
- [ ] Cursore contestuale (crosshair per spell, move per movimento)
- [ ] Alt+click drag: pan camera libero

---

## Fase 3 - Sistema Visualizzazione Livello (Buildings & Walls)

Questa fase sostituisce il sistema temporaneo che usa la mesh semplificata di navcat con un sistema completo di visualizzazione grafica.

---

### 3.0 Architettura dati edifici e mura

#### 3.0.1 Formato Building Definition (JSON)
Ogni edificio nel livello è definito con:
```json
{
  "id": "tower_01",
  "type": "GUARD_TOWER",           // Tipo edificio (dal catalogo)
  "position": [x, 0, z],
  "rotation": 0,                   // Rotazione Y in radianti
  "hp": 100,                       // HP correnti (opzionale, default = maxHp)
  "animatedElement": "ballista"    // ID elemento animato (opzionale)
}
```

#### 3.0.2 Building Catalog (src/data/buildingCatalog.js)
Catalogo centrale con definizioni edifici:
```javascript
export const BuildingCatalog = {
  GUARD_TOWER: {
    maxHp: 100,
    meshStates: {
      INTACT:    'guard_tower_intact.obj',
      DAMAGED:   'guard_tower_damaged.obj',
      CRITICAL:  'guard_tower_critical.obj',
      DESTROYED: 'guard_tower_destroyed.obj'
    },
    // Soglie HP per cambio stato (% del maxHp)
    stateThresholds: { DAMAGED: 0.75, CRITICAL: 0.35, DESTROYED: 0 },
    // Footprint per navmesh (semplificata)
    navmeshFootprint: { type: 'box', width: 2, depth: 2 },
    // Effetti per stato
    effects: {
      DAMAGED:  { particles: 'smoke_light', attachPoint: [0, 3, 0] },
      CRITICAL: { particles: 'smoke_heavy', attachPoint: [0, 3, 0] },
      DESTROYED: { particles: 'fire_small', attachPoint: [0, 1, 0] }
    },
    // Elementi animati disponibili
    animatedElements: ['ballista', 'archer']
  },
  // ... altri tipi
};
```

#### 3.0.3 Formato mesh OBJ vs GLTF
**Decisione: usare GLTF (glTF 2.0)**
- Formato binario compatto (.glb) o JSON (.gltf)
- Supporto nativo Three.js via GLTFLoader
- Include materiali, texture, animazioni in un file
- Più efficiente di OBJ per caricamento e memoria
- Esportazione facile da Blender

**Struttura file assets:**
```
assets/
  buildings/
    guard_tower/
      intact.glb
      damaged.glb
      critical.glb
      destroyed.glb
    ballista_tower/
      ...
  walls/
    wall_segment.glb        // Template per generazione procedurale
    wall_damaged.glb
    wall_rubble.glb
  effects/
    smoke_particles.png
    fire_sprite.png
  animated/
    ballista.glb            // Con animazione di rotazione
    cannon.glb              // Con animazione rinculo
    archer_sprite.png       // Billboard arciere
```

#### 3.0.4 Sistema di caricamento Assets (AssetManager)
**Nuovo file: src/AssetManager.js**
```javascript
// Caricamento lazy con cache
// Preload di asset critici all'avvio
// Progress callback per loading screen
// Fallback a mesh procedurale se asset mancante
```

---

### 3.1 Sistema Edifici (BuildingSystem)

#### 3.1.1 Classe Building (src/Building.js)
Estende Entity con:
- `state`: INTACT | DAMAGED | CRITICAL | DESTROYED
- `meshes`: Map<state, THREE.Mesh> (precaricate o lazy)
- `currentMesh`: riferimento alla mesh attiva
- `effects`: array di effetti attivi (particelle)
- `animatedElement`: riferimento a elemento animato (opzionale)

**Metodi principali:**
```javascript
class Building extends Entity {
  constructor(definition, catalog) { ... }

  takeDamage(amount) {
    this.hp -= amount;
    this._updateState();
  }

  _updateState() {
    const newState = this._calculateState();
    if (newState !== this.state) {
      this._transitionToState(newState);
    }
  }

  _transitionToState(newState) {
    // 1. Nasconde mesh corrente
    // 2. Mostra nuova mesh
    // 3. Aggiorna effetti particellari
    // 4. Se DESTROYED, notifica per update navmesh
  }

  update(dt) {
    // Aggiorna effetti particellari
    // Aggiorna elemento animato
  }
}
```

#### 3.1.2 BuildingManager (in Game.js o separato)
Gestisce tutti gli edifici:
- `buildings`: Map<id, Building>
- `addBuilding(definition)`: crea e registra edificio
- `getBuildingAt(x, z)`: query spaziale
- `updateAll(dt)`: aggiorna tutti gli edifici
- `onBuildingDestroyed(building)`: callback per navmesh update

#### 3.1.3 Transizione mesh stati
Quando un edificio cambia stato:
1. Memorizza posizione/rotazione corrente
2. Nasconde mesh corrente (visible = false)
3. Mostra nuova mesh alla stessa posizione
4. Spawn/update effetti particellari
5. Se stato = DESTROYED:
   - Rimuovi footprint dalla navmesh
   - Trigger rigenerazione navmesh

---

### 3.2 Sistema Effetti Particellari (ParticleSystem)

#### 3.2.1 Nuovo file: src/ParticleSystem.js
Sistema basato su THREE.Points o sprite billboards:

```javascript
class ParticleEmitter {
  constructor(config) {
    this.position = new THREE.Vector3();
    this.particles = [];
    this.config = config; // rate, lifetime, velocity, color, size, texture
  }

  emit(count) { ... }
  update(dt) { ... }  // Aggiorna posizioni, alpha, rimuovi morte
  dispose() { ... }
}

class ParticleSystem {
  constructor(scene) {
    this.emitters = [];
    this.effectGroup = scene.getObjectByName('effectGroup');
  }

  createEffect(type, position) {
    // type: 'smoke_light', 'smoke_heavy', 'fire_small', 'explosion'
    const config = ParticleConfigs[type];
    const emitter = new ParticleEmitter(config);
    emitter.position.copy(position);
    this.emitters.push(emitter);
    return emitter;
  }

  update(dt) {
    this.emitters.forEach(e => e.update(dt));
    // Rimuovi emitter completati
  }
}
```

#### 3.2.2 Configurazioni effetti predefinite
```javascript
const ParticleConfigs = {
  smoke_light: {
    texture: 'smoke_particles.png',
    rate: 5,              // particelle/secondo
    lifetime: 2.0,        // secondi
    startSize: 0.5,
    endSize: 2.0,
    startAlpha: 0.6,
    endAlpha: 0,
    velocity: { x: 0, y: 1.5, z: 0 },
    velocityVariance: 0.3,
    color: 0x888888
  },
  smoke_heavy: {
    rate: 15,
    lifetime: 3.0,
    // ...simile ma più denso
  },
  fire_small: {
    texture: 'fire_sprite.png',
    rate: 20,
    lifetime: 0.8,
    startSize: 0.3,
    endSize: 0.1,
    startAlpha: 1.0,
    endAlpha: 0,
    velocity: { x: 0, y: 2.0, z: 0 },
    color: 0xff6600
  },
  explosion: {
    // Burst effect, non continuo
    burstCount: 50,
    lifetime: 0.5,
    // ...
  }
};
```

---

### 3.3 Elementi Animati Edifici

#### 3.3.1 Tipi di elementi animati
1. **Ballista rotante**: mesh 3D che ruota verso il bersaglio
2. **Cannone con rinculo**: animazione procedurale di rinculo
3. **Arcieri billboard**: sprite 2D che cambia frame

#### 3.3.2 Classe AnimatedElement (src/AnimatedElement.js)
```javascript
class AnimatedElement {
  constructor(type, parentBuilding) {
    this.type = type;
    this.parent = parentBuilding;
    this.mesh = null;  // o sprite per billboard
    this.state = 'idle';
    this.targetAngle = 0;
    this.currentAngle = 0;
  }

  aimAt(target) {
    // Calcola angolo verso target
    this.targetAngle = Math.atan2(target.z - this.parent.z, target.x - this.parent.x);
  }

  fire() {
    // Trigger animazione sparo/rinculo
    this.state = 'firing';
  }

  update(dt) {
    // Interpola rotazione verso targetAngle
    // Aggiorna animazione (rinculo, sprite frame)
  }
}
```

#### 3.3.3 Billboard Arcieri
```javascript
class ArcherBillboard extends AnimatedElement {
  constructor(parentBuilding) {
    super('archer', parentBuilding);
    // Sprite sempre rivolto alla camera
    this.sprite = new THREE.Sprite(archerMaterial);
    this.frames = { idle: 0, draw: 1, fire: 2 };
    this.currentFrame = 'idle';
  }

  update(dt, camera) {
    // Billboard: sprite.quaternion.copy(camera.quaternion)
    // Già gestito da THREE.Sprite automaticamente
    // Aggiorna UV per frame corrente se animato
  }
}
```

---

### 3.4 Sistema Mura Procedurali (WallSystem)

#### 3.4.1 Concetto: Mura a Segmenti
Le mura sono divise in segmenti discreti:
- Ogni segmento ha lunghezza fissa (es. 2 unità)
- Ogni segmento ha HP indipendente
- Stati segmento: INTACT → DAMAGED → DESTROYED
- Quando DESTROYED: breccia nella navmesh

#### 3.4.2 Struttura dati mura (nel JSON livello)
```json
{
  "walls": [
    {
      "id": "wall_north",
      "path": [[x1, z1], [x2, z2], [x3, z3]],  // Polyline
      "segmentLength": 2.0,
      "height": 3.0,
      "thickness": 0.5,
      "maxHpPerSegment": 50
    }
  ]
}
```

#### 3.4.3 Classe WallSystem (src/WallSystem.js)
```javascript
class WallSegment {
  constructor(start, end, index, config) {
    this.start = start;    // Vector2
    this.end = end;        // Vector2
    this.index = index;
    this.hp = config.maxHp;
    this.maxHp = config.maxHp;
    this.state = 'INTACT'; // INTACT | DAMAGED | DESTROYED
    this.mesh = null;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this._updateState();
  }

  _updateState() {
    const ratio = this.hp / this.maxHp;
    if (ratio <= 0) this.state = 'DESTROYED';
    else if (ratio < 0.5) this.state = 'DAMAGED';
    else this.state = 'INTACT';
  }
}

class WallSystem {
  constructor(scene) {
    this.walls = new Map();     // id → Wall
    this.segments = [];         // Tutti i segmenti flat
    this.wallGroup = new THREE.Group();
    scene.add(this.wallGroup);
  }

  addWall(definition) {
    const wall = this._createWallFromPath(definition);
    this.walls.set(definition.id, wall);
    this._buildWallMesh(wall);
  }

  _createWallFromPath(def) {
    // Suddivide il path in segmenti di lunghezza fissa
    const segments = [];
    let currentLength = 0;

    for (let i = 0; i < def.path.length - 1; i++) {
      const p1 = def.path[i];
      const p2 = def.path[i + 1];
      const edgeLength = distance(p1, p2);
      const direction = normalize(subtract(p2, p1));

      while (currentLength < edgeLength) {
        const segStart = add(p1, scale(direction, currentLength));
        const segEnd = add(p1, scale(direction, Math.min(currentLength + def.segmentLength, edgeLength)));
        segments.push(new WallSegment(segStart, segEnd, segments.length, def));
        currentLength += def.segmentLength;
      }
      currentLength -= edgeLength;
    }

    return { id: def.id, segments, config: def };
  }

  _buildWallMesh(wall) {
    // Genera mesh procedurale per tutti i segmenti
    // Versione base: prismi rettangolari
    // Versione avanzata: mesh dettagliata con merli, texture
  }

  getSegmentAt(x, z) {
    // Trova il segmento più vicino a un punto
    // Usato per determinare quale segmento viene attaccato
  }

  damageAt(x, z, amount, radius = 0) {
    // Infligge danno ai segmenti in un'area
    if (radius === 0) {
      const segment = this.getSegmentAt(x, z);
      segment?.takeDamage(amount);
    } else {
      // Danno AoE: tutti i segmenti nel raggio
      this.segments.forEach(seg => {
        if (distanceToSegment(x, z, seg) < radius) {
          seg.takeDamage(amount);
        }
      });
    }
  }

  rebuildMesh() {
    // Ricostruisce la mesh delle mura dopo cambiamenti di stato
    // Chiamato quando un segmento cambia stato
  }

  getNavmeshObstacles() {
    // Ritorna solo i segmenti NON distrutti per la navmesh
    return this.segments
      .filter(s => s.state !== 'DESTROYED')
      .map(s => this._segmentToObstacle(s));
  }

  getDestroyedSegments() {
    // Ritorna segmenti distrutti (per creare brecce)
    return this.segments.filter(s => s.state === 'DESTROYED');
  }
}
```

#### 3.4.4 Generazione Mesh Mura Procedurale
**Fase 1 - Blocchi semplici (stesso sistema navmesh):**
```javascript
_buildSimpleWallMesh(wall) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];

  wall.segments.forEach((seg, i) => {
    if (seg.state === 'DESTROYED') return; // Skip brecce

    // Genera prisma rettangolare
    const height = seg.state === 'DAMAGED' ? wall.config.height * 0.6 : wall.config.height;
    const vertices = this._createBoxVertices(seg.start, seg.end, wall.config.thickness, height);
    // ... aggiungi a positions/indices
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, wallMaterial);
}
```

**Fase 2 - Mura dettagliate (futuro):**
- Mesh con merli e dettagli architettonici
- Texture con mattoni/pietre
- Deformazione mesh per stato DAMAGED
- Macerie a terra per DESTROYED

---

### 3.5 Integrazione NavMesh Dinamica

#### 3.5.1 Trigger rigenerazione
La navmesh deve essere rigenerata quando:
1. Un segmento di mura passa a DESTROYED (crea breccia)
2. Un segmento di mura viene riparato (chiude breccia) [futuro]
3. Un edificio viene distrutto e cambia il suo footprint

#### 3.5.2 NavMesh Update Pipeline
```javascript
// In Game.js
onWallSegmentDestroyed(segment) {
  // 1. Marca navmesh come "dirty"
  this.navmeshDirty = true;
  this.navmeshUpdateTimer = 0.5; // Delay per batch multiple distruzioni
}

update(dt) {
  if (this.navmeshDirty) {
    this.navmeshUpdateTimer -= dt;
    if (this.navmeshUpdateTimer <= 0) {
      this._regenerateNavmesh();
      this.navmeshDirty = false;
    }
  }
}

_regenerateNavmesh() {
  // 1. Ottieni mesh combinata aggiornata
  const obstacles = [
    ...this.buildingManager.getNavmeshFootprints(),
    ...this.wallSystem.getNavmeshObstacles()
  ];

  // 2. Combina con ground mesh
  const combinedMesh = this._combineWithGround(obstacles);

  // 3. Rigenera navmesh con navcat
  const { navMesh, navMeshQuery } = await generateNavMesh(combinedMesh, navMeshConfig);

  // 4. Aggiorna crowd system
  this.crowdSystem.updateNavMesh(navMesh, navMeshQuery);

  // 5. Aggiorna visualizzazione navmesh (debug)
  this.sceneManager.rebuildNavMeshGeometry(navMesh);
}
```

#### 3.5.3 Ottimizzazione: Navmesh Parziale
Per livelli grandi, rigenerare tutta la navmesh è costoso.
Possibile ottimizzazione futura:
- Dividere navmesh in tile
- Rigenerare solo tile affected
- navcat supporta tiled navmesh (da verificare)

---

### 3.6 Pipeline Caricamento Livello Aggiornata

#### 3.6.1 Nuovo flusso loadLevel()
```javascript
async loadLevel(levelData) {
  // 1. Mostra loading screen
  this.hud.showLoading(0);

  // 2. Carica assets edifici (GLTF)
  const buildingTypes = new Set(levelData.buildings.map(b => b.type));
  await this.assetManager.preloadBuildings(buildingTypes, progress => {
    this.hud.showLoading(progress * 0.5);
  });

  // 3. Costruisci ground mesh (come prima)
  this.sceneManager.buildGround(levelData.ground);
  this.hud.showLoading(0.6);

  // 4. Inizializza sistema mura
  levelData.walls.forEach(wallDef => {
    this.wallSystem.addWall(wallDef);
  });
  this.hud.showLoading(0.7);

  // 5. Inizializza edifici
  levelData.buildings.forEach(buildingDef => {
    this.buildingManager.addBuilding(buildingDef);
  });
  this.hud.showLoading(0.8);

  // 6. Genera navmesh iniziale
  await this._regenerateNavmesh();
  this.hud.showLoading(0.95);

  // 7. Inizializza entità (mago, torri, etc.)
  this._initializeEntities(levelData);
  this.hud.showLoading(1.0);

  // 8. Nascondi loading, avvia gioco
  this.hud.hideLoading();
}
```

---

### 3.7 Checklist Implementazione

#### Fase 3.0 - Infrastruttura (Priorità Alta)
- [ ] Creare `src/AssetManager.js` con GLTFLoader
- [ ] Creare struttura cartelle `assets/`
- [ ] Creare `src/data/buildingCatalog.js` con definizioni placeholder
- [ ] Aggiornare formato JSON livello con nuovi campi

#### Fase 3.1 - Sistema Edifici (Priorità Alta)
- [ ] Creare `src/Building.js` estendendo Entity
- [ ] Implementare transizione stati mesh
- [ ] Implementare BuildingManager in Game.js
- [ ] Creare mesh placeholder procedurali per test
- [ ] Testare cambio stato con danno

#### Fase 3.2 - Sistema Mura (Priorità Alta)
- [ ] Creare `src/WallSystem.js`
- [ ] Implementare suddivisione path in segmenti
- [ ] Implementare generazione mesh procedurale (blocchi)
- [ ] Implementare danno a segmenti
- [ ] Implementare query segmento per posizione
- [ ] Testare distruzione segmenti

#### Fase 3.3 - Integrazione NavMesh (Priorità Alta)
- [ ] Refactoring navmesh generation per supportare update dinamici
- [ ] Implementare trigger rigenerazione su distruzione
- [ ] Implementare batching updates (delay 0.5s)
- [ ] Testare pathfinding attraverso brecce

#### Fase 3.4 - Sistema Particelle (Priorità Media)
- [ ] Creare `src/ParticleSystem.js`
- [ ] Implementare emitter base (smoke)
- [ ] Collegare effetti a stati edificio
- [ ] Aggiungere effetti fuoco per DESTROYED
- [ ] Aggiungere effetto esplosione

#### Fase 3.5 - Elementi Animati (Priorità Bassa)
- [ ] Creare `src/AnimatedElement.js`
- [ ] Implementare ballista rotante
- [ ] Implementare cannone con rinculo
- [ ] Implementare arciere billboard
- [ ] Collegare animazioni a eventi torre (sparo)

#### Fase 3.6 - Asset Finali (Priorità Bassa)
- [ ] Creare/ottenere mesh GLTF edifici (4 stati ciascuno)
- [ ] Creare/ottenere texture mura
- [ ] Creare sprite particelle (fumo, fuoco)
- [ ] Creare sprite arciere
- [ ] Implementare mesh mura dettagliate (merli, etc.)

---

## Fase 3b - Visual & Polish (Entità e Terreno)

### 3b.1 Modelli lowpoly entità
- [ ] Mago: modello lowpoly con cappello e bastone (o procedurale)
- [ ] Creature: forme geometriche distinctive per tipo
  - Gigante: cubo/cilindro grande marrone
  - Larva: piccola sfera gialla
  - Elementale: icosaedro cyan luminoso
- [ ] Tesoro: stella dorata 3D con aura

### 3b.2 Effetti visivi entità
- [ ] Barra HP 3D sopra ogni entita' (sprite billboard)
- [ ] Indicatore direzione movimento
- [ ] Particelle per impatti, evocazioni (usa ParticleSystem della Fase 3)
- [ ] Cerchio di range per torri (semitrasparente)
- [ ] Linea tratteggiata percorso mago

### 3b.3 Illuminazione
- [ ] Luci dinamiche per esplosioni/spell
- [ ] Ombre base (shadow map sulla directional light)
- [ ] Glow effect sull'elementale e sul mago

### 3b.4 Terreno
- [ ] Texture base per ground (erba procedurale o UV)
- [ ] Colori diversi per zone (erba, terra, fango)
- [ ] Grid sottile opzionale per debug
- [ ] Buche e alture come parte della mesh terreno (ostacoli naturali)

---

## Fase 4 - UI / HUD

### 4.1 HUD in-game
- [x] HP / Mana (barre colorate)
- [ ] Icone incantesimi con cooldown radiale
- [ ] Icone evocazione con costo mana
- [ ] Contatore creature attive
- [ ] Contatore torri rimaste
- [ ] Minimap (opzionale)

### 4.2 Menu
- [ ] Schermata titolo
- [ ] Selezione livello
- [ ] Pausa (ESC)
- [ ] Settings (volume, qualita' grafica)

---

## Fase 5 - Livelli e contenuto

### 5.1 Sistema livelli
- [ ] I livelli vengono creati dall'editor (mesh 3D + metadata)
- [ ] Aggiungere all'editor: posizionamento torri, tesoro, spawn nemici
- [ ] JSON livello contiene: mesh, startingPosition, towers[], treasure, waves[]
- [ ] Caricamento livelli da file o da lista predefinita

### 5.2 Waves / Rinforzi nemici
- [ ] Defenders che escono da caserme
- [ ] Timer wave: ondate di nemici a intervalli
- [ ] Diversi tipi di defender con stats diverse

### 5.3 Bilanciamento
- [ ] Tuning HP/danno/mana per ogni livello
- [ ] Curva di difficolta' progressiva
- [ ] Testare con almeno 3 livelli

---

## Fase 6 - Audio

- [ ] Musica di sottofondo (loop ambientale)
- [ ] SFX: sparo torre, impatto, esplosione, evocazione
- [ ] SFX: morte creatura, morte torre, vittoria, sconfitta
- [ ] Feedback audio per mana insufficiente / cooldown

---

## Fase 7 - Ottimizzazione

- [ ] Instanced rendering per creature (InstancedMesh)
- [ ] LOD per entita' lontane
- [ ] Frustum culling manuale per grandi livelli
- [ ] Object pooling per proiettili e particelle
- [ ] Profiling e target 60fps con 100+ entita'

---

## Note tecniche

### Coordinate
- Editor lavora in 2D (x, y) → export come 3D (x, 0, z)
- Three.js: Y e' l'asse verticale, XZ e' il piano di gioco
- Camera ortografica guarda dall'alto con angolo ~55 gradi

### Navmesh
- Generata dalla mesh 3D combinata (ground + strutture abilitate)
- Stessa pipeline di app.js (multi-agent con aree narrow)
- Crowd system di navcat gestisce pathfinding e collision avoidance
- **Dinamica**: rigenerata quando mura/edifici vengono distrutti (Fase 3.5)
- Batching: update ritardato 0.5s per raggruppare distruzioni multiple

### Struttura file
```
game3d/
  index.html          - Entry point HTML
  PIANO.md            - Questo file
  assets/
    buildings/        - Mesh GLTF edifici (4 stati per tipo)
    walls/            - Template mesh mura
    effects/          - Texture particelle (fumo, fuoco)
    animated/         - Mesh/sprite elementi animati
  src/
    main.js           - Bootstrap, game loop
    config.js         - Costanti, stats creature/torri/spell
    Game.js           - Orchestratore principale
    SceneManager.js   - Setup Three.js, camera, luci, rendering livello
    CrowdSystem.js    - Wrapper navcat (identico a game/)
    Entity.js         - Classe base entita'
    Wizard.js         - Mago controllato dal giocatore
    Creature.js       - Creature evocate
    Tower.js          - Torri nemiche
    Projectile.js     - Proiettili
    SpellSystem.js    - Sistema incantesimi
    InputManager.js   - Mouse + keyboard
    HUD.js            - Overlay HTML per stats
    # Nuovi file Fase 3
    AssetManager.js     - Caricamento GLTF con cache
    Building.js         - Classe edificio con stati danneggiamento
    WallSystem.js       - Sistema mura a segmenti con HP
    ParticleSystem.js   - Sistema effetti particellari
    AnimatedElement.js  - Elementi animati (ballista, cannone, arciere)
    data/
      buildingCatalog.js - Definizioni tipi edifici
```
