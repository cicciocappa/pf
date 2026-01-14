// ============================================
// TORRI DIFENSIVE
// ============================================

class Tower {
    constructor(x, y, type) {
        const stats = TowerTypes[type];
        
        this.id = Utils.generateId();
        this.type = type;
        this.name = stats.name;
        this.x = x;
        this.y = y;
        
        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.damage = stats.damage;
        this.attackSpeed = stats.attackSpeed;
        this.range = stats.range;  // In celle
        this.targetingLogic = stats.targetingLogic;
        this.projectileSpeed = stats.projectileSpeed;
        this.color = stats.color;
        this.attackColor = stats.attackColor;
        
        this.radius = 18;
        this.attackCooldown = 0;
        this.currentTarget = null;
        this.projectiles = [];
    }
    
    getCell() {
        return Utils.pixelToGrid(this.x, this.y);
    }
    
    getRangeInPixels() {
        return this.range * CONFIG.TILE_SIZE;
    }
    
    isAlive() {
        return this.hp > 0;
    }
    
    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            GameLog.death(`${this.name} è stata distrutta!`);
        }
        return amount;
    }
    
    update(dt, enemies) {
        // Aggiorna cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }
        
        // Aggiorna proiettili
        this.updateProjectiles(dt, enemies);
        
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
                // Più vicino
                return inRange.sort((a, b) => 
                    Utils.entityDistance(this, a) - Utils.entityDistance(this, b)
                )[0];
                
            case TargetingLogic.HIGH_VALUE:
                // Più costoso in mana (priorità al mago)
                return inRange.sort((a, b) => {
                    // Mago ha priorità massima (costo infinito virtualmente)
                    const costA = a instanceof Mage ? 1000 : (a.manaCost || 1);
                    const costB = b instanceof Mage ? 1000 : (b.manaCost || 1);
                    return costB - costA;
                })[0];
                
            case TargetingLogic.LOW_HP:
                // Meno HP
                return inRange.sort((a, b) => a.hp - b.hp)[0];
                
            case TargetingLogic.RANDOM:
                // Casuale
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
            damage: this.damage,
            speed: this.projectileSpeed,
            color: this.attackColor
        };
        this.projectiles.push(projectile);
    }
    
    updateProjectiles(dt, enemies) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            
            // Trova il target
            const target = enemies.find(e => e.id === proj.targetId);
            
            if (!target || !target.isAlive()) {
                // Target perso, rimuovi proiettile
                this.projectiles.splice(i, 1);
                continue;
            }
            
            // Muovi verso il target
            const dx = target.x - proj.x;
            const dy = target.y - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 10) {
                // Colpito!
                let actualDamage = proj.damage;
                
                // Applica riduzione armatura del gigante
                if (target.armorReduction && !this.armorPiercing) {
                    actualDamage *= (1 - target.armorReduction);
                }
                
                target.takeDamage(actualDamage);
                
                // ========================================
                // REGISTRA QUESTA TORRE COME ATTACCANTE
                // La creatura saprà chi la sta attaccando
                // per poter contrattaccare
                // ========================================
                if (target.registerAttacker && !(target instanceof Mage)) {
                    target.registerAttacker(this);
                }
                
                // Log
                const damageText = Math.round(actualDamage);
                if (target instanceof Mage) {
                    GameLog.damage(`${this.name} colpisce il Mago per ${damageText} danni!`);
                }
                
                this.projectiles.splice(i, 1);
            } else {
                // Avanza
                proj.x += (dx / dist) * proj.speed * dt;
                proj.y += (dy / dist) * proj.speed * dt;
            }
        }
    }
    
    render(ctx, showRange = false) {
        // Range (se abilitato)
        if (showRange) {
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
        ctx.font = '8px Arial';
        ctx.fillStyle = '#aaa';
        const logicSymbol = {
            'PROXIMITY': 'P',
            'HIGH_VALUE': 'H',
            'LOW_HP': 'L',
            'RANDOM': 'R'
        };
        ctx.fillText(logicSymbol[this.targetingLogic] || '?', this.x + this.radius - 5, this.y - this.radius + 5);
        
        // Barra HP
        this.renderHpBar(ctx);
        
        // Proiettili
        this.renderProjectiles(ctx);
    }
    
    renderHpBar(ctx) {
        const barWidth = this.radius * 2;
        const barHeight = 4;
        const x = this.x - barWidth / 2;
        const y = this.y + this.radius + 5;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = hpPercent > 0.5 ? '#27ae60' : hpPercent > 0.25 ? '#f39c12' : '#c0392b';
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
}

// ============================================
// FACTORY per creare torri
// ============================================

function createTower(type, col, row) {
    const pos = Utils.gridToPixel(col, row);
    return new Tower(pos.x, pos.y, type);
}
