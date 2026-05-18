'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LP_URL = 'https://kakeru296.github.io/ai-cleaning-lp/';
const STATE_FILE = path.join(__dirname, 'x-state.json');
const POSTS_PER_RUN = 10;

const POST_THEMES = [
  { type: 'case1', prompt: '「夜間の問い合わせを取りこぼしていた清掃会社が、自動見積もり＋LINE通知で機会損失ゼロになった」イメージで経営者に刺さるX投稿文を書いてください。' },
  { type: 'tip1', prompt: '「清掃業の夜間問い合わせは全体の40%という事実と自動化の重要性」をX投稿にしてください。' },
  { type: 'cta1', prompt: '「無料モニター先着1社限定でLINE通知システムを構築する」という告知をX投稿にしてください。' },
  { type: 'know1', prompt: '「ハウスクリーニング経営者向けに、スマホで選ぶだけの自動見積もり仕組みの概要」をX投稿にしてください。' },
  { type: 'pain1', prompt: '「清掃業経営者が夜間・休日の問い合わせ対応で感じる悩みへの共感と解決策」をX投稿にしてください。' },
  { type: 'case2', prompt: '「美容室オーナーがLINE予約自動化で月10件の予約取りこぼしをゼロにした」事例風のX投稿を書いてください。' },
  { type: 'tip2', prompt: '「ホームページのお問い合わせフォームから自動でLINEに通知する仕組みが3万円でできる」という驚きのX投稿にしてください。' },
  { type: 'know2', prompt: '「サービス業の社長がスマホ1台で問い合わせ対応を完結できる時代」について経営者向けX投稿にしてください。' },
  { type: 'pain2', prompt: '「休日に電話に出られず顧客を逃した経験をした経営者への共感と解決策」をX投稿にしてください。' },
  { type: 'cta2', prompt: '「清掃業・整体院・美容室向けの問い合わせ自動化システム。今なら初月無料」という告知X投稿にしてください。' },
];

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { posted: [], themeIndex: 0 };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generatePost(theme) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `${theme.prompt}\n\n要件:\n- 120文字以内（URLを含めて140文字以内）\n- ハッシュタグ2〜3個（#ハウスクリーニング #業務自動化 #LINE活用 等）\n- 最後に「${LP_URL}」を付ける\n- テキストのみ返す`
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
  let successCount = 0;

  for (let i = 0; i < POSTS_PER_RUN; i++) {
    const idx = state.themeIndex % POST_THEMES.length;
    const theme = POST_THEMES[idx];
    console.log(`\n[${i + 1}/${POSTS_PER_RUN}] テーマ: ${theme.type}`);

    try {
      const text = await generatePost(theme);
      console.log('投稿: ' + text.slice(0, 60) + '... (' + text.length + '文字)');

      const result = await postToX(text);
      const entry = { date: new Date().toISOString(), theme: theme.type, text, id: result?.data?.id || null };
      if (entry.id) {
        console.log(`✓ 投稿完了: https://x.com/i/web/status/${entry.id}`);
        successCount++;
      }

      state.posted.push(entry);
      state.themeIndex = idx + 1;
      saveState(state);

      if (i < POSTS_PER_RUN - 1) await sleep(15000);
    } catch (err) {
      console.error(`投稿${i + 1}でエラー:`, err.message);
    }
  }

  console.log(`\n✅ 本日の投稿完了: ${successCount}/${POSTS_PER_RUN}件`);
}

main().catch(console.error);
