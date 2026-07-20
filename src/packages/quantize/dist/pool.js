export class Ref {
    value;
    constructor(value) {
        this.value = value;
    }
}
export class Pool {
    items = [];
    draw() {
        return this.items.pop() ?? {};
    }
    drop(item) {
        this.items.push(item);
    }
}
//# sourceMappingURL=pool.js.map