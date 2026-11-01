import { blockOwnText } from "./blockText.ts";

interface Entry { text: string; lower: string; count: number; level?: number; }
export class DocumentIndex {
  private entries = new Map<string, Entry>();
  private order: string[] = [];
  characters = 0;
  textRecomputations = 0;

  private put(block: any) {
    const old = this.entries.get(block.id);
    const text = blockOwnText(block);
    const count = text.replace(/\s/g, "").length;
    this.characters += count - (old?.count || 0);
    this.textRecomputations++;
    this.entries.set(block.id, { text, lower: text.toLowerCase(), count, level: block.type === "heading" ? block.props.level : undefined });
  }
  private visit(blocks: any[], callback: (block: any) => void) {
    for (const block of blocks) { callback(block); if (block.children?.length) this.visit(block.children, callback); }
  }
  reset(blocks: any[]) {
    this.entries.clear(); this.characters = 0; this.order = [];
    this.visit(blocks, block => { this.put(block); this.order.push(block.id); });
  }
  apply(changes: any[], getDocument: () => any[]) {
    const structural = changes.some(change => change.type !== "update");
    for (const change of changes) if (change.type === "delete") this.visit([change.block], block => {
      this.characters -= this.entries.get(block.id)?.count || 0;
      this.entries.delete(block.id);
    });
    for (const change of changes) if (change.type !== "delete") {
      if (change.type === "insert") this.visit([change.block], block => this.put(block));
      else this.put(change.block);
    }
    if (structural) {
      this.order = [];
      const present = new Set<string>();
      this.visit(getDocument(), block => {
        present.add(block.id); this.order.push(block.id);
        if (!this.entries.has(block.id)) this.put(block);
      });
      // A subtree may be moved out of a deleted parent in the same transaction.
      // Reconcile against the final tree, not intermediate delete/insert events.
      for (const [id, entry] of this.entries) if (!present.has(id)) {
        this.characters -= entry.count; this.entries.delete(id);
      }
    }
  }
  headings() {
    return this.order.flatMap(id => {
      const entry = this.entries.get(id);
      return entry?.level && entry.text ? [{ id, text: entry.text, level: entry.level }] : [];
    });
  }
  search(query: string, limit = 200) {
    if (!query) return [];
    const lower = query.toLowerCase();
    const results: { blockId: string; text: string }[] = [];
    for (const id of this.order) {
      const entry = this.entries.get(id);
      if (entry?.lower.includes(lower)) results.push({ blockId: id, text: entry.text });
      if (results.length === limit) break;
    }
    return results;
  }
}
