// ============================================
// STRUTTURE DIFENSIVE
// Classe unificata per torri e mura
// ============================================

class DefensiveStructure {
    constructor(x, y, type) {
        const stats = StructureTypes[type];

        this.id = Utils.generateId();
        this.type = type;
        this.name = stats.name;
        this.x = x;
        this.y = y;

        // Posizione griglia (calcolata da pixel)
        const cell = Utils.pixelToGrid(x, y);
        this.col = cell.col;
        this.row = cell.row;

        // HP
        this.hp = stats.hp;
        this.maxHp = stats.hp;

        // Attacco ranged (proiettili)
        this.rangedDamage = stats.rangedDamage || 0;
        this.attackSpeed = stats.attackSpeed || 0;
        this.range = stats.range || 0;
        this.targetingLogic = stats.targetingLogic;
        this.projectileSpeed = stats.projectileSpeed || 0;

        // Attacco melee (olio bollente, spuntoni, ecc.)
        this.meleeDamage = stats.meleeDamage || 0;
        this.meleeAttackSpeed = stats.meleeAttackSpeed || 0;
        this.meleeRange = stats.meleeRange || 1;  // Default: 1 cella
        this.meleeColor = stats.meleeColor || '#ff8c00';

        // Visuali
        this.color = stats.color;
        this.attackColor = stats.attackColor;

        // Flag per distinguere mura da torri (per priorità targeting creature)
        this.isWall = stats.isWall || false;

        // Dimensioni
        this.radius = this.isWall ? CONFIG.TILE_SIZE / 2 - 2 : 18;

        // Cooldown e targeting
        this.attackCooldown = 0;
        this.meleeAttackCooldown = 0;
        this.currentTarget = null;
        this.projectiles = [];

        // Lista creature che stanno attaccando questa struttura (per attacco melee)
        this.attackers = [];

        // Effetti visivi melee
        this.meleeEffects = [];
    }

    getCell() {
        return Utils.pixelToGrid(this.x, this.y);
    }

    getRangeInPixels() {
        return this.range * CONFIG.TILE_SIZE;
    }

    getMeleeRangeInPixels() {
        return this.meleeRange * CONFIG.TILE_SIZE;
    }

    isAlive() {
        return this.hp > 0;
    }

    // Verifica se questa struttura può attaccare (ranged o melee)
    canAttack() {
        return this.rangedDamage > 0 || this.meleeDamage > 0;
    }

    // Verifica se ha capacità ranged
    hasRangedAttack() {
        return this.rangedDamage > 0 && this.attackSpeed > 0;
    }

    // Verifica se ha capacità melee
    hasMeleeAttack() {
        return this.meleeDamage > 0 && this.meleeAttackSpeed > 0;
    }

