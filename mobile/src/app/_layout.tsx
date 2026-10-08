import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { callIdFromNotification, registerForPush } from '../lib/notifications';
import { PushStatusContext } from '../lib/pushStatus';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { loading, user } = useAuth();
  const pushProblem = usePushSetup(user?.id ?? null);
  useOpenCallFromNotifications(!!user);

  if (loading) return <Loading />;
  const isDispatcher = user?.role === 'dispatcher';
  const isParticipant = user?.role === 'participant';

  return (
    <PushStatusContext.Provider value={pushProblem}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { fontWeight: '700' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="register" options={{ title: 'Регистрация' }} />
        </Stack.Protected>
        <Stack.Protected guard={isDispatcher}>
          <Stack.Screen name="dispatcher" options={{ title: 'Диспетчер' }} />
          <Stack.Screen name="place" options={{ title: 'Указать место' }} />
          <Stack.Screen name="teams" options={{ title: 'Выбор команды' }} />
          <Stack.Screen name="team" options={{ title: 'Управление командой' }} />
          <Stack.Screen name="add-member" options={{ title: 'Добавить участника' }} />
          <Stack.Screen name="move/[userId]" options={{ title: 'Перевод в команду' }} />
        </Stack.Protected>
        <Stack.Protected guard={isParticipant}>
          <Stack.Screen name="participant" options={{ title: 'Участник' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="call/[id]" options={{ title: 'Вызов' }} />
          <Stack.Screen name="profile" options={{ title: 'Профиль' }} />
          <Stack.Screen name="history" options={{ title: 'История вызовов' }} />
        </Stack.Protected>
      </Stack>
    </PushStatusContext.Provider>
  );
}

/** После входа регистрирует устройство для push-уведомлений. */
function usePushSetup(userId: number | null): string | null {
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
  return problem;
}

/**
 * Открывает экран вызова: при нажатии на уведомление (в том числе когда
 * приложение было закрыто) и сразу при получении вызова в открытом приложении.
 */
function useOpenCallFromNotifications(signedIn: boolean) {
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
