import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Local edit state that mirrors `value` until the owner edits it, then resyncs whenever the
 * effective value actually changes from outside — this section's own save/clear, or another admin
 * session. `syncKey` is a separate, comparable key (the value itself for a primitive; a
 * `JSON.stringify` for an object) since a freshly re-fetched object has a new reference even when
 * its content is unchanged, which would otherwise resync — and clobber an in-progress edit — every
 * time any *other* setting saved.
 *
 * Uses React's documented "adjusting state during render" pattern instead of a resync Effect: a
 * conditional setState call while rendering, not inside `useEffect`, so this never round-trips
 * through an extra render and never reads as a synchronous setState-in-effect.
 */
export function useSyncedState<T>(syncKey: unknown, value: T): [T, Dispatch<SetStateAction<T>>] {
  const [prevKey, setPrevKey] = useState(syncKey);
  const [state, setState] = useState(value);
  if (prevKey !== syncKey) {
    setPrevKey(syncKey);
    setState(value);
  }
  return [state, setState];
}