    // Getter per retrocompatibilità - restituisce il danno ranged
    // Usato dalle creature per calcolare priorità target (hp * damage)
    get damage() {
        return this.rangedDamage;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            const suffix = this.isWall ? 'stato distrutto!' : 'stata distrutta!';
            GameLog.death(`${this.name} è ${suffix}`);
        }
        return amount;
    }

    // Registra una creatura che sta attaccando questa struttura
    registerAttacker(creature) {
        if (!this.attackers.includes(creature)) {
            this.attackers.push(creature);
        }
    }

    // Rimuovi creature morte o che non attaccano più dalla lista
    cleanupAttackers() {
        this.attackers = this.attackers.filter(c => {
            if (!c.isAlive()) return false;
            // Verifica se la creatura sta ancora attaccando questa struttura
            if (c.target !== this) return false;
            // Verifica se è ancora in range melee
            const dist = Utils.entityDistance(this, c);
            return dist <= this.getMeleeRangeInPixels() + c.radius + 20;
        });
    }

    update(dt, enemies) {
        // Aggiorna cooldown ranged
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }

        // Aggiorna cooldown melee
        if (this.meleeAttackCooldown > 0) {
            this.meleeAttackCooldown -= dt;
        }

        // Aggiorna proiettili
        this.updateProjectiles(dt, enemies);

        // Aggiorna effetti melee
        this.updateMeleeEffects(dt);

        // Pulisci lista attackers
        this.cleanupAttackers();

        // ========================================
        // ATTACCO RANGED
        // ========================================
        if (this.hasRangedAttack()) {
            // Se non ho un target valido, cercane uno nuovo
            if (!this.hasValidTarget(enemies)) {
                this.currentTarget = this.selectTarget(enemies);
            }

            // Attacca se possibile
            if (this.currentTarget && this.attackCooldown <= 0) {
                this.fireAt(this.currentTarget);
                this.attackCooldown = 1 / this.attackSpeed;
            }
        }

        // ========================================
        // ATTACCO MELEE (olio bollente, ecc.)
        // Danneggia tutte le creature che stanno attaccando
        // ========================================
        if (this.hasMeleeAttack() && this.meleeAttackCooldown <= 0) {
            this.performMeleeAttack(enemies);
        }
    }

    // ========================================
    // ATTACCO MELEE
    // Colpisce tutte le creature in range melee che stanno attaccando
    // ========================================
    performMeleeAttack(enemies) {
        // Trova creature in range melee
        const meleeTargets = enemies.filter(e => {
            if (!e.isAlive()) return false;
            const dist = Utils.entityDistance(this, e);
            return dist <= this.getMeleeRangeInPixels() + e.radius + 10;
        });

        if (meleeTargets.length === 0) return;

        // Infliggi danno a tutte le creature in range
        for (const target of meleeTargets) {
            let actualDamage = this.meleeDamage;

            // Armatura non riduce il danno da olio bollente (danno termico)
            target.takeDamage(actualDamage);

            // Aggiungi effetto visivo
            this.meleeEffects.push({
                x: target.x,
                y: target.y,
                radius: 15,
                alpha: 1.0,
                color: this.meleeColor
            });

            // Log solo per creature significative (non larve)
            if (target.manaCost > 3) {
                GameLog.damage(`${this.name} versa olio bollente su ${target.name} (${Math.round(actualDamage)} danni)`);
            }
        }

        // Reset cooldown
        this.meleeAttackCooldown = 1 / this.meleeAttackSpeed;
    }

    updateMeleeEffects(dt) {
        for (let i = this.meleeEffects.length - 1; i >= 0; i--) {
            const effect = this.meleeEffects[i];
            effect.alpha -= dt * 2;  // Svanisce in 0.5 secondi
            effect.radius += dt * 20;  // Si espande

            if (effect.alpha <= 0) {
                this.meleeEffects.splice(i, 1);
            }
        }
    }

    hasValidTarget(enemies) {
        if (!this.currentTarget) return false;
        if (!this.currentTarget.isAlive()) return false;

        const dist = Utils.entityDistance(this, this.currentTarget);
        return dist <= this.getRangeInPixels();
    }

    // Seleziona bersaglio basato sulla logica
    selectTarget(enemies) {
        const inRange = enemies.filter(e => {
            if (!e.isAlive()) return false;
            const dist = Utils.entityDistance(this, e);
            return dist <= this.getRangeInPixels();
        });

        if (inRange.length === 0) return null;

        switch (this.targetingLogic) {
            case TargetingLogic.PROXIMITY:
                return inRange.sort((a, b) =>
                    Utils.entityDistance(this, a) - Utils.entityDistance(this, b)
                )[0];

            case TargetingLogic.HIGH_VALUE:
                return inRange.sort((a, b) => {
                    const costA = a instanceof Mage ? 1000 : (a.manaCost || 1);
                    const costB = b instanceof Mage ? 1000 : (b.manaCost || 1);
                    return costB - costA;
                })[0];

            case TargetingLogic.LOW_HP:
                return inRange.sort((a, b) => a.hp - b.hp)[0];

            case TargetingLogic.RANDOM:
                return inRange[Utils.randomInt(0, inRange.length - 1)];

            default:
                return inRange[0];
        }
    }

    fireAt(target) {
        const projectile = {
            x: this.x,
            y: this.y,
            targetId: target.id,
            damage: this.rangedDamage,
            speed: this.projectileSpeed,
            color: this.attackColor
        };
        this.projectiles.push(projectile);
    }

    updateProjectiles(dt, enemies) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];

            const target = enemies.find(e => e.id === proj.targetId);

            if (!target || !target.isAlive()) {
                this.projectiles.splice(i, 1);
                continue;
            }

            const dx = target.x - proj.x;
            const dy = target.y - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 10) {
                let actualDamage = proj.damage;

                // Applica riduzione armatura del gigante
                if (target.armorReduction && !this.armorPiercing) {
                    actualDamage *= (1 - target.armorReduction);
                }

                target.takeDamage(actualDamage);

                // Registra questa struttura come attaccante
                if (target.registerAttacker && !(target instanceof Mage)) {
                    target.registerAttacker(this);
                }

                const damageText = Math.round(actualDamage);
                if (target instanceof Mage) {
                    GameLog.damage(`${this.name} colpisce il Mago per ${damageText} danni!`);
                }

                this.projectiles.splice(i, 1);
            } else {
                proj.x += (dx / dist) * proj.speed * dt;
                proj.y += (dy / dist) * proj.speed * dt;
            }
        }
    }

    render(ctx, showRange = false) {
        if (!this.isAlive()) return;

        // Delega al metodo di rendering appropriato
        if (this.isWall) {
            this.renderWall(ctx, showRange);
        } else {
            this.renderTower(ctx, showRange);
        }
    }

    // ========================================
    // RENDERING TORRE
    // ========================================
    renderTower(ctx, showRange) {
        // Range (se abilitato)
        if (showRange && this.hasRangedAttack()) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.getRangeInPixels(), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Base della torre
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(
            this.x - this.radius - 2,
            this.y - this.radius - 2,
            (this.radius + 2) * 2,
            (this.radius + 2) * 2
        );

        // Corpo della torre
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - this.radius,
            this.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );

        // Simbolo tipo torre
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this.type === 'GUARD_TOWER') {
            ctx.fillText('⚔', this.x, this.y);
        } else if (this.type === 'BALLISTA') {
            ctx.fillText('↟', this.x, this.y);
        }

        // Indicatore logica targeting
        if (this.targetingLogic) {
            ctx.font = '8px Arial';
            ctx.fillStyle = '#aaa';
            const logicSymbol = {
                'PROXIMITY': 'P',
                'HIGH_VALUE': 'H',
                'LOW_HP': 'L',
                'RANDOM': 'R'
            };
            ctx.fillText(logicSymbol[this.targetingLogic] || '?', this.x + this.radius - 5, this.y - this.radius + 5);
        }

        // Barra HP
        this.renderHpBar(ctx);

        // Proiettili
        this.renderProjectiles(ctx);

        // Effetti melee
        this.renderMeleeEffects(ctx);
    }

    // ========================================
    // RENDERING MURO
    // ========================================
    renderWall(ctx, showRange) {
        const size = CONFIG.TILE_SIZE - 4;
        const x = this.x - size / 2;
        const y = this.y - size / 2;

        // Range ranged (se presidiato e abilitato)
        if (showRange && this.hasRangedAttack()) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.getRangeInPixels(), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 200, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Colore basato sugli HP
        const hpPercent = this.hp / this.maxHp;
        let color;
        if (this.canAttack()) {
            // Muro presidiato - colore più chiaro
            if (hpPercent > 0.6) {
                color = '#777777';
            } else if (hpPercent > 0.3) {
                color = '#887766';
            } else {
                color = '#996655';
            }
        } else {
            // Muro normale
            if (hpPercent > 0.6) {
                color = '#555555';
            } else if (hpPercent > 0.3) {
                color = '#666655';
            } else {
                color = '#776655';
            }
        }

        // Corpo del muro
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);

        // Bordo
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, size, size);

        // Simbolo se presidiato
        if (this.canAttack()) {
            ctx.fillStyle = '#ddd';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⛨', this.x, this.y);  // Simbolo presidio
        }

        // Crepe se danneggiato
        if (hpPercent < 0.7) {
            ctx.strokeStyle = '#222222';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + size * 0.3, y);
            ctx.lineTo(x + size * 0.5, y + size * 0.4);
            ctx.lineTo(x + size * 0.4, y + size);
            ctx.stroke();
        }
        if (hpPercent < 0.4) {
            ctx.beginPath();
            ctx.moveTo(x + size, y + size * 0.2);
            ctx.lineTo(x + size * 0.6, y + size * 0.5);
            ctx.lineTo(x + size * 0.8, y + size);
            ctx.stroke();
        }

        // Barra HP (solo se danneggiato)
        if (this.hp < this.maxHp) {
            this.renderHpBar(ctx);
        }

        // Proiettili (se presidiato)
        if (this.hasRangedAttack()) {
            this.renderProjectiles(ctx);
        }

        // Effetti melee
        this.renderMeleeEffects(ctx);
    }

    renderHpBar(ctx) {
        const barWidth = this.isWall ? CONFIG.TILE_SIZE - 8 : this.radius * 2;
        const barHeight = this.isWall ? 3 : 4;
        const x = this.x - barWidth / 2;
        const y = this.isWall
            ? this.y + CONFIG.TILE_SIZE / 2 - 6
            : this.y + this.radius + 5;

        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, barWidth, barHeight);

        const hpPercent = this.hp / this.maxHp;
        if (this.isWall) {
            ctx.fillStyle = hpPercent > 0.5 ? '#888888' : hpPercent > 0.25 ? '#aa8855' : '#aa5555';
        } else {
            ctx.fillStyle = hpPercent > 0.5 ? '#27ae60' : hpPercent > 0.25 ? '#f39c12' : '#c0392b';
        }
        ctx.fillRect(x, y, barWidth * hpPercent, barHeight);
    }

    renderProjectiles(ctx) {
        for (const proj of this.projectiles) {
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = proj.color;
            ctx.fill();
        }
    }

    renderMeleeEffects(ctx) {
        for (const effect of this.meleeEffects) {
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.fillStyle = effect.color.replace(')', `, ${effect.alpha})`).replace('rgb', 'rgba');
            // Fallback per colori hex
            if (effect.color.startsWith('#')) {
                const r = parseInt(effect.color.slice(1, 3), 16);
                const g = parseInt(effect.color.slice(3, 5), 16);
                const b = parseInt(effect.color.slice(5, 7), 16);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${effect.alpha})`;
            }
            ctx.fill();
        }
    }
}

// ============================================
// ALIAS per retrocompatibilità
// ============================================
const Tower = DefensiveStructure;
const Wall = DefensiveStructure;

// ============================================
// FACTORY per creare strutture
// ============================================

function createStructure(type, col, row) {
    const pos = Utils.gridToPixel(col, row);
    return new DefensiveStructure(pos.x, pos.y, type);
}

// Factory con retrocompatibilità
function createTower(type, col, row) {
    return createStructure(type, col, row);
}

function createWall(col, row) {
    return createStructure('WALL', col, row);
}

function createGarrisonedWall(col, row) {
    return createStructure('GARRISONED_WALL', col, row);
}
