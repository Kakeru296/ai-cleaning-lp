'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, 'note-drafts');
const LP_URL = 'https://kakeru296.github.io/ai-cleaning-lp/';
const ARTICLES_PER_RUN = 5;

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
  { kw: '美容室 ホームページ 予約 自動化 LINE連携', intent: 'how-to' },
  { kw: '整体院 問い合わせ 自動返信 予約管理 効率化', intent: 'how-to' },
  { kw: 'ペットサロン 予約 LINE 自動化 集客', intent: 'how-to' },
  { kw: 'ホームページ お問い合わせフォーム LINE 連動 無料', intent: 'how-to' },
  { kw: '清掃業 売上アップ IT活用 小規模事業者', intent: 'info' },
  { kw: 'サービス業 DX デジタル化 簡単 始め方', intent: 'info' },
  { kw: '問い合わせ 自動化 月3万円 効果 事例', intent: 'info' },
  { kw: 'ハウスクリーニング 口コミ 集め方 Google レビュー', intent: 'info' },
  { kw: '水道修理 緊急 問い合わせ 自動 LINE通知', intent: 'how-to' },
  { kw: '引越し 見積もり 自動化 ホームページ 活用', intent: 'how-to' },
  { kw: 'コインランドリー 問い合わせ 自動化 地域密着', intent: 'how-to' },
  { kw: '清掃 フランチャイズ 問い合わせ システム 比較', intent: 'info' },
  { kw: 'エアコン クリーニング 予約 自動化 夏季 対策', intent: 'how-to' },
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

async function sendEmail(user, pass, articles) {
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  const body = articles.map((a, i) =>
    `━━━ 記事${i + 1}: ${a.title} ━━━\n\n${a.content}\n`
  ).join('\n\n');
  await t.sendMail({
    from: user, to: user,
    subject: `【note記事${articles.length}本】${articles[0].title} 他`,
    text: `📝 本日のnote記事${articles.length}本が生成されました！\n\n${body}\n\nhttps://note.com/kakeru_web`
  });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.log('ANTHROPIC_API_KEY 未設定'); return; }
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  const state = loadState();
  let remaining = NOTE_KEYWORDS.filter(k => !state.posted.includes(k.kw));

  if (remaining.length < ARTICLES_PER_RUN) {
    state.posted = [];
    saveState(state);
    remaining = NOTE_KEYWORDS.slice();
    console.log('全キーワード完了。リセットしました。');
  }

  const targets = remaining.slice(0, ARTICLES_PER_RUN);
  const articles = [];

  for (const target of targets) {
    console.log(`生成中: ${target.kw}`);
    try {
      const article = await generateArticle(target.kw, target.intent);
      const date = new Date().toISOString().split('T')[0];
      const slug = target.kw.slice(0, 15).replace(/\s/g, '-');
      const filename = `${date}-${articles.length + 1}-${slug}.md`;
      fs.writeFileSync(path.join(DRAFTS_DIR, filename), `# ${article.title}\n\n${article.content}`);
      console.log(`✓ 保存: ${filename}`);
      articles.push(article);
      state.posted.push(target.kw);
      saveState(state);
    } catch (err) {
      console.error(`エラー:`, err.message);
    }
  }

  if (articles.length > 0 && process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) {
    await sendEmail(process.env.GMAIL_USER, process.env.GMAIL_APP_PASS, articles);
    console.log(`✓ メール送信完了 (${articles.length}本)`);
  }
  console.log(`\n✅ 本日の記事生成: ${articles.length}/${ARTICLES_PER_RUN}本`);
}

main().catch(console.error);
