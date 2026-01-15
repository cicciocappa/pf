# Finite State Machine delle Creature

Questo documento descrive nel dettaglio la macchina a stati finiti (FSM) che governa il comportamento delle creature evocate dal mago.

## Panoramica degli Stati

| Stato | Descrizione |
|-------|-------------|
| `IDLE` | Creatura ferma, in attesa |
| `MOVING` | Creatura in movimento verso una destinazione |
| `ATTACKING` | Creatura che attacca un bersaglio |
| `LOOKING_FOR_TARGET` | Creatura in movimento direzionale cercando bersagli |
| `CLEAR_LINE_PATH` | Creatura che abbatte un ostacolo per raggiungere il target originale |

---

## Diagramma degli Stati

```
                                    ┌─────────────────────────────────────┐
                                    │                                     │
                                    ▼                                     │
┌──────────┐    ordine movimento   ┌──────────┐    arrivato/in range    ┌───────────┐
│          │ ───────────────────▶  │          │ ─────────────────────▶  │           │
│   IDLE   │                       │  MOVING  │                         │ ATTACKING │
│          │ ◀───────────────────  │          │ ◀─────────────────────  │           │
└──────────┘    nessun bersaglio   └──────────┘    fuori range (intel.) └───────────┘
      │                                  │                                    │
      │ attaccato                        │ attaccato                          │ bloccato
      │ (senza target)                   │ (senza target)                     │ (poco intel.)
      │                                  │                                    │
      ▼                                  ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐  ┌─────────────────┐
│                         reactToAttack()                          │  │ CLEAR_LINE_PATH │
│  - Creature poco intelligenti: useDirectMovement = true          │  │                 │
│  - Creature intelligenti: usa pathfinding                        │  │ Abbatte ostacolo│
└──────────────────────────────────────────────────────────────────┘  └─────────────────┘
                                                                              │
                                                                              │ ostacolo
                                                                              │ distrutto
                                                                              ▼
                                                                      Torna ad ATTACKING
                                                                      (originalTarget)
```

---

## Dettaglio degli Stati

### 1. IDLE

**Descrizione**: La creatura è ferma e non ha ordini.

**Comportamento**:
- Non si muove
- Ascolta gli attacchi in arrivo

**Transizioni in uscita**:

| Condizione | Nuovo Stato | Note |
|------------|-------------|------|
| Riceve ordine `setDirectTarget()` | MOVING | Path trovato verso il bersaglio |
| Riceve ordine `setDirectTarget()` | ATTACKING | Path non trovato, prova avvicinamento diretto |
| Riceve ordine `setMoveTarget()` | MOVING | Movimento verso punto specifico |
| Riceve ordine `setDirectionTarget()` | LOOKING_FOR_TARGET | Movimento direzionale |
| Viene attaccata (`attackedBy.length > 0`) | ATTACKING | Tramite `reactToAttack()` |

---

### 2. MOVING

**Descrizione**: La creatura si muove seguendo un percorso calcolato dal pathfinding.

**Comportamento**:
- Esegue `followPath()` per seguire il percorso
- Se ha un target valido, verifica se è arrivata in range
- Se non ha un target, verifica se è arrivata a destinazione

**Sotto-casi**:

