// ============================================
// SISTEMA INCANTESIMI
// ============================================

class SpellSystem {
    constructor() {
        this.activeEffects = [];  // Effetti visivi attivi
        this.activeBuffs = [];    // Buff/scudi attivi
    }
    
    // Lancia un incantesimo
    castSpell(spellType, caster, targetX, targetY, game) {
        const spell = SpellTypes[spellType];
        
        if (!caster.canCast(spell)) {
            GameLog.log('Mana insufficiente o in cooldown');
            return false;
        }
        
        // Verifica range
        const dist = Utils.distance(caster.x, caster.y, targetX, targetY);
        const rangeInPixels = spell.castRange * CONFIG.TILE_SIZE;
        
        if (spell.castRange > 0 && dist > rangeInPixels) {
            GameLog.log('Bersaglio fuori portata');
            return false;
        }
        
        // Consuma mana
        caster.spendMana(spell.manaCost);
        caster.castTimer = spell.castTime;
        
        // Esegui l'effetto
        switch (spellType) {
            case 'FIREBALL':
                this.castFireball(targetX, targetY, spell, game);
                break;
            case 'SHIELD':
                this.castShield(caster, spell);
                break;
        }
        
        GameLog.spell(`${spell.name} lanciato!`);
        return true;
    }
    
    // Palla di Fuoco - danno ad area
    castFireball(targetX, targetY, spell, game) {
        // Effetto visivo
        this.activeEffects.push({
            type: 'explosion',
            x: targetX,
            y: targetY,
            radius: 0,
            maxRadius: spell.radius * CONFIG.TILE_SIZE,
            color: spell.effectColor,
            duration: 0.5,
            elapsed: 0
        });
        
        // Danno alle torri nell'area
        const damageRadius = spell.radius * CONFIG.TILE_SIZE;
        
        for (const tower of game.towers) {
            const dist = Utils.distance(targetX, targetY, tower.x, tower.y);
            if (dist <= damageRadius) {
                // Danno diminuisce con la distanza
                const falloff = 1 - (dist / damageRadius) * 0.5;
                const damage = Math.round(spell.damage * falloff);
                tower.takeDamage(damage);
                GameLog.damage(`Palla di Fuoco infligge ${damage} danni a ${tower.name}`);
            }
        }
    }
    
    // Scudo - protezione temporanea
    castShield(caster, spell) {
        caster.addShield(spell.shieldAmount);
        
        // Effetto visivo
        this.activeEffects.push({
            type: 'shield_cast',
            x: caster.x,
            y: caster.y,
            radius: 30,
            color: spell.effectColor,
            duration: 0.3,
            elapsed: 0,
            follow: caster
        });
        
        GameLog.spell(`Scudo attivato: +${spell.shieldAmount} protezione`);
    }
    
    // Aggiorna effetti visivi
    update(dt) {
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const effect = this.activeEffects[i];
            effect.elapsed += dt;
            
            // Segui l'entità se necessario
            if (effect.follow) {
                effect.x = effect.follow.x;
                effect.y = effect.follow.y;
            }
            
            // Aggiorna in base al tipo
            if (effect.type === 'explosion') {
                effect.radius = (effect.elapsed / effect.duration) * effect.maxRadius;
            }
            
            // Rimuovi se completato
            if (effect.elapsed >= effect.duration) {
                this.activeEffects.splice(i, 1);
            }
        }
    }
    
    // Render effetti
    render(ctx) {
        for (const effect of this.activeEffects) {
            switch (effect.type) {
                case 'explosion':
                    this.renderExplosion(ctx, effect);
                    break;
                case 'shield_cast':
                    this.renderShieldCast(ctx, effect);
                    break;
            }
        }
    }
    
    renderExplosion(ctx, effect) {
        const alpha = 1 - (effect.elapsed / effect.duration);
        
        // Cerchio esterno
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = alpha;
        ctx.stroke();
        
        // Riempimento
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = alpha * 0.3;
        ctx.fill();
        
        ctx.globalAlpha = 1;
    }
    
    renderShieldCast(ctx, effect) {
        const alpha = 1 - (effect.elapsed / effect.duration);
        const scale = 1 + (effect.elapsed / effect.duration);
        
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * scale, 0, Math.PI * 2);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = alpha;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    
    // Verifica se un punto è nel range di cast
    isInCastRange(caster, targetX, targetY, spellType) {
        const spell = SpellTypes[spellType];
        if (spell.castRange === 0) return true; // Self-cast
        
        const dist = Utils.distance(caster.x, caster.y, targetX, targetY);
        return dist <= spell.castRange * CONFIG.TILE_SIZE;
    }
    
    // Render indicatore di range
    renderCastRange(ctx, caster, spellType) {
        const spell = SpellTypes[spellType];
        if (!spell || spell.castRange === 0) return;
        
        const rangePixels = spell.castRange * CONFIG.TILE_SIZE;
        
        ctx.beginPath();
        ctx.arc(caster.x, caster.y, rangePixels, 0, Math.PI * 2);
        ctx.strokeStyle = spell.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Area effetto al centro (se applicabile)
        if (spell.radius) {
            ctx.beginPath();
            ctx.arc(caster.x, caster.y, spell.radius * CONFIG.TILE_SIZE, 0, Math.PI * 2);
            ctx.fillStyle = `${spell.color}33`;
            ctx.fill();
        }
    }
}

// ============================================
// PREVIEW INCANTESIMO (per UI)
// ============================================

function renderSpellPreview(ctx, spellType, targetX, targetY, isValid) {
    const spell = SpellTypes[spellType];
    if (!spell) return;
    
    ctx.globalAlpha = 0.5;
    
    // Colore basato su validità
    const color = isValid ? spell.color : '#ff0000';
    
    if (spell.radius) {
        // Mostra area effetto
        const radiusPixels = spell.radius * CONFIG.TILE_SIZE;
        
        ctx.beginPath();
        ctx.arc(targetX, targetY, radiusPixels, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = `${color}44`;
        ctx.fill();
    } else {
        // Indicatore singolo
        ctx.beginPath();
        ctx.arc(targetX, targetY, 20, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
}
