import { Injectable } from '@angular/core'
import {
  AuthChangeEvent,
  AuthSession,
  createClient,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js'
import { environment } from '../../enviroments/enviroment'
import { Participant, ParticipantEntity } from '../models/participant-entity'
import { Gift, GiftEntity } from '../models/Gift'
import { Exchanges } from '../models/exchanges.entity';

export interface Profile {
  id?: string
  username: string
  website: string
  avatar_url: string
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient
  _session: AuthSession | null = null

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey)
  }

  getSession(): Promise<any> {
    return this.supabase.auth.getSession();
  }

  profile(user: User) {
    return this.supabase
      .from('profiles')
      .select(`username, website, avatar_url`)
      .eq('id', user.id)
      .single()
  }

  authChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback)
  }

  signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password })
  }

  signOut() {
    return this.supabase.auth.signOut()
  }

  singInByToken(token: string) {
    return this.supabase.auth.getUser(token);
  }

  signUp(email: string, password: string, username: string) {
    return this.supabase.auth.signUp({
      email, password, options: {
        data: {
          username
        }
      }
    });
  }

  updateProfile(profile: Profile) {
    const update = {
      ...profile,
      updated_at: new Date(),
    }

    return this.supabase.from('profiles').upsert(update)
  }

  downLoadImage(path: string) {
    return this.supabase.storage.from('avatars').download(path)
  }

  uploadAvatar(filePath: string, file: File) {
    return this.supabase.storage.from('avatars').upload(filePath, file)
  }


  // CRUD
  async getParticipants(value: string): Promise<Participant[]> {
    console.log("[getParticipants FIND BY] => ", value);
    try {
      const { data, error } = await this.supabase.from('participants').select("*").isDistinct("oauth_id", value);
      if (error) {
        throw error;
      }

      console.log("[DATA SUPABASE SELECTO ALL] => ", data);
      const p: Participant[] = data.map(v => {

        const pMap: Participant = {
          id: v.id,
          name: v.name,
          gifts: [],
          avatarUrl: "",
          is_ready: v.is_ready,
        }
        return pMap;
      });

      for (let participant of p as Participant[]) {
        const participantId: number = participant.id as unknown as number;
        const giftData = await this.getGift(participantId);

        const gifts: Gift[] = giftData
          .filter(g => g.removed != 1)
          .map(g => {
            const gMap: Gift = {
              id: g.id,
              title: g.title,
              link: g.link,
              store: g.store
            }
            return gMap;
          });

        participant.gifts = gifts;
      }
      return p;
    } catch (error) {
      console.log("[ERROR] => ", error);
      throw error;
    }
  }

  async getParticipant(value: string): Promise<Participant> {
    console.log("[getParticipant FIND BY] => ", value);
    try {
      const { data, error } = await this.supabase.from('participants').select("*").eq("oauth_id", value);
      if (error) {
        throw error;
      }
      console.log("[DATA PARTICIPANT] => ", data);
      const giftData = await this.getGift(data[0].id);

      const gifts: Gift[] = giftData
        .filter(g => g.removed != 1)
        .map(g => {
          const gMap: Gift = {
            id: g.id,
            title: g.title,
            link: g.link,
            store: g.store
          }
          return gMap;
        });

      const p: Participant = {
        id: data[0].id,
        gifts,
        name: data[0].name,
        avatarUrl: "",
        is_ready: data[0].is_ready,
        friend_id: data[0].friend_id,
      }
      return p;
    } catch (error) {
      console.log("[ERROR] => ", error);
      throw error;
    }
  }

  async saveParticipant(participant: Participant): Promise<any> {
    try {
      const p: ParticipantEntity = {
        name: participant.name,
        oauth_id: participant.oauth_id
      }
      const { data, error } = await this.supabase.from('participants').insert([p]);
      if (error) {
        throw error;
      }
      console.log("[DATA SUPABASE] => ", data);
      return data;
    } catch (error) {
      console.log("[ERROR] => ", error);
      throw error;
    }
  }

  async saveGift(gift: Gift, participant_id: string): Promise<any> {
    try {
      const g: GiftEntity = {
        participant_id,
        link: gift.link,
        title: gift.title,
        store: gift.store,
      }
      const { data, error } = await this.supabase.from('gift').insert([g]);
      if (error) {
        throw error;
      }
      console.log("[DATA SUPABASE] => ", data);
      return data;
    } catch (error) {
      console.log("[ERROR] => ", error);
      throw error;
    }
  }

  async getGift(participant_id: number) {
    try {
      const { data, error } = await this.supabase.from('gift').select("*").eq("participant_id", participant_id);
      if (error) {
        throw error;
      }
      console.log("[DATA SUPABASE] => ", data);
      return data;
    } catch (error) {
      console.log("[ERROR] => ", error);
      throw error;
    }
  }

  async updateGift(gift: Gift, removed: number): Promise<any> {
    try {
      const g: GiftEntity = {
        link: gift.link,
        title: gift.title,
        store: gift.store,
        removed
      }

      const { data, error } = await this.supabase.from('gift').update(g).eq('id', gift.id);
      if (error) {
        throw error;
      }
      console.log("[DATA SUPABASE] => ", data);
      return data;
    } catch (error) {
      console.log("[ERROR] => ", error);
      throw error;
    }
  }

  async updatedParticipantToReady(id: string, isReady: boolean): Promise<any> {
    try {
      const { data, error } = await this.supabase.from('participants').update({ is_ready: isReady }).eq('oauth_id', id);
      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      throw error;
    }
  }

  async getInfoEvent(): Promise<Exchanges> {
    try {
      const { data, error } = await this.supabase.from('exchanges').select("*").eq('id', 1);
      if (error) {
        throw error;
      }
      console.log("Event", data)
      const exchange: Exchanges = {
        id: data[0].id,
        date_event: data[0].date_event,
        money_event: data[0].money_event,
        start_event: data[0].start_event,
        time_event: data[0].time_event,
        upload_gift: data[0].upload_gift
      }
      
      localStorage.setItem("event", JSON.stringify(exchange));
      return exchange;
    } catch (error) {
      throw error;
    }
  }
}
