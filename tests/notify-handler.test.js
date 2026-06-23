const test = require('node:test');
const assert = require('node:assert/strict');

const notify = require('../api/notify');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

test('sends Korean Telegram text intact when request body is a UTF-8 buffer', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChat = process.env.TELEGRAM_CHAT_ID;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(options);
    return {
      ok: true,
      json: async () => ({ ok: true })
    };
  };
  process.env.TELEGRAM_BOT_TOKEN = 'token';
  process.env.TELEGRAM_CHAT_ID = '123';

  try {
    const body = Buffer.from(JSON.stringify({
      event: {
        title: '세종대로 사거리 차로 부분통제',
        eventType: '부분통제',
        controlType: '차로통제',
        rawDateText: '2026.6.15.(월) ~ 7.10.(금) 주간',
        roadName: '세종대로',
        agency: '서울특별시 종로구청',
        authority: '행정고시',
        sourceUrl: 'https://www.open.go.kr/'
      },
      distanceMeters: 113
    }), 'utf8');
    const res = createResponse();

    await notify({ method: 'POST', body }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers['content-type'], 'application/json; charset=utf-8');
    const telegramBody = JSON.parse(requests[0].body);
    assert.match(telegramBody.text, /세종대로 사거리 차로 부분통제/);
    assert.match(telegramBody.text, /서울특별시 종로구청/);
    assert.doesNotMatch(telegramBody.text, /ì|ê|ë|Ã|Â/);
  } finally {
    global.fetch = previousFetch;
    if (previousToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousChat == null) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = previousChat;
  }
});
