/** Insertion-ordered storage for recently fetched navigation data. */
export default class BoundedMap<K, V> extends Map<K, V> {
  constructor(readonly limit: number) {
    super();
  }

  override set(key: K, value: V): this {
    this.delete(key);
    super.set(key, value);
    while (this.size > this.limit) this.delete(this.keys().next().value!);
    return this;
  }
}
