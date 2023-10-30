class Resource<T = unknown> {
  private error: Error | null = null;
  private promise: Promise<T> | null = null;
  private result: T | null = null;

  constructor(private readonly loader: () => Promise<T>) {}

  load() {
    let promise = this.promise;
    if (promise === null) {
      promise = this.loader()
        .then((result) => {
          this.result = result;
          return result;
        })
        .catch((error) => {
          this.error = error;
          throw error;
        });
      this.promise = promise;
    }
    return promise;
  }

  get(): T | null {
    if (this.result !== null) {
      return this.result;
    }

    return null;
  }

  read(): T {
    if (this.result !== null) {
      return this.result;
    }

    if (this.error !== null) {
      throw this.error;
    }

    throw this.promise;
  }
}

export const createResourceGroup = <T>() => {
  const resources = new Map<string, Resource>();

  return (key: string, loader: () => Promise<T>): Resource<T> => {
    let resource = resources.get(key);
    if (resource === undefined) {
      resource = new Resource<T>(() => loader());
      resources.set(key, resource);
    }

    return resource as Resource<T>;
  };
};

export default Resource;
