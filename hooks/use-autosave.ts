import { useState, useEffect, useRef } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutosaveProps<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  interval?: number;
  enabled?: boolean;
}

export function useAutosave<T>({
  data,
  onSave,
  interval = 2000,
  enabled = true,
}: UseAutosaveProps<T>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Ref to hold the latest data to avoid closure staleness in timeout
  const dataRef = useRef(data);
  // Ref to track if it's the initial mount to avoid saving on load
  const isFirstMount = useRef(true);
  // Ref for the debouncing timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Track previous data to compare and avoid saving unchanged data
  const prevDataRef = useRef<string>(JSON.stringify(data));

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!enabled) return;

    // Skip first mount
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const currentDataString = JSON.stringify(data);

    // If data hasn't changed, don't schedule a save
    if (currentDataString === prevDataRef.current) {
      return;
    }

    // Data changed, set status to saving (pending)
    setStatus("saving");

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(async () => {
      try {
        await onSave(dataRef.current);
        setStatus("saved");
        setLastSaved(new Date());
        setError(null);
        // Update prevDataRef only after successful save
        prevDataRef.current = JSON.stringify(dataRef.current);
      } catch (err) {
        console.error("Autosave error:", err);
        setStatus("error");
        setError(err instanceof Error ? err : new Error("Unknown error"));
      }
    }, interval);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, interval, onSave, enabled]);

  return { status, lastSaved, error };
}
