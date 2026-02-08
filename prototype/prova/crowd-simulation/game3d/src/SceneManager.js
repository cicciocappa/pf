// ========================================
// SceneManager — Setup Three.js, camera ortografica, luci, livello
// ========================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AREA_WALKABLE_NARROW } from './config.js';

export class SceneManager {
    constructor(container) {
        this.container = container;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera ortografica
        const aspect = container.clientWidth / container.clientHeight;
        const frustumSize = 20;
        this.frustumSize = frustumSize;
        this.camera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            -frustumSize / 2,
            0.1,
            1000
        );

        // Camera orbitale: parametri
        this.cameraAzimuth = Math.PI / 4;       // 45° — vista isometrica
        this.cameraElevation = Math.PI / 3.2;   // ~56° elevazione
        this.cameraDistance = 50;
        this.cameraRadius = this.cameraDistance * Math.cos(this.cameraElevation) * Math.SQRT2;

        // Posizione isometrica iniziale
        this.camera.position.set(
            this.cameraRadius * Math.sin(this.cameraAzimuth),
            this.cameraDistance * Math.sin(this.cameraElevation),
            this.cameraRadius * Math.cos(this.cameraAzimuth)
        );
        this.camera.lookAt(0, 0, 0);

        // Camera target (per pan/follow)
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.desiredCameraTarget = new THREE.Vector3(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // Luci
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(30, 50, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 200;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        this.scene.add(dirLight);

        // Groups per organizzare la scena
        this.terrainGroup = new THREE.Group();  // Terreno visivo
        this.levelGroup = new THREE.Group();    // Mesh debug per navmesh
        this.navMeshGroup = new THREE.Group();  // Visualizzazione navmesh
        this.entityGroup = new THREE.Group();
        this.projectileGroup = new THREE.Group();
        this.effectGroup = new THREE.Group();

        this.scene.add(this.terrainGroup);
        this.scene.add(this.levelGroup);
        this.scene.add(this.navMeshGroup);
        this.scene.add(this.entityGroup);
        this.scene.add(this.projectileGroup);
        this.scene.add(this.effectGroup);

        // Debug: nascondi mesh di debug di default
        this.levelGroup.visible = false;
        this.navMeshGroup.visible = false;

        // Raycasting
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.mouse = new THREE.Vector2();

        // Terrain raycasting (per campionare altezza terreno)
        this._terrainRaycaster = new THREE.Raycaster();
        this._terrainDownDir = new THREE.Vector3(0, -1, 0);

        // Dati navmesh per rendering
        this.renderVertices = [];
        this.renderPolygons = [];

        // Resize handler
        this._onResize = () => this._handleResize();
        window.addEventListener('resize', this._onResize);
    }

    get canvas() {
        return this.renderer.domElement;
    }

    // ========================================
    // Camera
    // ========================================

    centerCameraOn(x, z) {
        this.cameraTarget.set(x, 0, z);
        this.desiredCameraTarget.set(x, 0, z);
    }

    setCameraDesiredTarget(x, z) {
        this.desiredCameraTarget.set(x, 0, z);
    }

    /**
     * Centra la camera su un set di posizioni flat [x,y,z, x,y,z, ...].
     */
    centerCameraOnPositions(positions) {
        if (!positions || positions.length < 3) return;

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        const numVerts = positions.length / 3;
        for (let i = 0; i < numVerts; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        this.centerCameraOn(cx, cz);

        const dx = maxX - minX;
        const dz = maxZ - minZ;
        const maxDim = Math.max(dx, dz) * 1.3;
        this.frustumSize = Math.max(10, maxDim);
        this._updateProjection();
        this.snapCameraToTarget();

        console.log(`Camera centrata su (${cx.toFixed(1)}, ${cz.toFixed(1)}), frustum: ${this.frustumSize.toFixed(1)}`);
    }

    /**
     * Posiziona la camera immediatamente sul target (senza lerp).
     */
    snapCameraToTarget() {
        const r = this.cameraRadius;
        this.camera.position.set(
            this.cameraTarget.x + r * Math.sin(this.cameraAzimuth),
            this.cameraDistance * Math.sin(this.cameraElevation),
            this.cameraTarget.z + r * Math.cos(this.cameraAzimuth)
        );
        this.camera.lookAt(this.cameraTarget);
    }

    /**
     * Pan camera di dx, dz in coordinate mondo.
     */
    panCamera(dx, dz) {
        const cos = Math.cos(this.cameraAzimuth);
        const sin = Math.sin(this.cameraAzimuth);
        const rx = dx * cos + dz * sin;
        const rz = -dx * sin + dz * cos;
        this.cameraTarget.x += rx;
        this.cameraTarget.z += rz;
        this.desiredCameraTarget.x += rx;
        this.desiredCameraTarget.z += rz;
        this.camera.position.x += rx;
        this.camera.position.z += rz;
    }

    rotateCamera(deltaAzimuth) {
        this.cameraAzimuth += deltaAzimuth;
    }

    /**
     * Zoom camera.
     */
    zoomCamera(factor) {
        this.frustumSize = Math.max(5, Math.min(100, this.frustumSize * factor));
        this._updateProjection();
    }

    /**
     * Aggiorna la camera per seguire il target con smooth lerp.
     */
    updateCamera(dt) {
        // Smooth target transition
        this.cameraTarget.lerp(this.desiredCameraTarget, Math.min(1, 3 * dt));

        const r = this.cameraRadius;
        const targetPos = new THREE.Vector3(
            this.cameraTarget.x + r * Math.sin(this.cameraAzimuth),
            this.cameraDistance * Math.sin(this.cameraElevation),
            this.cameraTarget.z + r * Math.cos(this.cameraAzimuth)
        );

        this.camera.position.lerp(targetPos, Math.min(1, 5 * dt));
        this.camera.lookAt(this.cameraTarget);
    }

    /**
     * Pan camera da mouse drag — converte pixel in unità mondo.
     */
    panCameraScreen(dxPixels, dyPixels) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const wpp = (this.camera.right - this.camera.left) / rect.width;

        const right = new THREE.Vector3();
        right.setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3();
        up.setFromMatrixColumn(this.camera.matrixWorld, 1);

        const wx = (right.x * dxPixels + up.x * dyPixels) * wpp;
        const wz = (right.z * dxPixels + up.z * dyPixels) * wpp;

        this.cameraTarget.x += wx;
        this.cameraTarget.z += wz;
        this.desiredCameraTarget.x += wx;
        this.desiredCameraTarget.z += wz;
        this.camera.position.x += wx;
        this.camera.position.z += wz;
    }

    _updateProjection() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.left = -this.frustumSize * aspect / 2;
        this.camera.right = this.frustumSize * aspect / 2;
        this.camera.top = this.frustumSize / 2;
        this.camera.bottom = -this.frustumSize / 2;
        this.camera.updateProjectionMatrix();
    }

