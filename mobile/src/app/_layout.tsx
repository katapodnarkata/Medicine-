import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { useOpenCallFromNotifications, usePushSetup } from '../lib/notifications';
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
  // Уведомления о вызовах нужны только участникам.
  const pushStatus = usePushSetup(user?.role === 'participant' ? user.id : null);
  useOpenCallFromNotifications(!!user);

  if (loading) return <Loading />;
  const isDispatcher = user?.role === 'dispatcher';
  const isParticipant = user?.role === 'participant';

  return (
    <PushStatusContext.Provider value={pushStatus}>
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
