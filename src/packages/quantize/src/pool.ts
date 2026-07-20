export class Ref<T> {
  constructor(public value: T) {}
}

export class Pool<T> {
  private items: T[] = [];

  draw(): T {
    return this.items.pop() ?? ({} as T);
  }

  drop(item: T): void {
    this.items.push(item);
  }
}
