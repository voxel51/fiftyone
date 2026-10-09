/**
 * A Map that holds at most `limit` entries, dropping the least recently set
 * one first.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(readonly limit: number) {
    super();
  }

  set(key: K, value: V) {
    super.delete(key);
    super.set(key, value);
    if (this.size > this.limit) super.delete(this.keys().next().value as K);
    return this;
  }
}
