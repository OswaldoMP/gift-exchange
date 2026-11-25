import { Gift } from './Gift';

export type UserRole = 'admin' | 'participant';

export interface Participant {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  gifts: Gift[];
  oauth_id?: string;
  is_ready?: boolean;
  friend_id?: string;
  is_admin?: boolean;
  wheel_played?: boolean;
  role?: UserRole;
}

export interface ParticipantEntity {
  id?: number;
  name?: string;
  friend_id?: number;
  oauth_id?: string;
  is_ready?: boolean;
  is_admin?: boolean;
}
