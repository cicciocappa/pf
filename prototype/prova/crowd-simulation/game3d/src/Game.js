// ========================================
// Game — classe principale che orchestra tutto (3D)
// ========================================

import * as THREE from 'three';
import {
    findNearestPoly,
    createFindNearestPolyResult,
    DEFAULT_QUERY_FILTER,
    getNodeByRef,
    addOffMeshConnection,
    OffMeshConnectionDirection,
    isOffMeshConnectionConnected,
    BuildContext,
    markWalkableTriangles,
    calculateMeshBounds,
    calculateGridSize,
    createHeightfield,
    rasterizeTriangles,
    filterLowHangingWalkableObstacles,
    filterLedgeSpans,
    filterWalkableLowHeightSpans,
    buildCompactHeightfield,
    erodeAndMarkWalkableAreas,
    medianFilterWalkableArea,
    buildDistanceField,
    buildRegionsMonotone,
    buildContours,
    buildPolyMesh,
    buildPolyMeshDetail,
    polyMeshToTilePolys,
    polyMeshDetailToTileDetailMesh,
    buildTile,
    addTile,
    createNavMesh,
    WALKABLE_AREA,
    ContourBuildFlags,
} from 'navcat';

import { crowd, floodFillNavMesh } from 'navcat/blocks';
import { vec3, box3, vec2 } from 'mathcat';

import { SceneManager } from './SceneManager.js';
import { CrowdSystem } from './CrowdSystem.js';
import { InputManager } from './InputManager.js';
import { SpellSystem } from './SpellSystem.js';
import { HUD } from './HUD.js';

import { Wizard } from './Wizard.js';
import { Creature } from './Creature.js';
import { Tower } from './Tower.js';
import { Projectile } from './Projectile.js';

import {
    EntityState,
    CreatureStats,
    CreatureType,
    SpellType,
    SMALL_RADIUS,
    LARGE_RADIUS,
    AREA_WALKABLE,
    AREA_WALKABLE_NARROW,
} from './config.js';

export class Game {
    constructor(container) {
        // Scene manager (Three.js)
        this.sceneManager = new SceneManager(container);
        this.victory = false;

        // Stato di gioco
        this.navMesh = null;
        this.crowdSystem = null;
        this.spellSystem = new SpellSystem(this);
        this.wizard = null;
        this.creatures = [];
        this.towers = [];
        this.projectiles = [];
        this.effects = [];

        // Treasure
        this.treasurePos = null;
        this.treasureMesh = null;

        // Selection
        this.selectedCreatures = new Set();

        // Dati mesh strutturati (dal JSON dell'editor)
        this.structuredMeshData = null;

        // HUD
        this.hud = new HUD(this);

        // Input (creato dopo scene manager)
        this.input = new InputManager(this.sceneManager, this);
    }

    // ========================================
    // Caricamento livello dall'editor JSON
    // ========================================

