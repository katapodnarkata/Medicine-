import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorText, Label, Loading, Muted, Screen, Title } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { confirmAction } from '../lib/confirm';
import { useAuth } from '../lib/auth';
import { usePolling } from '../lib/hooks';
import type { User } from '../lib/types';

/** Управление составом выбранной команды (п.4, п.15, п.16). */
export default function TeamManage() {
  const { user } = useAuth();
  const team = user?.team ?? null;
  const load = useCallback(() => (team ? api.teamMembers(team.id) : Promise.resolve([])), [team]);
  const { data: members, error, reload } = usePolling(load);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const confirmRemove = (m: User) =>
    confirmAction(
      'Убрать из команды?',
      `${m.name} больше не будет получать вызовы команды «${team?.name}».`,
      'Убрать',
      () => void run(() => api.setUserTeam(m.id, null)),
    );

  const confirmDelete = (m: User) =>
    confirmAction(
      'Удалить участника?',
      `Пользователь ${m.name} будет полностью удалён и больше не будет получать вызовы. Уже отправленные вызовы не изменятся.`,
      'Удалить',
      () => void run(() => api.deleteUser(m.id)),
    );

  if (!team) {
    return (
      <Screen>
        <Muted>Сначала выберите команду.</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{team.name}</Title>
      <Button title="+ Добавить участника" onPress={() => router.push('/add-member')} />
      <ErrorText>{actionError ?? error}</ErrorText>
      {!members ? <Loading /> : null}
      {members?.length === 0 ? <Muted>В команде пока нет участников.</Muted> : null}
      {members?.map((m) => (
        <Card key={m.id}>
          <Label>{m.phone}</Label>
          <Title>{m.name}</Title>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              title="Перевести"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/move/[userId]', params: { userId: String(m.id), name: m.name } })
              }
            />
            <Button title="Убрать" variant="secondary" onPress={() => confirmRemove(m)} />
            <Button title="Удалить" variant="danger" onPress={() => confirmDelete(m)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
