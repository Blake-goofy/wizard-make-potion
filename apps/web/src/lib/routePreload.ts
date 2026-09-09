export type RoutePreloader<T> = (() => Promise<T>) & { read: () => T };

export function createRoutePreloader<T>(load: () => Promise<T>): RoutePreloader<T> {
  let pending: Promise<T> | undefined;
  let loaded: T | undefined;
  let hasLoaded = false;
  let failed: unknown;
  let hasFailed = false;

  const preload = (() => {
    if (!pending) {
      hasFailed = false;
      failed = undefined;
      pending = load()
        .then((value) => {
          loaded = value;
          hasLoaded = true;
          return value;
        })
        .catch((error) => {
          failed = error;
          hasFailed = true;
          pending = undefined;
          throw error;
        });
    }

    return pending;
  }) as RoutePreloader<T>;

  preload.read = () => {
    if (hasLoaded) return loaded as T;
    if (hasFailed) throw failed;
    throw preload();
  };

  return preload;
}
