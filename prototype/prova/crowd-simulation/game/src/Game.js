// ========================================
// Game — classe principale che orchestra tutto
// ========================================

import { Camera } from './Camera.js';
import { InputManager } from './InputManager.js';
import { TileMap } from './TileMap.js';
import { buildNavMeshFromTileMap } from './NavMeshBuilder.js';
import { CrowdSystem } from './CrowdSystem.js';
import { SpellSystem } from './SpellSystem.js';
import { HUD } from './HUD.js';

import { Wizard } from './Wizard.js';
import { Creature } from './Creature.js';
import { Tower } from './Tower.js';
import { Projectile } from './Projectile.js';

import { EntityState, CreatureStats, CreatureType, SpellType, WizardStats } from './config.js';

export class Game {
    constructor(pixiApp) {
        this.app = pixiApp;
        this.camera = new Camera();
        this.victory = false;

        // Layer Pixi
        this.worldContainer = new PIXI.Container();
        this.tileLayer = new PIXI.Container();
        this.rangeLayer = new PIXI.Container();    // range indicator per torri
        this.entityLayer = new PIXI.Container();
        this.projectileLayer = new PIXI.Container();
        this.effectLayer = new PIXI.Container();

        this.worldContainer.addChild(this.tileLayer);
        this.worldContainer.addChild(this.rangeLayer);
        this.worldContainer.addChild(this.entityLayer);
        this.worldContainer.addChild(this.projectileLayer);
        this.worldContainer.addChild(this.effectLayer);

        this.app.stage.addChild(this.worldContainer);

        // HUD (sopra tutto, coordinate schermo)
        this.hud = new HUD(this);
        this.app.stage.addChild(this.hud.container);

        // Stato di gioco
        this.tileMap = null;
        this.navMesh = null;
        this.crowdSystem = null;
        this.spellSystem = new SpellSystem(this);
        this.wizard = null;
        this.creatures = [];
        this.towers = [];
        this.projectiles = [];
        this.effects = [];     // effetti visuali temporanei

        // Treasure
        this.treasurePos = null;
        this.treasureGraphics = null;

        // Summon mode
        this.summonMode = null; // null o { creatureType }
        this.summonCircle = null;
        this._createSummonCircle();

        // Input
        this.input = new InputManager(this.app.view, this.camera, this);
    }

    _createSummonCircle() {
        this.summonCircle = new PIXI.Graphics();
        this.summonCircle.visible = false;
        this.entityLayer.addChild(this.summonCircle);
    }

    _drawSummonCircle(color) {
        const r = WizardStats.summonRange;
        const g = this.summonCircle;
        g.clear();
        // Cerchio semitrasparente
        g.beginFill(color, 0.08);
        g.drawCircle(0, 0, r);
        g.endFill();
        // Bordo
        g.lineStyle(0.05, color, 0.5);
        g.drawCircle(0, 0, r);
    }

