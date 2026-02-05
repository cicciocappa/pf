// ========================================
// Building - Edifici con stati di danneggiamento
// ========================================

import * as THREE from 'three';
import { Entity } from './Entity.js';
import { EntityState } from './config.js';
import {
    BuildingCatalog,
    BuildingState,
    calculateBuildingState,
    getEffectForState,
    AnimatedElementType,
} from './data/buildingCatalog.js';
import { assetManager } from './AssetManager.js';

export class Building extends Entity {
    /**
     * @param {Object} definition - Definizione dell'edificio dal livello JSON
     * @param {string} definition.id - ID univoco
     * @param {string} definition.buildingType - Tipo (es. 'GUARD_TOWER')
     * @param {Array} definition.position - [x, z] o {x, z}
     * @param {number} definition.rotation - Rotazione in radianti
     * @param {number} definition.scale - Scala uniforme
     * @param {number} [definition.hp] - HP iniziali (default: maxHp del catalogo)
     */
    constructor(definition) {
        const pos = Array.isArray(definition.position)
            ? { x: definition.position[0], z: definition.position[1] }
            : definition.position;

        super(pos.x, pos.z);

        this.buildingId = definition.id;
        this.buildingType = definition.buildingType || 'GUARD_TOWER';
        this.rotation = definition.rotation || 0;
        this.scale = definition.scale || 5;

        // Recupera info dal catalogo
        this.catalogEntry = BuildingCatalog[this.buildingType] || BuildingCatalog.GUARD_TOWER;

        // HP
        this.maxHp = this.catalogEntry.maxHp || 100;
        this.hp = definition.hp !== undefined ? definition.hp : this.maxHp;

        // Stato corrente
        this.buildingState = calculateBuildingState(this.hp, this.maxHp);

        // Mesh per ogni stato (caricate async)
        this.stateMeshes = new Map(); // BuildingState → THREE.Group
        this.currentMesh = null;
        this.meshesLoaded = false;

        // Elemento animato (opzionale)
        this.animatedElement = null;
        this.animatedElementType = this.catalogEntry.animatedElement || AnimatedElementType.NONE;

        // Effetto particellare corrente
        this.currentEffect = null;

        // Callback quando cambia stato (per notificare navmesh update)
        this.onStateChange = null;

        // Faction
        this.faction = 'enemy';

        // Radius per collisioni (basato su scala)
        this.radius = this.scale * 0.5;
    }

    /**
     * Crea il visual dell'edificio (override di Entity)
     */
    createVisual(scene) {
        this.group = new THREE.Group();
        this.group.position.set(this.x, 0, this.z);
        this.group.rotation.y = this.rotation;

        // HP bar (più in alto per edifici)
        this._createHpBar();
        this.hpBarGroup.position.y = this.scale * 0.8;

        // Placeholder mesh (verrà sostituita quando caricata)
        this._createPlaceholderMesh();

        // Carica mesh async
        this._loadMeshes();

        return this.group;
    }

    /**
     * Crea mesh placeholder mentre si caricano i modelli
     */
    _createPlaceholderMesh() {
        const { baseSize, baseHeight, shape } = this.catalogEntry.fallbackGeometry || {
            baseSize: 2,
            baseHeight: 4,
            shape: 'box'
        };

        let geometry;
        const scaledSize = baseSize * (this.scale / 5);
        const scaledHeight = baseHeight * (this.scale / 5);

        switch (shape) {
            case 'cylinder':
            case 'octagon':
                geometry = new THREE.CylinderGeometry(
                    scaledSize * 0.5, scaledSize * 0.5, scaledHeight, 8
                );
                break;
            case 'box':
            default:
                geometry = new THREE.BoxGeometry(scaledSize, scaledHeight, scaledSize);
        }

        const material = new THREE.MeshLambertMaterial({
            color: this.catalogEntry.color || 0x888888,
            flatShading: true,
            transparent: true,
            opacity: 0.5,
        });

        this.currentMesh = new THREE.Mesh(geometry, material);
        this.currentMesh.position.y = scaledHeight / 2;
        this.currentMesh.castShadow = true;
        this.currentMesh.receiveShadow = true;
        this.group.add(this.currentMesh);
    }

    /**
     * Carica le mesh per tutti gli stati
     */
    async _loadMeshes() {
        try {
            const states = await assetManager.loadBuildingStates(this.buildingType);

            // Scala e posiziona ogni mesh
            states.forEach((mesh, state) => {
                mesh.scale.setScalar(this.scale / 5); // Assumendo che i modelli siano per scala 5
                mesh.visible = false;
                this.group.add(mesh);
                this.stateMeshes.set(state, mesh);
            });

            this.meshesLoaded = true;

            // Rimuovi placeholder e mostra mesh corretta
            if (this.currentMesh && this.currentMesh.geometry) {
                this.group.remove(this.currentMesh);
                this.currentMesh.geometry.dispose();
                this.currentMesh.material.dispose();
            }

            this._showMeshForState(this.buildingState);

            // Carica elemento animato se presente
            if (this.animatedElementType !== AnimatedElementType.NONE) {
                await this._loadAnimatedElement();
            }

        } catch (error) {
            console.error(`Failed to load meshes for building ${this.buildingId}:`, error);
            // Mantiene il placeholder
        }
    }

    /**
     * Carica l'elemento animato
     */
    async _loadAnimatedElement() {
        try {
            this.animatedElement = await assetManager.loadAnimatedElement(this.animatedElementType);
            this.animatedElement.scale.setScalar(this.scale / 5);

            // Posiziona in cima all'edificio
            const height = (this.catalogEntry.fallbackGeometry?.baseHeight || 4) * (this.scale / 5);
            this.animatedElement.position.y = height - 0.5;

            this.group.add(this.animatedElement);
        } catch (error) {
            console.warn(`Failed to load animated element for ${this.buildingId}`);
        }
    }

