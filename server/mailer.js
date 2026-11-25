'use strict';

const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(envPath) {
  const target = envPath || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(target)) {
    return;
  }
  const content = fs.readFileSync(target, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function encodeHeaderUtf8(value) {
  return `=?UTF-8?B?${Buffer.from(String(value || ''), 'utf8').toString('base64')}?=`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMimeMessage({ from, to, subject, html, text }) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const dateHeader = new Date().toUTCString();
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderUtf8(subject)}`,
    `Date: ${dateHeader}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text || '', 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html || '', 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

function createSmtpReader(socket) {
  let buffer = '';
  const queue = [];

  function pump() {
    while (queue.length > 0) {
      const lines = buffer.split('\r\n');
      if (lines.length < 2) {
        return;
      }
      // Check for final response line (NNN<space>...)
      let endIdx = -1;
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) {
        return;
      }
      const responseLines = lines.slice(0, endIdx + 1);
      buffer = lines.slice(endIdx + 1).join('\r\n');
      const code = Number(responseLines[responseLines.length - 1].slice(0, 3));
      const { resolve } = queue.shift();
      resolve({ code, text: responseLines.join('\n') });
    }
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    pump();
  });

  function readResponse() {
    return new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      socket.once('error', onError);
      queue.push({
        resolve: (res) => {
          socket.removeListener('error', onError);
          resolve(res);
        },
      });
      pump();
    });
  }

  async function command(cmd, expectedCodes) {
    socket.write(`${cmd}\r\n`);
    const res = await readResponse();
    if (!expectedCodes.includes(res.code)) {
      throw new Error(`SMTP error (${res.code}) on "${cmd.split(' ')[0]}": ${res.text}`);
    }
    return res;
  }

  return { readResponse, command };
}

async function sendViaSmtp(config, mail) {
  const port = Number(config.port || (config.secure ? 465 : 587));
  const useDirectTls = Boolean(config.secure) || port === 465;

  let socket = useDirectTls
    ? tls.connect({ host: config.host, port, servername: config.host })
    : net.connect({ host: config.host, port });

  await new Promise((resolve, reject) => {
    socket.once(useDirectTls ? 'secureConnect' : 'connect', resolve);
    socket.once('error', reject);
  });

  let reader = createSmtpReader(socket);
  const greeting = await reader.readResponse();
  if (greeting.code !== 220) {
    socket.destroy();
    throw new Error(`Unexpected SMTP greeting: ${greeting.text}`);
  }

  try {
    const ehlo = await reader.command('EHLO intercambio-local', [250]);

    if (!useDirectTls && /STARTTLS/i.test(ehlo.text)) {
      await reader.command('STARTTLS', [220]);
      socket = tls.connect({ socket, servername: config.host });
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
      });
      reader = createSmtpReader(socket);
      await reader.command('EHLO intercambio-local', [250]);
    }

    if (config.user && config.pass) {
      const authToken = Buffer.from(`\u0000${config.user}\u0000${config.pass}`, 'utf8').toString('base64');
      try {
        await reader.command(`AUTH PLAIN ${authToken}`, [235]);
      } catch {
        await reader.command('AUTH LOGIN', [334]);
        await reader.command(Buffer.from(config.user, 'utf8').toString('base64'), [334]);
        await reader.command(Buffer.from(config.pass, 'utf8').toString('base64'), [235]);
      }
    }

    const fromAddress = (config.from || config.user || 'no-reply@intercambio2026.local')
      .replace(/^.*<([^>]+)>.*$/, '$1')
      .trim();

    await reader.command(`MAIL FROM:<${fromAddress}>`, [250]);
    await reader.command(`RCPT TO:<${mail.to}>`, [250, 251]);
    await reader.command('DATA', [354]);

    const mime = buildMimeMessage({
      from: config.from || config.user || 'Intercambio Navideño 2026 <no-reply@intercambio2026.local>',
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    // Dot-stuffing per RFC 5321
    const stuffed = mime.replace(/^\./gm, '..');
    socket.write(`${stuffed}\r\n.\r\n`);
    const dataRes = await reader.readResponse();
    if (dataRes.code !== 250) {
      throw new Error(`SMTP DATA rejected (${dataRes.code}): ${dataRes.text}`);
    }

    await reader.command('QUIT', [221]).catch(() => undefined);
  } finally {
    socket.end();
  }
}