    // ========================================
    // Caricamento livello
    // ========================================
    loadLevel(levelData) {
        // Pulisci stato precedente
        this._clearAll();

        // Tile map
        this.tileMap = new TileMap(levelData.cols, levelData.rows, levelData.tiles);
        const tileGfx = this.tileMap.createGraphics();
        this.tileLayer.addChild(tileGfx);

        // NavMesh
        this.navMesh = buildNavMeshFromTileMap(this.tileMap);
        if (!this.navMesh) {
            console.error('Impossibile creare la navmesh!');
            return;
        }

        // Crowd system
        this.crowdSystem = new CrowdSystem(this.navMesh);

        // Wizard
        const ws = levelData.wizardStart;
        const wPos = this.tileMap.gridToWorld(ws.col, ws.row);
        this.wizard = new Wizard(wPos.x, wPos.y);
        this.entityLayer.addChild(this.wizard.createVisual());
        this.crowdSystem.addAgent(this.wizard);

        // Torri
        for (const td of levelData.towers) {
            const tPos = this.tileMap.gridToWorld(td.col, td.row);
            const tower = new Tower(tPos.x, tPos.y, td.type);
            this.towers.push(tower);
            this.entityLayer.addChild(tower.createVisual());
            this._drawRangeCircle(tower);
        }

        // Tesoro
        if (levelData.treasure) {
            const tp = this.tileMap.gridToWorld(levelData.treasure.col, levelData.treasure.row);
            this.treasurePos = tp;
            this.treasureGraphics = new PIXI.Graphics();
            // Stella a 5 punte (manuale)
            this.treasureGraphics.beginFill(0xFFD700);
            const pts = [];
            for (let i = 0; i < 10; i++) {
                const a = (Math.PI / 2) + (Math.PI * 2 * i) / 10;
                const r = i % 2 === 0 ? 0.3 : 0.15;
                pts.push(tp.x + Math.cos(a) * r, tp.y - Math.sin(a) * r);
            }
            this.treasureGraphics.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) {
                this.treasureGraphics.lineTo(pts[i], pts[i + 1]);
            }
            this.treasureGraphics.closePath();
            this.treasureGraphics.endFill();
            this.treasureGraphics.beginFill(0xFFD700, 0.3);
            this.treasureGraphics.drawCircle(tp.x, tp.y, 0.5);
            this.treasureGraphics.endFill();
            this.entityLayer.addChild(this.treasureGraphics);
        }

        // Centra camera sulla mappa
        this.camera.centerOn(levelData.cols / 2, levelData.rows / 2);
        this.camera.zoom = Math.min(
            this.app.screen.width / levelData.cols,
            this.app.screen.height / levelData.rows
        ) * 0.85;

