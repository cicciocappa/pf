// state.js - Stato globale condiviso

export const state = {
    mapData: null,
    processedGeometry: {
        outer: [],
        holes: []
    },
    visibilityGraph: {
        nodes: [],
        edges: []
    },
    agents: [],
    targetPos: null,
    lastTime: 0
};

export const camera = {
    offsetX: 50,
    offsetY: 50,
    zoom: 1.0
};

export const inputState = {
    isPanning: false,
    panStart: { x: 0, y: 0 },
    spacePressed: false
};

// Configurazione
export const config = {
    agentRadius: 12,
    simplifyThreshold: 1,
    showContours: true,
    showNavgraph: true,
    useRVO: true
};
