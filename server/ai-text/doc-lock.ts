const docLocks = new Map<string, Promise<void>>();

/**
 * Serializes mutations for one document folder. Metadata is read, updated, and
 * written as a unit, so two concurrent parses or a parse + delete would
 * otherwise drop a version.
 */
export async function withDocLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = docLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  docLocks.set(key, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (docLocks.get(key) === tail) {
      docLocks.delete(key);
    }
  }
}
