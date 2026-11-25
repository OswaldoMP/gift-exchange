import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { LocalDbService } from './local-db.service';
import { Gift } from '../models/Gift';

describe('LocalDbService', () => {
  let service: LocalDbService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LocalDbService],
    });
    service = TestBed.inject(LocalDbService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should sign in and store auth_token in localStorage', async () => {
    const promise = service.signIn('sofia@navidad2026.com', 'Password123!');

    const req = httpMock.expectOne('/api/auth/signin');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'sofia@navidad2026.com',
      password: 'Password123!',
    });

    req.flush({
      data: {
        user: {
          id: 'user-1',
          email: 'sofia@navidad2026.com',
          role: 'authenticated',
          user_metadata: { username: 'Sofía' },
        },
        session: {
          access_token: 'tok-123',
          expires_at: '2026-12-31T00:00:00.000Z',
          user: {
            id: 'user-1',
            email: 'sofia@navidad2026.com',
            role: 'authenticated',
            user_metadata: { username: 'Sofía' },
          },
        },
      },
      error: null,
    });

    const res = await promise;
    expect(res.error).toBeNull();
    expect(res.data.user?.id).toBe('user-1');
    expect(localStorage.getItem('auth_token')).toBe('tok-123');
  });

  it('should return AuthError when signIn responds with 401', async () => {
    const promise = service.signIn('sofia@navidad2026.com', 'wrong');

    const req = httpMock.expectOne('/api/auth/signin');
    req.flush(
      { error: { message: 'Invalid login credentials' } },
      { status: 401, statusText: 'Unauthorized' }
    );

    const res = await promise;
    expect(res.data.user).toBeNull();
    expect(res.error?.message).toBe('Invalid login credentials');
  });

  it('should return null session without HTTP call if no token stored', async () => {
    const res = await service.getSession();
    expect(res.data.session).toBeNull();
    expect(res.error).toBeNull();
  });

  it('should validate stored session and send Authorization header', async () => {
    localStorage.setItem('auth_token', 'tok-abc');
    const promise = service.getSession();

    const req = httpMock.expectOne('/api/auth/session');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-abc');
    req.flush({ data: { session: null }, error: null });

    const res = await promise;
    expect(res.data.session).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('should sign up a new user, store auth_token on success, and handle duplicate errors', async () => {
    const successPromise = service.signUp('ok@navidad2026.com', 'secret', 'Ana');
    const okReq = httpMock.expectOne('/api/auth/signup');
    expect(okReq.request.method).toBe('POST');
    okReq.flush({
      data: {
        user: {
          id: 'user-2',
          email: 'ok@navidad2026.com',
          role: 'authenticated',
          user_metadata: { username: 'Ana' },
        },
        session: {
          access_token: 'signup-tok-1',
          expires_at: '2026-12-31T00:00:00.000Z',
          user: {
            id: 'user-2',
            email: 'ok@navidad2026.com',
            role: 'authenticated',
            user_metadata: { username: 'Ana' },
          },
        },
      },
      error: null,
    });
    const okRes = await successPromise;
    expect(okRes.error).toBeNull();
    expect(localStorage.getItem('auth_token')).toBe('signup-tok-1');

    const dupPromise = service.signUp('new@navidad2026.com', 'secret', 'Nuevo');

    const req = httpMock.expectOne('/api/auth/signup');
    expect(req.request.method).toBe('POST');
    req.flush(
      { error: { message: 'User already registered' } },
      { status: 400, statusText: 'Bad Request' }
    );

    const res = await dupPromise;
    expect(res.error?.message).toBe('User already registered');
  });

  it('should sign out and clear auth_token', async () => {
    localStorage.setItem('auth_token', 'tok-xyz');
    const promise = service.signOut();

    const req = httpMock.expectOne('/api/auth/signout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-xyz');
    req.flush({ error: null });

    const res = await promise;
    expect(res.error).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('should fetch and cache 2026 event info', async () => {
    const promise = service.getInfoEvent();

    const req = httpMock.expectOne('/api/exchanges/current');
    expect(req.request.method).toBe('GET');
    const mockEvent = {
      id: 1,
      date_event: '24 de diciembre 2026',
      time_event: '18:00 hrs',
      money_event: '$500 MXN',
      start_event: '12 de diciembre 2026',
      upload_gift: '10 de diciembre 2026',
    };
    req.flush(mockEvent);

    const event = await promise;
    expect(event.date_event).toBe('24 de diciembre 2026');
    expect(JSON.parse(localStorage.getItem('event') || '{}').money_event).toBe('$500 MXN');
  });

  it('should perform participant and gift CRUD calls', async () => {
    localStorage.setItem('auth_token', 'admin-tok');

    const pPromise = service.getParticipant('oauth-1');
    const pReq = httpMock.expectOne('/api/participants/by-oauth/oauth-1');
    pReq.flush({ id: '1', name: 'Sofía', gifts: [], is_ready: false, is_admin: false });
    const participant = await pPromise;
    expect(participant.name).toBe('Sofía');

    const listPromise = service.getParticipants('oauth-1');
    const listReq = httpMock.expectOne('/api/participants?excludeOauthId=oauth-1');
    listReq.flush([]);
    expect(await listPromise).toEqual([]);

    const gift: Gift = { id: '5', title: 'Libro', store: 'Gandhi', link: 'https://gandhi.com' };
    const savePromise = service.saveGift(gift, '1');
    const saveReq = httpMock.expectOne('/api/gifts');
    expect(saveReq.request.method).toBe('POST');
    saveReq.flush({ id: 5, participant_id: '1', title: 'Libro', store: 'Gandhi', link: 'https://gandhi.com', removed: 0 });
    await savePromise;

    const updatePromise = service.updateGift(gift, 1);
    const updateReq = httpMock.expectOne('/api/gifts/5');
    expect(updateReq.request.method).toBe('PUT');
    expect(updateReq.request.body.removed).toBe(1);
    updateReq.flush({ id: 5, participant_id: '1', title: 'Libro', store: 'Gandhi', link: 'https://gandhi.com', removed: 1 });
    await updatePromise;

    const readyPromise = service.updatedParticipantToReady('oauth-1', true);
    const readyReq = httpMock.expectOne('/api/participants/by-oauth/oauth-1/ready');
    expect(readyReq.request.method).toBe('PATCH');
    readyReq.flush({ updated: 1 });
    await readyPromise;

    const assignPromise = service.assignSecretSanta([{ id: '1', friend_id: '2' }]);
    const assignReq = httpMock.expectOne('/api/participants/assign');
    expect(assignReq.request.method).toBe('POST');
    expect(assignReq.request.headers.get('Authorization')).toBe('Bearer admin-tok');
    assignReq.flush({ ok: true, notifiedCount: 1, emailMode: 'local-outbox' });
    const assignRes = await assignPromise;
    expect(assignRes.notifiedCount).toBe(1);

    const confirmPromise = service.confirmEmail('confirm-tok-99');
    const confirmReq = httpMock.expectOne('/api/auth/confirm');
    expect(confirmReq.request.method).toBe('POST');
    confirmReq.flush({
      data: {
        user: {
          id: 'u-9',
          email: 'ana@navidad2026.com',
          role: 'authenticated',
          user_metadata: { username: 'Ana' },
        },
        session: {
          access_token: 'confirmed-session-tok',
          expires_at: '2026-12-31T00:00:00.000Z',
          user: {
            id: 'u-9',
            email: 'ana@navidad2026.com',
            role: 'authenticated',
            user_metadata: { username: 'Ana' },
          },
        },
      },
      error: null,
    });
    const confirmRes = await confirmPromise;
    expect(confirmRes.error).toBeNull();
    expect(localStorage.getItem('auth_token')).toBe('confirmed-session-tok');

    const notifyPromise = service.notifySecretSanta('2');
    const notifyReq = httpMock.expectOne('/api/participants/notify-draw');
    expect(notifyReq.request.method).toBe('POST');
    expect(notifyReq.request.body).toEqual({ participantId: '2' });
    notifyReq.flush({ ok: true, notifiedCount: 1, emailMode: 'local-outbox' });
    expect((await notifyPromise).notifiedCount).toBe(1);

    const rolePromise = service.updateParticipantRole('2', 'admin');
    const roleReq = httpMock.expectOne('/api/participants/2/role');
    expect(roleReq.request.method).toBe('PATCH');
    expect(roleReq.request.body).toEqual({ role: 'admin' });
    roleReq.flush({ id: '2', name: 'Luis', gifts: [], is_admin: true, role: 'admin' });
    const promoted = await rolePromise;
    expect(promoted.role).toBe('admin');

    const cfgPromise = service.updateInfoEvent({ event_title: 'Navidad Pro 2026', money_event: '$600 MXN' });
    const cfgReq = httpMock.expectOne('/api/exchanges/current');
    expect(cfgReq.request.method).toBe('PUT');
    expect(cfgReq.request.headers.get('Authorization')).toBe('Bearer admin-tok');
    cfgReq.flush({ id: 1, event_title: 'Navidad Pro 2026', money_event: '$600 MXN' });
    const updatedCfg = await cfgPromise;
    expect(updatedCfg.event_title).toBe('Navidad Pro 2026');
    expect(JSON.parse(localStorage.getItem('event') || '{}').money_event).toBe('$600 MXN');

    const ownWheelPromise = service.updateParticipantWheelStatus('oauth-1', true);
    const ownWheelReq = httpMock.expectOne('/api/participants/by-oauth/oauth-1/wheel');
    expect(ownWheelReq.request.method).toBe('PATCH');
    expect(ownWheelReq.request.body).toEqual({ wheel_played: true });
    ownWheelReq.flush({ id: '1', name: 'Sofía', gifts: [], wheel_played: true });
    expect((await ownWheelPromise).wheel_played).toBeTrue();

    const adminWheelPromise = service.adminUpdateParticipantWheelStatus('1', false);
    const adminWheelReq = httpMock.expectOne('/api/participants/1/wheel');
    expect(adminWheelReq.request.method).toBe('PATCH');
    expect(adminWheelReq.request.body).toEqual({ wheel_played: false });
    adminWheelReq.flush({ id: '1', name: 'Sofía', gifts: [], wheel_played: false });
    expect((await adminWheelPromise).wheel_played).toBeFalse();
  });
});
