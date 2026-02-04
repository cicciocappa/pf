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

## Fase 3 - Visual & Polish

### 3.1 Modelli lowpoly
- [ ] Mago: modello lowpoly con cappello e bastone (o procedurale)
- [ ] Creature: forme geometriche distinctive per tipo
  - Gigante: cubo/cilindro grande marrone
  - Larva: piccola sfera gialla
  - Elementale: icosaedro cyan luminoso
- [ ] Torri: prismi con dettagli (merli, texture)
- [ ] Tesoro: stella dorata 3D con aura

### 3.2 Effetti visivi
- [ ] Barra HP 3D sopra ogni entita' (sprite billboard)
- [ ] Indicatore direzione movimento
- [ ] Particelle per impatti, esplosioni, evocazioni
- [ ] Cerchio di range per torri (semitrasparente)
- [ ] Linea tratteggiata percorso mago

### 3.3 Illuminazione
- [ ] Luci dinamiche per esplosioni/spell
- [ ] Ombre base (shadow map sulla directional light)
- [ ] Glow effect sull'elementale e sul mago

### 3.4 Terreno
- [ ] Texture base per ground (erba procedurale o UV)
- [ ] Colori diversi per zone (erba, terra, fango)
- [ ] Grid sottile opzionale per debug

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

### Struttura file
```
game3d/
  index.html          - Entry point HTML
  PIANO.md            - Questo file
  src/
    main.js           - Bootstrap, game loop
    config.js          - Costanti, stats creature/torri/spell
    Game.js            - Orchestratore principale
    SceneManager.js    - Setup Three.js, camera, luci, rendering livello
    CrowdSystem.js     - Wrapper navcat (identico a game/)
    Entity.js          - Classe base entita'
    Wizard.js          - Mago controllato dal giocatore
    Creature.js        - Creature evocate
    Tower.js           - Torri nemiche
    Projectile.js      - Proiettili
    SpellSystem.js     - Sistema incantesimi
    InputManager.js    - Mouse + keyboard
    HUD.js             - Overlay HTML per stats
```
