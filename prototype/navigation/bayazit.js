function cross(a, b, c) {
  // cross( (b-a), (c-a) )
  return (b.x - a.x) * (c.y - a.y) -
         (b.y - a.y) * (c.x - a.x);
}

function isReflex(prev, curr, next) {
  // CCW polygon → reflex if cross < 0
  return cross(curr, next, prev) < 0;
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > p.y) !== (b.y > p.y)) &&
        (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  function orient(p, q, r) {
    return cross(p, q, r);
  }

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return false;
}

function isDiagonal(i, j, poly) {
  const a = poly[i], b = poly[j];

  for (let k = 0; k < poly.length; k++) {
    const k2 = (k + 1) % poly.length;

    if (k === i || k === j || k2 === i || k2 === j) continue;

    if (segmentsIntersect(a, b, poly[k], poly[k2])) {
      return false;
    }
  }

  const mid = {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5
  };

  return pointInPolygon(mid, poly);
}

function splitPolygon(poly, i, j) {
  const a = [];
  const b = [];

  let k = i;
  while (k !== j) {
    a.push(poly[k]);
    k = (k + 1) % poly.length;
  }
  a.push(poly[j]);

  k = j;
  while (k !== i) {
    b.push(poly[k]);
    k = (k + 1) % poly.length;
  }
  b.push(poly[i]);

  return [a, b];
}

function isConvex(poly) {
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    if (isReflex(prev, curr, next)) return false;
  }
  return true;
}

function bayazit(poly) {
  if (isConvex(poly)) {
    return [poly];
  }

  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];

    if (!isReflex(prev, curr, next)) continue;

    let bestJ = -1;
    let bestDist = Infinity;

    for (let j = 0; j < poly.length; j++) {
      if (j === i) continue;
      if ((j + 1) % poly.length === i) continue;
      if ((i + 1) % poly.length === j) continue;

      if (isDiagonal(i, j, poly)) {
        const dx = poly[i].x - poly[j].x;
        const dy = poly[i].y - poly[j].y;
        const d = dx * dx + dy * dy;

        if (d < bestDist) {
          bestDist = d;
          bestJ = j;
        }
      }
    }

    if (bestJ !== -1) {
      const [a, b] = splitPolygon(poly, i, bestJ);
      return [...bayazit(a), ...bayazit(b)];
    }
  }

  // fallback (non dovrebbe succedere)
  return [poly];
}

function rightmostVertex(poly) {
  let idx = 0;
  for (let i = 1; i < poly.length; i++) {
    if (poly[i].x > poly[idx].x) idx = i;
  }
  return idx;
}

function bridgeHole(outer, hole) {
  const hi = rightmostVertex(hole);
  const h = hole[hi];

  let bestX = Infinity;
  let bestEdge = null;
  let bestIdx = -1;

  for (let i = 0; i < outer.length; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];

    if ((a.y > h.y) !== (b.y > h.y)) {
      const x = a.x + (h.y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (x > h.x && x < bestX) {
        bestX = x;
        bestEdge = [a, b];
        bestIdx = i;
      }
    }
  }

  const o = outer[bestIdx];

  const newPoly = [];
  newPoly.push(...outer.slice(0, bestIdx + 1));
  newPoly.push(...hole.slice(hi), ...hole.slice(0, hi + 1));
  newPoly.push(o);
  newPoly.push(...outer.slice(bestIdx + 1));

  return newPoly;
}

function mergeHoles(outer, holes) {
  let poly = outer;
  for (const hole of holes) {
    poly = bridgeHole(poly, hole);
  }
  return poly;
}

