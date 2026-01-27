// formation.js - Formazioni e assegnazione target

export function getFormationPositions(center, count, spacing, type, obstacleRadius = 0) {
    const positions = [];

    if (type === 'move') {
        positions.push({ x: center.x, y: center.y });

        let ring = 1;
        let countInRing = 6;
        let created = 1;

        while (created < count) {
            const radius = ring * spacing;
            const angleStep = (Math.PI * 2) / countInRing;

            for (let i = 0; i < countInRing && created < count; i++) {
                const angle = i * angleStep;
                positions.push({
                    x: center.x + Math.cos(angle) * radius,
                    y: center.y + Math.sin(angle) * radius
                });
                created++;
            }
            ring++;
            countInRing += 6;
        }

    } else if (type === 'attack') {
        const attackDistance = obstacleRadius + 80;
        const angleStep = (Math.PI * 2) / count;

        for (let i = 0; i < count; i++) {
            const angle = i * angleStep;
            positions.push({
                x: center.x + Math.cos(angle) * attackDistance,
                y: center.y + Math.sin(angle) * attackDistance
            });
        }
    }

    return positions;
}

export function assignTargetsIdeally(agents, targets) {
    let availableAgents = [...agents];
    let availableTargets = [...targets];
    let assignments = [];

    while (availableTargets.length > 0 && availableAgents.length > 0) {
        let bestDist = Infinity;
        let bestAgentIdx = -1;

        const target = availableTargets[0];

        for (let i = 0; i < availableAgents.length; i++) {
            const a = availableAgents[i];
            const d = (a.pos.x - target.x) ** 2 + (a.pos.y - target.y) ** 2;
            if (d < bestDist) {
                bestDist = d;
                bestAgentIdx = i;
            }
        }

        assignments.push({
            agent: availableAgents[bestAgentIdx],
            target: target
        });

        availableAgents.splice(bestAgentIdx, 1);
        availableTargets.splice(0, 1);
    }

    return assignments;
}
