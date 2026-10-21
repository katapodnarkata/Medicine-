import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Label, ListItem, Muted, Screen, Segmented } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { confirmAction } from '../lib/confirm';
import { useAuth } from '../lib/auth';
import { usePolling } from '../lib/hooks';
import type { Role } from '../lib/types';

/** Просмотр и изменение собственных данных (п.3). Изменяется существующий пользователь. */
export default function Profile() {
  const { user, setUser, signOut, deleteAccount } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'participant');
  const [teamId, setTeamId] = useState<number | null>(user?.team?.id ?? null);
  const { data: teams } = usePolling(api.teams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateMe({ name: name.trim(), phone: phone.trim(), role, teamId });
      setUser(updated);
      setPhone(updated.phone);
      setSaved(true);
      if (updated.role !== user.role) router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const logout = () =>
    confirmAction('להתנתק?', 'קריאות יפסיקו להגיע למכשיר הזה.', 'התנתקות', () => void signOut());

  const confirmDelete = () =>
    confirmAction(
      'למחוק את החשבון?',
      'הנתונים שלך יימחקו מהשרת וקריאות יפסיקו להגיע. אי אפשר לבטל את הפעולה.',
      'מחיקה',
      () => void deleteAccount().catch((err) => setError(errorMessage(err))),
    );

  return (
    <Screen>
      <Field label="שם" value={name} onChangeText={setName} />
      <Field label="מספר טלפון" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Label>תפקיד</Label>
      <Segmented
        value={role}
        onChange={setRole}
        options={[
          { value: 'participant', label: 'חבר צוות' },
          { value: 'dispatcher', label: 'מוקדן' },
        ]}
      />
      <Label>{role === 'dispatcher' ? 'הצוות הנבחר' : 'הצוות הנוכחי'}</Label>
      <ListItem title="ללא צוות" selected={teamId === null} onPress={() => setTeamId(null)} />
      {teams?.map((t) => (
        <ListItem key={t.id} title={t.name} selected={teamId === t.id} onPress={() => setTeamId(t.id)} />
      ))}
      <ErrorText>{error}</ErrorText>
      {saved ? <Muted>✓ השינויים נשמרו</Muted> : null}
      <Button title="שמירה" onPress={save} busy={busy} />
      <Button title="התנתקות" variant="secondary" onPress={logout} />
      <Button title="מחיקת החשבון" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}
