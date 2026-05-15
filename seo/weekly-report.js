'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const BLOG_DIR = path.join(__dirname, '..', 'blog');
const STATE_FILE = path.join(__dirname, 'state.json');

function countArticles() {
  return fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html') && f !== 'index.html').length;
}

function countThisWeek() {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  return fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html' && f >= weekAgo)
    .length;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { generated: [], gsc: null };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
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
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) { console.log('LINE_NOTIFY_TOKEN 未設定 → スキップ'); return; }

  const state = loadState();
  const total = countArticles();
  const thisWeek = countThisWeek();
  const date = new Date().toISOString().split('T')[0];

  let msg = `\n📊 週次レポート ${date}\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📝 記事総数: ${total}本\n`;
  msg += `📅 今週追加: ${thisWeek}本\n`;

  const gsc = state.gsc;
  if (gsc && gsc.pages && gsc.pages.length > 0) {
    const clicks = gsc.pages.reduce((s, p) => s + p.clicks, 0);
    const imp = gsc.pages.reduce((s, p) => s + p.impressions, 0);
    const ctr = imp > 0 ? (clicks / imp * 100).toFixed(1) : 0;
    const pos = (gsc.pages.reduce((s, p) => s + p.position, 0) / gsc.pages.length).toFixed(1);
    msg += `\n🔍 GSC（28日間）\n`;
    msg += `  表示: ${imp.toLocaleString()}回\n`;
    msg += `  クリック: ${clicks}回\n`;
    msg += `  CTR: ${ctr}% / 平均順位: ${pos}位\n`;

    const top = [...gsc.pages].sort((a, b) => b.clicks - a.clicks).slice(0, 3);
    if (top.length) {
      msg += `🏆 人気記事トップ3\n`;
      top.forEach((p, i) => {
        const name = (p.url.split('/blog/')[1] || p.url).substring(0, 25);
        msg += `  ${i + 1}. ${name} (${p.clicks}click)\n`;
      });
    }
  } else {
    msg += `\n📊 GSC: データ蓄積中...\n`;
  }

  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `✅ 毎朝25記事自動生成中\n`;
  msg += `💡 今週のToDo: 電話orDM 10社`;

  console.log(msg);
  await sendLine(token, msg);
  console.log('✓ LINE通知送信完了');
}

main().catch(console.error);
