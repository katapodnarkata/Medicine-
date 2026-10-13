export type Role = 'dispatcher' | 'participant';

export interface Team {
  id: number;
  name: string;
  memberCount: number;
}

export interface User {
  id: number;
  name: string;
  phone: string;
  role: Role;
  team: { id: number; name: string } | null;
}

export type RecipientStatus = 'seen' | 'pending';

export interface Recipient {
  userId: number;
  name: string;
  phone: string;
  status: RecipientStatus;
}

export interface Call {
  id: number;
  teamId: number;
  teamName: string;
  dispatcherId: number;
  dispatcherName: string;
  kind: 'car' | 'place';
  place: string | null;
  text: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
  recipients?: Recipient[] | null;
  myStatus?: RecipientStatus;
}
