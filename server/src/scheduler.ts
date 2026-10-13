import type { Service } from './service.js';

/**
 * Фоновая очистка истории. Состояние хранится в базе, поэтому после
 * перезапуска сервера очистка выполняется сразу.
 */
export function startScheduler(service: Service): () => void {
  const runCleanup = () => {
    try {
      service.cleanup();
    } catch (err) {
      console.error('[cleanup]', err);
    }
  };
  runCleanup();
  const cleanupTimer = setInterval(runCleanup, 60 * 1000);

  return () => clearInterval(cleanupTimer);
}
