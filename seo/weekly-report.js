'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

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

  const state = loadState();
  const total = countArticles();
  const thisWeek = countThisWeek();
  const date = new Date().toISOString().split('T')[0];

  let body = `週次ビジネスレポート ${date}\n`;
  body += `${'─'.repeat(30)}\n`;
  body += `ブログ記事総数: ${total}本\n`;
  body += `今週追加: ${thisWeek}本\n`;

  const gsc = state.gsc;
  if (gsc && gsc.pages && gsc.pages.length > 0) {
    const clicks = gsc.pages.reduce((s, p) => s + p.clicks, 0);
    const imp = gsc.pages.reduce((s, p) => s + p.impressions, 0);
    const ctr = imp > 0 ? (clicks / imp * 100).toFixed(1) : 0;
    const pos = (gsc.pages.reduce((s, p) => s + p.position, 0) / gsc.pages.length).toFixed(1);
    body += `\nGSCデータ（28日間）\n`;
    body += `  表示回数: ${imp.toLocaleString()}\n`;
    body += `  クリック: ${clicks}\n`;
    body += `  CTR: ${ctr}% / 平均順位: ${pos}位\n`;
    body += `  インデックスページ数: ${gsc.pages.length}\n`;

    const top = [...gsc.pages].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
    if (top.length) {
      body += `\n人気記事トップ5\n`;
      top.forEach((p, i) => {
        const name = (p.url.split('/blog/')[1] || p.url).substring(0, 40);
        body += `  ${i + 1}. ${name} (${p.clicks}click / imp${p.impressions})\n`;
      });
    }
  } else {
    body += `\nGSC: データ蓄積中（インデックス後1〜4週で表示）\n`;
  }

  body += `\n${'─'.repeat(30)}\n`;
  body += `毎朝25記事自動生成中\n`;
  body += `今週のToDo: 電話orDM 10社\n`;
  body += `LP: https://kakeru296.github.io/ai-cleaning-lp/\n`;

  console.log(body);
  await sendEmail(gmailUser, gmailPass, `【週次レポート】${date} 記事${total}本`, body);
  console.log('✓ メール送信完了 → ' + gmailUser);
}

main().catch(console.error);
