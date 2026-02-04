// ========================================
// Proiettili (3D)
// ========================================

import * as THREE from 'three';

let nextProjId = 1;

export class Projectile {
    constructor(x, z, target, speed, damage, color, aoeRadius = 0) {
        this.id = nextProjId++;
        this.x = x;
        this.z = z;
        this.y = 1.0; // altezza di volo
        this.target = target;    // Entity bersaglio (o {x, z, alive} per spell)
        this.speed = speed;
        this.damage = damage;
        this.color = color;
        this.aoeRadius = aoeRadius;
        this.radius = 0.08;
        this.alive = true;

        // Callback opzionale per impatto (usato da SpellSystem)
        this._onHit = null;

        // Three.js
        this.mesh = null;
    }

    createVisual() {
        const group = new THREE.Group();

        // Sfera proiettile
        const geom = new THREE.SphereGeometry(this.radius, 8, 6);
        const mat = new THREE.MeshPhongMaterial({
            color: this.color,
            emissive: this.color,
            emissiveIntensity: 0.5,
        });
        const sphere = new THREE.Mesh(geom, mat);
        group.add(sphere);

        // Alone per proiettili AoE (palle di fuoco)
        if (this.aoeRadius > 0) {
            const haloGeom = new THREE.SphereGeometry(this.radius * 2.5, 8, 6);
            const haloMat = new THREE.MeshBasicMaterial({
                color: this.color,
                transparent: true,
                opacity: 0.3,
            });
            group.add(new THREE.Mesh(haloGeom, haloMat));
        }

        group.position.set(this.x, this.y, this.z);
        this.mesh = group;
        return group;
    }

    /**
     * Aggiorna posizione. Restituisce true se ha raggiunto il bersaglio.
     */
    update(dt) {
        if (!this.alive) return false;

        const tx = this.target.x;
        const tz = this.target.z;
        const ty = this.target.alive ? 0.5 : this.y;

        const dx = tx - this.x;
        const dz = tz - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= this.speed * dt + 0.15) {
            // Colpito!
            this.x = tx;
            this.z = tz;
            this.alive = false;
            this._syncPosition();
            return true;
        }

        // Muovi verso il bersaglio
        const nx = dx / dist;
        const nz = dz / dist;
        this.x += nx * this.speed * dt;
        this.z += nz * this.speed * dt;
        this._syncPosition();
        return false;
    }

    _syncPosition() {
        if (this.mesh) {
            this.mesh.position.set(this.x, this.y, this.z);
            this.mesh.visible = this.alive;
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
        }
    }
}
