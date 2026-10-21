import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorText, Label, ListItem, Muted, Screen, Title } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatRemaining } from '../lib/format';
import { useNow, usePolling } from '../lib/hooks';

export default function DispatcherHome() {
  const { user } = useAuth();
  const team = user?.team ?? null;
  const now = useNow();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [members, active] = await Promise.all([
      team ? api.teamMembers(team.id) : Promise.resolve([]),
      api.activeCalls(),
    ]);
    return { members, active };
  }, [team]);
  const { data, error, loading, reload } = usePolling(load, 5000);

  const activeCall = data?.active.find((c) => c.teamId === team?.id && c.expiresAt > now) ?? null;
  const members = data?.members ?? [];
  const canSend = !!team && members.length > 0 && !activeCall;

  // Быстрый вызов отправляется сразу, без подтверждения (п.6.1).
  const sendQuick = async () => {
    setSending(true);
    setSendError(null);
    try {
      const call = await api.sendCall({ kind: 'car' });
      router.push({ pathname: '/call/[id]', params: { id: String(call.id) } });
    } catch (err) {
      setSendError(errorMessage(err));
      void reload();
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen refreshing={loading && !!data} onRefresh={reload}>
      <Card>
        <Label>הצוות הנבחר</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Title>{team?.name ?? 'לא נבחר צוות'}</Title>
          </View>
          <Button title={team ? 'שינוי' : 'בחירה'} variant="secondary" onPress={() => router.push('/teams')} />
        </View>
      </Card>

      {activeCall ? (
        <Card style={{ borderWidth: 2, borderColor: '#C62828' }}>
          <Label>קריאה פעילה · נותרו {formatRemaining(activeCall.expiresAt - now)}</Label>
          <Title>{activeCall.text}</Title>
          <Button
            title="סטטוס הנמענים"
            onPress={() => router.push({ pathname: '/call/[id]', params: { id: String(activeCall.id) } })}
          />
        </Card>
      ) : null}

      <Button title="שליחת קריאה" variant="danger" big onPress={sendQuick} disabled={!canSend} busy={sending} />
      <Button title="ציון מקום" big onPress={() => router.push('/place')} disabled={!canSend} />
      {activeCall ? <Muted>אפשר לשלוח קריאה חדשה אחרי שהנוכחית תסתיים.</Muted> : null}
      {team && data && members.length === 0 ? <Muted>אין חברים בצוות — יש להוסיף אותם.</Muted> : null}
      <ErrorText>{sendError ?? error}</ErrorText>

      {team ? (
        <>
          <Label>חברי הצוות ({members.length})</Label>
          {members.map((m) => (
            <ListItem key={m.id} title={m.name} subtitle={m.phone} />
          ))}
        </>
      ) : null}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title="ניהול צוות" variant="secondary" onPress={() => router.push('/team')} disabled={!team} />
        <Button title="היסטוריית קריאות" variant="secondary" onPress={() => router.push('/history')} />
        <Button title="פרופיל" variant="secondary" onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}
