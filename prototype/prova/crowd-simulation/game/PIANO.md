# Piano di Sviluppo Prototipo - "Tower Attack"

## Obiettivo
Prototipo 2D top-down in JavaScript/Pixi.js per validare le meccaniche di gameplay
descritte in gameplay.txt. Visuale top-down con sprite sheet per edifici e unita'.
Pathfinding basato su navcat (navmesh + crowd simulation).

---

## Fase 1 - Fondamenta (Rendering + Mappa)

1. **Setup progetto**: HTML + Pixi.js + navcat, game loop base
2. **Mappa e terreno**: Griglia di tile con tipi di terreno (grass, mud, wall, water, forest, ecc.)
   - Rendering tile-based top-down
   - Editor minimale per piazzare tile (o caricamento da JSON)
3. **Camera**: Pan (WASD/drag), zoom (rotella), viewport clipping
4. **NavMesh generation**: Dalla mappa di tile, generare la navmesh per navcat
   (le zone walkable diventano poligoni della navmesh)

## Fase 2 - Unita' e Movimento

5. **Sistema entita'**: Classe base Entity con posizione, HP, stato (FSM)
6. **Mago (eroe)**: Sprite con 8/16 direzioni, controllo diretto del giocatore
   - Click per muoversi, pathfinding via navcat
7. **Creature evocate**: Larva, Gigante, Elementale, Spettro
   - Sprite sheet multi-direzione
   - Spawning dal mago, movimento autonomo verso bersaglio
   - Parametro "Intelligenza" per il pathfinding (risk heatmap)
8. **Crowd simulation**: Integrazione navcat crowd per evitamento collisioni tra unita'

## Fase 3 - Strutture Difensive

9. **Torri**: Torre di Guardia, Balista, Torre Alchemica, Obelisco Antimagia
   - Sprite sheet (angolazioni diverse o singolo sprite top-down)
   - Raggio d'azione, cadenza, danno, logica di targeting
10. **Caserme**: Spawner di fanteria nemica con logica patrol/chase/attack
11. **Mura**: Ostacoli distruttibili che bloccano il pathfinding
12. **Heatmap dei rischi**: Mappa dinamica dei pericoli per il pathfinding intelligente

## Fase 4 - Combattimento

13. **Sistema di danno**: HP, armatura, modificatori elementali, morte
14. **Proiettili**: Frecce, palle di fuoco, veleno - con traiettoria visuale
15. **Targeting torri**: Logiche diverse (Proximity, Random, Priority, High-Value)
16. **Attacco creature**: Le creature attaccano strutture quando in range
17. **Truppe difensive**: FSM (IDLE -> CHASE -> ATTACK), spawn da caserme

## Fase 5 - Magia

18. **Sistema mana/essenza**: Raccolta anime dai nemici sconfitti
19. **Incantesimi distruttivi**: Palla di Fuoco, Corrosione
20. **Incantesimi utilita'**: Ponte di Ghiaccio, Incendio Boschivo, Nebbia Oscura
21. **Incantesimi buff/debuff**: Scudo, Frenesia, Rallentamento
22. **Portali**: Teletrasporto truppe

## Fase 6 - Oggetti e Inventario

23. **Pozioni/Reliquie**: Oggetti sulla mappa raccoglibili dal mago
24. **Inventario**: Slot limitati, attivazione con tasti 1-2-3
25. **Effetti pozioni**: Range, danno, velocita', mana, invisibilita'

## Fase 7 - UI e Game Loop

26. **HUD**: Barra HP mago, mana, inventario, minimap
27. **Selezione unita'**: Click + drag rettangolare (stile RTS)
28. **Pannello incantesimi**: Barra inferiore con hotkey
29. **Condizioni vittoria/sconfitta**: Raggiungere il tesoro / morte del mago
30. **Livello di prova**: Una mappa completa per testare tutte le meccaniche

---

## Architettura Codice (proposta)

```
game/
  index.html          - Entry point
  src/
    main.js           - Bootstrap, game loop
    config.js          - Costanti, bilanciamento

    core/
      Game.js          - Stato globale, update/render loop
      Camera.js        - Pan, zoom, viewport
      InputManager.js  - Mouse, tastiera, selezione

    map/
      TileMap.js       - Griglia terreno, tipi tile
      NavMeshBuilder.js - Generazione navmesh da tilemap
      RiskHeatmap.js   - Mappa pericoli per pathfinding

    entities/
      Entity.js        - Base: posizione, HP, FSM, sprite
      Wizard.js        - Eroe controllato dal giocatore
      Creature.js      - Creature evocate (Larva, Gigante, ecc.)
      Tower.js         - Strutture difensive
      Barracks.js      - Spawner truppe nemiche
      Defender.js      - Truppe difensive
      Projectile.js    - Proiettili

    systems/
      CombatSystem.js  - Danno, morte, loot essenze
      SpellSystem.js   - Incantesimi, cooldown, effetti
      CrowdSystem.js   - Wrapper navcat crowd
      InventorySystem.js - Pozioni, raccolta, uso

    ui/
      HUD.js           - Overlay Pixi per HP, mana, inventario
      SelectionBox.js  - Selezione rettangolare RTS

    assets/
      sprites/         - Sprite sheet PNG
      maps/            - Mappe JSON
```

---

## Priorita' per il Prototipo Minimo Giocabile

Per validare il gameplay il piu' rapidamente possibile, suggerirei di concentrarci
prima su un "vertical slice" con:

1. Mappa semplice con pochi tipi di terreno
2. Mago che si muove sulla navmesh
3. Una creatura evocabile (Gigante)
4. Una torre che spara
5. Sistema danno base
6. Un incantesimo (Palla di Fuoco)

Questo ci darebbe gia' il core loop: evocare creature, farle avanzare,
usare incantesimi per supportarle, e vedere se le meccaniche "funzionano".
