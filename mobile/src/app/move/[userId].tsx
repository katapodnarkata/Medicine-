import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ErrorText, ListItem, Loading, Muted, Screen } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePolling } from '../../lib/hooks';

/** Перевод участника в другую команду (п.16). */
export default function MoveMember() {
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const { user } = useAuth();
  const { data: teams, error } = usePolling(api.teams);
  const [actionError, setActionError] = useState<string | null>(null);

  const move = async (teamId: number) => {
    setActionError(null);
    try {
      await api.setUserTeam(Number(userId), teamId);
      router.back();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <Screen>
      <Muted>
        {name ? `${name}: ` : ''}קריאות עתידיות יגיעו רק מהצוות החדש. קריאות שכבר נשלחו לא ישתנו.
      </Muted>
      <ErrorText>{actionError ?? error}</ErrorText>
      {!teams && !error ? <Loading /> : null}
      {teams
        ?.filter((t) => t.id !== user?.team?.id)
        .map((t) => (
          <ListItem key={t.id} title={t.name} subtitle={`חברי צוות: ${t.memberCount}`} onPress={() => move(t.id)} />
        ))}
    </Screen>
  );
}
