/**
 * くらしのマーケット ハウスクリーニング出品者 連絡先収集
 * 実行: node kurashino-leads.js
 * 出力: kurashino-leads.csv (name, url, tel, area, line_mention)
 */
const { chromium } = require('playwright');
const fs = require('fs');

const OUTPUT_FILE = 'kurashino-leads.csv';
const MAX_PAGES = 5;
const AREA = process.env.AREA || '東京';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const leads = [];

  console.log(`\n🔍 くらしのマーケット「ハウスクリーニング ${AREA}」を検索中...\n`);

  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = `https://curama.jp/house-cleaning/list/?keyword=${encodeURIComponent(AREA)}&page=${p}`;
    console.log(`  📄 ページ ${p}/${MAX_PAGES}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const providerLinks = await page.$$('a[href*="/house-cleaning/"][href*="/provider/"]').catch(() => []);
    const uniqueUrls = new Set();
    for (const link of providerLinks) {
      const href = await link.getAttribute('href').catch(() => '');
      if (href) uniqueUrls.add(href.startsWith('http') ? href : `https://curama.jp${href}`);
    }

    console.log(`    → ${uniqueUrls.size} 件の出品者URLを検出`);
    if (uniqueUrls.size === 0) break;

    for (const fullUrl of Array.from(uniqueUrls).slice(0, 8)) {
      try {
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);
        const content = await page.textContent('body').catch(() => '');

        const nameEl = await page.$('h1, [class*="provider-name"], [class*="companyName"]');
        const name = nameEl ? (await nameEl.textContent()).trim() : '';
        const telMatch = content.match(/0[0-9]{1,4}[-\s]?[0-9]{1,4}[-\s]?[0-9]{3,4}/);
        const tel = telMatch ? telMatch[0].replace(/\s/g, '') : '';
        const hasLine = content.includes('LINE') || content.includes('ライン');
        const areaMatch = content.match(/(?:対応エリア|サービスエリア)[：:\s]*([^\n]+)/);
        const serviceArea = areaMatch ? areaMatch[1].trim().substring(0, 50) : AREA;

        if (name) {
          leads.push({ name, url: fullUrl, tel, area: serviceArea, line_mention: hasLine ? 'YES' : '' });
          console.log(`    ✅ ${name} | TEL: ${tel || 'なし'} | LINE: ${hasLine ? 'あり' : 'なし'}`);
        }
      } catch (_) { /* skip */ }
    }
  }

  await browser.close();

  const csvHeader = 'name,url,tel,area,line_mention\n';
  const csvRows = leads.map(l =>
    `"${l.name.replace(/"/g, '""')}","${l.url}","${l.tel}","${l.area.replace(/"/g, '""')}","${l.line_mention}"`
  ).join('\n');
  fs.writeFileSync(OUTPUT_FILE, csvHeader + csvRows, 'utf8');

  console.log(`\n✅ ${leads.length} 件 → ${OUTPUT_FILE}`);
  console.log('\n📞 電話番号あり:');
  leads.filter(l => l.tel).slice(0, 10).forEach((l, i) =>
    console.log(`  ${i + 1}. ${l.name} | ${l.tel}`)
  );

  console.log('\n💬 LINE/メールDMテンプレート:');
  console.log(`---
くらしのマーケットで拝見しました。清掃業専門でAI自動化を作っているKakeruと申します。

夜間・休日の見積もり問い合わせを自動受付できる仕組みです。
今だけ1社限定で無料モニターを募集しています。

▼ 30秒で動くデモ（返信不要・押し付けなし）
https://kakeru296.github.io/ai-cleaning-lp/demo-cleaning.html

ご興味あればお気軽にどうぞ。
---`);
}

run().catch(console.error);
