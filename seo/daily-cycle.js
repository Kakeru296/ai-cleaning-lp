'use strict';

const { collectGscData } = require('./collect-gsc-data');
const { improveArticles } = require('./improve-articles');
const { generateArticles } = require('./generate-articles');
const { updateSitemap } = require('./update-sitemap');

async function main() {
  const COUNT = parseInt(process.env.ARTICLE_COUNT || '25');
  const start = Date.now();
  console.log(`\n=== 日次SEOサイクル ${new Date().toISOString()} ===\n`);

  console.log('[1/4] GSCデータ収集');
  try { await collectGscData(); } catch (e) { console.warn(`  スキップ: ${e.message}`); }

  console.log('\n[2/4] 低CTR記事の改善');
  try { await improveArticles(); } catch (e) { console.warn(`  スキップ: ${e.message}`); }

  console.log(`\n[3/4] 新記事生成 (${COUNT}本)`);
  await generateArticles(COUNT);

  console.log('\n[4/4] サイトマップ更新');
  updateSitemap();

  console.log(`\n=== 完了 (${Math.round((Date.now() - start) / 1000)}秒) ===`);
}

main().catch(err => { console.error('エラー:', err.message); process.exit(1); });