    loadLevel(json) {
        this._clearAll();

        if (!json.ground) {
            console.error('Formato JSON non valido: manca ground');
            return;
        }

        console.log('loadLevel: inizio caricamento...');
        console.log('  ground vertices:', json.ground.positions.length / 3);
        console.log('  structures:', json.structures?.length || 0);
        console.log('  startingPosition:', json.startingPosition);

        this.structuredMeshData = json;

        // Combina mesh e genera navmesh
        const combined = this._combineMeshData();
        if (!combined || combined.positions.length < 9 || combined.indices.length < 3) {
            console.error('Mesh combinata non valida');
            return;
        }

        console.log('  combined mesh: vertices=', combined.positions.length / 3, 'triangles=', combined.indices.length / 3);

        // Genera navmesh
        let navMesh;
        try {
            navMesh = this._generateNavMeshMultiAgent(combined.positions, combined.indices);
        } catch (e) {
            console.error('NavMesh generation failed:', e);
            return;
        }

        this.navMesh = navMesh;
        console.log('  navMesh generata, tiles:', Object.keys(navMesh.tiles).length);

        // Imposta flags sulle polys
        for (const tileId of Object.keys(this.navMesh.tiles)) {
            const tile = this.navMesh.tiles[tileId];
            for (let i = 0; i < tile.polys.length; i++) {
                tile.polys[i].flags = i + 1;
                const nodeIdx = tile.polyNodes[i];
                this.navMesh.nodes[nodeIdx].flags = i + 1;
            }
        }

        // Off-mesh connections
        const offMeshConnections = json.offMeshConnections || [];
        for (const conn of offMeshConnections) {
            addOffMeshConnection(this.navMesh, {
                start: conn.start,
                end: conn.end,
                radius: conn.radius || 0.5,
                direction: conn.bidirectional
                    ? OffMeshConnectionDirection.BIDIRECTIONAL
                    : OffMeshConnectionDirection.START_TO_END,
                flags: 0xffffff,
                area: 0,
            });
        }

        // Flood fill pruning
        this._floodFillPrune(json.seedPoints || []);

        // Estrai dati rendering navmesh
        const { renderVertices, renderPolygons } = this._extractRenderData();
        console.log('  renderPolygons:', renderPolygons.length, 'renderVertices:', renderVertices.length);

        // Crowd system
        this.crowdSystem = new CrowdSystem(this.navMesh);

        // Costruisci geometria 3D del livello
        this.sceneManager.buildLevelGeometry(json);
        this.sceneManager.buildNavMeshGeometry(renderVertices, renderPolygons);
        console.log('  geometria livello costruita, levelGroup children:', this.sceneManager.levelGroup.children.length);

        // Wizard alla starting position
        if (json.startingPosition) {
            const sx = json.startingPosition[0];
            const sz = json.startingPosition[2];
            this.wizard = new Wizard(sx, sz);
            const visual = this.wizard.createVisual();
            this.sceneManager.entityGroup.add(visual);
            this.crowdSystem.addAgent(this.wizard);
        }

        // Torri (se specificate nel JSON)
        if (json.towers) {
            for (const td of json.towers) {
                const tower = new Tower(td.x, td.z, td.type);
                this.towers.push(tower);
                const visual = tower.createVisual();
                this.sceneManager.entityGroup.add(visual);
            }
        }

        // Tesoro (se specificato)
        if (json.treasure) {
            this.treasurePos = { x: json.treasure[0], z: json.treasure[2] };
            this._createTreasureMesh(this.treasurePos.x, this.treasurePos.z);
        }

        // Centra camera — usa navmesh vertices, fallback su ground positions
        if (renderVertices.length > 0) {
            this.sceneManager.centerCameraOnPositions(renderVertices);
        } else if (json.ground && json.ground.positions.length > 0) {
            this.sceneManager.centerCameraOnPositions(json.ground.positions);
        }

        console.log('Livello caricato!');
        console.log(`  NavMesh: ${renderPolygons.length} poligoni`);
        console.log(`  Strutture: ${json.structures.length}`);
    }

    _clearAll() {
        // Rimuovi entità dalla scena
        this.sceneManager._clearGroup(this.sceneManager.entityGroup);
        this.sceneManager._clearGroup(this.sceneManager.projectileGroup);
        this.sceneManager._clearGroup(this.sceneManager.effectGroup);

        this.selectedCreatures.clear();
        this.creatures = [];
        this.towers = [];
        this.projectiles = [];
        this.effects = [];
        this.wizard = null;
        this.victory = false;
        this.treasurePos = null;
        this.treasureMesh = null;
    }

