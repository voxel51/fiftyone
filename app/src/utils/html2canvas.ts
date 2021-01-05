export class Cache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _cache: { [key: string]: Promise<any> };
  private readonly _options: any;
  private readonly id: string;

  constructor(id: string, options: any) {
    this.id = id;
    this._options = options;
    this._cache = {};
  }

  addImage(src: string): Promise<void> {
    const result = Promise.resolve();
    if (this.has(src)) {
      return result;
    }
    this._cache[src] = this.loadImage(src);
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  match(src: string): Promise<any> {
    return this._cache[src];
  }

  private async loadImage(key: string) {
    const response = await fetch(key);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    return await new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;

      img.src = url;
    });
  }

  private has(key: string): boolean {
    return typeof this._cache[key] !== "undefined";
  }

  keys(): Promise<string[]> {
    return Promise.resolve(Object.keys(this._cache));
  }
}
