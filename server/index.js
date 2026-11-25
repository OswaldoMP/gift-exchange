'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, createMailer } = require('./mailer');

loadDotEnv();

const { createDatabase, DEFAULT_ADMIN } = require('./db');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function extractBearerToken(req, urlObj) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return urlObj.searchParams.get('token') || '';
}

function tryServeStatic(req, res, staticDir, pathname) {
  if (!staticDir || !fs.existsSync(staticDir)) {
    return false;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const safePath = path
    .normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(staticDir, safePath === '/' ? 'index.html' : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(staticDir, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
  });
  if (req.method === 'HEAD') {
    res.end();
  } else {
    res.end(content);
  }
  return true;
}

function createServer(db, options = {}) {
  const staticDir =
    options.staticDir !== undefined
      ? options.staticDir
      : path.join(__dirname, '..', 'dist', 'exchange-client', 'browser');
  const mailer = options.mailer || createMailer();

  function getAppUrl(req) {
    if (options.appUrl) return options.appUrl;
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const origin = req.headers.origin;
    if (origin && /^https?:\/\//i.test(origin)) {
      return origin.replace(/\/$/, '');
    }
    return 'http://localhost:4200';
  }

  async function notifySecretSantaTargets(req, participantIds, isReassignment) {
    if (!db.isEmailFeatureEnabled()) {
      return {
        notifiedCount: 0,
        emailMode: 'disabled',
      };
    }

    const targets = db.getNotificationTargets(participantIds);
    const eventConfig = db.getInfoEvent();
    const appUrl = getAppUrl(req);
    let notifiedCount = 0;

    for (const target of targets) {
      try {
        await mailer.sendSecretSantaNotification({
          to: target.email,
          participantName: target.name,
          friendName: target.friendName,
          appUrl,
          eventConfig,
          isReassignment,
        });
        notifiedCount += 1;
      } catch (err) {
        console.error(`[Mailer] Error notifying ${target.id}:`, err.message);
      }
    }

    return {
      notifiedCount,
      emailMode: mailer.isSmtpConfigured() ? 'smtp' : 'local-outbox',
    };
  }

  function requireAdmin(req, res, urlObj) {
    const token = extractBearerToken(req, urlObj);
    const sessionRes = db.getSession(token);
    const userId = sessionRes.data.session?.user?.id;
    if (!userId) {
      sendJson(res, 401, { error: { message: 'Unauthorized' } });
      return null;
    }
    const requester = db.getParticipantByOauthId(userId);
    if (!requester || !requester.is_admin) {
      sendJson(res, 403, { error: { message: 'Forbidden: admin required' } });
      return null;
    }
    return { userId, requester };
  }

  return http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    try {
      // Health check
      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { status: 'ok', event: 'Intercambio Navideño 2026' });
        return;
      }

      // Auth routes
      if (method === 'POST' && pathname === '/api/auth/signup') {
        const body = await readJsonBody(req);
        const result = db.signUp(body.email, body.password, body.username);
        if (result.error) {
          sendJson(res, 400, { data: result.data, error: result.error });
          return;
        }

        let emailSent = false;
        let confirmationPreviewUrl;
        const emailEnabled = db.isEmailFeatureEnabled();

        if (emailEnabled && result.data.requiresConfirmation && result.confirmationToken) {
          const confirmUrl = `${getAppUrl(req)}/login?confirmToken=${encodeURIComponent(
            result.confirmationToken
          )}`;
          try {
            await mailer.sendConfirmationEmail({
              to: result.data.user.email,
              username: result.data.user.user_metadata.username,
              confirmUrl,
              eventConfig: db.getInfoEvent(),
            });
            emailSent = true;
            if (!mailer.isSmtpConfigured()) {
              confirmationPreviewUrl = confirmUrl;
              console.log(
                `[Intercambio 2026] Correo de confirmación (modo local) -> ${confirmUrl}`
              );
            }
          } catch (mailError) {
            console.error('[Mailer] Error sending confirmation email:', mailError.message);
          }
        }

        sendJson(res, 201, {
          data: {
            ...result.data,
            emailSent,
            emailMode: !emailEnabled
              ? 'disabled'
              : mailer.isSmtpConfigured()
                ? 'smtp'
                : 'local-outbox',
            ...(confirmationPreviewUrl ? { confirmationPreviewUrl } : {}),
          },
          error: null,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/confirm') {
        const body = await readJsonBody(req);
        const result = db.confirmEmail(body.token);
        sendJson(res, result.status, { data: result.data, error: result.error });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/resend-confirmation') {
        if (!db.isEmailFeatureEnabled()) {
          sendJson(res, 200, {
            ok: false,
            emailMode: 'disabled',
            error: { message: 'El envío de correos está desactivado en la configuración.' },
          });
          return;
        }
        const body = await readJsonBody(req);
        const result = db.createConfirmationTokenForEmail(body.email);
        if (result.error) {
          sendJson(res, result.status, { error: result.error });
          return;
        }

        const confirmUrl = `${getAppUrl(req)}/login?confirmToken=${encodeURIComponent(
          result.confirmationToken
        )}`;
        await mailer.sendConfirmationEmail({
          to: result.user.email,
          username: result.user.user_metadata.username,
          confirmUrl,
          eventConfig: db.getInfoEvent(),
        });

        sendJson(res, 200, {
          ok: true,
          emailMode: mailer.isSmtpConfigured() ? 'smtp' : 'local-outbox',
          ...(!mailer.isSmtpConfigured() ? { confirmationPreviewUrl: confirmUrl } : {}),
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/signin') {
        const body = await readJsonBody(req);
        const result = db.signIn(body.email, body.password);
        const status = result.error
          ? result.error.message === 'Email not confirmed'
            ? 403
            : 401
          : 200;
        sendJson(res, status, result);
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/signout') {
        const token = extractBearerToken(req, urlObj);
        const result = db.signOut(token);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' && pathname === '/api/auth/session') {
        const token = extractBearerToken(req, urlObj);
        const result = db.getSession(token);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' && pathname === '/api/auth/user') {
        const token = extractBearerToken(req, urlObj);
        const result = db.getUserByToken(token);
        sendJson(res, 200, result);
        return;
      }

      // Exchange event info
      if (method === 'GET' && pathname === '/api/exchanges/current') {
        const exchange = db.getInfoEvent();
        if (!exchange) {
          sendJson(res, 404, { error: { message: 'Exchange not found' } });
          return;
        }
        sendJson(res, 200, exchange);
        return;
      }

      if (method === 'PUT' && pathname === '/api/exchanges/current') {
        if (!requireAdmin(req, res, urlObj)) return;
        const body = await readJsonBody(req);
        const updated = db.updateInfoEvent(body);
        if (!updated) {
          sendJson(res, 404, { error: { message: 'Exchange not found' } });
          return;
        }
        sendJson(res, 200, updated);
        return;
      }

      // Participants routes
      if (method === 'GET' && pathname === '/api/participants') {
        const excludeOauthId = urlObj.searchParams.get('excludeOauthId');
        const list = excludeOauthId
          ? db.getParticipantsExcept(excludeOauthId)
          : db.getAllParticipants();
        sendJson(res, 200, list);
        return;
      }

      const participantByOauthMatch = pathname.match(
        /^\/api\/participants\/by-oauth\/([^/]+)$/
      );
      if (method === 'GET' && participantByOauthMatch) {
        const oauthId = decodeURIComponent(participantByOauthMatch[1]);
        const participant = db.getParticipantByOauthId(oauthId);
        if (!participant) {
          sendJson(res, 404, { error: { message: 'Participant not found' } });
          return;
        }
        sendJson(res, 200, participant);
        return;
      }

      if (method === 'POST' && pathname === '/api/participants') {
        const body = await readJsonBody(req);
        const saved = db.saveParticipant({
          name: body.name,
          oauth_id: body.oauth_id,
          avatarUrl: body.avatarUrl,
        });
        sendJson(res, 201, saved);
        return;
      }

      const participantReadyMatch = pathname.match(
        /^\/api\/participants\/by-oauth\/([^/]+)\/ready$/
      );
      if (method === 'PATCH' && participantReadyMatch) {
        const oauthId = decodeURIComponent(participantReadyMatch[1]);
        const body = await readJsonBody(req);
        const result = db.updateParticipantReady(oauthId, Boolean(body.is_ready));
        sendJson(res, 200, result);
        return;
      }

      const participantWheelByOauthMatch = pathname.match(
        /^\/api\/participants\/by-oauth\/([^/]+)\/wheel$/
      );
      if (method === 'PATCH' && participantWheelByOauthMatch) {
        const token = extractBearerToken(req, urlObj);
        const sessionRes = db.getSession(token);
        const sessionUserId = sessionRes.data.session?.user?.id;
        if (!sessionUserId) {
          sendJson(res, 401, { error: { message: 'Unauthorized' } });
          return;
        }
        const oauthId = decodeURIComponent(participantWheelByOauthMatch[1]);
        const requester = db.getParticipantByOauthId(sessionUserId);
        if (sessionUserId !== oauthId && !requester?.is_admin) {
          sendJson(res, 403, { error: { message: 'Forbidden' } });
          return;
        }
        const body = await readJsonBody(req);
        const updated = db.updateParticipantWheelByOauthId(
          oauthId,
          Boolean(body.wheel_played)
        );
        if (!updated) {
          sendJson(res, 404, { error: { message: 'Participant not found' } });
          return;
        }
        sendJson(res, 200, updated);
        return;
      }

      const participantWheelByIdMatch = pathname.match(
        /^\/api\/participants\/(\d+)\/wheel$/
      );
      if (method === 'PATCH' && participantWheelByIdMatch) {
        if (!requireAdmin(req, res, urlObj)) return;
        const participantId = participantWheelByIdMatch[1];
        const body = await readJsonBody(req);
        const updated = db.updateParticipantWheelById(
          participantId,
          Boolean(body.wheel_played)
        );
        if (!updated) {
          sendJson(res, 404, { error: { message: 'Participant not found' } });
          return;
        }
        sendJson(res, 200, updated);
        return;
      }

      const participantRoleMatch = pathname.match(/^\/api\/participants\/(\d+)\/role$/);
      if (method === 'PATCH' && participantRoleMatch) {
        const auth = requireAdmin(req, res, urlObj);
        if (!auth) return;
        const participantId = participantRoleMatch[1];
        const body = await readJsonBody(req);
        const result = db.updateParticipantRole(participantId, body.role, auth.userId);
        sendJson(res, result.status, result.error ? { error: result.error } : result.data);
        return;
      }

      if (method === 'POST' && pathname === '/api/participants/assign') {
        if (!requireAdmin(req, res, urlObj)) return;
        const body = await readJsonBody(req);
        if (!Array.isArray(body.assignments)) {
          sendJson(res, 400, { error: { message: 'assignments array required' } });
          return;
        }
        const preserveUnchangedWheel = Boolean(body.preserveUnchangedWheel);
        const result = db.assignSecretSanta(body.assignments, {
          preserveUnchangedWheel,
        });
        if (result.error) {
          sendJson(res, result.status, { error: result.error });
          return;
        }

        const shouldNotify = body.sendNotifications !== false && db.isEmailFeatureEnabled();
        let notifyInfo = {
          notifiedCount: 0,
          emailMode: !db.isEmailFeatureEnabled()
            ? 'disabled'
            : mailer.isSmtpConfigured()
              ? 'smtp'
              : 'local-outbox',
        };
        if (shouldNotify && result.data.changedIds.length > 0) {
          notifyInfo = await notifySecretSantaTargets(
            req,
            result.data.changedIds,
            preserveUnchangedWheel
          );
        }

        sendJson(res, 200, {
          ok: true,
          ...notifyInfo,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/participants/notify-draw') {
        if (!requireAdmin(req, res, urlObj)) return;
        const body = await readJsonBody(req);
        const targetIds = body.participantId ? [String(body.participantId)] : null;
        const notifyInfo = await notifySecretSantaTargets(
          req,
          targetIds,
          Boolean(body.isReassignment)
        );
        sendJson(res, 200, { ok: true, ...notifyInfo });
        return;
      }

      // Gifts routes
      if (method === 'GET' && pathname === '/api/gifts') {
        const participantId = urlObj.searchParams.get('participantId');
        const gifts = participantId
          ? db.getGiftsByParticipantId(participantId)
          : db.getAllGifts();
        sendJson(res, 200, gifts);
        return;
      }

      if (method === 'POST' && pathname === '/api/gifts') {
        const body = await readJsonBody(req);
        if (!body.participant_id || !body.title) {
          sendJson(res, 400, {
            error: { message: 'participant_id and title are required' },
          });
          return;
        }
        const created = db.saveGift({
          participant_id: body.participant_id,
          title: body.title,
          store: body.store,
          link: body.link,
        });
        sendJson(res, 201, created);
        return;
      }

      const giftByIdMatch = pathname.match(/^\/api\/gifts\/(\d+)$/);
      if (method === 'PUT' && giftByIdMatch) {
        const giftId = giftByIdMatch[1];
        const body = await readJsonBody(req);
        const updated = db.updateGift(giftId, {
          title: body.title,
          store: body.store,
          link: body.link,
          removed: body.removed,
        });
        if (!updated) {
          sendJson(res, 404, { error: { message: 'Gift not found' } });
          return;
        }
        sendJson(res, 200, updated);
        return;
      }

      // Non-API requests: try serving Angular production build if present
      if (!pathname.startsWith('/api/')) {
        if (tryServeStatic(req, res, staticDir, pathname)) {
          return;
        }
      }

      sendJson(res, 404, { error: { message: 'Route not found' } });
    } catch (error) {
      console.error('[LocalServer] Error handling request:', error);
      const status = error.message === 'Invalid JSON payload' ? 400 : 500;
      sendJson(res, status, { error: { message: error.message || 'Internal server error' } });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const db = createDatabase();
  const server = createServer(db);

  server.listen(port, host, () => {
    console.log(`[Intercambio 2026] Servidor SQLite local escuchando en http://${host}:${port}`);
    console.log(`[Intercambio 2026] Usuario admin por defecto: ${DEFAULT_ADMIN.email}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createServer };
