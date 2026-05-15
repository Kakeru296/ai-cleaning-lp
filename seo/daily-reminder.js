'use strict';

// 毎日10:00 JST: 今日の記事数通知 + アウトリーチリマインダーをLINEに送信
const fs = require('fs');
const path = require('path');
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

function sendLine(token, message) {
  const body = 'message=' + encodeURIComponent(message);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'notify-api.line.me',
      path: '/api/notify',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) { console.log('LINE_NOTIFY_TOKEN 未設定'); return; }

  const todayCount = countToday();
  const totalCount = countTotal();
  const { city, keyword } = todayTarget();
  const date = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  let msg = `\n🌅 おはようございます！${date}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📝 今日の記事: ${todayCount}本\n`;
  msg += `📚 累計: ${totalCount}本\n`;
  msg += `\n📍 今日のアウトリーチ先\n`;
  msg += `  「${keyword} ${city}」\n`;
  msg += `\n✅ アクションリスト\n`;
  msg += `  1⃣ Coconalaメッセージ確認\n`;
  msg += `  2⃣ ${city}の${keyword}業者\n`;
  msg += `     に電話 or DM\n`;
  msg += `  3⃣ くらしのマーケットDM 5社\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `💰 目標: 今日1件問い合わせ獲得！`;

  console.log(msg);
  await sendLine(token, msg);
  console.log('✓ 朝のリマインダー送信完了');
}

main().catch(console.error);
