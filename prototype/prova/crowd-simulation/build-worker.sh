#!/bin/bash
# Builds navmesh-worker-bundle.js by inlining mathcat into navcat
# and appending the worker logic. No bundler needed.
# Each library is wrapped in an IIFE to avoid const/let conflicts.

OUTFILE="navmesh-worker-bundle.js"
MATHCAT="navcat/node_modules/mathcat/dist/index.js"
NAVCAT="navcat/dist/index.js"

cd "$(dirname "$0")"

{
    echo "// Auto-generated bundle: mathcat + navcat + worker logic"
    echo "// Run ./build-worker.sh to regenerate"
    echo ""

    # 1. Mathcat wrapped in IIFE, exposing needed symbols
    echo "const { vec3, vec2, box3, clamp, triangle2, circle } = (function() {"
    sed '/^export /d; /^\/\/#/d' "$MATHCAT"
    echo "return { vec3, vec2, box3, clamp, triangle2, circle };"
    echo "})();"
    echo ""

    # 2. Navcat wrapped in IIFE, receiving mathcat symbols, exposing navcat symbols
    # Extract the export line to find all exported names
    echo "const {"
    echo "  BuildContext, markWalkableTriangles, calculateMeshBounds, calculateGridSize,"
    echo "  createHeightfield, rasterizeTriangles, filterLowHangingWalkableObstacles,"
    echo "  filterLedgeSpans, filterWalkableLowHeightSpans, buildCompactHeightfield,"
    echo "  erodeAndMarkWalkableAreas, medianFilterWalkableArea, buildDistanceField,"
    echo "  buildRegionsMonotone, buildContours, buildPolyMesh, buildPolyMeshDetail,"
    echo "  polyMeshToTilePolys, polyMeshDetailToTileDetailMesh, buildTile,"
    echo "  WALKABLE_AREA, ContourBuildFlags"
    echo "} = (function(vec3, vec2, box3, clamp, triangle2, circle) {"
    sed '/^import.*from.*mathcat/d; /^export /d; /^\/\/#/d' "$NAVCAT"
    echo "return {"
    echo "  BuildContext, markWalkableTriangles, calculateMeshBounds, calculateGridSize,"
    echo "  createHeightfield, rasterizeTriangles, filterLowHangingWalkableObstacles,"
    echo "  filterLedgeSpans, filterWalkableLowHeightSpans, buildCompactHeightfield,"
    echo "  erodeAndMarkWalkableAreas, medianFilterWalkableArea, buildDistanceField,"
    echo "  buildRegionsMonotone, buildContours, buildPolyMesh, buildPolyMeshDetail,"
    echo "  polyMeshToTilePolys, polyMeshDetailToTileDetailMesh, buildTile,"
    echo "  WALKABLE_AREA, ContourBuildFlags"
    echo "};"
    echo "})(vec3, vec2, box3, clamp, triangle2, circle);"
    echo ""

    # 3. Worker logic
    echo "// --- worker logic ---"
    cat <<'WORKER_EOF'
const SMALL_RADIUS = 0.4;
const LARGE_RADIUS = 1.2;
const AREA_WALKABLE = 1;
const AREA_WALKABLE_NARROW = 2;

self.onmessage = function(e) {
    const { positions, indices, generationId } = e.data;

    try {
        const tile = buildTileFromMesh(positions, indices);
        self.postMessage({ tile, generationId });
    } catch (error) {
        self.postMessage({ error: error.message, generationId });
    }
};

function buildTileFromMesh(positions, indices) {
    const ctx = BuildContext.create();
    BuildContext.start(ctx, 'navmesh generation');

    const cs = 0.15;
    const ch = 0.15;
    const walkableRadiusVoxels = Math.ceil(SMALL_RADIUS / cs);
    const walkableHeightVoxels = Math.ceil(2.0 / ch);
    const walkableClimbVoxels = Math.ceil(0.5 / ch);
    const walkableSlopeAngleDegrees = 45;
    const borderSize = 0;
    const minRegionArea = 8;
    const mergeRegionArea = 20;
    const maxSimplificationError = 1.3;
    const maxEdgeLength = Math.floor(12 / cs);
    const maxVerticesPerPoly = 6;
    const detailSampleDistance = 6;
    const detailSampleMaxError = 1;

    const walkableRadiusThresholds = [
        {
            areaId: AREA_WALKABLE_NARROW,
            walkableRadiusVoxels: Math.ceil(LARGE_RADIUS / cs),
        }
    ];

    const triAreaIds = new Uint8Array(indices.length / 3).fill(0);
    markWalkableTriangles(positions, indices, triAreaIds, walkableSlopeAngleDegrees);

    const bounds = calculateMeshBounds(box3.create(), positions, indices);
    const [hfWidth, hfHeight] = calculateGridSize(vec2.create(), bounds, cs);
    const heightfield = createHeightfield(hfWidth, hfHeight, bounds, cs, ch);
    rasterizeTriangles(ctx, heightfield, positions, indices, triAreaIds, walkableClimbVoxels);

    filterLowHangingWalkableObstacles(heightfield, walkableClimbVoxels);
    filterLedgeSpans(heightfield, walkableHeightVoxels, walkableClimbVoxels);
    filterWalkableLowHeightSpans(heightfield, walkableHeightVoxels);

    const compactHf = buildCompactHeightfield(ctx, walkableHeightVoxels, walkableClimbVoxels, heightfield);

    erodeAndMarkWalkableAreas(walkableRadiusVoxels, walkableRadiusThresholds, compactHf);
    medianFilterWalkableArea(compactHf);

    buildDistanceField(compactHf);
    buildRegionsMonotone(compactHf, borderSize, minRegionArea, mergeRegionArea);

    const contourSet = buildContours(
        ctx, compactHf, maxSimplificationError, maxEdgeLength,
        ContourBuildFlags.CONTOUR_TESS_WALL_EDGES
    );

    const polyMesh = buildPolyMesh(ctx, contourSet, maxVerticesPerPoly);

    for (let i = 0; i < polyMesh.nPolys; i++) {
        if (polyMesh.areas[i] === WALKABLE_AREA) {
            polyMesh.areas[i] = AREA_WALKABLE;
        }
        if (polyMesh.areas[i] !== 0) {
            polyMesh.flags[i] = 1;
        }
    }

    const polyMeshDetail = buildPolyMeshDetail(ctx, polyMesh, compactHf, detailSampleDistance, detailSampleMaxError);

    BuildContext.end(ctx, 'navmesh generation');

    const tilePolys = polyMeshToTilePolys(polyMesh);
    const tileDetailMesh = polyMeshDetailToTileDetailMesh(tilePolys.polys, polyMeshDetail);

    const tileParams = {
        bounds: polyMesh.bounds,
        vertices: tilePolys.vertices,
        polys: tilePolys.polys,
        detailMeshes: tileDetailMesh.detailMeshes,
        detailVertices: tileDetailMesh.detailVertices,
        detailTriangles: tileDetailMesh.detailTriangles,
        tileX: 0,
        tileY: 0,
        tileLayer: 0,
        cellSize: cs,
        cellHeight: ch,
        walkableHeight: 2.0,
        walkableRadius: SMALL_RADIUS,
        walkableClimb: 0.5,
    };

    return buildTile(tileParams);
}
WORKER_EOF
} > "$OUTFILE"

echo "Built $OUTFILE ($(wc -c < "$OUTFILE") bytes)"
