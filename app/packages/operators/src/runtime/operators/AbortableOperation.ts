export default class AbortableOperation {
  constructor(public id: string, public params: any, public parser: any) {}
  abort() {
    return this.parser.abort();
  }
}

class AbortableOperationQueue {
  private items: AbortableOperation[] = [];

  add(uri: string, params: any, parser: any) {
    this.items.push(new AbortableOperation(uri, params, parser));
  }

  remove(uri: string) {
    this.items = this.items.filter((d) => d.id !== uri);
  }

  findByURI(uri: string) {
    return this.items.filter((d) => d.id === uri);
  }

  abortByURI(uri: string) {
    const items = this.findByURI(uri);
    for (const item of items) {
      item.abort();
    }
  }
}

let abortableOperationQueue: AbortableOperationQueue;
export function getAbortableOperationQueue() {
  if (!abortableOperationQueue) {
    abortableOperationQueue = new AbortableOperationQueue();
  }
  return abortableOperationQueue;
}
