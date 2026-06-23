const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTelegramAlertMessage } = require('../lib/telegram-message');

test('builds Telegram text from the same content shown in the app toast', () => {
  const message = buildTelegramAlertMessage({
    title: '종로3가 보도블록 정비공사 (예정)',
    eventType: '보수',
    controlType: '보행우회',
    rawDateText: '2026.8.1. ~ 8.20.',
    roadName: '종로',
    agency: '서울특별시 종로구청',
    authority: '착공신고',
    sourceUrl: 'https://example.com/notice'
  }, 117);

  assert.equal(message, [
    '<b>⚠ 보행우회 구간 진입 (117m)</b>',
    '',
    '<b>종로3가 보도블록 정비공사 (예정)</b>',
    '📅 2026.8.1. ~ 8.20.',
    '유형: 보수 · 보행우회',
    '📍 종로',
    '🏛 서울특별시 종로구청 · 확정도 착공신고',
    '🔗 <a href="https://example.com/notice">원문 공고 확인</a>'
  ].join('\n'));
});

test('escapes HTML in user-controlled event fields', () => {
  const message = buildTelegramAlertMessage({
    title: '<script>alert(1)</script>',
    controlType: '차로<통제>',
    sourceUrl: 'javascript:alert(1)'
  }, 7);

  assert.doesNotMatch(message, /<script>/);
  assert.match(message, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(message, /javascript:alert/);
});
