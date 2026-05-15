'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LP_URL = 'https://kakeru296.github.io/ai-cleaning-lp/';
const STATE_FILE = path.join(__dirname, 'x-state.json');

const POST_THEMES = [
  { type: 'case', prompt: '「夜間の問い合わせを取りこぼしていた清掃会社が、自動見積もり＋LINE通知で機会損失ゼロになった」イメージで経営者に刺さるX投稿文を書いてください。' },
  { type: 'tip', prompt: '「清掃業の夜間問い合わせは全体の40%という事実と自動化の重要性」をX投稿にしてください。' },
  { type: 'cta', prompt: '「無料モニター先着1社限定でLINE通知システムを構築する」という告知をX投稿にしてください。' },
  { type: 'know', prompt: '「ハウスクリーニング経営者向けに、スマホで選ぶだけの自動見積もり仕組みの概要」をX投稿にしてください。' },
  { type: 'pain', prompt: '「清掃業経営者が夜間・休日の問い合わせ対応で感じる悩みへの共感と解決策」をX投稿にしてください。' },
];

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { posted: [], themeIndex: 0 };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function generatePost(theme) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `${theme.prompt}

要件:
- 120文字以内（URLを含めて140文字以内）
- ハッシュタグ2〜3個（#ハウスクリーニング #業務自動化 #LINE活用 等）
- 最後に「${LP_URL}」を付ける
- テキストのみ返す`
    }]
  });
  return res.content[0].text.trim();
}

function buildOAuthHeader(method, url, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: tokenKey,
    oauth_version: '1.0',
  };
  const sortedKeys = Object.keys(oauthParams).sort();
  const paramStr = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`).join('&');
  const baseStr = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const sig = crypto.createHmac('sha1', signingKey).update(baseStr).digest('base64');
  oauthParams.oauth_signature = sig;
  return 'OAuth ' + Object.entries(oauthParams).map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(', ');
}

async function postToX(text) {
  const { X_API_KEY: key, X_API_SECRET: sec, X_ACCESS_TOKEN: tok, X_ACCESS_TOKEN_SECRET: tokSec } = process.env;
  if (!key || !sec || !tok || !tokSec) {
    console.log('X API credentials 未設定 → テキストのみ出力');
    return null;
  }
  const url = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({ text });
  const auth = buildOAuthHeader('POST', url, key, sec, tok, tokSec);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
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
  if (!process.env.ANTHROPIC_API_KEY) { console.log('ANTHROPIC_API_KEY 未設定'); return; }
  const state = loadState();
  const idx = state.themeIndex % POST_THEMES.length;
  const theme = POST_THEMES[idx];
  console.log(`テーマ: ${theme.type} (${idx + 1}/${POST_THEMES.length})`);

  const text = await generatePost(theme);
  console.log('\n投稿テキスト:\n' + text + '\n文字数: ' + text.length);

  const result = await postToX(text);
  const entry = { date: new Date().toISOString(), theme: theme.type, text, id: result?.data?.id || null };
  if (entry.id) console.log(`✓ 投稿完了: https://x.com/i/web/status/${entry.id}`);

  state.posted.push(entry);
  state.themeIndex = idx + 1;
  saveState(state);
}

main().catch(console.error);
