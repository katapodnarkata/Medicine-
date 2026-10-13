import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, ErrorText, Field, Label, ListItem, Muted, Screen, Segmented } from '../components/ui';
import { api, errorMessage } from '../lib/api';
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
    Alert.alert('Выйти?', 'На этом устройстве перестанут приходить вызовы.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      'Удалить аккаунт?',
      'Ваши данные будут удалены с сервера, вызовы перестанут приходить. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => deleteAccount().catch((err) => setError(errorMessage(err))),
        },
      ],
    );

  return (
    <Screen>
      <Field label="Имя" value={name} onChangeText={setName} />
      <Field label="Номер телефона" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Label>Роль</Label>
      <Segmented
        value={role}
        onChange={setRole}
        options={[
          { value: 'participant', label: 'Участник' },
          { value: 'dispatcher', label: 'Диспетчер' },
        ]}
      />
      <Label>{role === 'dispatcher' ? 'Выбранная команда' : 'Текущая команда'}</Label>
      <ListItem title="Без команды" selected={teamId === null} onPress={() => setTeamId(null)} />
      {teams?.map((t) => (
        <ListItem key={t.id} title={t.name} selected={teamId === t.id} onPress={() => setTeamId(t.id)} />
      ))}
      <ErrorText>{error}</ErrorText>
      {saved ? <Muted>✓ Изменения сохранены</Muted> : null}
      <Button title="Сохранить" onPress={save} busy={busy} />
      <Button title="Выйти" variant="secondary" onPress={logout} />
      <Button title="Удалить аккаунт" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}
