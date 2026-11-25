import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDatabase, DEFAULT_ADMIN } = require('./db.js');
const { createServer } = require('./index.js');
const { createMailer } = require('./mailer.js');

describe('Local SQLite Exchange 2026 API', () => {
  let db;
  let mailer;
  let server;
  let baseUrl;

  async function signInAsAdmin() {
    const res = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: DEFAULT_ADMIN.email,
        password: DEFAULT_ADMIN.password,
      }),
    });
    assert.equal(res.status, 200);
    return res.json();
  }

  async function registerUser(email, password, username) {
    const signUpRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    const signUpBody = await signUpRes.json();
    assert.equal(signUpRes.status, 201);
    assert.equal(signUpBody.error, null);
    assert.ok(signUpBody.data.session.access_token);
    return signUpBody;
  }

  beforeEach(async () => {
    db = createDatabase(':memory:');
    mailer = createMailer({ outboxDir: null, smtpHost: '' });
    server = createServer(db, { staticDir: null, mailer });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  it('returns health status and seeded 2026 exchange info', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');

    const eventRes = await fetch(`${baseUrl}/api/exchanges/current`);
    assert.equal(eventRes.status, 200);
    const event = await eventRes.json();
    assert.equal(event.id, 1);
    assert.equal(event.event_title, 'Intercambio 2026');
    assert.match(event.date_event, /2026/);
    assert.match(event.start_event, /2026/);
    assert.match(event.upload_gift, /2026/);
    assert.ok(event.money_event);
    assert.ok(event.rules_text);
    assert.ok(event.gift_name_placeholder);
    assert.equal(event.email_notifications_enabled, false);
  });

  it('enforces email confirmation, resends confirmation, encrypts sensitive data at rest, and sends secret santa notifications when enabled', async () => {
    // Enable email feature flag via admin endpoint
    const adminLogin = await signInAsAdmin();
    const adminToken = adminLogin.data.session.access_token;

    const enableRes = await fetch(`${baseUrl}/api/exchanges/current`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ email_notifications_enabled: true }),
    });
    assert.equal(enableRes.status, 200);
    assert.equal((await enableRes.json()).email_notifications_enabled, true);

    // 1. Register user — requires confirmation email before login
    const signUpRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'elena.secreta@navidad2026.com',
        password: 'SuperSecretPassword!',
        username: 'Elena Privada',
      }),
    });
    assert.equal(signUpRes.status, 201);
    const signUpBody = await signUpRes.json();
    assert.equal(signUpBody.data.requiresConfirmation, true);
    assert.equal(signUpBody.data.emailSent, true);
    assert.equal(mailer.sentLog.length, 1);
    assert.equal(mailer.sentLog[0].to, 'elena.secreta@navidad2026.com');
    assert.equal(mailer.sentLog[0].meta.type, 'registration_confirmation');

    // Login before confirming must fail with 403 Email not confirmed
    const blockedLogin = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'elena.secreta@navidad2026.com',
        password: 'SuperSecretPassword!',
      }),
    });
    assert.equal(blockedLogin.status, 403);
    assert.equal((await blockedLogin.json()).error.message, 'Email not confirmed');

    // Resend confirmation generates a new token and sends email
    const resendRes = await fetch(`${baseUrl}/api/auth/resend-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'elena.secreta@navidad2026.com' }),
    });
    assert.equal(resendRes.status, 200);
    const resendBody = await resendRes.json();
    assert.equal(resendBody.ok, true);
    assert.equal(mailer.sentLog.length, 2);

    const newToken = new URL(resendBody.confirmationPreviewUrl).searchParams.get(
      'confirmToken'
    );

    // Confirm email with latest token
    const confirmRes = await fetch(`${baseUrl}/api/auth/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: newToken }),
    });
    assert.equal(confirmRes.status, 200);
    const confirmBody = await confirmRes.json();
    const rawSessionToken = confirmBody.data.session.access_token;
    assert.ok(rawSessionToken);

    // Admin runs draw -> Secret Santa notification emails sent
    const allParticipants = await (await fetch(`${baseUrl}/api/participants`)).json();
    assert.equal(allParticipants.length, 2);
    const [p1, p2] = allParticipants;

    const assignRes = await fetch(`${baseUrl}/api/participants/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        assignments: [
          { id: p1.id, friend_id: p2.id },
          { id: p2.id, friend_id: p1.id },
        ],
      }),
    });
    assert.equal(assignRes.status, 200);
    const assignBody = await assignRes.json();
    assert.equal(assignBody.notifiedCount, 2);

    const drawEmails = mailer.sentLog.filter(
      (m) => m.meta.type === 'secret_santa_notification'
    );
    assert.equal(drawEmails.length, 2);

    // Manual admin notification endpoint for a single participant
    const manualNotifyRes = await fetch(`${baseUrl}/api/participants/notify-draw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ participantId: p2.id }),
    });
    assert.equal(manualNotifyRes.status, 200);
    assert.equal((await manualNotifyRes.json()).notifiedCount, 1);

    // AUDIT: Verify ALL sensitive data in SQLite is encrypted / hashed at rest!
    const rawUsers = db.rawDb
      .prepare('SELECT email, username, password_hash FROM users')
      .all();
    for (const row of rawUsers) {
      assert.ok(row.email.startsWith('enc:v1:'), 'users.email must be AES-256-GCM encrypted');
      assert.ok(!row.email.includes('@'), 'users.email must not leak plaintext email');
      assert.ok(row.username.startsWith('enc:v1:'), 'users.username must be AES-256-GCM encrypted');
      assert.ok(!row.username.includes('Elena'), 'users.username must not leak plaintext name');
      assert.ok(!row.password_hash.includes('SuperSecretPassword!'));
    }

    const rawSessions = db.rawDb.prepare('SELECT token FROM sessions').all();
    assert.ok(rawSessions.length >= 2);
    for (const row of rawSessions) {
      assert.notEqual(row.token, rawSessionToken, 'session token must be hashed, not plaintext');
      assert.match(row.token, /^[0-9a-f]{64}$/);
    }

    const rawParticipants = db.rawDb
      .prepare('SELECT name, friend_id, friend_id_enc FROM participants')
      .all();
    for (const row of rawParticipants) {
      assert.ok(row.name.startsWith('enc:v1:'), 'participants.name must be AES-256-GCM encrypted');
      assert.equal(row.friend_id, null, 'plaintext friend_id must be null');
      assert.ok(
        row.friend_id_enc && row.friend_id_enc.startsWith('enc:v1:'),
        'friend_id_enc must be AES-256-GCM encrypted'
      );
    }
  });

  it('allows admin to manage participant roles, wheel status, and update configurable event texts', async () => {
    const lauraAuth = await registerUser(
      'laura@navidad2026.com',
      'Password123!',
      'Laura Gómez'
    );
    const lauraToken = lauraAuth.data.session.access_token;
    const lauraOauthId = lauraAuth.data.user.id;

    const lauraPart = await (
      await fetch(`${baseUrl}/api/participants/by-oauth/${encodeURIComponent(lauraOauthId)}`)
    ).json();
    assert.equal(lauraPart.role, 'participant');
    assert.equal(lauraPart.email, 'laura@navidad2026.com');

    // Regular participant cannot change roles or update event config
    const forbiddenRole = await fetch(`${baseUrl}/api/participants/${lauraPart.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lauraToken}`,
      },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(forbiddenRole.status, 403);

    const forbiddenConfig = await fetch(`${baseUrl}/api/exchanges/current`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lauraToken}`,
      },
      body: JSON.stringify({ money_event: '$999 MXN' }),
    });
    assert.equal(forbiddenConfig.status, 403);

    // Admin signs in
    const adminLogin = await (
      await fetch(`${baseUrl}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: DEFAULT_ADMIN.email,
          password: DEFAULT_ADMIN.password,
        }),
      })
    ).json();
    const adminToken = adminLogin.data.session.access_token;
    const adminPart = await (
      await fetch(
        `${baseUrl}/api/participants/by-oauth/${encodeURIComponent(adminLogin.data.user.id)}`
      )
    ).json();
    assert.equal(adminPart.role, 'admin');

    // Admin cannot demote themselves
    const selfDemote = await fetch(`${baseUrl}/api/participants/${adminPart.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'participant' }),
    });
    assert.equal(selfDemote.status, 400);

    // Admin promotes and demotes Laura
    const promoteRes = await fetch(`${baseUrl}/api/participants/${lauraPart.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(promoteRes.status, 200);
    assert.equal((await promoteRes.json()).role, 'admin');

    const demoteRes = await fetch(`${baseUrl}/api/participants/${lauraPart.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ role: 'participant' }),
    });
    assert.equal(demoteRes.status, 200);
    assert.equal((await demoteRes.json()).role, 'participant');

    // Admin updates configurable texts
    const updateEventRes = await fetch(`${baseUrl}/api/exchanges/current`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        event_title: 'Navidad Corporativa 2026',
        date_event: '20 de diciembre 2026',
        money_event: '$750 MXN',
        rules_text: 'Regalo envuelto con tarjeta navideña.',
      }),
    });
    assert.equal(updateEventRes.status, 200);
    const updatedEvent = await updateEventRes.json();
    assert.equal(updatedEvent.event_title, 'Navidad Corporativa 2026');

    // Participant updates own wheel_played and admin resets it
    const selfWheelRes = await fetch(
      `${baseUrl}/api/participants/by-oauth/${encodeURIComponent(lauraOauthId)}/wheel`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lauraToken}`,
        },
        body: JSON.stringify({ wheel_played: true }),
      }
    );
    assert.equal(selfWheelRes.status, 200);
    assert.equal((await selfWheelRes.json()).wheel_played, true);

    const adminResetWheel = await fetch(`${baseUrl}/api/participants/${lauraPart.id}/wheel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ wheel_played: false }),
    });
    assert.equal(adminResetWheel.status, 200);
    assert.equal((await adminResetWheel.json()).wheel_played, false);

    // Backend rejects invalid secret santa assignments
    const selfAssignRes = await fetch(`${baseUrl}/api/participants/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        assignments: [
          { id: adminPart.id, friend_id: adminPart.id },
          { id: lauraPart.id, friend_id: lauraPart.id },
        ],
      }),
    });
    assert.equal(selfAssignRes.status, 400);
  });

  it('supports registration, login, session validation, gifts CRUD, ready state, and admin draw', async () => {
    const authA = await registerUser(
      'sofia@navidad2026.com',
      'Password123!',
      'Sofía Morales'
    );
    const tokenA = authA.data.session.access_token;
    const oauthIdA = authA.data.user.id;

    // Duplicate registration should fail
    const dupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'SOFIA@navidad2026.com',
        password: 'Password123!',
        username: 'Sofía Duplicada',
      }),
    });
    assert.equal(dupRes.status, 400);

    // Wrong password should fail
    const badLogin = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sofia@navidad2026.com',
        password: 'wrong-password',
      }),
    });
    assert.equal(badLogin.status, 401);

    const partA = await (
      await fetch(`${baseUrl}/api/participants/by-oauth/${encodeURIComponent(oauthIdA)}`)
    ).json();
    assert.equal(partA.name, 'Sofía Morales');

    // Add, update, and soft-delete gifts
    const createdGift = await (
      await fetch(`${baseUrl}/api/gifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: partA.id,
          title: 'Audífonos Bluetooth',
          store: 'Amazon',
          link: 'https://example.com/audifonos',
        }),
      })
    ).json();

    await fetch(`${baseUrl}/api/gifts/${createdGift.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Audífonos Pro 2026',
        store: 'Amazon',
        link: 'https://example.com/audifonos',
        removed: 0,
      }),
    });

    const refreshed = await (
      await fetch(`${baseUrl}/api/participants/by-oauth/${encodeURIComponent(oauthIdA)}`)
    ).json();
    assert.equal(refreshed.gifts.length, 1);
    assert.equal(refreshed.gifts[0].title, 'Audífonos Pro 2026');

    // Sign out invalidates token
    await fetch(`${baseUrl}/api/auth/signout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const sessionAfter = await (
      await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json();
    assert.equal(sessionAfter.data.session, null);
  });

  it('operates seamlessly by default with email_notifications_enabled disabled', async () => {
    // By default email_notifications_enabled is false
    const currentEvent = await (await fetch(`${baseUrl}/api/exchanges/current`)).json();
    assert.equal(currentEvent.email_notifications_enabled, false);

    const adminLogin = await signInAsAdmin();
    const adminToken = adminLogin.data.session.access_token;

    // Signup activates account immediately with session and sends NO email
    const signUpRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sin.correo@navidad2026.com',
        password: 'Password123!',
        username: 'Mateo Sin Correo',
      }),
    });
    assert.equal(signUpRes.status, 201);
    const signUpBody = await signUpRes.json();
    assert.equal(signUpBody.data.requiresConfirmation, false);
    assert.equal(signUpBody.data.emailSent, false);
    assert.equal(signUpBody.data.emailMode, 'disabled');
    assert.ok(signUpBody.data.session.access_token);
    assert.equal(mailer.sentLog.length, 0);

    // Draw completes normally without sending emails
    const allParticipants = await (await fetch(`${baseUrl}/api/participants`)).json();
    const [p1, p2] = allParticipants;
    const assignRes = await fetch(`${baseUrl}/api/participants/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        assignments: [
          { id: p1.id, friend_id: p2.id },
          { id: p2.id, friend_id: p1.id },
        ],
      }),
    });
    assert.equal(assignRes.status, 200);
    const assignBody = await assignRes.json();
    assert.equal(assignBody.notifiedCount, 0);
    assert.equal(assignBody.emailMode, 'disabled');
    assert.equal(mailer.sentLog.length, 0);

    // Manual notify endpoint safely returns disabled with 0 sent
    const notifyRes = await fetch(`${baseUrl}/api/participants/notify-draw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(notifyRes.status, 200);
    const notifyBody = await notifyRes.json();
    assert.equal(notifyBody.emailMode, 'disabled');
    assert.equal(notifyBody.notifiedCount, 0);
    assert.equal(mailer.sentLog.length, 0);
  });
});
