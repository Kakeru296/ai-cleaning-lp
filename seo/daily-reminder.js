'use strict';

// 毎日10:00 JST: 今日の記事数通知 + アウトリーチリマインダーをメールで送信
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const BLOG_DIR = path.join(__dirname, '..', 'blog');

const CITIES = ['千葉市', '船橋市', '柏市', '松戸市', '市川市', '浦安市', '習志野市', '四街道市', '佐倉市', '八千代市'];
const TARGETS = ['ハウスクリーニング', 'エアコンクリーニング', '清掃会社', 'リフォーム', '便利屋'];

function countToday() {
  const today = new Date().toISOString().split('T')[0];
  return fs.readdirSync(BLOG_DIR)
    .filter(f => f.startsWith(today) && f.endsWith('.html'))
    .length;
}

function countTotal() {
  return fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').length;
}

function todayTarget() {
  const day = new Date().getDay();
  return {
    city: CITIES[day % CITIES.length],
    keyword: TARGETS[day % TARGETS.length]
  };
}

async function sendEmail(user, pass, subject, body) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
  await transporter.sendMail({ from: user, to: user, subject, text: body });
}

async function main() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASS;
  if (!gmailUser || !gmailPass) { console.log('GMAIL_USER/GMAIL_APP_PASS 未設定 → スキップ'); return; }

  const todayCount = countToday();
  const totalCount = countTotal();
  const { city, keyword } = todayTarget();
  const date = new Date().toISOString().split('T')[0];

  let body = `おはようございます！ ${date}\n`;
  body += `${'─'.repeat(30)}\n`;
  body += `今日の記事: ${todayCount}本生成\n`;
  body += `累計: ${totalCount}本\n\n`;
  body += `今日のアウトリーチ先\n`;
  body += `  「${keyword} ${city}」\n\n`;
  body += `アクションリスト\n`;
  body += `  1. Coconalaメッセージ確認\n`;
  body += `     https://coconala.com/mypage/dashboard\n`;
  body += `  2. ${city}の${keyword}業者に電話 or DM\n`;
  body += `     Googleマップ: https://maps.google.com/?q=${encodeURIComponent(keyword + ' ' + city)}\n`;
  body += `  3. くらしのマーケットDM 5社\n`;
  body += `     https://www.curama.jp/cleaning/list/\n\n`;
  body += `${'─'.repeat(30)}\n`;
  body += `目標: 今日1件問い合わせ獲得！\n`;
  body += `LP: https://kakeru296.github.io/ai-cleaning-lp/\n`;

  console.log(body);
  await sendEmail(gmailUser, gmailPass, `【日次】${date} 記事${todayCount}本 / アウトリーチ: ${city}`, body);
  console.log('✓ 朝のリマインダー送信完了 → ' + gmailUser);
}

main().catch(console.error);
