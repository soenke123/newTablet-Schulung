/** Small bounded undo/redo history for page-layout operations and filled-in form values. */
export function createSnapshot(state) {
  return {
    pages: state.pages.map(page => ({ ...page })),
    selected: [...state.selected],
    anchor: state.anchor,
    activePageId: state.activePageId,
    forms: new Map(state.forms || []),
  };
}

export class HistoryStack {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  push(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
  undo(currentSnapshot) {
    if (!this.canUndo) return null;
    this.redoStack.push(currentSnapshot);
    return this.undoStack.pop();
  }
  redo(currentSnapshot) {
    if (!this.canRedo) return null;
    this.undoStack.push(currentSnapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return this.redoStack.pop();
  }
}
