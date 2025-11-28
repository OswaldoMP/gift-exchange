import {Gift} from './Gift';

export interface Participant {
  id?: string;
  name?: string;
  avatarUrl?: string;
  gifts: Gift[];
  oauth_id?: string
}

export interface ParticipantEntity {
    id?: number,
    name?: string
    friend_id?: number
    oauth_id?: string
}