        console.log('Livello caricato:', levelData.name);
    }

    _drawRangeCircle(tower) {
        const g = new PIXI.Graphics();
        g.lineStyle(0.03, 0xFF0000, 0.15);
        g.drawCircle(tower.x, tower.y, tower.range);
        this.rangeLayer.addChild(g);
    }

    _clearAll() {
        this.tileLayer.removeChildren();
        this.rangeLayer.removeChildren();
        this.entityLayer.removeChildren();
        this.projectileLayer.removeChildren();
        this.effectLayer.removeChildren();
        this.creatures = [];
        this.towers = [];
        this.projectiles = [];
        this.effects = [];
        this.wizard = null;
        this.victory = false;
        this.summonMode = null;
        this.summonCircle = null;
        this._createSummonCircle();
    }

    // ========================================
    // Input handlers (chiamati da InputManager)
    // ========================================
    onRightClick(worldPos) {
        if (!this.wizard || !this.wizard.alive) return;

        // Muovi il mago verso la posizione
        this.crowdSystem.requestMove(this.wizard, worldPos.x, worldPos.y);
        this.wizard.state = EntityState.MOVING;

        // Muovi anche le creature evocate
        for (const c of this.creatures) {
            if (!c.alive || c.crowdAgentId == null) continue;
            this.crowdSystem.requestMove(c, worldPos.x, worldPos.y);
            c.state = EntityState.MOVING;
            c.attackTarget = null;
        }
    }

    onLeftClick(worldPos) {
        // Click sinistro: seleziona un bersaglio per le creature
        const target = this._findEntityAt(worldPos.x, worldPos.y, 'enemy');
        if (target) {
            this._orderAttack(target);
        }
    }

    onCastSpell(spellType, worldPos) {
        if (!this.wizard || !this.wizard.alive) return;
        this.spellSystem.cast(spellType, this.wizard, worldPos.x, worldPos.y);
    }

    enterSummonMode(creatureType) {
        if (!this.wizard || !this.wizard.alive) return;

        const stats = CreatureStats[creatureType];
        if (!stats) return;

        // Check mana (non spendere ancora)
        if (!this.wizard.canCast(stats.manaCost)) {
            console.log('Mana insufficiente per evocare');
            return;
        }

        // Se già in summon mode con lo STESSO tipo → evoca attorno al mago
        if (this.summonMode && this.summonMode.creatureType === creatureType) {
            this._spawnCreatures(creatureType, this.wizard.x, this.wizard.y);
            this.cancelSummon();
            return;
        }

        // Entra in summon mode (o switch tipo)
        this.summonMode = { creatureType };
        this._drawSummonCircle(stats.color);
        this.summonCircle.visible = true;
        this.summonCircle.position.set(this.wizard.x, this.wizard.y);
    }

    summonAt(wx, wy) {
        if (!this.summonMode || !this.wizard || !this.wizard.alive) return;

        const dx = wx - this.wizard.x;
        const dy = wy - this.wizard.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= WizardStats.summonRange) {
            // Dentro il cerchio → evoca lì
            this._spawnCreatures(this.summonMode.creatureType, wx, wy);
            this.cancelSummon();
        } else {
            // Fuori dal cerchio → annulla
            this.cancelSummon();
        }
    }

    cancelSummon() {
        this.summonMode = null;
        if (this.summonCircle) {
            this.summonCircle.visible = false;
        }
    }

    _spawnCreatures(creatureType, cx, cy) {
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
            const sx = cx + Math.cos(angle) * dist;
            const sy = cy + Math.sin(angle) * dist;

            const creature = new Creature(sx, sy, creatureType);
            this.creatures.push(creature);
            this.entityLayer.addChild(creature.createVisual());
            this.crowdSystem.addAgent(creature);
        }

        console.log(`Evocato: ${stats.label} x${count}`);
    }

    _orderAttack(target) {
        for (const c of this.creatures) {
            if (!c.alive) continue;
            c.attackTarget = target;
            c.state = EntityState.MOVING;

            // Muovi la creatura verso il bersaglio
            if (c.crowdAgentId != null) {
                this.crowdSystem.requestMove(c, target.x, target.y);
            }
        }
        console.log(`Creature ordinate ad attaccare: ${target.constructor.name} [HP: ${target.hp}]`);
    }

    _findEntityAt(wx, wy, faction) {
        const entities = faction === 'enemy' ? this.towers : [this.wizard, ...this.creatures];
        let closest = null;
        let closestDist = 1.0; // raggio di selezione max

        for (const e of entities) {
            if (!e || !e.alive) continue;
            const dx = e.x - wx;
            const dy = e.y - wy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < closestDist) {
                closestDist = d;
                closest = e;
            }
        }
        return closest;
    }

    // ========================================
    // Update loop
    // ========================================
    update(dt) {
        if (this.victory || (this.wizard && !this.wizard.alive)) return;

        // Input (camera pan)
        this.input.update(dt);

        // Crowd simulation
        if (this.crowdSystem) {
            this.crowdSystem.update(dt);
        }

        // Aggiorna entità
        if (this.wizard) this.wizard.update(dt);

        for (const c of this.creatures) {
            c.update(dt);
        }

        for (const t of this.towers) {
            t.update(dt);
        }

        // Torri sparano
        this._updateTowersFiring(dt);

        // Creature attaccano
        this._updateCreatureAttacks(dt);

        // Proiettili
        this._updateProjectiles(dt);

        // Spell system
        this.spellSystem.update(dt);

        // Effetti visuali
        this._updateEffects(dt);

        // Pulizia entità morte
        this._cleanupDead();

        // Vittoria: mago raggiunge il tesoro
        this._checkVictory();

        // Aggiorna posizione cerchio evocazione
        if (this.summonMode && this.summonCircle && this.wizard && this.wizard.alive) {
            this.summonCircle.position.set(this.wizard.x, this.wizard.y);
        }

        // Aggiorna rotazione visual
        this._updateVisualRotations();

        // Camera
        this.camera.apply(this.worldContainer, this.app.screen.width, this.app.screen.height);

        // HUD
        this.hud.update(this.app.screen.width, this.app.screen.height);
    }

    _updateTowersFiring(dt) {
        // Le torri sparano ai nemici del giocatore
        const playerEntities = [this.wizard, ...this.creatures].filter(e => e && e.alive);

        for (const tower of this.towers) {
            if (!tower.alive || !tower.canFire()) continue;

            const target = tower.selectTarget(playerEntities);
            if (!target) continue;

            // Spara!
            tower.fire();
            const proj = new Projectile(
                tower.x, tower.y,
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
            const dy = c.attackTarget.y - c.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= c.attackRange) {
                // In range: ferma e attacca
                c.state = EntityState.ATTACKING;
            } else {
                // Continua a muoversi verso il bersaglio
                if (c.crowdAgentId != null) {
                    this.crowdSystem.requestMove(c, c.attackTarget.x, c.attackTarget.y);
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
                    // Spell projectile (es. fireball AoE)
                    p._onHit();
                } else {
                    // Tower projectile: danno diretto
                    if (p.target.alive && typeof p.target.damage === 'function') {
                        p.target.damage(p.damage);
                    }
                }
            }
        }
    }

    _updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i];
            fx.timer -= dt;
            fx.graphics.alpha = Math.max(0, fx.timer / fx.duration);
            fx.graphics.scale.set(1 + (1 - fx.timer / fx.duration) * 0.5);

            if (fx.timer <= 0) {
                this.effectLayer.removeChild(fx.graphics);
                this.effects.splice(i, 1);
            }
        }
    }

    _cleanupDead() {
        // Rimuovi creature morte
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const c = this.creatures[i];
            if (!c.alive) {
                this.crowdSystem.removeAgent(c);
                if (c.container) this.entityLayer.removeChild(c.container);
                this.creatures.splice(i, 1);
            }
        }

        // Rimuovi torri morte — raccolta essenza
        for (const t of this.towers) {
            if (!t.alive && t.container && t.container.visible) {
                t.container.visible = false;
                if (this.wizard && this.wizard.alive) {
                    this.wizard.collectEssence(5);
                }
            }
        }

        // Rimuovi proiettili spenti
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (!this.projectiles[i].alive) {
                const g = this.projectiles[i].graphics;
                if (g) this.projectileLayer.removeChild(g);
                this.projectiles.splice(i, 1);
            }
        }
    }

    _checkVictory() {
        if (!this.wizard || !this.wizard.alive || !this.treasurePos) return;

        const dx = this.wizard.x - this.treasurePos.x;
        const dy = this.wizard.y - this.treasurePos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.6) {
            this.victory = true;
            console.log('VITTORIA! Il mago ha raggiunto il tesoro!');
        }
    }

    _updateVisualRotations() {
        // Ruota l'indicatore di direzione in base all'angolo
        const rotateEntity = (e) => {
            if (e && e.alive && e.graphics) {
                e.graphics.rotation = e.angle;
            }
        };

        rotateEntity(this.wizard);
        for (const c of this.creatures) rotateEntity(c);
    }

    // ========================================
    // Utilities pubbliche
    // ========================================
    addProjectile(proj) {
        this.projectiles.push(proj);
        this.projectileLayer.addChild(proj.createVisual());
    }

    getAllEntities() {
        const all = [...this.towers, ...this.creatures];
        if (this.wizard) all.push(this.wizard);
        return all;
    }

    showExplosion(cx, cy, radius) {
        const g = new PIXI.Graphics();
        g.beginFill(0xFF4500, 0.6);
        g.drawCircle(0, 0, radius);
        g.endFill();
        g.beginFill(0xFFFF00, 0.4);
        g.drawCircle(0, 0, radius * 0.5);
        g.endFill();
        g.position.set(cx, cy);

        this.effectLayer.addChild(g);
        this.effects.push({
            graphics: g,
            timer: 0.5,
            duration: 0.5,
        });
    }
}
