// ============================================
// ENTRY POINT
// ============================================

let game;
let inputHandler;

window.addEventListener('DOMContentLoaded', () => {
    console.log('Tower Attack Prototype - Inizializzazione...');
    
    // Ottieni canvas
    const canvas = document.getElementById('gameCanvas');
    
    if (!canvas) {
        console.error('Canvas non trovato!');
        return;
    }
    
    // Crea il gioco
    game = new Game(canvas);
    
    // Setup input
    inputHandler = new InputHandler(game);
    
    // Carica il primo livello
    game.loadLevel(Levels.tutorial);
    
    // Avvia game loop
    game.start();
    
    // Log istruzioni
    console.log('=== TOWER ATTACK PROTOTYPE ===');
    console.log('Controlli:');
    console.log('  Click sinistro: Muovi il mago / Seleziona creatura');
    console.log('  Click sinistro + drag su creatura: Ordine direzionale');
    console.log('  Click destro: Attacca / Lancia incantesimo');
    console.log('  1: Seleziona Palla di Fuoco');
    console.log('  2: Seleziona Scudo');
    console.log('  Q: Modalità evocazione Larve');
    console.log('  W: Modalità evocazione Gigante');
    console.log('  T: Mostra/Nascondi range torri');
    console.log('  D: Mostra/Nascondi mappa pericoli');
    console.log('  R: Ricomincia');
    console.log('  ESC: Annulla selezione');
    console.log('==============================');
    console.log('EVOCAZIONE:');
    console.log('  - Premi Q o W per attivare modalità evocazione');
    console.log('  - Click destro su torre: evoca e attacca quella torre');
    console.log('  - Click destro + drag: evoca in direzione');
    console.log('==============================');
    
    GameLog.log('Prototipo inizializzato');
    GameLog.log('Q/W per evocare, poi click destro');
});
