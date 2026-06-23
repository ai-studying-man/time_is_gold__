// GET /api/config
// 클라이언트에 전달해도 되는 "공개" 설정만 반환한다.
//  - KAKAO_JS_KEY : Kakao 지도 JavaScript 키(도메인 제한으로 보호되는 공개키)
//  - telegramEnabled : 텔레그램 푸시 사용 가능 여부 (토큰/챗ID 노출 없이 boolean 만)
// 비밀값(TELEGRAM_BOT_TOKEN 등)은 절대 반환하지 않는다.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    kakaoJsKey: process.env.KAKAO_JS_KEY || '',
    telegramEnabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  });
};
