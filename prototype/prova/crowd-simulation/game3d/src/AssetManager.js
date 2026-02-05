// ========================================
// AssetManager - Caricamento e cache di asset 3D (GLTF)
// ========================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BuildingCatalog, BuildingState } from './data/buildingCatalog.js';

export class AssetManager {
    constructor() {
        this.gltfLoader = new GLTFLoader();

        // Cache per modelli caricati: Map<path, THREE.Group>
        this.modelCache = new Map();

        // Cache per geometrie procedurali di fallback
        this.fallbackCache = new Map();

        // Stato caricamento
        this.loadingPromises = new Map();

        // Base path per gli asset
        this.basePath = './assets/';
    }

    // ========================================
    // Caricamento singolo modello GLTF
    // ========================================

    /**
     * Carica un modello GLTF e lo mette in cache
     * @param {string} path - Percorso relativo al basePath
     * @returns {Promise<THREE.Group>} - Clone del modello caricato
     */
    async loadModel(path) {
        const fullPath = this.basePath + path;

        // Se già in cache, ritorna un clone
        if (this.modelCache.has(fullPath)) {
            return this._cloneModel(this.modelCache.get(fullPath));
        }

        // Se già in caricamento, aspetta quella promise
        if (this.loadingPromises.has(fullPath)) {
            await this.loadingPromises.get(fullPath);
            return this._cloneModel(this.modelCache.get(fullPath));
        }

        // Avvia nuovo caricamento
        const loadPromise = new Promise((resolve, reject) => {
            this.gltfLoader.load(
                fullPath,
                (gltf) => {
                    // Prepara il modello per il caching
                    const model = gltf.scene;
                    this._prepareModel(model);
                    this.modelCache.set(fullPath, model);
                    resolve(model);
                },
                undefined, // progress callback (non usato)
                (error) => {
                    console.warn(`Failed to load model: ${fullPath}`, error);
                    reject(error);
                }
            );
        });

        this.loadingPromises.set(fullPath, loadPromise);

        try {
            await loadPromise;
            return this._cloneModel(this.modelCache.get(fullPath));
        } finally {
            this.loadingPromises.delete(fullPath);
        }
    }

