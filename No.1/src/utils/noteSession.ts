// A failed operation must not poison the queue or let a later write overtake it.
export class NoteOperationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export class NoteSession {
  path: string | null = null;
  source = "";
  private savedSnapshot = "";
  private baseline = new Map<string, string>();
  private live = new Map<string, string>();
  private changed = new Set<string>();
  private savedOrder = "";
  private orderChanged = false;
  private tracking = false;
  textComparisons = 0;

  private signatures(document: any): Map<string, string> {
    const out = new Map<string, string>();
    const visit = (blocks: any[]) => { for (const block of blocks) {
      out.set(block.id, JSON.stringify({ ...block, children: undefined })); visit(block.children || []);
    } };
    if (Array.isArray(document)) visit(document);
    return out;
  }
  private compare(id: string) {
    this.textComparisons++;
    if (this.live.get(id) === this.baseline.get(id)) this.changed.delete(id); else this.changed.add(id);
  }
  trackChanges(changes: any[], getDocument: () => any[]) {
    this.tracking = true;
    const visit = (block: any, remove = false) => {
      if (remove) this.live.delete(block.id);
      else this.live.set(block.id, JSON.stringify({ ...block, children: undefined }));
      this.compare(block.id);
      for (const child of block.children || []) visit(child, remove);
    };
    for (const change of changes) visit(change.block, change.type === "delete");
    if (changes.some(change => change.type !== "update")) {
      // Structural changes can move children out of deleted parents. Reconcile once.
      const final = this.signatures(getDocument());
      const ids = new Set([...this.live.keys(), ...final.keys()]); this.live = final;
      for (const id of ids) this.compare(id);
      this.orderChanged = JSON.stringify([...final.keys()]) !== this.savedOrder;
    }
  }
  replaceDocument(document: unknown) {
    this.tracking = true; this.live = this.signatures(document); this.changed.clear();
    for (const id of new Set([...this.baseline.keys(), ...this.live.keys()])) this.compare(id);
    this.orderChanged = JSON.stringify([...this.live.keys()]) !== this.savedOrder;
  }

  open(path: string | null, source: string, document: unknown): void {
    this.path = path;
    this.source = source;
    this.savedSnapshot = JSON.stringify(document);
    this.baseline = this.signatures(document); this.live = new Map(this.baseline);
    this.savedOrder = JSON.stringify([...this.baseline.keys()]);
    this.changed.clear(); this.orderChanged = false; this.tracking = false;
  }

  isDirty(document: unknown): boolean {
    return this.path !== null && (this.tracking ? this.changed.size > 0 || this.orderChanged : JSON.stringify(document) !== this.savedSnapshot);
  }

  async save<T>(
    document: T,
    serialize: (document: T) => Promise<string>,
    write: (path: string, content: string, expectedContent: string) => Promise<unknown>,
  ): Promise<boolean> {
    if (!this.path || !this.isDirty(document)) return false;
    const path = this.path;
    const snapshot = JSON.stringify(document);
    const content = await serialize(JSON.parse(snapshot) as T);
    await write(path, content, this.source);
    // Only this snapshot was persisted. Later edits must remain dirty.
    this.source = content;
    this.savedSnapshot = snapshot;
    this.baseline = this.signatures(JSON.parse(snapshot));
    this.savedOrder = JSON.stringify([...this.baseline.keys()]);
    this.changed.clear();
    for (const id of new Set([...this.baseline.keys(), ...this.live.keys()])) this.compare(id);
    this.orderChanged = JSON.stringify([...this.live.keys()]) !== this.savedOrder;
    return true;
  }
}
