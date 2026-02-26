import { useCallback, useState } from "react";

export function useUndoRedo<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const push = useCallback((next: T) => {
    setPast((current) => [...current, present]);
    setPresent(next);
    setFuture([]);
  }, [present]);

  const replace = useCallback((next: T) => {
    setPresent(next);
  }, []);

  const undo = useCallback(() => {
    setPast((currentPast) => {
      if (currentPast.length === 0) {
        return currentPast;
      }

      const previous = currentPast[currentPast.length - 1];
      setFuture((currentFuture) => [present, ...currentFuture]);
      setPresent(previous);
      return currentPast.slice(0, -1);
    });
  }, [present]);

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      if (currentFuture.length === 0) {
        return currentFuture;
      }

      const next = currentFuture[0];
      setPast((currentPast) => [...currentPast, present]);
      setPresent(next);
      return currentFuture.slice(1);
    });
  }, [present]);

  return {
    present,
    push,
    replace,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
