'use strict';

const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'lead-state.json');
const REVENUE_FILE = path.join(__dirname, 'revenue.json');

const LEAD_SOURCES = [
  { domain: 'coconala.com',  label: 'Coconala'  },
  { domain: 'lancers.jp',    label: 'ランサーズ' },
  { domain: 'meetsmore.com', label: 'ミツモア'  },
];

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { processed: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function loadRevenue() {
  if (!fs.existsSync(REVENUE_FILE)) return { leads: [], total_won: 0 };
  return JSON.parse(fs.readFileSync(REVENUE_FILE, 'utf8'));
}

function saveRevenue(d) { fs.writeFileSync(REVENUE_FILE, JSON.stringify(d, null, 2)); }

async function sendPushNotification(title, message) {
  // ntfy.sh — 無料・アカウント不要のプッシュ通知
  const topic = process.env.NTFY_TOPIC || 'kakeru-leads-2026';
  return new Promise((resolve) => {
    const body = Buffer.from(message);
    const req = https.request({
      hostname: 'ntfy.sh',
      path: `/${topic}`,
      method: 'POST',
      headers: {
        'Title': encodeURIComponent(title),
        'Priority': 'urgent',
        'Tags': 'bell,money_with_wings',
        'Content-Length': body.length,
      },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(body); req.end();
  });
}

async function generateDraftReply(source, subject, snippet) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: `Web自動化エンジニアのKakeruとして、${source}からの問い合わせに返信文を書いてください。\n件名: ${subject}\n内容: ${snippet}\n\n丁寧に・専門家として・具体的な次ステップを提案・200文字以内・返信文のみ` }],
  });
  return res.content[0].text.trim();
}

async function createGmailDraft(gmail, from, subject, body, threadId) {
  const to = from.match(/<(.+)>/)?.[1] || from;
  const raw = [`To: ${to}`, `Subject: Re: ${subject}`, `Content-Type: text/plain; charset=utf-8`, ``, body].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64url');
  const draftBody = { message: { raw: encoded } };
  if (threadId) draftBody.message.threadId = threadId;
  await gmail.users.drafts.create({ userId: 'me', requestBody: draftBody });
}

async function getGmailClient() {
  const { GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: secret, GMAIL_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) throw new Error('Gmail OAuth2 credentials not set');
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: refresh });
  return google.gmail({ version: 'v1', auth });
}

async function main() {
  console.log(`\n🔍 リード監視: ${new Date().toLocaleString('ja-JP')}`);
  const state = loadState();
  const revenue = loadRevenue();

  let gmail;
  try { gmail = await getGmailClient(); }
  catch (e) { console.log('[Gmail] 未設定のためスキップ:', e.message); return; }

  const since = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
  const q = `(${LEAD_SOURCES.map(s => `from:${s.domain}`).join(' OR ')}) is:unread after:${since}`;

  const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 20 }).catch(e => { console.error('[Gmail]', e.message); return { data: {} }; });
  const messages = listRes.data.messages || [];
  console.log(`📬 候補: ${messages.length}件`);

  let newCount = 0;
  for (const msg of messages) {
    if (state.processed.includes(msg.id)) continue;

    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject'] });
    const h = detail.data.payload.headers;
    const from    = h.find(x => x.name === 'From')?.value || '';
    const subject = h.find(x => x.name === 'Subject')?.value || '';
    const snippet = detail.data.snippet || '';
    const threadId = detail.data.threadId;

    const source = LEAD_SOURCES.find(s => from.includes(s.domain));
    if (!source) { state.processed.push(msg.id); continue; }

    console.log(`\n✨ [${source.label}] ${subject}`);

    await sendPushNotification(`🔔 新規リード [${source.label}]`, `件名: ${subject}\n内容: ${snippet.substring(0, 80)}\n⚡ 今すぐ返信！`);

    let draftGenerated = false;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const draft = await generateDraftReply(source.label, subject, snippet);
        await createGmailDraft(gmail, from, subject, draft, threadId);
        console.log(`   ✍️  Gmail下書き作成 (${draft.length}文字)`);
        draftGenerated = true;
      } catch (e) { console.error('   ⚠️ 下書きエラー:', e.message); }
    }

    revenue.leads.push({
      id: msg.id, date: new Date().toISOString(),
      source: source.label, subject, snippet: snippet.substring(0, 100),
      status: 'new', amount: 0, draft: draftGenerated,
    });

    state.processed.push(msg.id);
    newCount++;
    saveState(state);
    saveRevenue(revenue);
  }

  if (state.processed.length > 500) { state.processed = state.processed.slice(-500); saveState(state); }
  console.log(`\n✅ 新規リード: ${newCount}件`);
}

main().catch(console.error);
