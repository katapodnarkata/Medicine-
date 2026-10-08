import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

/**
 * Загружает данные при показе экрана и, если задан intervalMs,
 * периодически обновляет их, пока экран открыт.
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      if (!intervalMs) return;
      const timer = setInterval(() => void reload(), intervalMs);
      return () => clearInterval(timer);
    }, [reload, intervalMs]),
  );

  return { data, error, loading, reload, setData };
}

/** Текущее время, обновляемое раз в секунду (для обратного отсчёта). */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
