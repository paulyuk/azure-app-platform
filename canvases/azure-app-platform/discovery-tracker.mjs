export function createDiscoveryTracker() {
  let generation = 0;
  let activeKey = null;
  let activeController = null;
  const pending = new Map();
  return {
    invalidate() {
      generation += 1;
      if (activeController) {
        activeController.abort();
        activeController = null;
        activeKey = null;
      }
    },
    begin(key, load, refresh = false) {
      const current = ++generation;
      if (refresh && activeController) {
        activeController.abort();
        activeController = null;
        activeKey = null;
      } else if (activeController && activeKey && activeKey !== key) {
        activeController.abort();
        activeController = null;
        activeKey = null;
      }
      let entry = !refresh && pending.get(key);
      if (!entry || entry.controller.signal.aborted) {
        const controller = new AbortController();
        activeController = controller;
        activeKey = key;
        let promise;
        try {
          promise = Promise.resolve(load({ signal: controller.signal }));
        } catch (err) {
          promise = Promise.reject(err);
        }
        promise = promise.finally(() => {
          if (pending.get(key)?.promise === promise) pending.delete(key);
          if (activeController === controller) {
            activeController = null;
            activeKey = null;
          }
        });
        entry = { promise, controller };
        pending.set(key, entry);
      } else {
        activeController = entry.controller;
        activeKey = key;
      }
      return {
        promise: entry.promise,
        signal: entry.controller.signal,
        abort: () => {
          entry.controller.abort();
          if (pending.get(key)?.promise === entry.promise) pending.delete(key);
          if (activeController === entry.controller) {
            activeController = null;
            activeKey = null;
          }
          if (current === generation) generation += 1;
        },
        isCurrent: () => current === generation && !entry.controller.signal.aborted,
      };
    },
  };
}
