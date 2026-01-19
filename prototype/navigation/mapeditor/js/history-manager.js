/**
 * Gestisce la cronologia degli stati per Undo/Redo
 */
export class HistoryManager {
    constructor(editor, maxSteps = 50) {
        this.editor = editor;
        this.maxSteps = maxSteps;
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Salva lo stato attuale prima di una modifica
     */
    save() {
      
        const snapshot = JSON.stringify(this.editor.mapData.toJSON());
        
        // Evitiamo di salvare due stati identici consecutivi
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) {
            return;
        }

        this.undoStack.push(snapshot);
        this.redoStack = []; // Ogni nuova azione cancella la cronologia redo

        if (this.undoStack.length > this.maxSteps) {
            this.undoStack.shift(); // Rimuove lo stato più vecchio
        }
    }

    undo() {
        console.log("chiamata undo con stack", this.undoStack);
        if (this.undoStack.length <= 1) return; // Serve almeno uno stato precedente + quello attuale
        
        // Salva lo stato attuale nel redo prima di tornare indietro
        const currentState = JSON.stringify(this.editor.mapData.toJSON());
        this.redoStack.push(currentState);

        // Estrai l'ultimo stato e caricalo
        const previousState = JSON.parse(this.undoStack.pop());
        this.editor.mapData.fromJSON(previousState);
        
        this.editor.render();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const currentState = JSON.stringify(this.editor.mapData.toJSON());
        this.undoStack.push(currentState);

        const nextState = JSON.parse(this.redoStack.pop());
        this.editor.mapData.fromJSON(nextState);
        
        this.editor.render();
    }
}