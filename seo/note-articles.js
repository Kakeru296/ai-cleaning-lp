'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, 'note-drafts');
const LP_URL = 'https://kakeru296.github.io/ai-cleaning-lp/';

const NOTE_KEYWORDS = [
  { kw: 'ハウスクリーニング LINE 通知 自動化 方法', intent: 'how-to' },
  { kw: 'GAS Googleフォーム LINE 通知 自動 設定', intent: 'how-to' },
  { kw: '清掃会社 自動見積もり スマホ 作り方', intent: 'how-to' },
  { kw: 'Make.com LINE 問い合わせ 自動化 初心者', intent: 'how-to' },
  { kw: 'サービス業 夜間 問い合わせ 取りこぼし 解決', intent: 'problem' },
  { kw: 'ハウスクリーニング 集客 ホームページ 改善', intent: 'info' },
  { kw: '便利屋 問い合わせ 自動返信 LINE 設定', intent: 'how-to' },
  { kw: '清掃会社 Googleマップ 上位表示 MEO 対策', intent: 'how-to' },
  { kw: 'エアコンクリーニング 夏前 集客 LINE 活用', intent: 'info' },
  { kw: '害虫駆除 緊急 問い合わせ 24時間 対応 仕組み', intent: 'how-to' },
  { kw: 'リフォーム会社 問い合わせ 自動化 費用 相場', intent: 'info' },
  { kw: 'ネイルサロン LINE予約 自動化 無料 設定方法', intent: 'how-to' },
];

function loadState() {
  const f = path.join(__dirname, 'note-state.json');
  if (!fs.existsSync(f)) return { posted: [] };
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(path.join(__dirname, 'note-state.json'), JSON.stringify(state, null, 2));
}

async function generateArticle(keyword, intent) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intentMap = { 'how-to': '手順を示す実践ガイド', 'info': '情報提供記事', 'problem': '課題解決記事' };

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `note.comに投稿するブログ記事をJSON形式で書いてください。

キーワード: ${keyword}
スタイル: ${intentMap[intent] || '情報提供記事'}
文字数: 800〜1000文字
対象: ハウスクリーニング・サービス業の経営者

要件:
- タイトルはキーワードを含む（30文字以内）
- 冒頭で読者の悩みに共感
- 具体的な数字・手順を含める
- 見出しは ## を使う
- 末尾に「詳しくはこちら → ${LP_URL}」を追加

{"title": "タイトル", "content": "本文（Markdown）"}`
    }]
  });

  const match = res.content[0].text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found');
  return JSON.parse(match[0]);
}

async function sendEmail(user, pass, subject, body) {
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await t.sendMail({ from: user, to: user, subject, text: body });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.log('ANTHROPIC_API_KEY 未設定'); return; }

  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  const state = loadState();
  const posted = new Set(state.posted);
  const remaining = NOTE_KEYWORDS.filter(k => !posted.has(k.kw));

  if (remaining.length === 0) {
    state.posted = [];
    saveState(state);
    console.log('全キーワード完了。リセットしました。');
    return;
  }

  const target = remaining[0];
  console.log(`生成中: ${target.kw}`);

  const article = await generateArticle(target.kw, target.intent);
  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-note.md`;
  const content = `# ${article.title}\n\n${article.content}`;

  fs.writeFileSync(path.join(DRAFTS_DIR, filename), content);
  console.log(`✓ 保存: seo/note-drafts/${filename}`);

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASS;
  if (gmailUser && gmailPass) {
    const body = `📝 今週のnote記事が生成されました！\n\n` +
      `タイトル: ${article.title}\n` +
      `キーワード: ${target.kw}\n\n` +
      `━━━ 記事内容 ━━━\n\n${article.content}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `👆 note.comにコピペして投稿してください（3分）\nhttps://note.com/`;
    await sendEmail(gmailUser, gmailPass, `【note記事】${article.title}`, body);
    console.log('✓ メール送信完了');
  }

  state.posted.push(target.kw);
  saveState(state);
  console.log(`完了: "${article.title}"`);
}

main().catch(console.error);
