export declare class Ref<T> {
    value: T;
    constructor(value: T);
}
export declare class Pool<T> {
    private items;
    draw(): T;
    drop(item: T): void;
}
//# sourceMappingURL=pool.d.ts.map