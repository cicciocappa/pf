// ============================================================================
// NavMesh 3D Player - Crowd Simulation
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateTiledNavMesh } from 'navcat/blocks';
import { createNavMeshHelper } from 'navcat/three';
import { crowd } from 'navcat/blocks';
import { vec3 } from 'mathcat';

class Player3D {
    constructor() {
        this.canvas = document.getElementById('canvas');

        // Three.js setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(30, 25, 30);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight - 100);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lighting
        this.setupLights();

        // Grid
        const gridHelper = new THREE.GridHelper(100, 100, 0x2a3f5f, 0x2a3f5f);
        this.scene.add(gridHelper);

        // Navmesh data
        this.navMesh = null;
        this.navMeshHelper = null;
        this.geometryMeshes = [];
        this.exportData = null;

        // Crowd simulation
        this.crowdSim = null;
        this.agents = new Map(); // agentId -> { mesh, data }

        // Raycaster for picking
        this.raycaster = new THREE.Raycaster();
        this.mouseVector = new THREE.Vector2();

        // UI state
        this.showNavMesh = false;
        this.showGeometry = true;

        // Performance tracking
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fpsUpdateTime = 0;

        this.init();
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(20, 30, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(hemiLight);
    }

    init() {
        this.setupEventListeners();
        this.checkForEditorData();
        this.startLoop();

        window.addEventListener('resize', () => this.onResize());
    }

    setupEventListeners() {
        // Toolbar buttons
        document.getElementById('loadBtn')?.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        this.loadNavMesh(data);
                    } catch (err) {
                        this.setStatus('Error loading file: ' + err.message);
                        console.error(err);
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = '';
        });

        document.getElementById('spawnAgent')?.addEventListener('click', () => {
            this.spawnRandomAgent();
        });

        document.getElementById('clearAgents')?.addEventListener('click', () => {
            this.clearAgents();
        });

        document.getElementById('toggleNavMesh')?.addEventListener('click', (e) => {
            this.showNavMesh = !this.showNavMesh;
            e.target.classList.toggle('active', this.showNavMesh);
            if (this.navMeshHelper) {
                this.navMeshHelper.visible = this.showNavMesh;
            }
        });

        document.getElementById('toggleGeometry')?.addEventListener('click', (e) => {
            this.showGeometry = !this.showGeometry;
            e.target.classList.toggle('active', this.showGeometry);
            for (const mesh of this.geometryMeshes) {
                mesh.visible = this.showGeometry;
            }
        });

