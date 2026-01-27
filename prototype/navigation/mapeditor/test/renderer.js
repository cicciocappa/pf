// renderer.js - Rendering canvas

import { state, camera, config } from './state.js';

let canvasRef = null;
let ctxRef = null;

export function initRenderer(canvas) {
    canvasRef = canvas;
    ctxRef = canvas.getContext('2d');
}

export function render(canvas) {
    const ctx = canvas ? canvas.getContext('2d') : ctxRef;
    const cv = canvas || canvasRef;

    if (!ctx || !cv) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(camera.offsetX, camera.offsetY);
    ctx.scale(camera.zoom, camera.zoom);

    drawGrid(ctx, cv);

    if (state.mapData) {
        // NavGraph (disegnato per primo, sotto tutto)
        if (config.showNavgraph) {
            drawGraph(ctx);
        }

        // Original geometry - bordo esterno (blu, tratto spesso)
        drawPolygon(ctx, state.mapData.outer, '#4a9eff', null, 4);
        // Original geometry - ostacoli (rosso pieno, tratto spesso)
        (state.mapData.holes || []).forEach(h => drawPolygon(ctx, h, '#ff4060', '#ff406030', 3));

        // Processed geometry (offset contours) - tratteggiato per distinguersi
        if (config.showContours) {
            if (state.processedGeometry.outer.length) {
                drawPolygonDashed(ctx, state.processedGeometry.outer, '#80c0ff', 2, [8, 4]);
            }
            state.processedGeometry.holes.forEach(h =>
                drawPolygonDashed(ctx, h, '#ff80a0', 2, [8, 4])
            );
        }
    }

    // Agent destinations (disegnate prima degli agenti, sotto)
    state.agents.forEach((agent) => {
        if (agent.destination) {
            const dest = agent.destination;
            const color = agent.color || '#ffcc00';

            // Cerchio esterno tratteggiato (destination marker)
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / camera.zoom;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(dest.x, dest.y, agent.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Croce al centro
            const crossSize = 6 / camera.zoom;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / camera.zoom;
            ctx.beginPath();
            ctx.moveTo(dest.x - crossSize, dest.y);
            ctx.lineTo(dest.x + crossSize, dest.y);
            ctx.moveTo(dest.x, dest.y - crossSize);
            ctx.lineTo(dest.x, dest.y + crossSize);
            ctx.stroke();
        }
    });

    // Agents
    state.agents.forEach((agent) => {
        if (agent.pos) {
            // Path tratteggiato
            if (agent.path.length > 0) {
                ctx.strokeStyle = agent.color || '#ffcc00';
                ctx.lineWidth = 2 / camera.zoom;
                ctx.setLineDash([5, 5]);
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(agent.pos.x, agent.pos.y);
                for (const p of agent.path) ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1.0;
            }

            // Agente (cerchio pieno con bordo)
            ctx.fillStyle = agent.color || '#ffcc00';
            ctx.beginPath();
            ctx.arc(agent.pos.x, agent.pos.y, agent.radius, 0, Math.PI * 2);
            ctx.fill();

            // Bordo scuro per contrasto
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5 / camera.zoom;
            ctx.stroke();
        }
    });

    // Target
    if (state.targetPos) {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(state.targetPos.x, state.targetPos.y, 6 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawGraph(ctx) {
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (const edge of state.visibilityGraph.edges) {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
    }
    ctx.stroke();

    ctx.fillStyle = '#00ffcc';
    for (const node of state.visibilityGraph.nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 3 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPolygon(ctx, poly, stroke, fill, width) {
    if (!poly || poly.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width / camera.zoom; ctx.stroke(); }
}

function drawPolygonDashed(ctx, poly, stroke, width, dashPattern) {
    if (!poly || poly.length < 2) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width / camera.zoom;
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawGrid(ctx, canvas) {
    const step = 50;
    const bounds = {
        minX: -camera.offsetX / camera.zoom - 100,
        minY: -camera.offsetY / camera.zoom - 100,
        maxX: (canvas.width - camera.offsetX) / camera.zoom + 100,
        maxY: (canvas.height - camera.offsetY) / camera.zoom + 100
    };

    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 1 / camera.zoom;

    ctx.beginPath();
    for (let x = Math.floor(bounds.minX / step) * step; x < bounds.maxX; x += step) {
        ctx.moveTo(x, bounds.minY);
        ctx.lineTo(x, bounds.maxY);
    }
    for (let y = Math.floor(bounds.minY / step) * step; y < bounds.maxY; y += step) {
        ctx.moveTo(bounds.minX, y);
        ctx.lineTo(bounds.maxX, y);
    }
    ctx.stroke();
}

export function fitToView(canvas) {
    if (!state.mapData || state.mapData.outer.length === 0) return;
    const xs = state.mapData.outer.map(p => p.x);
    const ys = state.mapData.outer.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padding = 80;
    const scaleX = (canvas.width - padding * 2) / (maxX - minX);
    const scaleY = (canvas.height - padding * 2) / (maxY - minY);
    camera.zoom = Math.min(scaleX, scaleY, 2);
    camera.offsetX = padding - minX * camera.zoom;
    camera.offsetY = padding - minY * camera.zoom;
}
