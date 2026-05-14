'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');
const BLOG_DIR = path.join(__dirname, '..', 'blog');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { generated: [], gsc: null };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

async function improveArticles() {
  if (!process.env.ANTHROPIC_API_KEY) { console.log('ANTHROPIC_API_KEY 未設定 → スキップ'); return; }

  const state = loadState();
  if (!state.gsc || !state.gsc.pages || state.gsc.pages.length === 0) {
    console.log('GSCデータなし → 改善スキップ（データ蓄積中）');
    return;
  }

  // 改善対象: impression >= 50 かつ CTR < 2%（表示されているのにクリックされない記事）
  const targets = state.gsc.pages
    .filter(p => p.impressions >= 50 && p.ctr < 2 && p.url.includes('/blog/'))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3);

  if (targets.length === 0) {
    console.log('改善対象なし（データ蓄積中またはCTR良好）');
    return;
  }

  console.log(`改善対象: ${targets.length}記事`);

  for (const page of targets) {
    const filename = path.basename(page.url);
    const filepath = path.join(BLOG_DIR, filename);
    if (!fs.existsSync(filepath)) continue;

    const html = fs.readFileSync(filepath, 'utf8');
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="(.*?)">/);
    if (!titleMatch) continue;

    const currentTitle = titleMatch[1];
    const currentDesc = descMatch ? descMatch[1] : '';
    const relatedQueries = (state.gsc.queries || [])
      .filter(q => q.page === page.url && q.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5)
      .map(q => `"${q.query}"(pos${q.position})`).join(', ');

    console.log(`  ${currentTitle} → imp:${page.impressions} CTR:${page.ctr}%`);

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `記事のCTRを改善するため、タイトルとディスクリプションを書き直してください。

現状: CTR ${page.ctr}% (表示${page.impressions}回、順位${page.position}位)
関連クエリ: ${relatedQueries || 'なし'}
現タイトル: ${currentTitle}
現ディスクリプション: ${currentDesc}

より具体的・魅力的に改善してください。
JSON: {"title": "新タイトル(60文字以内)", "description": "新ディスクリプション(120文字以内)"}`
        }]
      });

      const match = response.content[0].text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const improved = JSON.parse(match[0]);

      const updatedHtml = html
        .replace(/<title>.*?<\/title>/, `<title>${improved.title}</title>`)
        .replace(/(<meta name="description" content=")[^"]*"/, `$1${improved.description}"`);

      fs.writeFileSync(filepath, updatedHtml);
      console.log(`    ✓ → ${improved.title}`);
    } catch (err) {
      console.log(`    ✗ ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

module.exports = { improveArticles };

if (require.main === module) {
  improveArticles().catch(console.error);
}
