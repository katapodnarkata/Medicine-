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
      'להוציא מהצוות?',
      `${m.name} לא יקבל/תקבל יותר קריאות של הצוות "${team?.name}".`,
      'הוצאה',
      () => void run(() => api.setUserTeam(m.id, null)),
    );

  const confirmDelete = (m: User) =>
    confirmAction(
      'למחוק את חבר הצוות?',
      `המשתמש ${m.name} יימחק לגמרי ולא יקבל יותר קריאות. קריאות שכבר נשלחו לא ישתנו.`,
      'מחיקה',
      () => void run(() => api.deleteUser(m.id)),
    );

  if (!team) {
    return (
      <Screen>
        <Muted>קודם יש לבחור צוות.</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{team.name}</Title>
      <Button title="+ הוספת חבר צוות" onPress={() => router.push('/add-member')} />
      <ErrorText>{actionError ?? error}</ErrorText>
      {!members ? <Loading /> : null}
      {members?.length === 0 ? <Muted>אין עדיין חברים בצוות.</Muted> : null}
      {members?.map((m) => (
        <Card key={m.id}>
          <Label>{m.phone}</Label>
          <Title>{m.name}</Title>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              title="העברה"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/move/[userId]', params: { userId: String(m.id), name: m.name } })
              }
            />
            <Button title="הוצאה" variant="secondary" onPress={() => confirmRemove(m)} />
            <Button title="מחיקה" variant="danger" onPress={() => confirmDelete(m)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
