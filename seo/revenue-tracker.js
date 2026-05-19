'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');

const REVENUE_FILE = path.join(__dirname, 'revenue.json');

function load() {
  if (!fs.existsSync(REVENUE_FILE)) return { leads: [], total_won: 0 };
  return JSON.parse(fs.readFileSync(REVENUE_FILE, 'utf8'));
}

function save(d) { fs.writeFileSync(REVENUE_FILE, JSON.stringify(d, null, 2)); }

async function sendLineNotify(msg) {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) return;
  return new Promise((resolve) => {
    const body = `message=${encodeURIComponent(msg)}`;
    const req = https.request({
      hostname: 'notify-api.line.me', path: '/api/notify', method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(body); req.end();
  });
}

function analyzeRevenue(data) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekLeads = data.leads.filter(l => new Date(l.date) > weekAgo);

  const bySource = {};
  for (const l of data.leads) {
    if (!bySource[l.source]) bySource[l.source] = { new: 0, won: 0, lost: 0, amount: 0 };
    bySource[l.source][l.status] = (bySource[l.source][l.status] || 0) + 1;
    if (l.status === 'won') bySource[l.source].amount += l.amount || 0;
  }

  const wonLeads = data.leads.filter(l => l.status === 'won');
  const totalWon = wonLeads.reduce((s, l) => s + (l.amount || 0), 0);
  const convRate = data.leads.length > 0 ? ((wonLeads.length / data.leads.length) * 100).toFixed(1) : 0;

  return { weekLeads, bySource, totalLeads: data.leads.length, wonLeads, totalWon, convRate };
}

async function generateInsight(stats) {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: `フリーランスWeb自動化ビジネス週次データ分析:\n総リード${stats.totalLeads}件 成約${stats.wonLeads.length}件 売上¥${stats.totalWon} 転換率${stats.convRate}%\nチャネル: ${JSON.stringify(stats.bySource)}\n→来週の最優先施策を1つだけ具体的に教えてください（100文字以内）` }],
  });
  return res.content[0].text.trim();
}

async function main() {
  console.log(`\n📊 収益トラッカー: ${new Date().toLocaleString('ja-JP')}`);
  const data = load();
  const stats = analyzeRevenue(data);

  console.log(`\n総リード: ${stats.totalLeads}件 | 成約: ${stats.wonLeads.length}件 | 売上: ¥${stats.totalWon.toLocaleString()} | 転換率: ${stats.convRate}%`);
  console.log(`今週: ${stats.weekLeads.length}件`);
  for (const [src, d] of Object.entries(stats.bySource)) {
    console.log(`  ${src}: 新規${d.new||0} 成約${d.won||0} 失注${d.lost||0} ¥${(d.amount||0).toLocaleString()}`);
  }

  const insight = await generateInsight(stats);
  if (insight) console.log(`\n💡 AI提案: ${insight}`);

  await sendLineNotify(`\n📊 週次収益レポート\n💰 売上: ¥${stats.totalWon.toLocaleString()}\n📥 リード: ${stats.totalLeads}件（転換率${stats.convRate}%）\n今週: ${stats.weekLeads.length}件${insight ? '\n💡' + insight.substring(0, 80) : ''}`);

  data.total_won = stats.totalWon;
  save(data);
  console.log('\n✅ 完了');
}

main().catch(console.error);
