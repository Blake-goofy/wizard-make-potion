export function createRoutePreloader<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;

  return () => {
    pending ??= load().catch((error) => {
      pending = undefined;
      throw error;
    });

    return pending;
  };
}
