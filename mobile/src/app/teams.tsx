import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Label, ListItem, Loading, Screen } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePolling } from '../lib/hooks';

/** Выбор команды диспетчером (п.4): можно выбрать любую существующую или создать новую. */
export default function Teams() {
  const { user, setUser } = useAuth();
  const { data: teams, error, reload } = usePolling(api.teams);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const select = async (teamId: number) => {
    setActionError(null);
    try {
      setUser(await api.updateMe({ teamId }));
      router.back();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const create = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api.createTeam(newName.trim());
      setNewName('');
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {!teams && !error ? <Loading /> : null}
      {teams?.map((t) => (
        <ListItem
          key={t.id}
          title={t.name}
          subtitle={`חברי צוות: ${t.memberCount}`}
          selected={t.id === user?.team?.id}
          onPress={() => select(t.id)}
        />
      ))}
      <ErrorText>{actionError ?? error}</ErrorText>
      <Label>צוות חדש</Label>
      <Field label="שם" value={newName} onChangeText={setNewName} placeholder="צוות 4" />
      <Button title="יצירת צוות" variant="secondary" onPress={create} busy={busy} disabled={!newName.trim()} />
    </Screen>
  );
}
