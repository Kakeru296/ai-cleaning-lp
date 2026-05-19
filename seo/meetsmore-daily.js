'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');

const TEMPLATES = [
  { keyword: 'ホームページ', msg: 'Webサイト・LP制作の実績があります。スマホ対応・問い合わせフォーム付きで制作します。' },
  { keyword: 'LINE', msg: 'LINE公式アカウントの設定・自動返信の実績があります。問い合わせをLINEで一元管理できます。' },
  { keyword: '自動化', msg: 'Google Apps Script(GAS)による業務自動化の実績があります。繰り返し作業を削減します。' },
  { keyword: '見積もり', msg: 'スマホで選ぶだけで自動見積もりが出る仕組みを構築した実績があります。' },
  { keyword: 'フォーム', msg: 'Googleフォームと業務システムの連携実績があります。フォーム送信を即LINE通知に繋げます。' },
];

async function generateMsg(title) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base = TEMPLATES.find(t => title?.includes(t.keyword))?.msg || 'Web自動化・業務効率化の実績があります。';
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 200,
    messages: [{ role: 'user', content: `ミツモアの「${title}」依頼への応募文(150文字以内):\n自己PR: ${base}\n親しみやすく・具体的・「まずご要件をお聞かせください」で締める` }],
  });
  return res.content[0].text.trim();
}

async function sendPush(title, body) {
  const topic = process.env.NTFY_TOPIC || 'kakeru-leads-2026';
  const buf = Buffer.from(body);
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'ntfy.sh', path: `/${topic}`, method: 'POST',
      headers: { 'Title': encodeURIComponent(title), 'Priority': 'high', 'Tags': 'moneybag', 'Content-Length': buf.length },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(buf); req.end();
  });
}

async function main() {
  console.log(`\n🎯 ミツモア朝活: ${new Date().toLocaleString('ja-JP')}`);

  const categories = ['ホームページ制作', 'LINE公式アカウント設定', 'GAS業務自動化'];
  const msgs = [];

  for (const cat of categories) {
    const msg = await generateMsg(cat);
    if (msg) { msgs.push({ cat, msg }); console.log(`\n[${cat}]\n${msg}`); }
  }

  const body = `🌅 今日のミツモアアクション\n\n新着依頼を確認して手動応募！\n\n` +
    msgs.map(m => `【${m.cat}】\n${m.msg.substring(0, 80)}...`).join('\n\n') +
    `\n\n👉 meetsmore.com/lancer/mypage`;

  await sendPush('🎯 ミツモア朝活！新着依頼チェック', body);
  console.log('\n✅ 完了 → ミツモアを開いて新着依頼に応募！');
}

main().catch(console.error);
