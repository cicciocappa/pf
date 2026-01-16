
export class Geometry {
    constructor() {
    }

    /**
     * Compute NavMesh from outer polygon and holes.
     * @param {Array<{x,y}>} outer 
     * @param {Array<Array<{x,y}>>} holes 
     */
    computeNavMesh(outer, holes) {
        // 1. Prepare data for poly2tri
        // poly2tri expects Point objects
        // Access global poly2tri explicitly
        const p2t = window.poly2tri;
        const swctx = new p2t.SweepContext(this.toPoints(outer));

        for (const hole of holes) {
            swctx.addHole(this.toPoints(hole));
        }

        // 2. Triangulate
        swctx.triangulate();
        const triangles = swctx.getTriangles();

        // 3. Convert triangles to simple structure for merging
        let myTriangles = triangles.map(t => {
            return [
                { x: t.getPoint(0).x, y: t.getPoint(0).y },
                { x: t.getPoint(1).x, y: t.getPoint(1).y },
                { x: t.getPoint(2).x, y: t.getPoint(2).y }
            ];
        });

        // 4. Convex Partitioning (Hertel-Mehlhorn)
        // Since we start with a triangulation, we are already convex.
        // We just need to merge adjacent triangles if they form a convex polygon.

        const polygons = this.mergeTriangles(myTriangles);

        return polygons;
    }

    toPoints(poly) {
        return poly.map(p => new window.poly2tri.Point(p.x, p.y));
    }

    // Hertel-Mehlhorn Heuristic
    mergeTriangles(triangles) {
        // Convert triangles to a more workable structure (Doubly Connected Edge List or similar adjacency)
        // For simplicity in JS, we can use a list of polygons and iteratively check shared edges.

        let polygons = [...triangles]; // Start with triangles as polygons

        let changed = true;
        while (changed) {
            changed = false;

            // Naive O(N^2) approach for finding mergeable neighbors
            // Because N is small for this demo, it's fine. 
            // Better: build an adjacency graph first.

            for (let i = 0; i < polygons.length; i++) {
                for (let j = i + 1; j < polygons.length; j++) {
                    const polyA = polygons[i];
                    const polyB = polygons[j];

                    const sharedEdge = this.findSharedEdge(polyA, polyB);
                    if (sharedEdge) {
                        // Check if merging creates a convex polygon
                        if (this.isConvexMerge(polyA, polyB, sharedEdge)) {
                            const newPoly = this.merge(polyA, polyB, sharedEdge);

                            // Replace polyA with newPoly, remove polyB
                            polygons[i] = newPoly;
                            polygons.splice(j, 1);

                            changed = true;
                            break; // Restart loop to stay safe
                        }
                    }
                }
                if (changed) break;
            }
        }

        return polygons;
    }

    // Returns indices of shared edge vertices in polyA and polyB or null
    // Actually returns the two shared points
    findSharedEdge(polyA, polyB) {
        // Find 2 points that are common to both
        const common = [];
        for (const pA of polyA) {
            for (const pB of polyB) {
                if (Math.abs(pA.x - pB.x) < 0.1 && Math.abs(pA.y - pB.y) < 0.1) {
                    common.push(pA);
                }
            }
        }

        if (common.length === 2) return common;
        return null; // Should ideally be 2 for a valid shared edge, or 0.
    }

    isConvexMerge(polyA, polyB, sharedEdge) {
        // Merging two convex polygons is convex logic:
        // When removing the shared edge, check the internal angles at the vertices of that edge.
        // If both become < 180 degrees, it's convex.

        // Let's construct the merged polygon first, then check convexity.
        const merged = this.merge(polyA, polyB, sharedEdge);
        return this.isConvex(merged);
    }

    merge(polyA, polyB, sharedEdge) {
        // Combine vertices. The order matters (CW or CCW).
        // Standard approach: 
        // 1. Find indices of shared edge in A.
        // 2. Insert B's vertices (excluding shared) at the right place.

        // Simplify: Just collect all unique points and sort angularly? No, that breaks simple polygons.
        // We need to trace the perimeter.

        // Make a list of edges for both
        const edgesA = this.getEdges(polyA);
        const edgesB = this.getEdges(polyB);

        // Remove the shared edge (it appears in both)
        // The shared edge in A is (p1, p2), in B it might be (p2, p1).

        const validEdges = [];

        const isShared = (p1, p2) => {
            return (this.eq(p1, sharedEdge[0]) && this.eq(p2, sharedEdge[1])) ||
                (this.eq(p1, sharedEdge[1]) && this.eq(p2, sharedEdge[0]));
        };

        [...edgesA, ...edgesB].forEach(edge => {
            if (!isShared(edge[0], edge[1])) {
                validEdges.push(edge);
            }
        });

        // Reconstruct polygon from edges
        return this.linkEdges(validEdges);
    }

    getEdges(poly) {
        const edges = [];
        for (let i = 0; i < poly.length; i++) {
            edges.push([poly[i], poly[(i + 1) % poly.length]]);
        }
        return edges;
    }

    // Stitch edges back into a loop
    linkEdges(edges) {
        if (edges.length === 0) return [];
        const poly = [edges[0][0]];
        let currentPoint = edges[0][1];
        const usedEdges = new Set([0]);

        while (usedEdges.size < edges.length) {
            poly.push(currentPoint);

            // Find next edge starting with currentPoint
            let found = false;
            for (let i = 0; i < edges.length; i++) {
                if (usedEdges.has(i)) continue;

                if (this.eq(edges[i][0], currentPoint)) {
                    currentPoint = edges[i][1];
                    usedEdges.add(i);
                    found = true;
                    break;
                }
                // Could be reversed?
                // Assuming consistent winding, edges should align head-to-tail. 
                // But let's check reverse just in case.
                else if (this.eq(edges[i][1], currentPoint)) {
                    currentPoint = edges[i][0];
                    usedEdges.add(i);
                    found = true;
                    break;
                }
            }
            if (!found) break; // Should not happen for valid polygons
        }
        return poly;
    }

    eq(p1, p2) {
        return Math.abs(p1.x - p2.x) < 0.1 && Math.abs(p1.y - p2.y) < 0.1;
    }

    isConvex(poly) {
        if (poly.length < 3) return false;
        let isPositive = null;

        for (let i = 0; i < poly.length; i++) {
            const p0 = poly[i];
            const p1 = poly[(i + 1) % poly.length];
            const p2 = poly[(i + 2) % poly.length];

            const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);

            if (cross !== 0) {
                if (isPositive === null) {
                    isPositive = cross > 0;
                } else if ((cross > 0) !== isPositive) {
                    return false;
                }
            }
        }
        return true;
    }
}
