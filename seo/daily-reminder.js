'use strict';

// 毎日09:00 JST: フリーランス4アクション + アウトリーチリマインダー
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const https = require('https');

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

async function sendNtfy(topic, title, message) {
  return new Promise((resolve) => {
    const data = Buffer.from(message);
    const req = https.request({
      hostname: 'ntfy.sh',
      path: `/${topic}`,
      method: 'POST',
      headers: {
        'Title': title,
        'Content-Type': 'text/plain',
        'Content-Length': data.length
      }
    }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.write(data);
    req.end();
  });
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

  const ntfyTopic = process.env.NTFY_TOPIC || 'kakeru-freelance';

  // ntfy.sh プッシュ通知（4アクション）
  const ntfyMsg =
    `📋 今日の4アクション\n` +
    `1️⃣ Lancers 新着5件に提案\n   https://www.lancers.jp/work/search?sort=new&open=1\n` +
    `2️⃣ Coconala 新着5件に応募\n   https://coconala.com/requests/categories/11?order=new\n` +
    `3️⃣ CrowdWorks 新着3件に提案\n   https://crowdworks.jp/public/jobs/search?order=new\n` +
    `4️⃣ ミツモア 見積り確認\n   https://www.meetsmore.com/lancer/\n` +
    `\n📰 SEO記事: 今日${todayCount}本 / 累計${totalCount}本`;
  await sendNtfy(ntfyTopic, `【毎朝9時】フリーランス4アクション`, ntfyMsg);
  console.log('✓ ntfy.sh 通知送信完了');

  let body = `おはようございます！ ${date}\n`;
  body += `${'─'.repeat(30)}\n`;
  body += `▼ 今日の4アクション（フリーランス）\n\n`;
  body += `1. Lancers 新着案件5件に提案\n`;
  body += `   https://www.lancers.jp/work/search?sort=new&open=1\n\n`;
  body += `2. Coconala 新着案件5件に応募\n`;
  body += `   IT相談: https://coconala.com/requests/categories/11?order=new\n`;
  body += `   AI活用: https://coconala.com/requests/categories/28?order=new\n`;
  body += `   Web制作: https://coconala.com/requests/categories/22?order=new\n\n`;
  body += `3. CrowdWorks 新着案件3件に提案\n`;
  body += `   https://crowdworks.jp/public/jobs/search?order=new\n\n`;
  body += `4. ミツモア 見積り・問い合わせ確認\n`;
  body += `   https://www.meetsmore.com/lancer/\n\n`;
  body += `${'─'.repeat(30)}\n`;
  body += `今日の記事: ${todayCount}本生成 / 累計: ${totalCount}本\n`;
  body += `今日のアウトリーチ先: 「${keyword} ${city}」\n`;
  body += `目標: 今日1件問い合わせ獲得！\n`;

  console.log(body);
  await sendEmail(gmailUser, gmailPass, `【毎朝】${date} 4アクション / 記事${todayCount}本`, body);
  console.log('✓ 朝のリマインダー送信完了 → ' + gmailUser);
}

main().catch(console.error);
