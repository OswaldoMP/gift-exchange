'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createCryptoContext } = require('./crypto');

const DEFAULT_EXCHANGE_2026 = {
  id: 1,
  event_title: 'Intercambio 2026',
  date_event: '24 de diciembre 2026',
  time_event: '18:00 hrs',
  money_event: '$500 MXN',
  start_event: '12 de diciembre 2026',
  upload_gift: '10 de diciembre 2026',
  hero_subtitle:
    'Coordina el sorteo de Navidad 2026, comparte ideas de regalos y mantén a tu tribu conectada desde un único espacio.',
  register_subtitle:
    'Diseñamos una experiencia moderna para sumar participantes, registrar ideas de regalos y compartir actualizaciones con banners informativos en cada etapa de la Navidad 2026.',
  dashboard_title: 'Panel del intercambio navideño 2026',
  dashboard_subtitle:
    'Revisa tus ideas de regalo, solicita el sorteo y mantente al tanto del estado de la Navidad 2026.',
  rules_text: 'Incluye enlaces o tiendas para cada idea de regalo.',
  reminder_text: 'Comparte mínimo tres opciones para inspirar a tu amigo secreto.',
  draw_banner_note: 'Para recibir el resultado del sorteo navideño.',
  exchange_banner_note: 'Para dar y recibir regalo de tu amigo secreto.',
  email_placeholder: 'navidad2026@tuempresa.com',
  gift_name_placeholder: 'Ej. Audífonos inalámbricos, taza navideña...',
  gift_store_placeholder: 'Ej. Amazon, Liverpool, Mercado Libre...',
  gift_link_placeholder: 'https://tienda.com/mi-regalo-2026',
  email_notifications_enabled:
    String(process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true',
};

const CONFIGURABLE_EXCHANGE_FIELDS = [
  'event_title',
  'date_event',
  'time_event',
  'money_event',
  'start_event',
  'upload_gift',
  'hero_subtitle',
  'register_subtitle',
  'dashboard_title',
  'dashboard_subtitle',
  'rules_text',
  'reminder_text',
  'draw_banner_note',
  'exchange_banner_note',
  'email_placeholder',
  'gift_name_placeholder',
  'gift_store_placeholder',
  'gift_link_placeholder',
];

const VALID_ROLES = new Set(['admin', 'participant']);

const DEFAULT_ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@intercambio2026.local',
  password: process.env.ADMIN_PASSWORD || 'Admin2026!',
  username: process.env.ADMIN_NAME || 'Administrador',
};

