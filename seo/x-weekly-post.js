'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LP_URL = 'https://kakeru296.github.io/ai-cleaning-lp/';
const STATE_FILE = path.join(__dirname, 'x-state.json');
const POSTS_PER_RUN = 10;

// Thread format: first tweet hooks, replies build story (up to 5 tweets)
const POST_THEMES = [
  {
    type: 'thread_case1', isThread: true,
    prompt: `ハウスクリーニング経営者向け「夜中の問い合わせ取りこぼし→自動化で解決」スレッドを書いてください。
ツイート1（フック）: 衝撃的な事実か問題提起
ツイート2: 具体的な問題の深掘り（数字を入れる）
ツイート3: 解決策の概要
ツイート4: 具体的な仕組みの説明
ツイート5（CTA）: 「詳しくはこちら ${LP_URL}」で締める、#ハウスクリーニング #業務自動化
JSON配列のみ返す: [{"tweet":"..."},{"tweet":"..."},...]`
  },
  {
    type: 'thread_pain1', isThread: true,
    prompt: `「サービス業社長が休日に顧客を逃し続ける理由」スレッドを書いてください。
ツイート1: 「日曜の夜11時、あなたの競合は...」で始まる問題提起
ツイート2: 夜間問い合わせの実態（数字を入れる）
ツイート3: 手動対応のコストを計算
ツイート4: 自動化で変わること
ツイート5: CTA「${LP_URL}」#清掃業 #集客
JSON配列のみ返す: [{"tweet":"..."},...]`
  },
  {
    type: 'thread_how1', isThread: true,
    prompt: `「LINE通知×自動見積もりを3週間で構築する3ステップ」ハウツースレッドを書いてください。
ツイート1: フック「知らないと損する清掃業の自動化3ステップ」
ツイート2: STEP1の説明
ツイート3: STEP2の説明
ツイート4: STEP3と費用感
ツイート5: CTA「${LP_URL}」#DX #業務効率化
JSON配列のみ返す: [{"tweet":"..."},...]`
  },
  { type: 'single_tip1', isThread: false, prompt: `清掃業で夜間に来る問い合わせは全体の38%。自動化していない会社が毎月逃している金額を計算したツイート（140文字以内）。末尾 #ハウスクリーニング #業務自動化` },
  { type: 'single_cta1', isThread: false, prompt: `無料モニター残り2枠。ハウスクリーニング会社向け問い合わせ自動化を0円で試せるという告知ツイート（140文字以内）。末尾 ${LP_URL} #無料モニター` },
  { type: 'single_pain1', isThread: false, prompt: `LINEを見たら昨夜3件問い合わせが来ていたが全員別業者に頼んでいた、という経営者あるある共感ツイート（140文字以内）。#清掃業 #集客` },
  { type: 'single_know1', isThread: false, prompt: `スマホで部屋の広さと汚れ具合を選ぶだけで自動見積もりが出る仕組みを3万円で作れるという驚きツイート（140文字以内）。#ハウスクリーニング #DX` },
  {
    type: 'thread_compare1', isThread: true,
    prompt: `「問い合わせ対応 手動 vs 自動化 徹底比較」スレッドを書いてください。
ツイート1: フック「手動対応を続けている会社が毎月失っているもの」
ツイート2: 手動対応のコスト（時間・機会損失を数字で）
ツイート3: 自動化した場合のコスト・効果
ツイート4: 導入前後の比較（テキスト表形式）
ツイート5: CTA「${LP_URL}」#業務効率化
JSON配列のみ返す: [{"tweet":"..."},...]`
  },
  { type: 'single_data1', isThread: false, prompt: `中小サービス業のDX実態：問い合わせを当日中に返信できている会社は全体の31%のみ、という事実ベースの衝撃ツイート（140文字以内）。#清掃業 #業務効率化` },
  {
    type: 'thread_story1', isThread: true,
    prompt: `「個人でハウスクリーニングをやっている職人さんが自動化で月商1.4倍になった話」ストーリースレッドを書いてください。
ツイート1: ドラマチックな状況設定（夜中12時、スマホが鳴る...）
ツイート2: 導入前の状況
ツイート3: 導入の決め手
ツイート4: 導入3ヶ月後の変化（具体的な数字）
ツイート5: CTA「${LP_URL}」#ハウスクリーニング #成功事例
JSON配列のみ返す: [{"tweet":"..."},...]`
  },
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
  const maxTokens = theme.isThread ? 800 : 300;
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: theme.prompt }]
  });
  const raw = res.content[0].text.trim();

  if (theme.isThread) {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [{ tweet: raw.slice(0, 280) }];
    try { return JSON.parse(match[0]); } catch { return [{ tweet: raw.slice(0, 280) }]; }
  }
  return raw;
}

async function postToXReply(text, replyToId) {
  const { X_API_KEY: key, X_API_SECRET: sec, X_ACCESS_TOKEN: tok, X_ACCESS_TOKEN_SECRET: tokSec } = process.env;
  if (!key || !sec || !tok || !tokSec) { console.log('X API credentials 未設定'); return null; }
  const url = 'https://api.twitter.com/2/tweets';
  const bodyObj = replyToId ? { text, reply: { in_reply_to_tweet_id: replyToId } } : { text };
  const body = JSON.stringify(bodyObj);
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
      const generated = await generatePost(theme);

      if (theme.isThread && Array.isArray(generated)) {
        // Post as thread: each tweet replies to the previous
        let replyToId = null;
        let firstId = null;
        for (const [ti, { tweet }] of generated.entries()) {
          const truncated = tweet.slice(0, 280);
          console.log(`  [${ti + 1}/${generated.length}] ${truncated.slice(0, 50)}...`);
          const result = await postToXReply(truncated, replyToId);
          const id = result?.data?.id || null;
          if (ti === 0) firstId = id;
          replyToId = id;
          if (ti < generated.length - 1) await sleep(3000);
        }
        const entry = { date: new Date().toISOString(), theme: theme.type, isThread: true, id: firstId };
        if (firstId) {
          console.log(`✓ スレッド投稿完了 (${generated.length}件): https://x.com/i/web/status/${firstId}`);
          successCount++;
        }
        state.posted.push(entry);
      } else {
        const text = String(generated);
        console.log('投稿: ' + text.slice(0, 60) + '... (' + text.length + '文字)');
        const result = await postToXReply(text, null);
        const entry = { date: new Date().toISOString(), theme: theme.type, text, id: result?.data?.id || null };
        if (entry.id) {
          console.log(`✓ 投稿完了: https://x.com/i/web/status/${entry.id}`);
          successCount++;
        }
        state.posted.push(entry);
      }

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
