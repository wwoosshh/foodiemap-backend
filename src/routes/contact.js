const express = require('express');
const router = express.Router();
const { sendContactEmail } = require('../utils/emailService');

/**
 * POST /api/contact
 * 문의하기 이메일 발송
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // 입력 검증
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: '모든 필드를 입력해주세요.'
      });
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: '올바른 이메일 주소를 입력해주세요.'
      });
    }

    // 이메일 발송
    await sendContactEmail({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim()
    });

    res.json({
      success: true,
      message: '문의가 성공적으로 전송되었습니다.'
    });

  } catch (error) {
    console.error('문의 처리 오류:', error);
    res.status(500).json({
      success: false,
      message: '문의 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    });
  }
});

module.exports = router;