#### 2a. MOVING con Target
- Segue il path verso il target
- NON cerca nuovi bersagli (rispetta l'ordine del giocatore)
- NON reagisce agli attacchi (continua verso il target)

#### 2b. MOVING senza Target
- Segue il path verso il punto di destinazione
- NON cerca bersagli autonomamente
- Reagisce agli attacchi tramite `reactToAttack()`

**Transizioni in uscita**:

| Condizione | Nuovo Stato | Note |
|------------|-------------|------|
| In range del target | ATTACKING | `checkTargetReached()` |
| Path finito ma non in range | ATTACKING | Continua avvicinamento |
| Arrivato a destinazione (senza target) | IDLE | `checkMoveTargetReached()` |
| Attaccata (senza target) | ATTACKING | `reactToAttack()` |
| Target distrutto | IDLE | Target non più valido |

---

### 3. ATTACKING

**Descrizione**: La creatura attacca un bersaglio (torre o muro).

**Comportamento**:
- Se in range: infligge danni al target
- Se fuori range: si avvicina al target

**Movimento basato su `useDirectMovement`**:

#### useDirectMovement = true (creature poco intelligenti)
- Movimento in linea retta verso il target
- Se bloccata da un muro distruttibile → CLEAR_LINE_PATH
- Se bloccata da altro → prova a scivolare lungo l'ostacolo

#### useDirectMovement = false (creature intelligenti)
- Movimento diretto verso il target
- Se bloccata → resta ferma (non abbatte muri)

**Transizioni in uscita**:

| Condizione | Nuovo Stato | Note |
|------------|-------------|------|
| Target distrutto | ATTACKING/IDLE | `findNextTarget()` cerca nuovo bersaglio |
| Bloccata da muro (poco intel.) | CLEAR_LINE_PATH | Abbatte l'ostacolo |
| Fuori range (intelligente) | Resta ATTACKING | Continua avvicinamento |

---

### 4. LOOKING_FOR_TARGET

**Descrizione**: La creatura si muove in una direzione cercando bersagli.

**Comportamento**:
- Segue il path verso il bordo della mappa nella direzione indicata
- Cerca bersagli (torri/mura) nel raggio di vista

**Transizioni in uscita**:

| Condizione | Nuovo Stato | Note |
|------------|-------------|------|
| Trova bersaglio in vista | ATTACKING | `findTargetInSight()` |
| Arriva al bordo senza trovare nulla | IDLE | - |

---

### 5. CLEAR_LINE_PATH

**Descrizione**: La creatura sta abbattendo un ostacolo per raggiungere il target originale.

**Comportamento**:
- Salva il target originale in `originalTarget`
- Attacca l'ostacolo (muro) che la blocca
- Una volta distrutto l'ostacolo, torna al target originale

**Transizioni in uscita**:

| Condizione | Nuovo Stato | Note |
|------------|-------------|------|
| Ostacolo distrutto, originalTarget vivo | ATTACKING | Torna ad attaccare originalTarget |
| Ostacolo distrutto, originalTarget morto | ATTACKING/IDLE | `findNextTarget()` |

---

## Proprietà Chiave delle Creature

### Intelligenza (`intelligence`)

| Valore | Comportamento |
|--------|---------------|
| < 0.5 | **Poco intelligente**: movimento diretto, può bloccarsi, usa CLEAR_LINE_PATH |
| >= 0.5 | **Intelligente**: usa pathfinding, evita ostacoli, non abbatte muri |

### Flag `useDirectMovement`

Impostato da:
- `reactToAttack()`: `true` se `intelligence < 0.5`
- `findNextTarget()` (attaccanti): `true` se `intelligence < 0.5`
- `findNextTarget()` (altri): `false`
- `setDirectTarget()`: non modificato (usa pathfinding)

### Proprietà Target

| Proprietà | Uso |
|-----------|-----|
| `target` | Bersaglio corrente (torre o muro) |
| `originalTarget` | Bersaglio originale salvato durante CLEAR_LINE_PATH |
| `attackedBy` | Lista delle torri che stanno attaccando la creatura |

---

## Logica di Selezione Bersaglio (`findNextTarget`)

### Priorità

1. **Torri che stanno attaccando** (contrattacco)
   - Score: `HP * DAMAGE` (più basso = priorità)
   - A parità: più vicina

2. **Torri nel raggio di vista**
   - Score: `HP * DAMAGE` (più basso = priorità)
   - A parità: più vicina

3. **Mura nel raggio di vista**
   - Score: `HP` (più basso = priorità)
   - A parità: più vicina

4. **Nessun bersaglio** → IDLE

---

## Ricerca Punto Adiacente (`findAdjacentWalkablePoint`)

Usato quando il target è su una cella non camminabile (es. muro).

**Ordine di preferenza**:
1. **Celle ortogonali** (sinistra, destra, sopra, sotto) - più vicine al target
2. **Celle diagonali** - più lontane, usate solo se le ortogonali non sono disponibili

---

## Flusso Tipico di Attacco a un Muro

```
1. Giocatore clicca destro su muro
2. setDirectTarget(muro)
   └─▶ moveTo(muro) fallisce (cella non camminabile)
   └─▶ findAdjacentWalkablePoint() trova cella ortogonale
   └─▶ moveTo(cella adiacente) successo
   └─▶ Stato: MOVING

3. Creatura segue il path
   └─▶ followPath()
   └─▶ checkTargetReached() verifica distanza

4. Arriva in range del muro
   └─▶ Stato: ATTACKING

5. Attacca il muro
   └─▶ performAttack() infligge danni
   └─▶ Muro distrutto

6. Cerca nuovo bersaglio
   └─▶ findNextTarget()
   └─▶ Se trova bersaglio: ATTACKING
   └─▶ Altrimenti: IDLE
```

---

## Flusso CLEAR_LINE_PATH (Creature Poco Intelligenti)

```
1. Creatura poco intelligente in MOVING senza target
2. Viene attaccata da una torre
3. reactToAttack()
   └─▶ useDirectMovement = true
   └─▶ Stato: ATTACKING

4. performAttack() - movimento diretto verso torre
   └─▶ Bloccata da muro
   └─▶ findBlockingWall() trova il muro

5. Entra in CLEAR_LINE_PATH
   └─▶ originalTarget = torre
   └─▶ target = muro

6. performClearLinePath()
   └─▶ Attacca il muro
   └─▶ Muro distrutto

7. Torna ad attaccare la torre
   └─▶ target = originalTarget (torre)
   └─▶ Stato: ATTACKING
```

---

## Note Implementative

### File Coinvolti
- `entities.js`: Classe `Creature` e logica FSM
- `config.js`: Definizione `EntityState`

### Metodi Principali
- `update()`: Loop principale della FSM
- `setDirectTarget()`: Assegna bersaglio con pathfinding
- `performAttack()`: Logica stato ATTACKING
- `performClearLinePath()`: Logica stato CLEAR_LINE_PATH
- `findNextTarget()`: Cerca prossimo bersaglio
- `reactToAttack()`: Reagisce a un attacco
- `checkTargetReached()`: Verifica arrivo al target
- `findAdjacentWalkablePoint()`: Trova punto adiacente camminabile
- `findBlockingWall()`: Trova muro bloccante
