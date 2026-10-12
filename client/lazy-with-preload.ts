import * as React from "react";

export interface PreloadableLazyComponent<T extends React.ComponentType<any>>
  extends React.LazyExoticComponent<T> {
  preload: () => Promise<void>;
}

/**
 * Wraps `React.lazy` with an explicit `.preload()` method and synchronous
 * resolution once loaded.
 *
 * In React 19, `lazyInitializer` invokes `ctor().then(onFulfilled)` and checks
 * whether `payload._status` transitioned to `1` (`Resolved`) synchronously
 * before throwing to `<Suspense>`. Native `Promise.prototype.then` always
 * defers to a microtask, which forces `<Suspense>` to show its fallback and
 * triggers React 19's 300ms fallback commit throttle even when the module is
 * already in memory.
 *
 * By invoking `onFulfilled(resolved)` synchronously once `factory()` has
 * settled, preloaded components mount on the very first render pass in 0ms.
 */
export function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): PreloadableLazyComponent<T> {
  let resolved: { default: T } | null = null;
  let inFlight: Promise<{ default: T }> | null = null;

  const ensureLoaded = (): Promise<{ default: T }> => {
    if (!inFlight) {
      inFlight = factory()
        .then((mod) => {
          resolved = mod;
          return mod;
        })
        .catch((err) => {
          inFlight = null;
          throw err;
        });
    }
    return inFlight;
  };

  const loadForReactLazy = (): Promise<{ default: T }> => {
    if (resolved) {
      const current = resolved;
      return {
        then<TResult1 = { default: T }, TResult2 = never>(
          onFulfilled?:
            | ((
                value: { default: T },
              ) => TResult1 | PromiseLike<TResult1>)
            | null,
        ): Promise<TResult1 | TResult2> {
          if (onFulfilled) {
            try {
              return Promise.resolve(onFulfilled(current));
            } catch (err) {
              return Promise.reject(err);
            }
          }
          return Promise.resolve(current as unknown as TResult1);
        },
      } as Promise<{ default: T }>;
    }
    return ensureLoaded();
  };

  const LazyComponent = React.lazy(
    loadForReactLazy,
  ) as PreloadableLazyComponent<T>;
  LazyComponent.preload = async () => {
    await ensureLoaded();
  };
  return LazyComponent;
}
