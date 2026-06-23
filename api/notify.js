const { buildTelegramAlertMessage } = require('./telegram-message');

// 서버에서만 텔레그램 봇 토큰을 사용해 메시지를 전송한다(토큰은 클라이언트로 나가지 않음).
// 환경변수 미설정 시에는 200 + {ok:false, skipped:true} 로 조용히 통과(앱 자체 알림이 대체).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    res.status(200).json({ ok: false, skipped: true, reason: 'telegram env 미설정' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  const event = body && typeof body.event === 'object' ? body.event : {};
  const text = buildTelegramAlertMessage(event, body.distanceMeters);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: false })
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.ok && data && data.ok ? 200 : 502).json({ ok: !!(data && data.ok) });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'telegram send failed' });
  } finally {
    clearTimeout(timeout);
  }
};
