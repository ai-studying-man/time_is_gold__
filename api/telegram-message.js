function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function text(value, fallback = '') {
  const trimmed = String(value == null ? '' : value).trim();
  return trimmed || fallback;
}

function dateRange(event) {
  if (text(event.rawDateText)) return text(event.rawDateText);
  const start = text(event.startDate, '?');
  const end = text(event.endDate, '?');
  return `${start} ~ ${end}${text(event.timeText) ? ` (${text(event.timeText)})` : ''}`;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function buildTelegramAlertMessage(event, distanceMeters) {
  const distance = Number.isFinite(Number(distanceMeters))
    ? Math.max(0, Math.round(Number(distanceMeters)))
    : 0;
  const title = text(event.title, text(event.eventType, '공사 알림'));
  const eventType = text(event.eventType, '-');
  const controlType = text(event.controlType, '공사');
  const location = text(event.roadName, text(event.location, '-'));
  const agency = text(event.agency, '-');
  const authority = text(event.authority);
  const sourceUrl = safeHttpUrl(event.sourceUrl);

  const lines = [
    `⚠️ <b>${escapeHtml(controlType)} 구간 진입 (${distance}m)</b>`,
    '',
    `<b>${escapeHtml(title)}</b>`,
    `📅 <b>${escapeHtml(dateRange(event))}</b>`,
    `유형: ${escapeHtml(eventType)} · ${escapeHtml(controlType)}`,
    `📍 ${escapeHtml(location)}`,
    `🏛 ${escapeHtml(agency)}${authority ? ` · 확정도 ${escapeHtml(authority)}` : ''}`
  ];

  if (sourceUrl) {
    lines.push(`🔗 <a href="${escapeHtml(sourceUrl)}">원문 공고 확인</a>`);
  }

  return lines.join('\n').slice(0, 3500);
}

module.exports = { buildTelegramAlertMessage };