    /**
     * Prepara un modello per l'uso (ombre, materiali, etc.)
     */
    _prepareModel(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Assicura che i materiali siano clonabili
                if (child.material) {
                    child.material = child.material.clone();
                }
            }
        });
    }

    /**
     * Clona un modello (deep clone con materiali)
     */
    _cloneModel(model) {
        const clone = model.clone();

        // Deep clone dei materiali
        clone.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
            }
        });

        return clone;
    }

    // ========================================
    // Caricamento edifici con stati multipli
    // ========================================

    /**
     * Carica tutti gli stati di un tipo di edificio
     * @param {string} buildingType - Tipo edificio (es. 'GUARD_TOWER')
     * @returns {Promise<Map<string, THREE.Group>>} - Map stato → modello
     */
    async loadBuildingStates(buildingType) {
        const catalogEntry = BuildingCatalog[buildingType];
        if (!catalogEntry) {
            console.warn(`Building type not in catalog: ${buildingType}`);
            return this._createFallbackBuildingStates(buildingType);
        }

        const states = new Map();
        const stateNames = Object.values(BuildingState);

        for (const state of stateNames) {
            try {
                const path = `buildings/${buildingType.toLowerCase()}/${state.toLowerCase()}.glb`;
                const model = await this.loadModel(path);
                states.set(state, model);
            } catch (error) {
                // Fallback a mesh procedurale per questo stato
                console.warn(`Using fallback for ${buildingType} ${state}`);
                states.set(state, this._createFallbackBuilding(buildingType, state));
            }
        }

        return states;
    }

    /**
     * Precarica tutti i modelli per un set di tipi edificio
     * @param {Set<string>|Array<string>} buildingTypes - Tipi da precaricare
     * @param {Function} onProgress - Callback progresso (0-1)
     * @returns {Promise<Map<string, Map<string, THREE.Group>>>}
     */
    async preloadBuildings(buildingTypes, onProgress = null) {
        const types = Array.from(buildingTypes);
        const total = types.length * Object.keys(BuildingState).length;
        let loaded = 0;

        const result = new Map();

        for (const buildingType of types) {
            const states = await this.loadBuildingStates(buildingType);
            result.set(buildingType, states);

            loaded += Object.keys(BuildingState).length;
            if (onProgress) {
                onProgress(loaded / total);
            }
        }

        return result;
    }

    // ========================================
    // Mesh di fallback procedurali
    // ========================================

    /**
     * Crea mesh di fallback per tutti gli stati di un edificio
     */
    _createFallbackBuildingStates(buildingType) {
        const states = new Map();
        for (const state of Object.values(BuildingState)) {
            states.set(state, this._createFallbackBuilding(buildingType, state));
        }
        return states;
    }

    /**
     * Crea una mesh procedurale di fallback per un edificio
     */
    _createFallbackBuilding(buildingType, state) {
        const cacheKey = `${buildingType}_${state}`;

        if (this.fallbackCache.has(cacheKey)) {
            return this._cloneModel(this.fallbackCache.get(cacheKey));
        }

        const catalogEntry = BuildingCatalog[buildingType] || BuildingCatalog.GUARD_TOWER;
        const { baseSize, baseHeight } = catalogEntry.fallbackGeometry || { baseSize: 2, baseHeight: 4 };

        // Altezza ridotta per stati danneggiati
        let height = baseHeight;
        let color = catalogEntry.color || 0x888888;

        switch (state) {
            case BuildingState.INTACT:
                // Altezza piena, colore normale
                break;
            case BuildingState.DAMAGED:
                height *= 0.85;
                color = this._darkenColor(color, 0.15);
                break;
            case BuildingState.CRITICAL:
                height *= 0.65;
                color = this._darkenColor(color, 0.3);
                break;
            case BuildingState.DESTROYED:
                height *= 0.25;
                color = this._darkenColor(color, 0.5);
                break;
        }

        // Crea geometria basata sul tipo
        let geometry;
        const shape = catalogEntry.fallbackGeometry?.shape || 'box';

        switch (shape) {
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(
                    baseSize * 0.5, baseSize * 0.6, height, 8
                );
                break;
            case 'octagon':
                geometry = new THREE.CylinderGeometry(
                    baseSize * 0.5, baseSize * 0.5, height, 8
                );
                break;
            case 'box':
            default:
                geometry = new THREE.BoxGeometry(baseSize, height, baseSize);
                break;
        }

        // Materiale lowpoly
        const material = new THREE.MeshLambertMaterial({
            color: color,
            flatShading: true,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = height / 2; // Origine a terra
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Wrappa in un Group
        const group = new THREE.Group();
        group.add(mesh);

        // Per stato destroyed, aggiungi qualche maceria
        if (state === BuildingState.DESTROYED) {
            this._addRubble(group, baseSize, color);
        }

        this.fallbackCache.set(cacheKey, group);
        return this._cloneModel(group);
    }

    /**
     * Aggiunge macerie per edifici distrutti
     */
    _addRubble(group, baseSize, color) {
        const rubbleGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
        const rubbleMat = new THREE.MeshLambertMaterial({
            color: this._darkenColor(color, 0.4),
            flatShading: true,
        });

        for (let i = 0; i < 5; i++) {
            const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
            rubble.position.set(
                (Math.random() - 0.5) * baseSize * 0.8,
                0.1,
                (Math.random() - 0.5) * baseSize * 0.8
            );
            rubble.rotation.set(
                Math.random() * 0.5,
                Math.random() * Math.PI,
                Math.random() * 0.5
            );
            rubble.scale.setScalar(0.5 + Math.random() * 0.5);
            rubble.castShadow = true;
            group.add(rubble);
        }
    }

    /**
     * Scurisce un colore
     */
    _darkenColor(color, amount) {
        const c = new THREE.Color(color);
        c.multiplyScalar(1 - amount);
        return c.getHex();
    }

    // ========================================
    // Caricamento altri asset
    // ========================================

    /**
     * Carica una texture
     */
    async loadTexture(path) {
        const fullPath = this.basePath + path;

        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(
                fullPath,
                (texture) => resolve(texture),
                undefined,
                (error) => reject(error)
            );
        });
    }

    /**
     * Carica un elemento animato (ballista, etc.)
     */
    async loadAnimatedElement(elementType) {
        const path = `animated/${elementType.toLowerCase()}.glb`;
        try {
            return await this.loadModel(path);
        } catch (error) {
            console.warn(`Animated element not found: ${elementType}, using fallback`);
            return this._createFallbackAnimatedElement(elementType);
        }
    }

    /**
     * Crea elemento animato di fallback
     */
    _createFallbackAnimatedElement(elementType) {
        const group = new THREE.Group();

        switch (elementType.toLowerCase()) {
            case 'ballista':
                // Base
                const base = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.4, 0.2, 8),
                    new THREE.MeshLambertMaterial({ color: 0x4a3728, flatShading: true })
                );
                base.position.y = 0.1;
                group.add(base);

                // Braccio
                const arm = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 0.1, 0.8),
                    new THREE.MeshLambertMaterial({ color: 0x5c4033, flatShading: true })
                );
                arm.position.set(0, 0.25, 0.2);
                group.add(arm);
                break;

            case 'cannon':
                // Base
                const cannonBase = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.2, 0.4),
                    new THREE.MeshLambertMaterial({ color: 0x4a3728, flatShading: true })
                );
                cannonBase.position.y = 0.1;
                group.add(cannonBase);

                // Canna
                const barrel = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8),
                    new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true })
                );
                barrel.rotation.x = Math.PI / 2;
                barrel.position.set(0, 0.25, 0.3);
                group.add(barrel);
                break;

            default:
                // Placeholder generico
                const placeholder = new THREE.Mesh(
                    new THREE.SphereGeometry(0.2, 8, 6),
                    new THREE.MeshLambertMaterial({ color: 0xff00ff, flatShading: true })
                );
                placeholder.position.y = 0.2;
                group.add(placeholder);
        }

        return group;
    }

    // ========================================
    // Utility
    // ========================================

    /**
     * Pulisce la cache (per liberare memoria)
     */
    clearCache() {
        this.modelCache.forEach((model) => {
            model.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });

        this.modelCache.clear();
        this.fallbackCache.clear();
        this.loadingPromises.clear();
    }

    /**
     * Verifica se un modello è in cache
     */
    isLoaded(path) {
        return this.modelCache.has(this.basePath + path);
    }

    /**
     * Ottiene statistiche sulla cache
     */
    getCacheStats() {
        return {
            modelsLoaded: this.modelCache.size,
            fallbacksCreated: this.fallbackCache.size,
            pendingLoads: this.loadingPromises.size,
        };
    }
}

// Singleton per uso globale
export const assetManager = new AssetManager();