function createMailer(options = {}) {
  const outboxDir =
    options.outboxDir !== undefined
      ? options.outboxDir
      : path.join(__dirname, 'data', 'outbox');
  const sentLog = [];

  function getSmtpConfig() {
    const host = options.smtpHost ?? process.env.SMTP_HOST ?? '';
    if (!host) {
      return null;
    }
    return {
      host,
      port: options.smtpPort ?? process.env.SMTP_PORT ?? '587',
      secure: String(options.smtpSecure ?? process.env.SMTP_SECURE ?? 'false') === 'true',
      user: options.smtpUser ?? process.env.SMTP_USER ?? '',
      pass: options.smtpPass ?? process.env.SMTP_PASS ?? '',
      from:
        options.smtpFrom ??
        process.env.SMTP_FROM ??
        `Intercambio Navideño 2026 <${options.smtpUser ?? process.env.SMTP_USER ?? 'no-reply@intercambio2026.local'}>`,
    };
  }

  function isSmtpConfigured() {
    return Boolean(getSmtpConfig());
  }

  async function sendMail({ to, subject, html, text, meta = {} }) {
    const smtpConfig = getSmtpConfig();
    const record = {
      to,
      subject,
      html,
      text,
      meta,
      mode: smtpConfig ? 'smtp' : 'local-outbox',
      sentAt: new Date().toISOString(),
    };

    if (smtpConfig) {
      await sendViaSmtp(smtpConfig, { to, subject, html, text });
    } else if (outboxDir) {
      fs.mkdirSync(outboxDir, { recursive: true });
      const safeTo = String(to).replace(/[^a-zA-Z0-9@._-]/g, '_');
      const fileName = `${Date.now()}-${safeTo}.html`;
      fs.writeFileSync(path.join(outboxDir, fileName), html, 'utf8');
      record.previewFile = path.join(outboxDir, fileName);
    }

    sentLog.push(record);
    return record;
  }

  async function sendConfirmationEmail({ to, username, confirmUrl, eventConfig }) {
    const eventTitle = eventConfig?.event_title || 'Intercambio 2026';
    const subject = `🎄 Confirma tu cuenta para ${eventTitle}`;
    const text = `Hola ${username},\n\nConfirma tu cuenta para participar en ${eventTitle} entrando al siguiente enlace:\n${confirmUrl}\n\nEste enlace expira en 24 horas.`;
    const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#081421;font-family:Segoe UI,Arial,sans-serif;color:#f3f7ff;">
  <div style="max-width:560px;margin:0 auto;background:#0f2236;border:1px solid #f5c24955;border-radius:20px;padding:32px;">
    <p style="margin:0;color:#f5c249;font-size:12px;letter-spacing:2px;text-transform:uppercase;">🎄 ${escapeHtml(eventTitle)}</p>
    <h1 style="margin:12px 0 16px;font-size:24px;color:#ffffff;">¡Hola, ${escapeHtml(username)}!</h1>
    <p style="line-height:1.6;color:#d6e4f5;">
      Gracias por registrarte en <strong>${escapeHtml(eventTitle)}</strong>. Para activar tu cuenta y acceder a tu panel de regalos, confirma tu correo electrónico haciendo clic en el botón:
    </p>
    <p style="margin:28px 0;text-align:center;">
      <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 28px;border-radius:14px;background:linear-gradient(135deg,#c41e3a,#f5c249);color:#081421;font-weight:700;text-decoration:none;">
        Confirmar mi cuenta 🎁
      </a>
    </p>
    <p style="font-size:12px;color:#9bb2cc;word-break:break-all;">
      Si el botón no funciona, copia y pega este enlace:<br/>
      <a href="${escapeHtml(confirmUrl)}" style="color:#f5c249;">${escapeHtml(confirmUrl)}</a>
    </p>
    <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0;"/>
    <p style="font-size:12px;color:#8fa6bf;margin:0;">Este enlace expira en 24 horas.</p>
  </div>
</body>
</html>`;

    return sendMail({
      to,
      subject,
      html,
      text,
      meta: { type: 'registration_confirmation', confirmUrl },
    });
  }

  async function sendSecretSantaNotification({
    to,
    participantName,
    friendName,
    appUrl,
    eventConfig,
    isReassignment = false,
  }) {
    const eventTitle = eventConfig?.event_title || 'Intercambio 2026';
    const dateEvent = eventConfig?.date_event || '24 de diciembre 2026';
    const moneyEvent = eventConfig?.money_event || '$500 MXN';
    const rulesText = eventConfig?.rules_text || '';
    const includeFriendName =
      String(process.env.NOTIFY_INCLUDE_FRIEND_NAME || 'false') === 'true';
    const exchangeUrl = `${String(appUrl || 'http://localhost:4200').replace(/\/$/, '')}/intercambio`;

    const subject = isReassignment
      ? `🎁 Tu amigo secreto en ${eventTitle} fue actualizado`
      : `🎄 ¡El sorteo de ${eventTitle} está listo! Descubre a tu amigo secreto`;

    const revealLine = includeFriendName && friendName
      ? `Tu amigo secreto asignado es: ${friendName}.`
      : 'Entra a la app y gira la Ruleta Navideña para descubrir a tu amigo secreto y ver su lista de regalos.';

    const text = `Hola ${participantName},\n\n${
      isReassignment
        ? `Tu asignación del sorteo de ${eventTitle} fue actualizada.`
        : `¡El sorteo de ${eventTitle} ya fue generado!`
    }\n${revealLine}\n\nFecha del intercambio: ${dateEvent}\nPresupuesto sugerido: ${moneyEvent}\n${
      rulesText ? `Reglas: ${rulesText}\n` : ''
    }\nAccede aquí: ${exchangeUrl}`;

    const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#081421;font-family:Segoe UI,Arial,sans-serif;color:#f3f7ff;">
  <div style="max-width:560px;margin:0 auto;background:#0f2236;border:1px solid #f5c24955;border-radius:20px;padding:32px;">
    <p style="margin:0;color:#f5c249;font-size:12px;letter-spacing:2px;text-transform:uppercase;">🎅 ${escapeHtml(eventTitle)}</p>
    <h1 style="margin:12px 0 16px;font-size:24px;color:#ffffff;">
      ${isReassignment ? '¡Tu asignación fue actualizada!' : '¡Ya tenemos resultado del sorteo!'}
    </h1>
    <p style="line-height:1.6;color:#d6e4f5;">
      Hola <strong>${escapeHtml(participantName)}</strong>, ${escapeHtml(revealLine)}
    </p>
    <div style="margin:20px 0;padding:16px;border-radius:14px;background:#081421;border:1px solid #ffffff1a;">
      <p style="margin:4px 0;color:#f5c249;"><strong>📅 Intercambio:</strong> ${escapeHtml(dateEvent)}</p>
      <p style="margin:4px 0;color:#78e6b2;"><strong>💰 Presupuesto sugerido:</strong> ${escapeHtml(moneyEvent)}</p>
      ${rulesText ? `<p style="margin:8px 0 0;color:#d6e4f5;font-size:13px;">📌 ${escapeHtml(rulesText)}</p>` : ''}
    </div>
    <p style="margin:24px 0;text-align:center;">
      <a href="${escapeHtml(exchangeUrl)}" style="display:inline-block;padding:14px 28px;border-radius:14px;background:linear-gradient(135deg,#146b3a,#f5c249);color:#081421;font-weight:700;text-decoration:none;">
        Ir a mi panel y girar la ruleta 🎄
      </a>
    </p>
  </div>
</body>
</html>`;

    return sendMail({
      to,
      subject,
      html,
      text,
      meta: { type: 'secret_santa_notification', isReassignment, exchangeUrl },
    });
  }

  return {
    isSmtpConfigured,
    sendMail,
    sendConfirmationEmail,
    sendSecretSantaNotification,
    sentLog,
  };
}

module.exports = {
  loadDotEnv,
  createMailer,
  buildMimeMessage,
};
