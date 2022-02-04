class Resource<T> {
  private error: Error = null;
  private promise: Promise<T> = null;
  private result: T = null;

  constructor(private readonly loader: () => Promise<T>) {}

  load() {
    let promise = this.promise;
    if (promise == null) {
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

  get() {
    if (this.result != null) {
      return this.result;
    }
  }

  read() {
    if (this.result != null) {
      return this.result;
    } else if (this.error != null) {
      throw this.error;
    } else {
      throw this.promise;
    }
  }
}

export const createResourceGroup = <T extends unknown>() => {
  const resources = new Map<string, Resource<T>>();

  return (id: string, loader: () => Promise<T>): Resource<T> => {
    let resource = resources.get(id);
    if (resource == null) {
      resource = new Resource(loader);
      resources.set(id, resource);
    }
    return resource;
  };
};

export default Resource;
