const nodemailer = require('nodemailer');

// Gmail SMTP 설정
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Gmail 주소
    pass: process.env.EMAIL_PASSWORD // Gmail 앱 비밀번호
  }
});

// 이메일 전송 테스트
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ 이메일 설정 오류:', error);
  } else {
    console.log('✅ 이메일 서버 준비 완료');
  }
});

/**
 * 이메일 인증 코드 발송
 * @param {string} email - 수신자 이메일
 * @param {string} code - 6자리 인증 코드
 * @param {string} userName - 사용자 이름
 */
const sendVerificationEmail = async (email, code, userName = '사용자') => {
  try {
    const mailOptions = {
      from: {
        name: 'FoodieMap',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: '[FoodieMap] 이메일 인증 코드',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #ffffff;
              border-radius: 10px;
              padding: 40px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: bold;
              color: #FF6B6B;
            }
            .code-box {
              background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
              color: white;
              font-size: 36px;
              font-weight: bold;
              text-align: center;
              padding: 30px;
              border-radius: 10px;
              letter-spacing: 8px;
              margin: 30px 0;
            }
            .info {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #999;
              font-size: 12px;
            }
            .warning {
              color: #e74c3c;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🍴 FoodieMap</div>
              <h2>이메일 인증</h2>
            </div>

            <p>안녕하세요, <strong>${userName}</strong>님!</p>
            <p>FoodieMap 회원가입을 위한 이메일 인증 코드입니다.</p>

            <div class="code-box">
              ${code}
            </div>

            <div class="info">
              <p><strong>📌 안내사항</strong></p>
              <ul>
                <li>이 인증 코드는 <span class="warning">5분간 유효</span>합니다.</li>
                <li>인증 코드를 입력하여 이메일 인증을 완료해주세요.</li>
                <li>본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</li>
              </ul>
            </div>

            <p style="margin-top: 30px;">감사합니다.<br>FoodieMap 팀 드림</p>

            <div class="footer">
              <p>이 메일은 발신 전용입니다. 문의사항은 FoodieMap 고객센터를 이용해주세요.</p>
              <p>&copy; 2025 FoodieMap. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ 인증 메일 발송 성공:', email);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ 인증 메일 발송 실패:', error);
    throw error;
  }
};

/**
 * 이메일 인증 완료 알림
 * @param {string} email - 수신자 이메일
 * @param {string} userName - 사용자 이름
 */
const sendVerificationSuccessEmail = async (email, userName = '사용자') => {
  try {
    const mailOptions = {
      from: {
        name: 'FoodieMap',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: '[FoodieMap] 이메일 인증 완료',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #ffffff;
              border-radius: 10px;
              padding: 40px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .success-icon {
              text-align: center;
              font-size: 64px;
              margin: 20px 0;
            }
            .header {
              text-align: center;
              color: #27ae60;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h2 class="header">이메일 인증 완료!</h2>

            <p>안녕하세요, <strong>${userName}</strong>님!</p>
            <p>이메일 인증이 성공적으로 완료되었습니다.</p>
            <p>이제 FoodieMap의 모든 기능을 자유롭게 이용하실 수 있습니다.</p>

            <ul>
              <li>✨ 맛집 리뷰 작성</li>
              <li>💬 댓글 작성</li>
              <li>❤️ 즐겨찾기 추가</li>
              <li>🔔 알림 받기</li>
            </ul>

            <p style="margin-top: 30px;">감사합니다.<br>FoodieMap 팀 드림</p>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ 인증 완료 메일 발송 성공:', email);
    return { success: true };
  } catch (error) {
    console.error('❌ 인증 완료 메일 발송 실패:', error);
    // 인증 완료 메일은 실패해도 괜찮음 (주요 기능 아님)
    return { success: false };
  }
};

module.exports = {
  sendVerificationEmail,
  sendVerificationSuccessEmail
};