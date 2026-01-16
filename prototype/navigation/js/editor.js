
import { Geometry } from './geometry.js';

export class Editor {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Data
        this.outerPoly = []; // Array of points {x, y}
        this.holes = [];     // Array of arrays of points
        this.currentPoly = []; // Points for the polygon currently being drawn

        this.navMesh = null; // Resulting navmesh (list of convex polygons)

        // State
        this.mode = 'outer'; // 'outer' or 'hole'
        this.isDrawing = false;

        // Geometry helper
        this.geometry = new Geometry();

        this.bindEvents();
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelDrawing();
            } else if (e.key === 'Enter') {
                this.finishCurrentPoly();
            }
        });
    }

    setMode(mode) {
        this.mode = mode;
        this.cancelDrawing(); // Reset current drawing when switching modes
        this.draw();
    }

    getMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);

        // Left click: Force a point
        if (e.button === 0) {
            this.addPoint(pos);
        }
        // Right click: Finish polygon
        else if (e.button === 2) {
            this.finishCurrentPoly();
        }
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        this.currentMousePos = pos;
        this.draw();
    }

    addPoint(pos) {
        if (!this.isDrawing) {
            this.isDrawing = true;
            this.currentPoly = [];
        }

        // Snap logic could go here

        this.currentPoly.push(pos);
        this.draw();
    }

    cancelDrawing() {
        this.isDrawing = false;
        this.currentPoly = [];
        this.draw();
    }

    finishCurrentPoly() {
        if (!this.isDrawing || this.currentPoly.length < 3) return;

        if (this.mode === 'outer') {
            this.outerPoly = [...this.currentPoly];
        } else {
            this.holes.push([...this.currentPoly]);
        }

        this.cancelDrawing();
        this.navMesh = null; // Invalidate bake
        this.draw();
    }

    clear() {
        this.outerPoly = [];
        this.holes = [];
        this.currentPoly = [];
        this.navMesh = null;
        this.draw();
    }

    bake() {
        if (this.outerPoly.length < 3) {
            alert("Please draw an outer map boundary first.");
            return;
        }

        console.log("Baking NavMesh...");
        try {
            this.navMesh = this.geometry.computeNavMesh(this.outerPoly, this.holes);
            console.log("NavMesh generated:", this.navMesh);
        } catch (err) {
            console.error(err);
            alert("Error generating NavMesh: " + err.message);
        }
        this.draw();
    }

    exportJson() {
        if (!this.navMesh) {
            alert("Please bake the NavMesh first.");
            return;
        }

        const data = {
            outer: this.outerPoly,
            holes: this.holes,
            navMesh: this.navMesh
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "navmesh.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw NavMesh (if exists)
        if (this.navMesh) {
            ctx.fillStyle = 'rgba(74, 144, 226, 0.3)';
            ctx.strokeStyle = 'rgba(74, 144, 226, 0.8)';
            ctx.lineWidth = 1;

            for (const poly of this.navMesh) {
                this.drawPolygonPath(ctx, poly);
                ctx.fill();
                ctx.stroke();
            }
        }

        // 2. Draw Outer Boundary
        if (this.outerPoly.length > 0) {
            ctx.strokeStyle = '#4a90e2';
            ctx.lineWidth = 3;
            this.drawPolygonPath(ctx, this.outerPoly, true);
            ctx.stroke();
        }

        // 3. Draw Holes
        ctx.fillStyle = 'rgba(231, 76, 60, 0.5)';
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        for (const hole of this.holes) {
            this.drawPolygonPath(ctx, hole, true);
            ctx.fill();
            ctx.stroke();
        }

        // 4. Draw Current Drawing
        if (this.isDrawing && this.currentPoly.length > 0) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.currentPoly[0].x, this.currentPoly[0].y);
            for (let i = 1; i < this.currentPoly.length; i++) {
                ctx.lineTo(this.currentPoly[i].x, this.currentPoly[i].y);
            }
            if (this.currentMousePos) {
                ctx.lineTo(this.currentMousePos.x, this.currentMousePos.y);
            }
            ctx.stroke();

            // Draw vertices
            ctx.fillStyle = '#fff';
            for (const p of this.currentPoly) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawPolygonPath(ctx, points, close = false) {
        ctx.beginPath();
        if (points.length === 0) return;
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        if (close) ctx.closePath();
    }
}
