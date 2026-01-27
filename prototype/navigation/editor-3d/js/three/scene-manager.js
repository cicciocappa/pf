/**
 * Three.js scene manager
 * Handles scene setup, camera, lights, and rendering
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor(container, mapSettings) {
        this.container = container;
        this.mapSettings = mapSettings;

        // Three.js core
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Scene objects
        this.terrainMesh = null;
        this.buildingMeshes = new Map();
        this.wallMeshes = new Map();
        this.navmeshMesh = null;

        // Raycaster for picking
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Selection state
        this.selectedObject = null;
        this.hoveredObject = null;

        // Materials
        this._initMaterials();

        // Setup scene
        this._initRenderer();
        this._initCamera();
        this._initLights();
        this._initHelpers();

        // Start render loop
        this._animate = this._animate.bind(this);
        this._animate();

        // Event listeners
        this._setupEventListeners();
    }

    _initMaterials() {
        this.materials = {
            terrain: new THREE.MeshStandardMaterial({
                color: 0x4a7c59,
                roughness: 0.9,
                metalness: 0.1,
                wireframe: false
            }),
            terrainWireframe: new THREE.MeshBasicMaterial({
                color: 0x88aa88,
                wireframe: true,
                transparent: true,
                opacity: 0.3
            }),
            building: new THREE.MeshStandardMaterial({
                color: 0x8b7355,
                roughness: 0.7,
                metalness: 0.2
            }),
            buildingSelected: new THREE.MeshStandardMaterial({
                color: 0xffaa00,
                roughness: 0.5,
                metalness: 0.3,
                emissive: 0x442200
            }),
            wall: new THREE.MeshStandardMaterial({
                color: 0x666666,
                roughness: 0.8,
                metalness: 0.1
            }),
            wallSelected: new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                roughness: 0.6,
                metalness: 0.2,
                emissive: 0x332200
            }),
            navmesh: new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                wireframe: false
            }),
            navmeshWireframe: new THREE.LineBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.8
            })
        };
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x1a1a2e);

        this.container.appendChild(this.renderer.domElement);
    }

    _initCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 5000);

        // Position camera to view the map
        const mapSize = Math.max(this.mapSettings.width, this.mapSettings.height);
        this.camera.position.set(
            this.mapSettings.width / 2,
            mapSize * 0.8,
            this.mapSettings.height + mapSize * 0.3
        );

        // Orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(
            this.mapSettings.width / 2,
            0,
            this.mapSettings.height / 2
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.maxPolarAngle = Math.PI * 0.45;
        this.controls.minDistance = 10;
        this.controls.maxDistance = mapSize * 3;
        this.controls.update();
    }

    _initLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404050, 0.5);
        this.scene.add(ambient);

        // Main directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xffffee, 1.0);
        this.sunLight.position.set(
            this.mapSettings.width * 0.5,
            200,
            this.mapSettings.height * -0.3
        );
        this.sunLight.castShadow = true;

        // Shadow settings
        const shadowSize = Math.max(this.mapSettings.width, this.mapSettings.height);
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 1000;
        this.sunLight.shadow.camera.left = -shadowSize;
        this.sunLight.shadow.camera.right = shadowSize;
        this.sunLight.shadow.camera.top = shadowSize;
        this.sunLight.shadow.camera.bottom = -shadowSize;
        this.sunLight.shadow.bias = -0.0001;

        this.scene.add(this.sunLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0x8888aa, 0.3);
        fillLight.position.set(-100, 50, 100);
        this.scene.add(fillLight);
    }

    _initHelpers() {
        // Grid helper
        const gridSize = Math.max(this.mapSettings.width, this.mapSettings.height);
        const divisions = Math.floor(gridSize / 64);
        this.gridHelper = new THREE.GridHelper(gridSize, divisions, 0x444444, 0x333333);
        this.gridHelper.position.set(this.mapSettings.width / 2, 0.01, this.mapSettings.height / 2);
        this.scene.add(this.gridHelper);

        // Axes helper
        this.axesHelper = new THREE.AxesHelper(50);
        this.axesHelper.position.set(0, 0.1, 0);
        this.scene.add(this.axesHelper);
    }

    _setupEventListeners() {
        window.addEventListener('resize', () => this.resize());

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            this._onMouseMove(e);
        });

        this.renderer.domElement.addEventListener('click', (e) => {
            this._onClick(e);
        });
    }

    _onMouseMove(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _onClick(e) {
        // Raycast to find clicked object
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const pickables = [];
        for (const mesh of this.buildingMeshes.values()) {
            pickables.push(mesh);
        }
        for (const mesh of this.wallMeshes.values()) {
            pickables.push(mesh);
        }

        const intersects = this.raycaster.intersectObjects(pickables, true);
        if (intersects.length > 0) {
            this.selectObject(intersects[0].object);
        } else {
            this.selectObject(null);
        }
    }

    /**
     * Select an object
     */
    selectObject(object) {
        // Deselect previous
        if (this.selectedObject) {
            if (this.selectedObject.userData.type === 'building') {
                this.selectedObject.material = this.materials.building;
            } else if (this.selectedObject.userData.type === 'wall') {
                this.selectedObject.material = this.materials.wall;
            }
        }

        this.selectedObject = object;

        // Highlight new selection
        if (object) {
            if (object.userData.type === 'building') {
                object.material = this.materials.buildingSelected;
            } else if (object.userData.type === 'wall') {
                object.material = this.materials.wallSelected;
            }
        }
    }

    /**
     * Update terrain mesh from heightmap
     */
    setTerrainMesh(terrainMesh) {
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
        }
        this.terrainMesh = terrainMesh;
        if (terrainMesh) {
            terrainMesh.receiveShadow = true;
            this.scene.add(terrainMesh);
        }
    }

    /**
     * Add a building mesh
     */
    addBuildingMesh(id, mesh) {
        mesh.userData.type = 'building';
        mesh.userData.id = id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.buildingMeshes.set(id, mesh);
        this.scene.add(mesh);
    }

    /**
     * Remove a building mesh
     */
    removeBuildingMesh(id) {
        const mesh = this.buildingMeshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            this.buildingMeshes.delete(id);
        }
    }

    /**
     * Add a wall mesh
     */
    addWallMesh(id, mesh) {
        mesh.userData.type = 'wall';
        mesh.userData.id = id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.wallMeshes.set(id, mesh);
        this.scene.add(mesh);
    }

    /**
     * Remove a wall mesh
     */
    removeWallMesh(id) {
        const mesh = this.wallMeshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            this.wallMeshes.delete(id);
        }
    }

    /**
     * Set navmesh visualization
     */
    setNavmeshMesh(mesh) {
        if (this.navmeshMesh) {
            this.scene.remove(this.navmeshMesh);
        }
        this.navmeshMesh = mesh;
        if (mesh) {
            this.scene.add(mesh);
        }
    }

    /**
     * Clear all building and wall meshes
     */
    clearObjects() {
        for (const [id] of this.buildingMeshes) {
            this.removeBuildingMesh(id);
        }
        for (const [id] of this.wallMeshes) {
            this.removeWallMesh(id);
        }
    }

    /**
     * Raycast to terrain and return world position
     */
    raycastTerrain(screenX, screenY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.terrainMesh) {
            const intersects = this.raycaster.intersectObject(this.terrainMesh);
            if (intersects.length > 0) {
                return intersects[0].point.clone();
            }
        }

        // Fallback: intersect with Y=0 plane
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, target);
        return target;
    }

    /**
     * Resize renderer to container
     */
    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Focus camera on map center
     */
    focusOnMap() {
        this.controls.target.set(
            this.mapSettings.width / 2,
            0,
            this.mapSettings.height / 2
        );
        const mapSize = Math.max(this.mapSettings.width, this.mapSettings.height);
        this.camera.position.set(
            this.mapSettings.width / 2,
            mapSize * 0.8,
            this.mapSettings.height + mapSize * 0.3
        );
        this.controls.update();
    }

    /**
     * Toggle wireframe mode
     */
    setWireframe(enabled) {
        if (this.terrainMesh) {
            this.terrainMesh.material = enabled ?
                this.materials.terrainWireframe :
                this.materials.terrain;
        }
    }

    /**
     * Toggle navmesh visibility
     */
    setNavmeshVisible(visible) {
        if (this.navmeshMesh) {
            this.navmeshMesh.visible = visible;
        }
    }

    _animate() {
        requestAnimationFrame(this._animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.renderer.dispose();
        this.controls.dispose();

        // Dispose geometries and materials
        if (this.terrainMesh) {
            this.terrainMesh.geometry.dispose();
        }
        for (const mesh of this.buildingMeshes.values()) {
            mesh.geometry.dispose();
        }
        for (const mesh of this.wallMeshes.values()) {
            mesh.geometry.dispose();
        }

        for (const mat of Object.values(this.materials)) {
            mat.dispose();
        }
    }
}