    _createTreasureMesh(x, z) {
        const group = new THREE.Group();

        // Stella dorata (torusKnot come placeholder vistoso)
        const geom = new THREE.TorusKnotGeometry(0.25, 0.08, 64, 8, 2, 3);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xFFD700,
            emissive: 0x553300,
        });
        const star = new THREE.Mesh(geom, mat);
        star.position.y = 0.5;
        group.add(star);

        // Aura dorata
        const auraGeom = new THREE.RingGeometry(0, 0.6, 24);
        const auraMat = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
        });
        const aura = new THREE.Mesh(auraGeom, auraMat);
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.02;
        group.add(aura);

        group.position.set(x, 0, z);
        this.sceneManager.entityGroup.add(group);
        this.treasureMesh = { group, star };
    }

    // ========================================
    // Input handlers (chiamati da InputManager)
    // ========================================

    onRightClick(worldPos) {
        if (!this.wizard || !this.wizard.alive) return;

        if (this.selectedCreatures.size === 0) {
            // Nessuna selezione: muovi solo il mago
            this.crowdSystem.requestMove(this.wizard, worldPos.x, worldPos.z);
            this.wizard.state = EntityState.MOVING;
        } else {
            // Muovi tutte le unità selezionate in formazione a spirale
            const units = [...this.selectedCreatures].filter(
                c => c.alive && c.crowdAgentId != null
            );
            const targets = this._spiralFormation(
                worldPos.x, worldPos.z,
                units.length
            );
            for (let i = 0; i < units.length; i++) {
                const c = units[i];
                const t = targets[i];
                this.crowdSystem.requestMove(c, t.x, t.z);
                c.state = EntityState.MOVING;
                if (c.attackTarget) c.attackTarget = null;
            }
        }
    }

    onLeftClick(worldPos) {
        // Cerca torre nemica vicina al click
        const target = this._findEntityAt(worldPos.x, worldPos.z, 'enemy');
        if (target) {
            this._orderAttack(target);
        }
    }

    onCastSpell(spellType, worldPos) {
        if (!this.wizard || !this.wizard.alive) return;
        this.spellSystem.cast(spellType, this.wizard, worldPos.x, worldPos.z);
    }

    onSummonCreature(creatureType) {
        if (!this.wizard || !this.wizard.alive) return;

        const stats = CreatureStats[creatureType];
        if (!stats) return;

        if (!this.wizard.canCast(stats.manaCost)) {
            console.log('Mana insufficiente per evocare');
            return;
        }

        this.wizard.spendMana(stats.manaCost);

        const count = stats.spawnCount || 1;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
            const dist = 0.8 + Math.random() * 0.5;
            const cx = this.wizard.x + Math.cos(angle) * dist;
            const cz = this.wizard.z + Math.sin(angle) * dist;

            const creature = new Creature(cx, cz, creatureType);
            this.creatures.push(creature);
            const visual = creature.createVisual();
            this.sceneManager.entityGroup.add(visual);
            this.crowdSystem.addAgent(creature);
        }

        console.log(`Evocato: ${stats.label} x${count}`);
    }

    _orderAttack(target) {
        for (const c of this.creatures) {
            if (!c.alive) continue;
            c.attackTarget = target;
            c.state = EntityState.MOVING;

            if (c.crowdAgentId != null) {
                this.crowdSystem.requestMove(c, target.x, target.z);
            }
        }
        console.log(`Creature ordinate ad attaccare: ${target.towerType} [HP: ${target.hp}]`);
    }

    _findEntityAt(wx, wz, faction) {
        const entities = faction === 'enemy' ? this.towers : [this.wizard, ...this.creatures];
        let closest = null;
        let closestDist = 1.5; // raggio di selezione max

        for (const e of entities) {
            if (!e || !e.alive) continue;
            const dx = e.x - wx;
            const dz = e.z - wz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < closestDist) {
                closestDist = d;
                closest = e;
            }
        }
        return closest;
    }

    // ========================================
    // Selection
    // ========================================

    selectCreature(creature, additive = false) {
        if (!additive) this.deselectAll();
        if (creature && creature.alive) {
            this.selectedCreatures.add(creature);
            creature.setSelected(true);
        }
    }

    selectCreatures(creatures, additive = false) {
        if (!additive) this.deselectAll();
        for (const c of creatures) {
            if (c && c.alive) {
                this.selectedCreatures.add(c);
                c.setSelected(true);
            }
        }
    }

    deselectAll() {
        for (const c of this.selectedCreatures) {
            c.setSelected(false);
        }
        this.selectedCreatures.clear();
    }

    selectAllOfType(creatureType) {
        this.deselectAll();
        for (const c of this.creatures) {
            if (c.alive && c.creatureType === creatureType) {
                this.selectedCreatures.add(c);
                c.setSelected(true);
            }
        }
    }

    getCreaturesInRect(x1, z1, x2, z2) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);
        const result = [];
        for (const c of this.creatures) {
            if (!c.alive) continue;
            if (c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ) {
                result.push(c);
            }
        }
        return result;
    }

    /**
     * Genera posizioni a cerchi concentrici attorno a un centro (pattern RTS).
     * Il primo anello ha 6 slot, ogni anello successivo ne ha 6 in più.
     */
    _spiralFormation(cx, cz, count) {
        if (count <= 1) return [{ x: cx, z: cz }];

        const positions = [{ x: cx, z: cz }];
        const spacing = 0.9;
        let ring = 1;
        let placed = 1;

        while (placed < count) {
            const radius = spacing * ring;
            const slotsInRing = 6 * ring;
            const unitsInRing = Math.min(slotsInRing, count - placed);
            const angleStep = (Math.PI * 2) / unitsInRing;
            // Offset angolare alternato per anelli pari/dispari
            const angleOffset = (ring % 2 === 0) ? angleStep / 2 : 0;

            for (let i = 0; i < unitsInRing; i++) {
                const angle = angleOffset + angleStep * i;
                positions.push({
                    x: cx + Math.cos(angle) * radius,
                    z: cz + Math.sin(angle) * radius,
                });
                placed++;
            }
            ring++;
        }

        return positions;
    }

    // ========================================
    // Update loop
    // ========================================

    update(dt) {
        if (this.victory || (this.wizard && !this.wizard.alive)) {
            this.hud.update();
            return;
        }

        // Input (camera pan)
        this.input.update(dt);

        // Crowd simulation
        if (this.crowdSystem) {
            this.crowdSystem.update(dt);
        }

        // Aggiorna entità
        if (this.wizard) this.wizard.update(dt);

        for (const c of this.creatures) c.update(dt);
        for (const t of this.towers) t.update(dt);

        // Torri sparano
        this._updateTowersFiring(dt);

        // Creature attaccano (muovono verso bersaglio)
        this._updateCreatureAttacks(dt);

        // Proiettili
        this._updateProjectiles(dt);

        // Spell system
        this.spellSystem.update(dt);

        // Effetti
        this._updateEffects(dt);

        // Pulizia morti
        this._cleanupDead();

        // Vittoria
        this._checkVictory();

        // Anima tesoro
        this._animateTreasure(dt);

        // Camera segue il mago
        if (this.wizard && this.wizard.alive) {
            this.sceneManager.centerCameraOn(this.wizard.x, this.wizard.z);
        }

        // Camera update
        this.sceneManager.updateCamera(dt);

        // HUD
        this.hud.update();
    }

    render() {
        this.sceneManager.render();
    }

    _updateTowersFiring(dt) {
        const playerEntities = [this.wizard, ...this.creatures].filter(e => e && e.alive);

        for (const tower of this.towers) {
            if (!tower.alive || !tower.canFire()) continue;

            const target = tower.selectTarget(playerEntities);
            if (!target) continue;

            tower.fire();
            const proj = new Projectile(
                tower.x, tower.z,
                target,
                tower.projectileSpeed,
                tower.attackDamage,
                0xFFFF00,
                tower.aoeRadius
            );
            this.addProjectile(proj);
        }
    }

    _updateCreatureAttacks(dt) {
        for (const c of this.creatures) {
            if (!c.alive || !c.attackTarget || !c.attackTarget.alive) continue;

            const dx = c.attackTarget.x - c.x;
            const dz = c.attackTarget.z - c.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist <= c.attackRange) {
                c.state = EntityState.ATTACKING;
            } else {
                if (c.crowdAgentId != null) {
                    this.crowdSystem.requestMove(c, c.attackTarget.x, c.attackTarget.z);
                }
            }
        }
    }

    _updateProjectiles(dt) {
        for (const p of this.projectiles) {
            if (!p.alive) continue;
            const hit = p.update(dt);
            if (hit) {
                if (p._onHit) {
                    p._onHit();
                } else {
                    if (p.target.alive && typeof p.target.takeDamage === 'function') {
                        p.target.takeDamage(p.damage);
                    }
                }
            }
        }
    }

    _updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i];
            fx.timer -= dt;

            const progress = 1 - fx.timer / fx.duration;
            fx.group.scale.set(1 + progress * 0.5, 1, 1 + progress * 0.5);
            fx.group.traverse((obj) => {
                if (obj.material && obj.material.transparent) {
                    obj.material.opacity = Math.max(0, (1 - progress) * 0.6);
                }
            });

            if (fx.timer <= 0) {
                this.sceneManager.effectGroup.remove(fx.group);
                fx.group.traverse((obj) => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                });
                this.effects.splice(i, 1);
            }
        }
    }

    _cleanupDead() {
        // Creature morte
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const c = this.creatures[i];
            if (!c.alive) {
                this.selectedCreatures.delete(c);
                this.crowdSystem.removeAgent(c);
                if (c.group) {
                    this.sceneManager.entityGroup.remove(c.group);
                    c.dispose();
                }
                this.creatures.splice(i, 1);
            }
        }

        // Torri morte
        for (const t of this.towers) {
            if (!t.alive && t.group && t.group.visible) {
                t.group.visible = false;
                if (this.wizard && this.wizard.alive) {
                    this.wizard.collectEssence(5);
                }
            }
        }

        // Proiettili spenti
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (!this.projectiles[i].alive) {
                const p = this.projectiles[i];
                if (p.mesh) {
                    this.sceneManager.projectileGroup.remove(p.mesh);
                    p.dispose();
                }
                this.projectiles.splice(i, 1);
            }
        }
    }

    _checkVictory() {
        if (!this.wizard || !this.wizard.alive || !this.treasurePos) return;

        const dx = this.wizard.x - this.treasurePos.x;
        const dz = this.wizard.z - this.treasurePos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 0.6) {
            this.victory = true;
            console.log('VITTORIA! Il mago ha raggiunto il tesoro!');
        }
    }

    _animateTreasure(dt) {
        if (this.treasureMesh && this.treasureMesh.star) {
            this.treasureMesh.star.rotation.y += dt * 1.5;
            this.treasureMesh.star.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.1;
        }
    }

    // ========================================
    // Utilities pubbliche
    // ========================================

    addProjectile(proj) {
        this.projectiles.push(proj);
        const visual = proj.createVisual();
        this.sceneManager.projectileGroup.add(visual);
    }

    getAllEntities() {
        const all = [...this.towers, ...this.creatures];
        if (this.wizard) all.push(this.wizard);
        return all;
    }

    showExplosion(cx, cz, radius) {
        const fx = this.sceneManager.showExplosion(cx, cz, radius);
        this.effects.push(fx);
    }

    // ========================================
    // NavMesh Generation Pipeline (da app.js)
    // ========================================

    _combineMeshData() {
        const data = this.structuredMeshData;
        if (!data) return null;

        const positions = [];
        const indices = [];

        for (let i = 0; i < data.ground.positions.length; i++) {
            positions.push(data.ground.positions[i]);
        }
        for (let i = 0; i < data.ground.indices.length; i++) {
            indices.push(data.ground.indices[i]);
        }

        for (const s of data.structures) {
            const offset = positions.length / 3;
            for (let i = 0; i < s.positions.length; i++) {
                positions.push(s.positions[i]);
            }
            for (let i = 0; i < s.indices.length; i++) {
                indices.push(s.indices[i] + offset);
            }
        }

        if (data.staticObstacles && data.staticObstacles.positions.length > 0) {
            const offset = positions.length / 3;
            for (let i = 0; i < data.staticObstacles.positions.length; i++) {
                positions.push(data.staticObstacles.positions[i]);
            }
            for (let i = 0; i < data.staticObstacles.indices.length; i++) {
                indices.push(data.staticObstacles.indices[i] + offset);
            }
        }

        return { positions, indices };
    }

    _buildTileFromMesh(positions, indices) {
        const ctx = BuildContext.create();
        BuildContext.start(ctx, 'navmesh generation');

        const cs = 0.15;
        const ch = 0.15;
        const walkableRadiusVoxels = Math.ceil(SMALL_RADIUS / cs);
        const walkableHeightVoxels = Math.ceil(2.0 / ch);
        const walkableClimbVoxels = Math.ceil(0.5 / ch);
        const walkableSlopeAngleDegrees = 45;
        const borderSize = 0;
        const minRegionArea = 8;
        const mergeRegionArea = 20;
        const maxSimplificationError = 1.3;
        const maxEdgeLength = Math.floor(12 / cs);
        const maxVerticesPerPoly = 6;
        const detailSampleDistance = 6;
        const detailSampleMaxError = 1;

        const walkableRadiusThresholds = [
            {
                areaId: AREA_WALKABLE_NARROW,
                walkableRadiusVoxels: Math.ceil(LARGE_RADIUS / cs),
            }
        ];

        const triAreaIds = new Uint8Array(indices.length / 3).fill(0);
        markWalkableTriangles(positions, indices, triAreaIds, walkableSlopeAngleDegrees);

        const bounds = calculateMeshBounds(box3.create(), positions, indices);
        const [hfWidth, hfHeight] = calculateGridSize(vec2.create(), bounds, cs);
        const heightfield = createHeightfield(hfWidth, hfHeight, bounds, cs, ch);
        rasterizeTriangles(ctx, heightfield, positions, indices, triAreaIds, walkableClimbVoxels);

        filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
        filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
        filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

        const compactHf = buildCompactHeightfield(ctx, walkableHeightVoxels, walkableClimbVoxels, heightfield);

        erodeAndMarkWalkableAreas(walkableRadiusVoxels, walkableRadiusThresholds, compactHf);
        medianFilterWalkableArea(compactHf);

        buildDistanceField(compactHf);
        buildRegionsMonotone(compactHf, borderSize, minRegionArea, mergeRegionArea);

        const contourSet = buildContours(
            ctx, compactHf, maxSimplificationError, maxEdgeLength,
            ContourBuildFlags.CONTOUR_TESS_WALL_EDGES
        );

        const polyMesh = buildPolyMesh(ctx, contourSet, maxVerticesPerPoly);

        for (let i = 0; i < polyMesh.nPolys; i++) {
            if (polyMesh.areas[i] === WALKABLE_AREA) {
                polyMesh.areas[i] = AREA_WALKABLE;
            }
            if (polyMesh.areas[i] !== 0) {
                polyMesh.flags[i] = 1;
            }
        }

        const polyMeshDetail = buildPolyMeshDetail(ctx, polyMesh, compactHf, detailSampleDistance, detailSampleMaxError);

        BuildContext.end(ctx, 'navmesh generation');

        const tilePolys = polyMeshToTilePolys(polyMesh);
        const tileDetailMesh = polyMeshDetailToTileDetailMesh(tilePolys.polys, polyMeshDetail);

        const tileParams = {
            bounds: polyMesh.bounds,
            vertices: tilePolys.vertices,
            polys: tilePolys.polys,
            detailMeshes: tileDetailMesh.detailMeshes,
            detailVertices: tileDetailMesh.detailVertices,
            detailTriangles: tileDetailMesh.detailTriangles,
            tileX: 0,
            tileY: 0,
            tileLayer: 0,
            cellSize: cs,
            cellHeight: ch,
            walkableHeight: 2.0,
            walkableRadius: SMALL_RADIUS,
            walkableClimb: 0.5,
        };

        const tile = buildTile(tileParams);
        return { tile, polyMesh };
    }

    _generateNavMeshMultiAgent(positions, indices) {
        const { tile, polyMesh } = this._buildTileFromMesh(positions, indices);

        const nav = createNavMesh();
        nav.tileWidth = polyMesh.bounds[1][0] - polyMesh.bounds[0][0];
        nav.tileHeight = polyMesh.bounds[1][2] - polyMesh.bounds[0][2];
        vec3.copy(nav.origin, polyMesh.bounds[0]);

        addTile(nav, tile);

        return nav;
    }

    _floodFillPrune(seedPoints) {
        if (!seedPoints || seedPoints.length === 0) return;

        const halfExtents = [1, 1, 1];
        const startRefs = [];

        for (const sp of seedPoints) {
            const result = findNearestPoly(
                createFindNearestPolyResult(),
                this.navMesh,
                sp,
                halfExtents,
                DEFAULT_QUERY_FILTER
            );
            if (result.nodeRef !== 0) {
                startRefs.push(result.nodeRef);
            }
        }

        if (startRefs.length === 0) return;

        const { unreachable } = floodFillNavMesh(this.navMesh, startRefs);

        for (const nodeRef of unreachable) {
            const node = getNodeByRef(this.navMesh, nodeRef);
            node.flags = 0;

            const tile = this.navMesh.tiles[node.tileId];
            tile.polys[node.polyIndex].flags = 0;
        }

        console.log(`Flood fill: ${startRefs.length} seeds, ${unreachable.length} unreachable polys disabled`);
    }

    _extractRenderData() {
        const renderVertices = [];
        const renderPolygons = [];

        for (const tileId of Object.keys(this.navMesh.tiles)) {
            const tile = this.navMesh.tiles[tileId];
            // Use tile vertices directly (they're a flat array)
            const verts = tile.vertices;

            for (let i = 0; i < tile.polys.length; i++) {
                const poly = tile.polys[i];
                renderPolygons.push({
                    vertices: poly.vertices.slice(),
                    neis: poly.neis ? poly.neis.slice() : [],
                    area: poly.area,
                    flags: poly.flags,
                });
            }

            return { renderVertices: verts, renderPolygons };
        }

        return { renderVertices: [], renderPolygons: [] };
    }
}
