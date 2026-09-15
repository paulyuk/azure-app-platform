export function createDiscoveryTracker() {
  let generation = 0;
  const pending = new Map();
  return {
    invalidate() { generation += 1; },
    begin(key, load, refresh = false) {
      const current = ++generation;
      let promise = !refresh && pending.get(key);
      if (!promise) {
        promise = Promise.resolve().then(load).finally(() => {
          if (pending.get(key) === promise) pending.delete(key);
        });
        pending.set(key, promise);
      }
      return { promise, isCurrent: () => current === generation };
    },
  };
}
