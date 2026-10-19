import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import type { PushStatus } from './pushStatus';

/**
 * Веб-уведомления (Web Push) для веб-приложения, установленного на экран телефона.
 * Уведомления показывает service worker (public/sw.js) — даже когда приложение закрыто.
 */

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const INSTALL_IOS =
  'Чтобы получать вызовы на iPhone, добавьте приложение на экран «Домой»: в Safari нажмите «Поделиться» → «На экран „Домой“», затем откройте приложение со значка.';
const UNSUPPORTED =
  'Этот браузер не умеет получать уведомления. Откройте приложение в Chrome (Android) или Safari (iPhone).';
const DENIED =
  'Уведомления запрещены. Разрешите их в настройках телефона для этого приложения, иначе вызовы не будут приходить.';
const ASK = 'Уведомления не включены — без них вызовы не придут.';

function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

/** Подписывает браузер на уведомления и отправляет подписку на сервер. */
async function subscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await api.pushPublicKey();
    subscription = await withTimeout(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }),
      20000,
      'служба уведомлений не отвечает, проверьте интернет',
    );
  }
  await api.setPushToken(JSON.stringify(subscription));
}

/** Проверяет, можно ли получать уведомления, и что нужно сделать человеку. */
export function usePushSetup(userId: number | null): PushStatus {
  const [status, setStatus] = useState<PushStatus>({ problem: null });

  const check = useCallback(async () => {
    const registration = registerServiceWorker();
    if (userId == null) return setStatus({ problem: null });
    if (isIos() && !isStandalone()) return setStatus({ problem: INSTALL_IOS });
    if (!registration || !('PushManager' in window) || !('Notification' in window)) {
      return setStatus({ problem: UNSUPPORTED });
    }
    await registration;
    if (Notification.permission === 'denied') return setStatus({ problem: DENIED });
    if (Notification.permission === 'default') {
      // Разрешение можно спросить только по нажатию кнопки (требование iPhone).
      const enable = () => {
        Notification.requestPermission().then(
          (permission) => {
            if (permission === 'granted') void check();
            else setStatus({ problem: DENIED });
          },
          (err) => setStatus({ problem: errorMessage(err) }),
        );
      };
      return setStatus({ problem: ASK, enable });
    }
    try {
      await subscribe();
      setStatus({ problem: null });
    } catch (err) {
      setStatus({
        problem: `Не удалось включить уведомления: ${errorMessage(err)}. Нажмите кнопку, чтобы попробовать снова.`,
        enable: () => void check(),
      });
    }
  }, [userId]);

  useEffect(() => {
    void check();
  }, [check]);

  return status;
}

/** Открывает экран вызова, когда service worker сообщает о вызове или нажатии на уведомление. */
export function useOpenCallFromNotifications(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; callId?: unknown } | null;
      const id = Number(data?.callId);
      if (data?.type !== 'open-call' || !Number.isInteger(id)) return;
      router.navigate({ pathname: '/call/[id]', params: { id: String(id) } });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [signedIn]);
}
