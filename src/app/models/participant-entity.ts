import {Gift} from './Gift';

export interface Participant {
  id: string;
  name: string;
  avatarUrl?: string;
  gifts: Gift[];
}