    /**
     * Mostra la mesh per uno stato specifico
     */
    _showMeshForState(state) {
        // Nascondi tutte le mesh
        this.stateMeshes.forEach((mesh, s) => {
            mesh.visible = false;
        });

        // Mostra quella corrente
        const mesh = this.stateMeshes.get(state);
        if (mesh) {
            mesh.visible = true;
            this.currentMesh = mesh;
        }
    }

    /**
     * Override takeDamage per gestire cambio stato
     */
    takeDamage(amount) {
        if (!this.alive) return;

        const oldState = this.buildingState;
        this.hp = Math.max(0, this.hp - amount);
        this.buildingState = calculateBuildingState(this.hp, this.maxHp);

        // Aggiorna HP bar
        this._updateHpBar();

        // Se lo stato è cambiato, aggiorna visual
        if (oldState !== this.buildingState) {
            this._onBuildingStateChange(oldState, this.buildingState);
        }

        // Check morte
        if (this.hp <= 0) {
            this.state = EntityState.DEAD;
            this.onDeath();
        }
    }

    /**
     * Chiamato quando lo stato dell'edificio cambia
     */
    _onBuildingStateChange(oldState, newState) {
        // Cambia mesh
        if (this.meshesLoaded) {
            this._showMeshForState(newState);
        }

        // Aggiorna effetto particellare
        this._updateEffect(newState);

        // Nascondi elemento animato se critico/distrutto
        if (this.animatedElement) {
            this.animatedElement.visible = (newState === BuildingState.INTACT || newState === BuildingState.DAMAGED);
        }

        // Notifica per update navmesh se distrutto
        if (newState === BuildingState.DESTROYED && this.onStateChange) {
            this.onStateChange(this, oldState, newState);
        }

        console.log(`Building ${this.buildingId} state: ${oldState} → ${newState}`);
    }

    /**
     * Aggiorna l'effetto particellare per lo stato corrente
     */
    _updateEffect(state) {
        // TODO: Implementare con ParticleSystem
        // Per ora solo placeholder
        const effectConfig = getEffectForState(this.buildingType, state);

        // Rimuovi effetto precedente
        if (this.currentEffect) {
            // particleSystem.removeEmitter(this.currentEffect);
            this.currentEffect = null;
        }

        // Crea nuovo effetto se necessario
        if (effectConfig.type !== 'NONE') {
            // const emitterPos = new THREE.Vector3(...effectConfig.attachPoint);
            // this.currentEffect = particleSystem.createEffect(effectConfig.type, emitterPos);
            // this.currentEffect.attachTo(this.group);
        }
    }

    /**
     * Fa puntare l'elemento animato verso un target
     */
    aimAt(targetX, targetZ) {
        if (!this.animatedElement) return;

        const dx = targetX - this.x;
        const dz = targetZ - this.z;
        const angle = Math.atan2(dx, dz);

        // Interpola la rotazione per animazione smooth
        // Per ora rotazione immediata
        this.animatedElement.rotation.y = angle - this.rotation;
    }

    /**
     * Trigger animazione di sparo
     */
    fireAnimation() {
        if (!this.animatedElement) return;

        // TODO: Implementare animazione di rinculo/sparo
        // Per ora solo un flash di scala
        const originalScale = this.animatedElement.scale.x;
        this.animatedElement.scale.setScalar(originalScale * 1.1);

        setTimeout(() => {
            if (this.animatedElement) {
                this.animatedElement.scale.setScalar(originalScale);
            }
        }, 100);
    }

    /**
     * Update frame (override di Entity)
     */
    update(dt) {
        if (!this.alive) return;

        super.update(dt);

        // Aggiorna effetti particellari
        // if (this.currentEffect) this.currentEffect.update(dt);

        // Aggiorna animazione elemento
        // if (this.animatedElement) this._updateAnimatedElement(dt);
    }

    /**
     * Override _syncPosition per gestire rotazione
     */
    _syncPosition() {
        if (this.group) {
            this.group.position.set(this.x, 0, this.z);
            this.group.rotation.y = this.rotation;
            this.group.visible = this.alive;
        }
    }

    /**
     * Ripara l'edificio
     */
    repair(amount) {
        if (this.buildingState === BuildingState.DESTROYED) return; // Non si può riparare

        const oldState = this.buildingState;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        this.buildingState = calculateBuildingState(this.hp, this.maxHp);

        this._updateHpBar();

        if (oldState !== this.buildingState) {
            this._onBuildingStateChange(oldState, this.buildingState);
        }
    }

    /**
     * Restituisce il footprint per la navmesh
     */
    getNavmeshFootprint() {
        if (this.buildingState === BuildingState.DESTROYED) {
            return null; // Non blocca più la navmesh
        }

        const footprint = this.catalogEntry.navmeshFootprint || { type: 'box', width: 2, depth: 2 };
        const scaleFactor = this.scale / 5;

        return {
            type: footprint.type,
            x: this.x,
            z: this.z,
            rotation: this.rotation,
            width: (footprint.width || 2) * scaleFactor,
            depth: (footprint.depth || 2) * scaleFactor,
        };
    }

    /**
     * Cleanup
     */
    dispose() {
        // Rimuovi effetti
        if (this.currentEffect) {
            // particleSystem.removeEmitter(this.currentEffect);
        }

        // Dispose delle mesh
        this.stateMeshes.forEach((mesh) => {
            mesh.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
        });

        super.dispose();
    }
}
