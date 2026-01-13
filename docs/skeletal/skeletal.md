# Modulo: skeletal

## Descrizione
Sottosistema completo per l'animazione scheletrica e rendering di mesh skinnate.
Supporta:
- Caricamento formati binari custom `.skel` (Skeleton + Animations) e `.smsh` (Skinned Mesh).
- Blending tra animazioni (es. Walk -> Run).
- Skinning GPU tramite shader.
- Inverse Kinematics (Foot IK) a due ossa per adattamento al terreno.

## Strutture

### `Skeleton`
Struttura dati gerarchica delle ossa.
- `bones`: Array di ossa (nome, parent, bind pose inversa).
- `animations`: Lista di animazioni caricate.
- `finalMatrices`: Matrici trasformazione finale (per GPU).

### `Animator`
Gestore dello stato dell'animazione.
- `currentAnim`: Animazione attiva.
- `blendAnim`: Animazione precedente (durante transizione).
- `blendTime`: Fattore di mix corrente.

### `SkinnedMesh`
Mesh con pesi per skinning.
- `vertexCount`, `indexCount`.
- `vao`, `shader`, `texture`.

### `FootIKConfig` & `TwoBoneIK`
Configurazione e stato per l'IK delle gambe. Risolve la posizione del ginocchio geometricamente per raggiungere un target del piede.

## Funzioni
### Loading
- `skeleton_load`: Carica file `.skel`.
- `skinned_mesh_load`: Carica file `.smsh` e texture.

### Animator
- `animator_init`: Collega l'animator a uno skeleton.
- `animator_play` / `animator_play_name`: Avvia un'animazione con fading opzionale.
- `animator_update`: Avanza il tempo, interpola i keyframe, calcola le matrici delle ossa.

### Rendering
- `skinned_mesh_render`: Disegna la mesh inviando le matrici delle ossa allo shader.

### IK
- `foot_ik_config_setup`: Trova gli indici delle ossa per le gambe.
- `animator_apply_foot_ik`: Applica logicamente l'IK (ruota coscia e tibia) dopo l'update dell'animazione standard.
- `two_bone_ik_solve`: Solver geometrico low-level.

## Utilizzo
- **asset_manager.c**: Carica le risorse (Skeleton e Mesh).
- **player.c**: Utilizza `Animator` e `FootIK` per controllare il personaggio.