const SESSION_TTL_DAYS = 30;
const CONFIRMATION_TTL_HOURS = 24;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createDatabase(dbPath) {
  const resolvedPath =
    dbPath ||
    process.env.DB_PATH ||
    path.join(__dirname, 'data', 'exchange-2026.sqlite');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const cryptoCtx = createCryptoContext(resolvedPath);
  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  initSchema(db);
  migrateSensitiveData(db);
  seedInitialData(db);

  function buildAuthUser(row) {
    return {
      id: row.id,
      email: cryptoCtx.decrypt(row.email),
      role: row.role || 'authenticated',
      email_confirmed: Boolean(row.email_confirmed),
      user_metadata: {
        username: cryptoCtx.decrypt(row.username),
      },
    };
  }

  function decodeFriendId(row) {
    if (row.friend_id_enc) {
      const decrypted = cryptoCtx.decrypt(row.friend_id_enc);
      return decrypted || undefined;
    }
    if (row.friend_id !== null && row.friend_id !== undefined) {
      return String(row.friend_id);
    }
    return undefined;
  }

  function initSchema(connection) {
    connection.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        email_hash TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'authenticated',
        email_confirmed INTEGER NOT NULL DEFAULT 0,
        confirmation_token_hash TEXT,
        confirmation_expires_at TEXT,
        is_mock INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        oauth_id TEXT UNIQUE,
        friend_id INTEGER,
        friend_id_enc TEXT,
        is_ready INTEGER NOT NULL DEFAULT 0,
        is_admin INTEGER NOT NULL DEFAULT 0,
        wheel_played INTEGER NOT NULL DEFAULT 0,
        avatar_url TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (oauth_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (friend_id) REFERENCES participants(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS gift (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        store TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        removed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS exchanges (
        id INTEGER PRIMARY KEY,
        event_title TEXT NOT NULL DEFAULT 'Intercambio 2026',
        date_event TEXT NOT NULL,
        time_event TEXT NOT NULL,
        money_event TEXT NOT NULL,
        start_event TEXT NOT NULL,
        upload_gift TEXT NOT NULL,
        hero_subtitle TEXT NOT NULL DEFAULT '',
        register_subtitle TEXT NOT NULL DEFAULT '',
        dashboard_title TEXT NOT NULL DEFAULT '',
        dashboard_subtitle TEXT NOT NULL DEFAULT '',
        rules_text TEXT NOT NULL DEFAULT '',
        reminder_text TEXT NOT NULL DEFAULT '',
        draw_banner_note TEXT NOT NULL DEFAULT '',
        exchange_banner_note TEXT NOT NULL DEFAULT '',
        email_placeholder TEXT NOT NULL DEFAULT '',
        gift_name_placeholder TEXT NOT NULL DEFAULT '',
        gift_store_placeholder TEXT NOT NULL DEFAULT '',
        gift_link_placeholder TEXT NOT NULL DEFAULT '',
        email_notifications_enabled INTEGER NOT NULL DEFAULT 0
      );
    `);

    ensureUserColumns(connection);
    ensureParticipantColumns(connection);
    ensureExchangeColumns(connection);
  }

  function ensureUserColumns(connection) {
    const cols = new Set(
      connection.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
    );
    if (!cols.has('email_hash')) {
      connection.exec('ALTER TABLE users ADD COLUMN email_hash TEXT');
    }
    if (!cols.has('confirmation_token_hash')) {
      connection.exec('ALTER TABLE users ADD COLUMN confirmation_token_hash TEXT');
    }
    if (!cols.has('confirmation_expires_at')) {
      connection.exec('ALTER TABLE users ADD COLUMN confirmation_expires_at TEXT');
    }
    if (!cols.has('is_mock')) {
      connection.exec('ALTER TABLE users ADD COLUMN is_mock INTEGER NOT NULL DEFAULT 0');
    }
    connection.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash)'
    );
  }

  function ensureParticipantColumns(connection) {
    const cols = new Set(
      connection.prepare('PRAGMA table_info(participants)').all().map((c) => c.name)
    );
    if (!cols.has('wheel_played')) {
      connection.exec(
        'ALTER TABLE participants ADD COLUMN wheel_played INTEGER NOT NULL DEFAULT 0'
      );
    }
    if (!cols.has('friend_id_enc')) {
      connection.exec('ALTER TABLE participants ADD COLUMN friend_id_enc TEXT');
    }
  }

  function ensureExchangeColumns(connection) {
    const existingCols = new Set(
      connection.prepare('PRAGMA table_info(exchanges)').all().map((c) => c.name)
    );
    for (const field of CONFIGURABLE_EXCHANGE_FIELDS) {
      if (!existingCols.has(field)) {
        const defaultVal = String(DEFAULT_EXCHANGE_2026[field] || '').replace(/'/g, "''");
        connection.exec(
          `ALTER TABLE exchanges ADD COLUMN ${field} TEXT NOT NULL DEFAULT '${defaultVal}'`
        );
      }
    }
    if (!existingCols.has('email_notifications_enabled')) {
      const defaultEnabled =
        String(process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true' ? 1 : 0;
      connection.exec(
        `ALTER TABLE exchanges ADD COLUMN email_notifications_enabled INTEGER NOT NULL DEFAULT ${defaultEnabled}`
      );
    }
  }

  function migrateSensitiveData(connection) {
    const users = connection
      .prepare('SELECT id, email, email_hash, username, is_mock FROM users')
      .all();
    const updateUser = connection.prepare(
      'UPDATE users SET email = ?, email_hash = ?, username = ?, is_mock = ? WHERE id = ?'
    );
    for (const user of users) {
      const plainEmail = normalizeEmail(cryptoCtx.decrypt(user.email));
      const plainUsername = cryptoCtx.decrypt(user.username);
      const isMock = user.is_mock || plainEmail.endsWith('@prueba2026.local') ? 1 : 0;
      const needsUpdate =
        !cryptoCtx.isEncrypted(user.email) ||
        !user.email_hash ||
        !cryptoCtx.isEncrypted(user.username) ||
        isMock !== user.is_mock;
      if (needsUpdate) {
        updateUser.run(
          cryptoCtx.encrypt(plainEmail),
          cryptoCtx.blindIndex(plainEmail),
          cryptoCtx.encrypt(plainUsername),
          isMock,
          user.id
        );
      }
    }

    const participants = connection
      .prepare('SELECT id, name, friend_id, friend_id_enc FROM participants')
      .all();
    const updateParticipant = connection.prepare(
      'UPDATE participants SET name = ?, friend_id = NULL, friend_id_enc = ? WHERE id = ?'
    );
    for (const p of participants) {
      const plainName = cryptoCtx.decrypt(p.name);
      const hasPlainFriend = p.friend_id !== null && p.friend_id !== undefined;
      const encFriend = hasPlainFriend
        ? cryptoCtx.encrypt(String(p.friend_id))
        : p.friend_id_enc || null;

      if (!cryptoCtx.isEncrypted(p.name) || hasPlainFriend) {
        updateParticipant.run(cryptoCtx.encrypt(plainName), encFriend, p.id);
      }
    }
  }

  function seedInitialData(connection) {
    const existingExchange = connection
      .prepare('SELECT id FROM exchanges WHERE id = 1')
      .get();

    if (!existingExchange) {
      const defaultEmailFlag =
        String(process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true' ? 1 : 0;
      const cols = ['id', ...CONFIGURABLE_EXCHANGE_FIELDS, 'email_notifications_enabled'];
      const placeholders = cols.map(() => '?').join(', ');
      const values = [
        DEFAULT_EXCHANGE_2026.id,
        ...CONFIGURABLE_EXCHANGE_FIELDS.map((col) => DEFAULT_EXCHANGE_2026[col]),
        defaultEmailFlag,
      ];
      connection
        .prepare(`INSERT INTO exchanges (${cols.join(', ')}) VALUES (${placeholders})`)
        .run(...values);
    } else {
      for (const field of CONFIGURABLE_EXCHANGE_FIELDS) {
        const row = connection
          .prepare(`SELECT ${field} AS val FROM exchanges WHERE id = 1`)
          .get();
        if (!row || row.val === null || row.val === '') {
          connection
            .prepare(`UPDATE exchanges SET ${field} = ? WHERE id = 1`)
            .run(DEFAULT_EXCHANGE_2026[field]);
        }
      }
    }

    const adminEmail = normalizeEmail(DEFAULT_ADMIN.email);
    const adminEmailHash = cryptoCtx.blindIndex(adminEmail);
    const existingAdmin = connection
      .prepare('SELECT id FROM users WHERE email_hash = ?')
      .get(adminEmailHash);

    if (!existingAdmin) {
      const adminId = crypto.randomUUID();
      const passwordHash = cryptoCtx.hashPassword(DEFAULT_ADMIN.password);

      connection
        .prepare(
          `INSERT INTO users (id, email, email_hash, password_hash, username, role, email_confirmed, is_mock)
           VALUES (?, ?, ?, ?, ?, 'authenticated', 1, 0)`
        )
        .run(
          adminId,
          cryptoCtx.encrypt(adminEmail),
          adminEmailHash,
          passwordHash,
          cryptoCtx.encrypt(DEFAULT_ADMIN.username)
        );

      connection
        .prepare(
          `INSERT INTO participants (name, oauth_id, is_ready, is_admin, wheel_played, avatar_url)
           VALUES (?, ?, 0, 1, 0, '')`
        )
        .run(cryptoCtx.encrypt(DEFAULT_ADMIN.username), adminId);
    }
  }

  function createSessionForUser(userId) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = cryptoCtx.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    db.prepare(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(tokenHash, userId, expiresAt);

    return { access_token: rawToken, expires_at: expiresAt };
  }

  function mapGiftRow(row) {
    return {
      id: String(row.id),
      title: row.title,
      store: row.store || '',
      link: row.link || '',
    };
  }

  function mapGiftEntityRow(row) {
    return {
      id: row.id,
      participant_id: String(row.participant_id),
      title: row.title,
      store: row.store || '',
      link: row.link || '',
      removed: row.removed,
    };
  }

  function getActiveGiftsForParticipant(participantId) {
    const rows = db
      .prepare(
        'SELECT id, participant_id, title, store, link, removed FROM gift WHERE participant_id = ? AND removed != 1 ORDER BY id ASC'
      )
      .all(participantId);
    return rows.map(mapGiftRow);
  }

  function mapParticipantRow(row, options = {}) {
    const gifts = getActiveGiftsForParticipant(row.id);
    const isAdmin = Boolean(row.is_admin);
    const mapped = {
      id: String(row.id),
      name: cryptoCtx.decrypt(row.name),
      avatarUrl: row.avatar_url || '',
      is_ready: Boolean(row.is_ready),
      wheel_played: Boolean(row.wheel_played),
      role: isAdmin ? 'admin' : 'participant',
      gifts,
    };

    if (options.includeEmail && row.email !== undefined) {
      mapped.email = row.email ? cryptoCtx.decrypt(row.email) : '';
    }

    if (options.includeFriend) {
      mapped.friend_id = decodeFriendId(row);
    }

    if (options.includeAdmin) {
      mapped.is_admin = isAdmin;
    }

    return mapped;
  }

  function signUp(email, password, username, options = {}) {
    const normalizedEmail = normalizeEmail(email);
    const trimmedName = String(username || '').trim();

    if (!normalizedEmail || !password || !trimmedName) {
      return {
        data: { user: null, session: null, requiresConfirmation: false },
        error: { message: 'Todos los campos son obligatorios' },
      };
    }

    const emailHash = cryptoCtx.blindIndex(normalizedEmail);
    const existing = db
      .prepare('SELECT id FROM users WHERE email_hash = ?')
      .get(emailHash);

    if (existing) {
      return {
        data: { user: null, session: null, requiresConfirmation: false },
        error: { message: 'User already registered' },
      };
    }

    const emailFeatureEnabled = isEmailFeatureEnabled();
    const requireConfirmation =
      options.requireConfirmation !== undefined
        ? Boolean(options.requireConfirmation)
        : emailFeatureEnabled &&
          String(process.env.REQUIRE_EMAIL_CONFIRMATION ?? 'true') !== 'false';
    const isMock = options.isMock ? 1 : 0;

    const userId = crypto.randomUUID();
    const passwordHash = cryptoCtx.hashPassword(password);
    const rawConfirmToken = requireConfirmation
      ? crypto.randomBytes(32).toString('hex')
      : null;
    const confirmTokenHash = rawConfirmToken
      ? cryptoCtx.hashToken(rawConfirmToken)
      : null;
    const confirmExpiresAt = rawConfirmToken
      ? new Date(Date.now() + CONFIRMATION_TTL_HOURS * 60 * 60 * 1000).toISOString()
      : null;

    db.prepare(
      `INSERT INTO users (
         id, email, email_hash, password_hash, username, role,
         email_confirmed, confirmation_token_hash, confirmation_expires_at, is_mock
       )
       VALUES (?, ?, ?, ?, ?, 'authenticated', ?, ?, ?, ?)`
    ).run(
      userId,
      cryptoCtx.encrypt(normalizedEmail),
      emailHash,
      passwordHash,
      cryptoCtx.encrypt(trimmedName),
      requireConfirmation ? 0 : 1,
      confirmTokenHash,
      confirmExpiresAt,
      isMock
    );

    db.prepare(
      `INSERT INTO participants (name, oauth_id, is_ready, is_admin, wheel_played, avatar_url)
       VALUES (?, ?, 0, 0, 0, '')`
    ).run(cryptoCtx.encrypt(trimmedName), userId);

    const userRow = db
      .prepare('SELECT id, email, username, role, email_confirmed FROM users WHERE id = ?')
      .get(userId);
    const user = buildAuthUser(userRow);

    if (requireConfirmation) {
      return {
        data: {
          user,
          session: null,
          requiresConfirmation: true,
        },
        confirmationToken: rawConfirmToken,
        error: null,
      };
    }

    const sessionToken = createSessionForUser(userId);
    return {
      data: {
        user,
        session: {
          ...sessionToken,
          user,
        },
        requiresConfirmation: false,
      },
      confirmationToken: null,
      error: null,
    };
  }

  function confirmEmail(rawToken) {
    if (!rawToken || !String(rawToken).trim()) {
      return {
        status: 400,
        data: { user: null, session: null },
        error: { message: 'Token de confirmación requerido.' },
      };
    }

    const tokenHash = cryptoCtx.hashToken(String(rawToken).trim());
    const userRow = db
      .prepare(
        `SELECT id, email, username, role, email_confirmed, confirmation_expires_at
         FROM users
         WHERE confirmation_token_hash = ?`
      )
      .get(tokenHash);

    if (!userRow) {
      return {
        status: 400,
        data: { user: null, session: null },
        error: { message: 'El enlace de confirmación no es válido o ya fue utilizado.' },
      };
    }

    if (
      userRow.confirmation_expires_at &&
      new Date(userRow.confirmation_expires_at).getTime() <= Date.now()
    ) {
      return {
        status: 400,
        data: { user: null, session: null },
        error: { message: 'El enlace de confirmación expiró. Solicita uno nuevo.' },
      };
    }

    db.prepare(
      `UPDATE users
       SET email_confirmed = 1, confirmation_token_hash = NULL, confirmation_expires_at = NULL
       WHERE id = ?`
    ).run(userRow.id);

    const updatedRow = db
      .prepare('SELECT id, email, username, role, email_confirmed FROM users WHERE id = ?')
      .get(userRow.id);
    const user = buildAuthUser(updatedRow);
    const sessionToken = createSessionForUser(updatedRow.id);

    return {
      status: 200,
      data: {
        user,
        session: {
          ...sessionToken,
          user,
        },
      },
      error: null,
    };
  }

  function createConfirmationTokenForEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { status: 400, error: { message: 'Correo electrónico requerido.' } };
    }

    const emailHash = cryptoCtx.blindIndex(normalizedEmail);
    const userRow = db
      .prepare('SELECT id, email, username, role, email_confirmed FROM users WHERE email_hash = ?')
      .get(emailHash);

    if (!userRow) {
      return { status: 404, error: { message: 'No existe una cuenta registrada con ese correo.' } };
    }

    if (userRow.email_confirmed) {
      return { status: 400, error: { message: 'Esta cuenta ya se encuentra confirmada.' } };
    }

    const rawConfirmToken = crypto.randomBytes(32).toString('hex');
    const confirmTokenHash = cryptoCtx.hashToken(rawConfirmToken);
    const confirmExpiresAt = new Date(
      Date.now() + CONFIRMATION_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();

    db.prepare(
      `UPDATE users
       SET confirmation_token_hash = ?, confirmation_expires_at = ?
       WHERE id = ?`
    ).run(confirmTokenHash, confirmExpiresAt, userRow.id);

    return {
      status: 200,
      user: buildAuthUser(userRow),
      confirmationToken: rawConfirmToken,
    };
  }

  function signIn(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const emailHash = cryptoCtx.blindIndex(normalizedEmail);
    const userRow = db
      .prepare(
        'SELECT id, email, password_hash, username, role, email_confirmed FROM users WHERE email_hash = ?'
      )
      .get(emailHash);

    if (!userRow || !cryptoCtx.verifyPassword(password, userRow.password_hash)) {
      return {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      };
    }

    if (!userRow.email_confirmed) {
      return {
        data: { user: null, session: null },
        error: { message: 'Email not confirmed' },
      };
    }

    const user = buildAuthUser(userRow);
    const sessionToken = createSessionForUser(userRow.id);

    return {
      data: {
        user,
        session: {
          ...sessionToken,
          user,
        },
      },
      error: null,
    };
  }

  function getSession(rawToken) {
    if (!rawToken) {
      return { data: { session: null }, error: null };
    }

    const tokenHash = cryptoCtx.hashToken(rawToken);
    const row = db
      .prepare(
        `SELECT s.token, s.expires_at, u.id, u.email, u.username, u.role, u.email_confirmed
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`
      )
      .get(tokenHash);

    if (!row) {
      return { data: { session: null }, error: null };
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash);
      return { data: { session: null }, error: null };
    }

    const user = buildAuthUser(row);
    return {
      data: {
        session: {
          access_token: rawToken,
          expires_at: row.expires_at,
          user,
        },
      },
      error: null,
    };
  }

  function getUserByToken(token) {
    const result = getSession(token);
    return {
      data: {
        user: result.data.session ? result.data.session.user : null,
      },
      error: null,
    };
  }

  function signOut(rawToken) {
    if (rawToken) {
      const tokenHash = cryptoCtx.hashToken(rawToken);
      db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash);
    }
    return { error: null };
  }

  function getParticipantsExcept(oauthId) {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url
         FROM participants p
         WHERE p.oauth_id IS NULL OR p.oauth_id != ?
         ORDER BY p.id ASC`
      )
      .all(oauthId || '');

    return rows.map((row) => mapParticipantRow(row));
  }

  function getAllParticipants() {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url, u.email
         FROM participants p
         LEFT JOIN users u ON u.id = p.oauth_id
         ORDER BY p.id ASC`
      )
      .all();

    return rows.map((row) =>
      mapParticipantRow(row, { includeFriend: true, includeAdmin: true, includeEmail: true })
    );
  }

  function getParticipantByOauthId(oauthId) {
    const row = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url, u.email
         FROM participants p
         LEFT JOIN users u ON u.id = p.oauth_id
         WHERE p.oauth_id = ?`
      )
      .get(oauthId);

    if (!row) {
      return null;
    }

    return mapParticipantRow(row, {
      includeFriend: true,
      includeAdmin: true,
      includeEmail: true,
    });
  }

  function updateParticipantRole(participantId, role, requesterOauthId) {
    if (!VALID_ROLES.has(role)) {
      return {
        status: 400,
        error: { message: 'Rol inválido. Debe ser admin o participant.' },
      };
    }

    const target = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url, u.email
         FROM participants p
         LEFT JOIN users u ON u.id = p.oauth_id
         WHERE p.id = ?`
      )
      .get(Number(participantId));

    if (!target) {
      return { status: 404, error: { message: 'Participante no encontrado' } };
    }

    const nextIsAdmin = role === 'admin' ? 1 : 0;

    if (nextIsAdmin === 0 && target.oauth_id && target.oauth_id === requesterOauthId) {
      return {
        status: 400,
        error: { message: 'No puedes quitarte el rol de administrador a ti mismo.' },
      };
    }

    if (nextIsAdmin === 0 && Boolean(target.is_admin)) {
      const adminCountRow = db
        .prepare('SELECT COUNT(*) AS count FROM participants WHERE is_admin = 1')
        .get();
      if (Number(adminCountRow.count) <= 1) {
        return {
          status: 400,
          error: { message: 'Debe existir al menos un administrador en el sistema.' },
        };
      }
    }

    db.prepare('UPDATE participants SET is_admin = ? WHERE id = ?').run(
      nextIsAdmin,
      Number(participantId)
    );

    const updated = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url, u.email
         FROM participants p
         LEFT JOIN users u ON u.id = p.oauth_id
         WHERE p.id = ?`
      )
      .get(Number(participantId));

    return {
      status: 200,
      data: mapParticipantRow(updated, {
        includeFriend: true,
        includeAdmin: true,
        includeEmail: true,
      }),
    };
  }

  function updateParticipantWheelByOauthId(oauthId, wheelPlayed) {
    const info = db
      .prepare('UPDATE participants SET wheel_played = ? WHERE oauth_id = ?')
      .run(wheelPlayed ? 1 : 0, oauthId);
    if (!info.changes) {
      return null;
    }
    return getParticipantByOauthId(oauthId);
  }

  function updateParticipantWheelById(participantId, wheelPlayed) {
    const info = db
      .prepare('UPDATE participants SET wheel_played = ? WHERE id = ?')
      .run(wheelPlayed ? 1 : 0, Number(participantId));
    if (!info.changes) {
      return null;
    }
    const row = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url, u.email
         FROM participants p
         LEFT JOIN users u ON u.id = p.oauth_id
         WHERE p.id = ?`
      )
      .get(Number(participantId));
    return mapParticipantRow(row, {
      includeFriend: true,
      includeAdmin: true,
      includeEmail: true,
    });
  }

  function saveParticipant({ name, oauth_id, avatarUrl }) {
    if (oauth_id) {
      const existing = db
        .prepare('SELECT id FROM participants WHERE oauth_id = ?')
        .get(oauth_id);
      if (existing) {
        return getParticipantByOauthId(oauth_id);
      }
    }

    const result = db
      .prepare(
        `INSERT INTO participants (name, oauth_id, is_ready, is_admin, wheel_played, avatar_url)
         VALUES (?, ?, 0, 0, 0, ?)`
      )
      .run(cryptoCtx.encrypt(String(name || '').trim()), oauth_id || null, avatarUrl || '');

    const row = db
      .prepare(
        `SELECT p.id, p.name, p.oauth_id, p.friend_id, p.friend_id_enc, p.is_ready, p.is_admin, p.wheel_played, p.avatar_url, u.email
         FROM participants p
         LEFT JOIN users u ON u.id = p.oauth_id
         WHERE p.id = ?`
      )
      .get(Number(result.lastInsertRowid));

    return mapParticipantRow(row, {
      includeFriend: true,
      includeAdmin: true,
      includeEmail: true,
    });
  }

  function updateParticipantReady(oauthId, isReady) {
    const info = db
      .prepare('UPDATE participants SET is_ready = ? WHERE oauth_id = ?')
      .run(isReady ? 1 : 0, oauthId);
    return { updated: info.changes };
  }

  function assignSecretSanta(assignments, options = {}) {
    if (!Array.isArray(assignments) || assignments.length < 2) {
      return {
        status: 400,
        error: { message: 'Se necesitan al menos 2 asignaciones válidas.' },
      };
    }

    const seenGivers = new Set();
    const seenReceivers = new Set();

    for (const assign of assignments) {
      const giverId = Number(assign.id);
      const receiverId = Number(assign.friend_id);

      if (!Number.isInteger(giverId) || !Number.isInteger(receiverId)) {
        return {
          status: 400,
          error: {
            message: 'Todas las asignaciones deben tener participante y amigo secreto válidos.',
          },
        };
      }
      if (giverId === receiverId) {
        return {
          status: 400,
          error: { message: 'Un participante no puede ser su propio amigo secreto.' },
        };
      }
      if (seenGivers.has(giverId)) {
        return {
          status: 400,
          error: { message: 'Hay un participante duplicado en las asignaciones.' },
        };
      }
      if (seenReceivers.has(receiverId)) {
        return {
          status: 400,
          error: {
            message: 'Un mismo amigo secreto fue asignado a más de un participante.',
          },
        };
      }
      seenGivers.add(giverId);
      seenReceivers.add(receiverId);
    }

    const preserveUnchangedWheel = Boolean(options.preserveUnchangedWheel);
    const selectCurrent = db.prepare(
      'SELECT id, friend_id, friend_id_enc, wheel_played FROM participants WHERE id = ?'
    );
    const updateStmt = db.prepare(
      'UPDATE participants SET friend_id = NULL, friend_id_enc = ?, wheel_played = ? WHERE id = ?'
    );

    const changedIds = [];

    db.exec('BEGIN');
    try {
      for (const assign of assignments) {
        const giverId = Number(assign.id);
        const receiverId = String(Number(assign.friend_id));
        const currentRow = selectCurrent.get(giverId);
        const prevFriendId = currentRow ? decodeFriendId(currentRow) : undefined;
        const unchanged = prevFriendId === receiverId;
        const nextWheelPlayed =
          preserveUnchangedWheel && unchanged ? (currentRow?.wheel_played ? 1 : 0) : 0;

        if (!unchanged || !preserveUnchangedWheel) {
          changedIds.push(String(giverId));
        }

        updateStmt.run(cryptoCtx.encrypt(receiverId), nextWheelPlayed, giverId);
      }
      db.exec('COMMIT');
      return { status: 200, data: { ok: true, changedIds } };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function getNotificationTargets(participantIds = null) {
    const all = getAllParticipants();
    const byId = new Map(all.map((p) => [p.id, p]));
    const filterSet = Array.isArray(participantIds)
      ? new Set(participantIds.map((id) => String(id)))
      : null;

    return all
      .filter((p) => Boolean(p.email) && Boolean(p.friend_id))
      .filter((p) => !filterSet || filterSet.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        friendId: p.friend_id,
        friendName: byId.get(p.friend_id)?.name || '',
      }));
  }

  function getGiftsByParticipantId(participantId) {
    const rows = db
      .prepare(
        'SELECT id, participant_id, title, store, link, removed FROM gift WHERE participant_id = ? ORDER BY id ASC'
      )
      .all(Number(participantId));
    return rows.map(mapGiftEntityRow);
  }

  function getAllGifts() {
    const rows = db
      .prepare(
        'SELECT id, participant_id, title, store, link, removed FROM gift ORDER BY id ASC'
      )
      .all();
    return rows.map(mapGiftEntityRow);
  }

  function saveGift({ participant_id, title, store, link }) {
    const result = db
      .prepare(
        `INSERT INTO gift (participant_id, title, store, link, removed)
         VALUES (?, ?, ?, ?, 0)`
      )
      .run(
        Number(participant_id),
        String(title || '').trim(),
        String(store || '').trim(),
        String(link || '').trim()
      );

    const row = db
      .prepare(
        'SELECT id, participant_id, title, store, link, removed FROM gift WHERE id = ?'
      )
      .get(Number(result.lastInsertRowid));
    return mapGiftEntityRow(row);
  }

  function updateGift(giftId, { title, store, link, removed }) {
    const info = db
      .prepare(
        `UPDATE gift
         SET title = ?, store = ?, link = ?, removed = ?
         WHERE id = ?`
      )
      .run(
        String(title || '').trim(),
        String(store || '').trim(),
        String(link || '').trim(),
        Number(removed) === 1 ? 1 : 0,
        Number(giftId)
      );

    if (!info.changes) {
      return null;
    }

    const row = db
      .prepare(
        'SELECT id, participant_id, title, store, link, removed FROM gift WHERE id = ?'
      )
      .get(Number(giftId));
    return mapGiftEntityRow(row);
  }

  function getInfoEvent() {
    const cols = ['id', ...CONFIGURABLE_EXCHANGE_FIELDS, 'email_notifications_enabled'].join(
      ', '
    );
    const row = db.prepare(`SELECT ${cols} FROM exchanges WHERE id = 1`).get();
    if (!row) {
      return null;
    }
    return {
      ...row,
      email_notifications_enabled: Boolean(row.email_notifications_enabled),
    };
  }

  function isEmailFeatureEnabled() {
    const row = db
      .prepare('SELECT email_notifications_enabled FROM exchanges WHERE id = 1')
      .get();
    if (!row) {
      return String(process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true';
    }
    return Boolean(row.email_notifications_enabled);
  }

  function updateInfoEvent(payload) {
    const current = getInfoEvent();
    if (!current) {
      return null;
    }

    const updates = [];
    const values = [];

    for (const field of CONFIGURABLE_EXCHANGE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(payload, field) && payload[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(String(payload[field]).trim());
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(payload, 'email_notifications_enabled') &&
      payload.email_notifications_enabled !== undefined
    ) {
      updates.push('email_notifications_enabled = ?');
      values.push(payload.email_notifications_enabled ? 1 : 0);
    }

    if (updates.length > 0) {
      db.prepare(`UPDATE exchanges SET ${updates.join(', ')} WHERE id = 1`).run(...values);
    }

    return getInfoEvent();
  }

  function findMockUserIds(domain = 'prueba2026.local') {
    const suffix = `@${String(domain).toLowerCase()}`;
    const rows = db.prepare('SELECT id, email, is_mock FROM users').all();
    const ids = [];
    for (const row of rows) {
      if (row.is_mock) {
        ids.push(row.id);
        continue;
      }
      const plainEmail = normalizeEmail(cryptoCtx.decrypt(row.email));
      if (plainEmail.endsWith(suffix)) {
        ids.push(row.id);
      }
    }
    return ids;
  }

  function findUserIdByEmail(email) {
    const row = db
      .prepare('SELECT id FROM users WHERE email_hash = ?')
      .get(cryptoCtx.blindIndex(normalizeEmail(email)));
    return row ? row.id : null;
  }

  function close() {
    db.close();
  }

  return {
    signUp,
    confirmEmail,
    createConfirmationTokenForEmail,
    signIn,
    getSession,
    getUserByToken,
    signOut,
    getParticipantsExcept,
    getAllParticipants,
    getParticipantByOauthId,
    saveParticipant,
    updateParticipantReady,
    updateParticipantRole,
    updateParticipantWheelByOauthId,
    updateParticipantWheelById,
    assignSecretSanta,
    getNotificationTargets,
    getGiftsByParticipantId,
    getAllGifts,
    saveGift,
    updateGift,
    getInfoEvent,
    isEmailFeatureEnabled,
    updateInfoEvent,
    findMockUserIds,
    findUserIdByEmail,
    rawDb: db,
    close,
  };
}

module.exports = {
  createDatabase,
  DEFAULT_EXCHANGE_2026,
  DEFAULT_ADMIN,
};