        // Canvas events
        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.onRightClick(e);
        });

        // Keyboard
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    checkForEditorData() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('fromEditor') === '1') {
            const data = localStorage.getItem('editor3DNavMesh');
            if (data) {
                try {
                    const json = JSON.parse(data);
                    this.loadNavMesh(json);
                    this.setStatus('Level loaded from editor');
                } catch (err) {
                    this.setStatus('Error loading editor data');
                    console.error(err);
                }
            }
        }
    }

    async loadNavMesh(data) {
        this.setStatus('Loading navmesh...');

        try {
            this.exportData = data;

            // Clear old data
            this.clearScene();

            // Visualize original geometry
            this.renderGeometry(data);

            // Generate navmesh
            const positions = new Float32Array(data.geometry.positions);
            const indices = new Uint32Array(data.geometry.indices);

            this.setStatus('Generating tiled navmesh...');

            const navmeshInput = { positions, indices };
            const navmeshOptions = {
                ...data.navmeshConfig,
                // Additional navcat parameters
                borderSize: 4,
                minRegionArea: 8,
                mergeRegionArea: 20,
                maxSimplificationError: 1.3,
                maxEdgeLength: 12,
                maxVerticesPerPoly: 6,
                detailSampleDistance: 6,
                detailSampleMaxError: 1
            };

            // generateTiledNavMesh returns { navMesh, intermediates }
            const result = generateTiledNavMesh(navmeshInput, navmeshOptions);
            this.navMesh = result.navMesh;

            console.log('NavMesh generated:', this.navMesh);

            // Create navmesh visual helper
            if (this.navMesh) {
                try {
                    this.navMeshHelper = createNavMeshHelper(this.navMesh);
                    if (this.navMeshHelper && this.navMeshHelper.object) {
                        this.navMeshHelper.object.visible = this.showNavMesh;
                        this.scene.add(this.navMeshHelper.object);
                    }
                } catch (err) {
                    console.warn('Could not create navmesh helper:', err);
                }
            }

            // Initialize crowd simulation
            // crowd.create takes only maxAgentRadius
            this.crowdSim = crowd.create(0.6);

            console.log('Crowd created:', this.crowdSim);

            const tileCount = this.navMesh?.tiles?.length || 0;
            const polyCount = this.navMesh?.tiles?.reduce((sum, tile) =>
                sum + (tile ? tile.polys.length : 0), 0) || 0;

            this.setStatus(`NavMesh ready: ${polyCount} polygons, ${tileCount} tiles`);

        } catch (err) {
            this.setStatus('Error generating navmesh: ' + err.message);
            console.error('NavMesh generation error:', err);
        }
    }

    renderGeometry(data) {
        const positions = new Float32Array(data.geometry.positions);
        const indices = new Uint32Array(data.geometry.indices);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        // Main mesh
        const material = new THREE.MeshStandardMaterial({
            color: 0x3a5a40,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.geometryMeshes.push(mesh);

        // Wireframe overlay
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.1
        });

        const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(geometry),
            wireframeMaterial
        );
        this.scene.add(wireframe);
        this.geometryMeshes.push(wireframe);
    }

    clearScene() {
        // Remove geometry meshes
        for (const mesh of this.geometryMeshes) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.geometryMeshes = [];

        // Remove navmesh helper
        if (this.navMeshHelper && this.navMeshHelper.object) {
            this.scene.remove(this.navMeshHelper.object);
            if (this.navMeshHelper.dispose) {
                this.navMeshHelper.dispose();
            }
            this.navMeshHelper = null;
        }

        // Clear agents
        this.clearAgents();
    }

    spawnRandomAgent() {
        if (!this.navMesh || !this.crowdSim) {
            this.setStatus('Load a navmesh first');
            return;
        }

        const count = parseInt(document.getElementById('agentCountInput')?.value) || 1;

        for (let i = 0; i < count; i++) {
            // Find random position on navmesh
            const bounds = this.getNavMeshBounds();
            const randomPos = [
                bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
                0,
                bounds.minY + Math.random() * (bounds.maxY - bounds.minY)
            ];

            this.spawnAgentAt(randomPos);
        }
    }

    spawnAgentAt(position) {
        if (!this.crowdSim || !this.navMesh) return;

        try {
            const agentParams = {
                radius: 0.3,
                height: 2.0,
                maxSpeed: 3.5,
                maxAcceleration: 8.0,
                collisionQueryRange: 0.5 * 12.0,
                pathOptimizationRange: 0.3 * 30.0,
                separationWeight: 2.0
            };

            // crowd.addAgent signature: (crowd, navMesh, position, params)
            const agentId = crowd.addAgent(this.crowdSim, this.navMesh, position, agentParams);

            if (agentId !== null && agentId !== undefined) {
                // Create visual mesh for agent
                const geometry = new THREE.CylinderGeometry(agentParams.radius, agentParams.radius, agentParams.height, 16);
                const material = new THREE.MeshStandardMaterial({
                    color: 0x4a90e2,
                    roughness: 0.7
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.position.set(position[0], agentParams.height / 2, position[2]);
                this.scene.add(mesh);

                this.agents.set(agentId, { mesh, data: agentParams });

                this.updateAgentCount();
            } else {
                console.warn('Could not spawn agent at position:', position);
            }
        } catch (err) {
            console.error('Error spawning agent:', err);
        }
    }

    clearAgents() {
        for (const [agentId, agentData] of this.agents) {
            this.scene.remove(agentData.mesh);
            agentData.mesh.geometry.dispose();
            agentData.mesh.material.dispose();

            if (this.crowdSim) {
                try {
                    crowd.removeAgent(this.crowdSim, agentId);
                } catch (err) {
                    console.warn('Error removing agent:', err);
                }
            }
        }
        this.agents.clear();
        this.updateAgentCount();
    }

    getNavMeshBounds() {
        if (!this.exportData) {
            return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
        }

        const positions = this.exportData.geometry.positions;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]);
            maxX = Math.max(maxX, positions[i]);
            minY = Math.min(minY, positions[i + 2]);
            maxY = Math.max(maxY, positions[i + 2]);
        }

        return { minX, maxX, minY, maxY };
    }

    onClick(event) {
        if (!this.navMesh || !this.crowdSim) return;

        const intersection = this.getGroundIntersection(event);
        if (intersection) {
            const position = [intersection.x, intersection.y, intersection.z];
            this.spawnAgentAt(position);
        }
    }

    onRightClick(event) {
        if (!this.navMesh || !this.crowdSim) return;

        const intersection = this.getGroundIntersection(event);
        if (intersection) {
            const target = [intersection.x, intersection.y, intersection.z];

            // Move all agents to target
            for (const [agentId, agentData] of this.agents) {
                try {
                    crowd.agentGoto(this.crowdSim, this.navMesh, agentId, target);
                } catch (err) {
                    console.warn('Error setting agent target:', err);
                }
            }

            // Visual feedback
            this.showTargetMarker(intersection);
        }
    }

    getGroundIntersection(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseVector.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseVector.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouseVector, this.camera);

        // Raycast against geometry meshes
        const intersects = this.raycaster.intersectObjects(this.geometryMeshes, false);

        if (intersects.length > 0) {
            return intersects[0].point;
        }

        // Fallback: intersect with ground plane
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersection);

        return intersection;
    }

    showTargetMarker(position) {
        // Remove old marker
        const oldMarker = this.scene.getObjectByName('targetMarker');
        if (oldMarker) {
            this.scene.remove(oldMarker);
            oldMarker.geometry.dispose();
            oldMarker.material.dispose();
        }

        // Create new marker
        const geometry = new THREE.SphereGeometry(0.3, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.7
        });

        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.name = 'targetMarker';
        this.scene.add(marker);

        // Auto-remove after 2 seconds
        setTimeout(() => {
            this.scene.remove(marker);
            marker.geometry.dispose();
            marker.material.dispose();
        }, 2000);
    }

    onKeyDown(event) {
        if (event.key === '1') {
            // Top view
            this.camera.position.set(0, 50, 0);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        } else if (event.key === '2') {
            // Perspective view
            this.camera.position.set(30, 25, 30);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
        }
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight - 100;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    update(deltaTime) {
        if (this.crowdSim && this.navMesh) {
            try {
                // Update crowd simulation
                crowd.update(this.crowdSim, this.navMesh, deltaTime);

                // Update agent visuals
                for (const [agentId, agentData] of this.agents) {
                    const agentPos = crowd.getAgentPosition(this.crowdSim, agentId);
                    if (agentPos) {
                        agentData.mesh.position.set(
                            agentPos[0],
                            agentPos[1] + agentData.data.height / 2,
                            agentPos[2]
                        );

                        // Rotation based on velocity
                        const velocity = crowd.getAgentVelocity(this.crowdSim, agentId);
                        if (velocity && vec3.length(velocity) > 0.1) {
                            const angle = Math.atan2(velocity[2], velocity[0]);
                            agentData.mesh.rotation.y = -angle + Math.PI / 2;
                        }
                    }
                }
            } catch (err) {
                console.error('Error updating crowd:', err);
            }
        }
    }

    updateAgentCount() {
        const el = document.getElementById('agentCount');
        if (el) el.textContent = this.agents.size;
    }

    updateFPS() {
        const el = document.getElementById('fps');
        if (el) el.textContent = Math.round(1000 / (performance.now() - this.lastTime));
    }

    setStatus(text) {
        const el = document.getElementById('status');
        if (el) el.textContent = text;
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    startLoop() {
        const loop = (time) => {
            const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
            this.lastTime = time;

            this.update(deltaTime);
            this.render();

            // FPS update
            this.frameCount++;
            if (time - this.fpsUpdateTime > 1000) {
                this.updateFPS();
                this.fpsUpdateTime = time;
                this.frameCount = 0;
            }

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}

// Initialize player
window.addEventListener('DOMContentLoaded', () => {
    window.player3d = new Player3D();
});