    _handleResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.renderer.setSize(w, h);
        this._updateProjection();
    }

    // ========================================
    // Terrain
    // ========================================

    /**
     * Costruisce il terreno visivo.
     * Prova a caricare un file GLB (es. terrain01.glb), altrimenti crea piani dalle boundaries.
     * @param {string} levelName - Nome del livello (es. "level01")
     * @param {Array} boundaries - Array di boundaries dal JSON [{id, vertices: [[x,0,z],...]}]
     */
    async buildTerrain(levelName, boundaries) {
        this._clearGroup(this.terrainGroup);

        // Estrai numero dal nome del livello (level01 -> 01)
        const levelNum = levelName.replace(/\D/g, '') || '01';
        const terrainPath = `./levels/terrain${levelNum}.glb`;

        // Prova a caricare il GLB del terreno
        try {
            const gltf = await this._loadGLTF(terrainPath);
            console.log(`Terreno caricato da ${terrainPath}`);

            // Prepara il modello
            gltf.scene.traverse((child) => {
                if (child.isMesh) {
                    child.receiveShadow = true;
                    child.castShadow = false;
                }
            });

            this.terrainGroup.add(gltf.scene);
            return;
        } catch (e) {
            console.log(`Terreno GLB non trovato (${terrainPath}), uso fallback dalle boundaries`);
        }

        // Fallback: crea piani verdi dalle boundaries
        if (!boundaries || boundaries.length === 0) {
            console.warn('Nessuna boundary definita per il terreno');
            return;
        }

        for (const boundary of boundaries) {
            const mesh = this._createTerrainFromBoundary(boundary.vertices);
            if (mesh) {
                this.terrainGroup.add(mesh);
            }
        }
    }

    /**
     * Carica un file GLTF/GLB
     */
    _loadGLTF(path) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(
                path,
                (gltf) => resolve(gltf),
                undefined,
                (error) => reject(error)
            );
        });
    }

    /**
     * Crea una mesh del terreno da una boundary (poligono)
     * @param {Array} vertices - Array di vertici [[x, 0, z], ...]
     */
    _createTerrainFromBoundary(vertices) {
        if (!vertices || vertices.length < 3) return null;

        // Crea shape 2D per ShapeGeometry (piano XY)
        // rotateX(-PI/2) trasforma (sx, sy, 0) → (sx, 0, -sy),
        // quindi neghiamo z per compensare: -(-z) = z
        const shape = new THREE.Shape();
        shape.moveTo(vertices[0][0], -vertices[0][2]);
        for (let i = 1; i < vertices.length; i++) {
            shape.lineTo(vertices[i][0], -vertices[i][2]);
        }
        shape.closePath();

        // Crea geometria dal shape
        const geometry = new THREE.ShapeGeometry(shape);

        // Ruota per essere orizzontale (da XY a XZ)
        geometry.rotateX(-Math.PI / 2);

        // Materiale verde erba
        const material = new THREE.MeshLambertMaterial({
            color: 0x4a7c39,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.position.y = 0.01; // Leggermente sopra Y=0 per evitare z-fighting

        return mesh;
    }

    /**
     * Campiona l'altezza del terreno in un punto (x, z) con raycast.
     * @param {number} x
     * @param {number} z
     * @returns {number} altezza Y del terreno, o 0 se nessun hit
     */
    sampleTerrainHeight(x, z) {
        if (this.terrainGroup.children.length === 0) return 0;
        const origin = new THREE.Vector3(x, 100, z);
        this._terrainRaycaster.set(origin, this._terrainDownDir);
        const meshes = [];
        this.terrainGroup.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
        const intersects = this._terrainRaycaster.intersectObjects(meshes);
        return intersects.length > 0 ? intersects[0].point.y : 0;
    }

    // ========================================
    // Level Geometry
    // ========================================

    buildLevelGeometry(structuredMeshData) {
        // Clear
        this._clearGroup(this.levelGroup);

        if (!structuredMeshData) return;

        // Ground
        if (structuredMeshData.ground && structuredMeshData.ground.positions.length > 0) {
            this.levelGroup.add(this._buildMesh(
                structuredMeshData.ground.positions,
                structuredMeshData.ground.indices,
                0x3a7d44, 0.7
            ));
            this.levelGroup.add(this._buildWireframe(
                structuredMeshData.ground.positions,
                structuredMeshData.ground.indices,
                0x66ff66
            ));
        }

        // Structures
        const structColors = { building: 0xc0392b, wall: 0xe67e22 };
        for (const s of structuredMeshData.structures) {
            const col = structColors[s.type] || 0x9b59b6;
            this.levelGroup.add(this._buildMesh(s.positions, s.indices, col, 0.85));
            this.levelGroup.add(this._buildWireframe(s.positions, s.indices, 0xffffff));
        }

        // Static obstacles
        if (structuredMeshData.staticObstacles && structuredMeshData.staticObstacles.positions.length > 0) {
            this.levelGroup.add(this._buildMesh(
                structuredMeshData.staticObstacles.positions,
                structuredMeshData.staticObstacles.indices,
                0x8e44ad, 0.85
            ));
            this.levelGroup.add(this._buildWireframe(
                structuredMeshData.staticObstacles.positions,
                structuredMeshData.staticObstacles.indices,
                0xffffff
            ));
        }

        // Off-mesh connections
        if (structuredMeshData.offMeshConnections && structuredMeshData.offMeshConnections.length > 0) {
            const pts = [];
            for (const link of structuredMeshData.offMeshConnections) {
                pts.push(link.start[0], link.start[1] + 0.1, link.start[2]);
                pts.push(link.end[0], link.end[1] + 0.1, link.end[2]);
            }
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            this.levelGroup.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0x00ffff })));
        }
    }

    _buildMesh(positions, indices, color, opacity = 1) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.MeshPhongMaterial({
            color,
            side: THREE.DoubleSide,
            transparent: opacity < 1,
            opacity,
            depthWrite: opacity >= 1,
        });
        return new THREE.Mesh(geom, mat);
    }

    _buildWireframe(positions, indices, color) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        const wire = new THREE.WireframeGeometry(geom);
        return new THREE.LineSegments(wire, new THREE.LineBasicMaterial({
            color,
            opacity: 0.3,
            transparent: true,
        }));
    }

    // ========================================
    // NavMesh Geometry
    // ========================================

    buildNavMeshGeometry(renderVertices, renderPolygons) {
        this._clearGroup(this.navMeshGroup);
        this.renderVertices = renderVertices;
        this.renderPolygons = renderPolygons;

        if (renderPolygons.length === 0) return;

        const verts = renderVertices;
        const positions = [];
        const colors = [];
        const wallPositions = [];

        for (let i = 0; i < renderPolygons.length; i++) {
            const poly = renderPolygons[i];
            if (poly.flags === 0) continue;
            const isNarrow = poly.area === AREA_WALKABLE_NARROW;

            // Triangulate (fan)
            const pVerts = poly.vertices;
            for (let j = 1; j < pVerts.length - 1; j++) {
                const v0 = pVerts[0], v1 = pVerts[j], v2 = pVerts[j + 1];
                positions.push(
                    verts[v0 * 3], verts[v0 * 3 + 1] + 0.05, verts[v0 * 3 + 2],
                    verts[v1 * 3], verts[v1 * 3 + 1] + 0.05, verts[v1 * 3 + 2],
                    verts[v2 * 3], verts[v2 * 3 + 1] + 0.05, verts[v2 * 3 + 2]
                );

                let r, g, b;
                if (isNarrow) {
                    r = 0.55; g = 0.4; b = 0.2;
                } else {
                    const hue = (200 + (i * 17) % 60) / 360;
                    const c = this._hslToRgb(hue, 0.5, 0.3);
                    r = c[0]; g = c[1]; b = c[2];
                }
                for (let k = 0; k < 3; k++) colors.push(r, g, b);
            }

            // Wall edges
            for (let j = 0; j < pVerts.length; j++) {
                const v1i = pVerts[j];
                const v2i = pVerts[(j + 1) % pVerts.length];
                if (!this._isSharedEdge(v1i, v2i, renderPolygons)) {
                    wallPositions.push(
                        verts[v1i * 3], verts[v1i * 3 + 1] + 0.06, verts[v1i * 3 + 2],
                        verts[v2i * 3], verts[v2i * 3 + 1] + 0.06, verts[v2i * 3 + 2]
                    );
                }
            }
        }

        if (positions.length > 0) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geom.computeVertexNormals();

            const mat = new THREE.MeshPhongMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            this.navMeshGroup.add(new THREE.Mesh(geom, mat));
        }

        if (wallPositions.length > 0) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
            this.navMeshGroup.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
                color: 0xe94560,
                linewidth: 2,
            })));
        }
    }

    _isSharedEdge(v1Idx, v2Idx, polygons) {
        let count = 0;
        for (const poly of polygons) {
            const verts = poly.vertices;
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i];
                const b = verts[(i + 1) % verts.length];
                if ((a === v1Idx && b === v2Idx) || (a === v2Idx && b === v1Idx)) {
                    count++;
                    if (count > 1) return true;
                }
            }
        }
        return false;
    }

    _hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return [r, g, b];
    }

    /**
     * Ricostruisce la geometria della navmesh (alias per buildNavMeshGeometry)
     * Usato quando la navmesh viene rigenerata dinamicamente
     */
    rebuildNavMeshGeometry(renderVertices, renderPolygons) {
        this.buildNavMeshGeometry(renderVertices, renderPolygons);
    }

    // ========================================
    // Raycasting
    // ========================================

    /**
     * Ottiene la posizione mondo dal mouse (intersezione con piano Y=0).
     * Restituisce {x, z} o null.
     */
    getWorldPosFromMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
        if (hit) {
            return { x: target.x, z: target.z };
        }
        return null;
    }

    /**
     * Ottiene la posizione mondo da coordinate screen (pixel).
     */
    getWorldPosFromScreen(screenX, screenY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
        if (hit) {
            return { x: target.x, z: target.z };
        }
        return null;
    }

    /**
     * Proietta una posizione mondo (x, y, z) in coordinate schermo (pixel).
     * Restituisce {x, y} in pixel relativi al canvas, o null.
     */
    worldToScreen(x, y, z) {
        const v = new THREE.Vector3(x, y, z);
        v.project(this.camera);

        const rect = this.renderer.domElement.getBoundingClientRect();
        return {
            x: (v.x * 0.5 + 0.5) * rect.width,
            y: (-v.y * 0.5 + 0.5) * rect.height,
        };
    }

    /**
     * Trova l'entity più vicina al click tra una lista di entities con mesh.
     */
    getEntityAtClick(event, entities) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Raccogli tutte le mesh delle entità
        const meshes = [];
        const entityMap = new Map();
        for (const e of entities) {
            if (!e.alive || !e.group) continue;
            e.group.traverse((obj) => {
                if (obj.isMesh) {
                    meshes.push(obj);
                    entityMap.set(obj, e);
                }
            });
        }

        const intersects = this.raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            return entityMap.get(intersects[0].object) || null;
        }
        return null;
    }

    // ========================================
    // Effects
    // ========================================

    showExplosion(cx, cz, radius) {
        const group = new THREE.Group();
        group.position.set(cx, 0.1, cz);

        // Cerchio arancione
        const ringGeom = new THREE.RingGeometry(0, radius, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xFF4500,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);

        // Sfera interna gialla
        const innerGeom = new THREE.SphereGeometry(radius * 0.4, 12, 8);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xFFFF00,
            transparent: true,
            opacity: 0.8,
        });
        const inner = new THREE.Mesh(innerGeom, innerMat);
        inner.position.y = radius * 0.3;
        group.add(inner);

        this.effectGroup.add(group);

        return {
            group,
            timer: 0.5,
            duration: 0.5,
        };
    }

    // ========================================
    // Rendering
    // ========================================

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // ========================================
    // Utilities
    // ========================================

    _clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            child.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        }
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }

    /**
     * Mostra/nasconde le mesh di debug (levelGroup e navMeshGroup)
     */
    setDebugVisible(visible) {
        this.levelGroup.visible = visible;
        this.navMeshGroup.visible = visible;
    }
}
