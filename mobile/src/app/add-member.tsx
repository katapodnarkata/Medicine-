import { router } from 'expo-router';
import { useState } from 'react';
import { ErrorText, Field, ListItem, Loading, Muted, Screen } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePolling } from '../lib/hooks';
import type { User } from '../lib/types';

/**
 * Добавление участника в выбранную команду. Если участник состоит в другой
 * команде, он автоматически из неё удаляется (п.4).
 */
export default function AddMember() {
  const { user } = useAuth();
  const team = user?.team ?? null;
  const { data: participants, error } = usePolling(api.participants);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const candidates = (participants ?? []).filter(
    (p) => p.team?.id !== team?.id && (!q || p.name.toLowerCase().includes(q) || p.phone.includes(q)),
  );

  const add = async (p: User) => {
    if (!team) return;
    setActionError(null);
    try {
      await api.setUserTeam(p.id, team.id);
      router.back();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <Screen>
      <Field label="חיפוש" value={query} onChangeText={setQuery} placeholder="שם או טלפון" />
      <ErrorText>{actionError ?? error}</ErrorText>
      {!participants && !error ? <Loading /> : null}
      {participants && candidates.length === 0 ? <Muted>אין חברי צוות להוספה.</Muted> : null}
      {candidates.map((p) => (
        <ListItem
          key={p.id}
          title={p.name}
          subtitle={p.team ? `${p.phone} · כרגע ב"${p.team.name}", יועבר/תועבר` : `${p.phone} · ללא צוות`}
          onPress={() => add(p)}
        />
      ))}
    </Screen>
  );
}
