import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { api } from './api';
import type { PushStatus } from './pushStatus';

/** Должен совпадать с ANDROID_CHANNEL_ID на сервере. */
export const CALL_CHANNEL_ID = 'calls';

// Уведомления показываются и при открытом приложении: баннер, звук, вибрация.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
    name: 'קריאות',
    description: 'קריאות דחופות לצוות',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // Режим «Не беспокоить» не обходится (п.8 ТЗ).
    bypassDnd: false,
  });
}

function projectId(): string | undefined {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return id || undefined;
}

/**
 * Запрашивает разрешение на уведомления и отправляет push-токен устройства
 * на сервер. Возвращает текст проблемы или null, если всё в порядке.
 */
async function registerForPush(): Promise<string | null> {
  await ensureAndroidChannel();
  if (!Device.isDevice) return 'התראות פועלות רק במכשיר אמיתי';

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return 'יש לאפשר התראות בהגדרות הטלפון, אחרת קריאות לא יגיעו';

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await api.setPushToken(data);
    return null;
  } catch (err) {
    return `רישום המכשיר להתראות נכשל: ${err instanceof Error ? err.message : err}`;
  }
}

function callIdFromNotification(notification: Notifications.Notification): number | null {
  const data = notification.request.content.data as { type?: string; callId?: unknown } | undefined;
  if (data?.type !== 'call') return null;
  const id = Number(data.callId);
  return Number.isInteger(id) ? id : null;
}

/** После входа регистрирует устройство для push-уведомлений. */
export function usePushSetup(userId: number | null): PushStatus {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    const run = () =>
      registerForPush().then((p) => {
        if (!cancelled) setProblem(p);
      });
    void run();
    // Токен устройства может смениться — отправляем новый на сервер.
    const sub = Notifications.addPushTokenListener(() => void run());
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);
  return { problem: userId == null ? null : problem };
}

/**
 * Открывает экран вызова: при нажатии на уведомление (в том числе когда
 * приложение было закрыто) и сразу при получении вызова в открытом приложении.
 */
export function useOpenCallFromNotifications(signedIn: boolean) {
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!signedIn) return;
    const open = (notification: Notifications.Notification) => {
      const id = callIdFromNotification(notification);
      const key = notification.request.identifier;
      if (id == null || handled.current.has(key)) return;
      handled.current.add(key);
      router.navigate({ pathname: '/call/[id]', params: { id: String(id) } });
    };

    const last = Notifications.getLastNotificationResponse();
    if (last) {
      open(last.notification);
      Notifications.clearLastNotificationResponse();
    }
    const received = Notifications.addNotificationReceivedListener(open);
    const response = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => {
      received.remove();
      response.remove();
    };
  }, [signedIn]);
}
