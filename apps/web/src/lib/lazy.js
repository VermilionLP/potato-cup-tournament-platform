// Loads a module part on first use and keeps it: lazy(() => import("…"))
// returns a function giving the same promise on every call (a failed load
// is retried on the next call). Used to keep admin-only and on-demand parts
// of a page out of the code every visitor downloads.

export function lazy(load) {
  let pending = null;
  return () => {
    pending ??= Promise.resolve()
      .then(load)
      .catch((e) => {
        pending = null;
        throw e;
      });
    return pending;
  };
}
