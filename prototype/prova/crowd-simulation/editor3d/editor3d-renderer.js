// ========================================
// editor3d-renderer.js
// Three.js rendering for 3D editor
// ========================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    createBuildingGeometry,
    createWallGeometry,
    createTerrainGeometry,
    createObstacleGeometry,
    createGridGeometry
} from './editor3d-geometry.js';

export class Editor3DRenderer {
    constructor(editor) {
        this.editor = editor;

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera setup
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(30, 30, 30);
        this.camera.lookAt(0, 0, 0);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({
            canvas: editor.canvas,
            antialias: true
        });
        this.renderer.setSize(editor.canvas.clientWidth, editor.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        // Lighting
        this.setupLights();

        // Grid
        this.gridHelper = this.createGrid();
        this.scene.add(this.gridHelper);

        // Raycaster for picking
        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();

        // Object meshes cache
        this.meshCache = new Map();

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambient);

        // Directional light (sun)
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(20, 30, 10);
        dirLight.castShadow = true;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Hemisphere light
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(hemiLight);
    }

    createGrid() {
        const gridGeometry = createGridGeometry(100, 100);
        const gridMaterial = new THREE.LineBasicMaterial({
            color: 0x2a3f5f,
            transparent: true,
            opacity: 0.3
        });
        return new THREE.LineSegments(gridGeometry, gridMaterial);
    }

    onResize() {
        const container = this.editor.canvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    // ========================================
    // Rendering
    // ========================================
    render() {
        this.controls.update();

        // Clear old meshes
        this.clearScene();

        // Render terrain
        this.renderTerrain();

        // Render buildings
        for (const [id, building] of this.editor.editorData.buildings) {
            this.renderBuilding(building);
        }

        // Render walls
        for (const [id, wall] of this.editor.editorData.walls) {
            this.renderWall(wall);
        }

        // Render obstacles
        for (const [id, obstacle] of this.editor.editorData.obstacles) {
            this.renderObstacle(obstacle);
        }

        // Render selection highlight
        if (this.editor.selectedObject) {
            this.renderSelectionHighlight(this.editor.selectedObject);
        }

        // Render tool preview
        if (this.editor.currentToolInstance && this.editor.currentToolInstance.renderPreview) {
            this.editor.currentToolInstance.renderPreview(this);
        }

        this.renderer.render(this.scene, this.camera);
    }

    clearScene() {
        // Remove all cached meshes from scene
        for (const mesh of this.meshCache.values()) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }
        this.meshCache.clear();
    }

    renderTerrain() {
        const geometry = createTerrainGeometry(
            this.editor.editorData.terrain,
            this.editor.editorData.obstacles
        );

        if (!geometry) return;

        const material = new THREE.MeshStandardMaterial({
            color: 0x3a5a40,
            roughness: 0.8,
            metalness: 0.2
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.userData.type = 'terrain';
        this.scene.add(mesh);
        this.meshCache.set('terrain', mesh);
    }

    renderBuilding(building) {
        const geometry = createBuildingGeometry(building);
        if (!geometry) return;

        const material = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.7,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.type = 'building';
        mesh.userData.id = building.id;
        this.scene.add(mesh);
        this.meshCache.set(building.id, mesh);
    }

    renderWall(wall) {
        const geometry = createWallGeometry(wall);
        if (!geometry) return;

        const material = new THREE.MeshStandardMaterial({
            color: 0x708090,
            roughness: 0.9,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.type = 'wall';
        mesh.userData.id = wall.id;
        this.scene.add(mesh);
        this.meshCache.set(wall.id, mesh);
    }

    renderObstacle(obstacle) {
        if (obstacle.obstacleType === 'hole') {
            // Holes are rendered as part of terrain
            return;
        }

        const geometry = createObstacleGeometry(obstacle);
        if (!geometry) return;

        const material = new THREE.MeshStandardMaterial({
            color: 0xff6b6b,
            roughness: 0.5,
            metalness: 0.3,
            transparent: true,
            opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.type = 'obstacle';
        mesh.userData.id = obstacle.id;
        this.scene.add(mesh);
        this.meshCache.set(obstacle.id, mesh);
    }

    renderSelectionHighlight(obj) {
        const mesh = this.meshCache.get(obj.id);
        if (!mesh) return;

        // Create outline box
        const box = new THREE.Box3().setFromObject(mesh);
        const helper = new THREE.Box3Helper(box, 0xe94560);
        this.scene.add(helper);
        this.meshCache.set('selection_helper', helper);
    }

    // ========================================
    // Raycasting
    // ========================================
    getIntersectionPoint(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouseVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouseVector, this.camera);

        // Intersect with ground plane (y=0)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersection);

        if (intersection) {
            return { x: intersection.x, y: intersection.z };
        }

        return null;
    }

    getIntersectedObject(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouseVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouseVector, this.camera);

        const meshes = Array.from(this.meshCache.values()).filter(m => m.userData.id);
        const intersects = this.raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            const id = mesh.userData.id;
            const type = mesh.userData.type;

            if (type === 'building') {
                return this.editor.editorData.buildings.get(id);
            } else if (type === 'wall') {
                return this.editor.editorData.walls.get(id);
            } else if (type === 'obstacle') {
                return this.editor.editorData.obstacles.get(id);
            }
        }

        return null;
    }
}
