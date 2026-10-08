import type { Service } from './service.js';

/**
 * Фоновые задачи. Состояние хранится в базе, поэтому после перезапуска
 * сервера просроченные SMS и очистка выполняются при первом же тике.
 */
export function startScheduler(service: Service): () => void {
  let smsBusy = false;
  const smsTimer = setInterval(() => {
    if (smsBusy) return;
    smsBusy = true;
    service
      .processSms()
      .catch((err) => console.error('[sms]', err))
      .finally(() => {
        smsBusy = false;
      });
  }, 1000);

  const runCleanup = () => {
    try {
      service.cleanup();
    } catch (err) {
      console.error('[cleanup]', err);
    }
  };
  runCleanup();
  const cleanupTimer = setInterval(runCleanup, 60 * 1000);

  return () => {
    clearInterval(smsTimer);
    clearInterval(cleanupTimer);
  };
}
