import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../enviroments/enviroment';
import { Participant, UserRole } from '../models/participant-entity';
import { Gift, GiftEntity } from '../models/Gift';
import { Exchanges, mergeExchangeConfig } from '../models/exchanges.entity';

export interface AuthError {
  message: string;
}

export interface LocalAuthUser {
  id: string;
  email: string;
  role: string;
  user_metadata: {
    username: string;
  };
}

export interface LocalAuthSession {
  access_token: string;
  expires_at: string;
  user: LocalAuthUser;
}

export interface AuthResponse {
  data: {
    user: LocalAuthUser | null;
    session: LocalAuthSession | null;
    requiresConfirmation?: boolean;
    emailSent?: boolean;
    confirmationPreviewUrl?: string;
  };
  error: AuthError | null;
}

export interface DrawNotificationResult {
  ok: boolean;
  notifiedCount: number;
  emailMode: string;
}

export interface AuthSessionResponse {
  data: {
    session: LocalAuthSession | null;
  };
  error: AuthError | null;
}

export interface AuthUserResponse {
  data: {
    user: LocalAuthUser | null;
  };
  error: AuthError | null;
}

const TOKEN_STORAGE_KEY = 'auth_token';

@Injectable({
  providedIn: 'root',
})
export class LocalDbService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl || '/api';

  private getAuthHeaders(tokenOverride?: string): HttpHeaders {
    const token = tokenOverride ?? localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private extractError(error: unknown, fallbackMessage: string): AuthError {
    if (error instanceof HttpErrorResponse) {
      const serverMessage =
        error.error?.error?.message ||
        error.error?.message ||
        fallbackMessage;
      return { message: serverMessage };
    }
    return { message: fallbackMessage };
  }

  async getSession(): Promise<AuthSessionResponse> {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      return { data: { session: null }, error: null };
    }
    try {
      const response = await firstValueFrom(
        this.http.get<AuthSessionResponse>(`${this.apiUrl}/auth/session`, {
          headers: this.getAuthHeaders(token),
        })
      );
      if (!response.data.session) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      return response;
    } catch (error) {
      return {
        data: { session: null },
        error: this.extractError(error, 'Error validating session'),
      };
    }
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/auth/signin`, {
          email,
          password,
        })
      );
      if (response.data.session?.access_token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, response.data.session.access_token);
      }
      return response;
    } catch (error) {
      return {
        data: { user: null, session: null },
        error: this.extractError(error, 'Invalid login credentials'),
      };
    }
  }

  async signOut(): Promise<{ error: AuthError | null }> {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    try {
      const response = await firstValueFrom(
        this.http.post<{ error: AuthError | null }>(
          `${this.apiUrl}/auth/signout`,
          {},
          { headers: this.getAuthHeaders(token) }
        )
      );
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return response;
    } catch (error) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return { error: this.extractError(error, 'Error signing out') };
    }
  }

  async signInByToken(token: string): Promise<AuthUserResponse> {
    if (!token) {
      return { data: { user: null }, error: null };
    }
    try {
      const response = await firstValueFrom(
        this.http.get<AuthUserResponse>(`${this.apiUrl}/auth/user`, {
          headers: this.getAuthHeaders(token),
        })
      );
      if (response.data.user?.role === 'authenticated') {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      }
      return response;
    } catch (error) {
      return {
        data: { user: null },
        error: this.extractError(error, 'Invalid token'),
      };
    }
  }

  async signUp(
    email: string,
    password: string,
    username: string
  ): Promise<AuthResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/auth/signup`, {
          email,
          password,
          username,
        })
      );
      if (response.data.session?.access_token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, response.data.session.access_token);
      }
      return response;
    } catch (error) {
      return {
        data: { user: null, session: null },
        error: this.extractError(error, 'Registration failed'),
      };
    }
  }

  async confirmEmail(token: string): Promise<AuthResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/auth/confirm`, { token })
      );
      if (response.data.session?.access_token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, response.data.session.access_token);
      }
      return response;
    } catch (error) {
      return {
        data: { user: null, session: null },
        error: this.extractError(error, 'No se pudo confirmar tu cuenta.'),
      };
    }
  }

  async resendConfirmation(email: string): Promise<{
    ok: boolean;
    emailMode?: string;
    confirmationPreviewUrl?: string;
    error: AuthError | null;
  }> {
    try {
      const response = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          emailMode?: string;
          confirmationPreviewUrl?: string;
        }>(`${this.apiUrl}/auth/resend-confirmation`, { email })
      );
      return { ...response, error: null };
    } catch (error) {
      return {
        ok: false,
        error: this.extractError(error, 'No se pudo reenviar el correo de confirmación.'),
      };
    }
  }

  async getParticipants(oauthId: string): Promise<Participant[]> {
    return firstValueFrom(
      this.http.get<Participant[]>(`${this.apiUrl}/participants`, {
        params: { excludeOauthId: oauthId },
        headers: this.getAuthHeaders(),
      })
    );
  }

  async getAllParticipants(): Promise<Participant[]> {
    return firstValueFrom(
      this.http.get<Participant[]>(`${this.apiUrl}/participants`, {
        headers: this.getAuthHeaders(),
      })
    );
  }

  async getParticipant(oauthId: string): Promise<Participant> {
    return firstValueFrom(
      this.http.get<Participant>(
        `${this.apiUrl}/participants/by-oauth/${encodeURIComponent(oauthId)}`,
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async saveParticipant(participant: Participant): Promise<Participant> {
    return firstValueFrom(
      this.http.post<Participant>(
        `${this.apiUrl}/participants`,
        {
          name: participant.name,
          oauth_id: participant.oauth_id,
          avatarUrl: participant.avatarUrl || '',
        },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async saveGift(gift: Gift, participantId: string): Promise<GiftEntity> {
    return firstValueFrom(
      this.http.post<GiftEntity>(
        `${this.apiUrl}/gifts`,
        {
          participant_id: participantId,
          title: gift.title,
          store: gift.store || '',
          link: gift.link || '',
        },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async getGift(participantId: number | string): Promise<GiftEntity[]> {
    return firstValueFrom(
      this.http.get<GiftEntity[]>(`${this.apiUrl}/gifts`, {
        params: { participantId: String(participantId) },
        headers: this.getAuthHeaders(),
      })
    );
  }

  async updateGift(gift: Gift, removed: number): Promise<GiftEntity> {
    return firstValueFrom(
      this.http.put<GiftEntity>(
        `${this.apiUrl}/gifts/${encodeURIComponent(gift.id)}`,
        {
          title: gift.title,
          store: gift.store || '',
          link: gift.link || '',
          removed,
        },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async updatedParticipantToReady(
    oauthId: string,
    isReady: boolean
  ): Promise<{ updated: number }> {
    return firstValueFrom(
      this.http.patch<{ updated: number }>(
        `${this.apiUrl}/participants/by-oauth/${encodeURIComponent(oauthId)}/ready`,
        { is_ready: isReady },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async updateParticipantRole(
    participantId: string,
    role: UserRole
  ): Promise<Participant> {
    return firstValueFrom(
      this.http.patch<Participant>(
        `${this.apiUrl}/participants/${encodeURIComponent(participantId)}/role`,
        { role },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async updateParticipantWheelStatus(
    oauthId: string,
    wheelPlayed: boolean
  ): Promise<Participant> {
    return firstValueFrom(
      this.http.patch<Participant>(
        `${this.apiUrl}/participants/by-oauth/${encodeURIComponent(oauthId)}/wheel`,
        { wheel_played: wheelPlayed },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async adminUpdateParticipantWheelStatus(
    participantId: string,
    wheelPlayed: boolean
  ): Promise<Participant> {
    return firstValueFrom(
      this.http.patch<Participant>(
        `${this.apiUrl}/participants/${encodeURIComponent(participantId)}/wheel`,
        { wheel_played: wheelPlayed },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  getCachedInfoEvent(): Required<Exchanges> {
    try {
      const raw = localStorage.getItem('event');
      return mergeExchangeConfig(raw ? (JSON.parse(raw) as Exchanges) : null);
    } catch {
      return mergeExchangeConfig(null);
    }
  }

  async getInfoEvent(): Promise<Required<Exchanges>> {
    const exchange = mergeExchangeConfig(
      await firstValueFrom(
        this.http.get<Exchanges>(`${this.apiUrl}/exchanges/current`)
      )
    );
    localStorage.setItem('event', JSON.stringify(exchange));
    return exchange;
  }

  async updateInfoEvent(config: Partial<Exchanges>): Promise<Required<Exchanges>> {
    const updated = mergeExchangeConfig(
      await firstValueFrom(
        this.http.put<Exchanges>(`${this.apiUrl}/exchanges/current`, config, {
          headers: this.getAuthHeaders(),
        })
      )
    );
    localStorage.setItem('event', JSON.stringify(updated));
    return updated;
  }

  async assignSecretSanta(
    assignments: { id: string; friend_id: string }[],
    preserveUnchangedWheel = false
  ): Promise<DrawNotificationResult> {
    return firstValueFrom(
      this.http.post<DrawNotificationResult>(
        `${this.apiUrl}/participants/assign`,
        { assignments, preserveUnchangedWheel },
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async notifySecretSanta(participantId?: string): Promise<DrawNotificationResult> {
    return firstValueFrom(
      this.http.post<DrawNotificationResult>(
        `${this.apiUrl}/participants/notify-draw`,
        participantId ? { participantId } : {},
        { headers: this.getAuthHeaders() }
      )
    );
  }

  async getAllGift(): Promise<GiftEntity[]> {
    return firstValueFrom(
      this.http.get<GiftEntity[]>(`${this.apiUrl}/gifts`, {
        headers: this.getAuthHeaders(),
      })
    );
  }
}
