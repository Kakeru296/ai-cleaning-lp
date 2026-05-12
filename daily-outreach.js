/**
 * 毎日自動アウトリーチ（GitHub Actionsで実行）
 * エリアをローテーションしながら清掃会社の問い合わせフォームに自動送信
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MY_EMAIL = 'info.shopworld.team@gmail.com';
const MY_NAME  = 'AI導入支援担当';
const LP_URL   = 'https://kakeru296.github.io/ai-cleaning-lp/';
const DEMO_URL = 'https://kakeru296.github.io/ai-cleaning-lp/demo-cleaning.html';

const MESSAGE = `突然のご連絡失礼いたします。清掃会社様専門でAI業務自動化のご支援をしております。

「夜中や休日の見積もり問い合わせを取りこぼしていませんか？」

お客様がスマホで間取りを選ぶだけで自動見積もりが表示され、社長さんに即通知が届く仕組みを作っています。

▼ 30秒で動作確認できるデモ（返信不要）
${DEMO_URL}

・24時間自動で見積もり・問い合わせ受付
・御社専用カスタマイズで最短2週間納品
・初期費用75,000円〜（同エリア競合他社には販売しません）

詳細・お申し込みはこちら（フォームから完結します）:
${LP_URL}

ご不要の場合はそのままで構いません。`;

// 全国の攻略エリアリスト（毎日ローテーション）
const ALL_AREAS = [
  // 東京
  ['東京都世田谷区', '東京都練馬区'],
  ['東京都板橋区', '東京都足立区'],
  ['東京都江戸川区', '東京都葛飾区'],
  ['東京都杉並区', '東京都中野区'],
  ['東京都豊島区', '東京都北区'],
  ['東京都荒川区', '東京都墨田区'],
  ['東京都江東区', '東京都品川区'],
  ['東京都目黒区', '東京都大田区'],
  // 神奈川
  ['神奈川県横浜市', '神奈川県川崎市'],
  ['神奈川県相模原市', '神奈川県厚木市'],
  // 埼玉
  ['埼玉県さいたま市', '埼玉県川口市'],
  ['埼玉県川越市', '埼玉県越谷市'],
  // 千葉
  ['千葉県千葉市', '千葉県船橋市'],
  ['千葉県松戸市', '千葉県柏市'],
  // 大阪
  ['大阪府大阪市北区', '大阪府大阪市中央区'],
  ['大阪府堺市', '大阪府東大阪市'],
  // 愛知
  ['愛知県名古屋市', '愛知県豊田市'],
  // 福岡
  ['福岡県福岡市', '福岡県北九州市'],
  // 北海道
  ['北海道札幌市', '北海道旭川市'],
  // その他
  ['京都府京都市', '兵庫県神戸市'],
];

// 今日のエリアをローテーション
const dayIndex = (parseInt(process.env.RUN_DATE || '1') - 1) % ALL_AREAS.length;
const todayAreas = ALL_AREAS[dayIndex];

console.log(`📅 本日のエリア: ${todayAreas.join('、')}`);
console.log(`   (ローテーション ${dayIndex + 1}/${ALL_AREAS.length})\n`);

async function getCompaniesWithUrls(page, area) {
  const results = [];
  const query = `ハウスクリーニング ${area}`;
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
    waitUntil: 'networkidle', timeout: 20000
  }).catch(() => {});
  await page.waitForTimeout(2000);

  for (let i = 0; i < 3; i++) {
    await page.locator('[role="main"]').first().evaluate(el => el.scrollBy(0, 600)).catch(() => {});
    await page.waitForTimeout(800);
  }

  const items = await page.locator('[role="article"]').all();
  for (const item of items.slice(0, 10)) {
    const name = await item.getAttribute('aria-label').catch(() => '');
    if (!name || name.length < 2) continue;

    // Skip major franchises
    const isFranchise = ['おそうじ本舗', 'おそうじ革命', 'ダスキン', 'ベアーズ'].some(f => name.includes(f));
    if (isFranchise) continue;

    await item.click().catch(() => {});
    await page.waitForTimeout(1500);

    const webLink = await page.locator('a[data-item-id="authority"]').first().getAttribute('href').catch(() => '');
    if (webLink && webLink.startsWith('http')) {
      results.push({ name: name.trim(), area, url: webLink });
      console.log(`  ✓ ${name.slice(0, 30)}`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  return results;
}

async function submitContactForm(page, company) {
  try {
    await page.goto(company.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Find contact page
    const contactLink = page.locator('a:has-text("お問い合わせ"), a:has-text("問い合わせ"), a[href*="contact"], a[href*="inquiry"]').first();
    if (await contactLink.count() > 0) {
      const href = await contactLink.getAttribute('href').catch(() => '');
      if (href) {
        const contactUrl = href.startsWith('http') ? href : new URL(href, company.url).href;
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);
      }
    }

    const nameInput = page.locator('input[name*="name"], input[placeholder*="名前"], input[placeholder*="お名前"]').first();
    const emailInput = page.locator('input[type="email"], input[name*="email"], input[name*="mail"]').first();
    const msgInput = page.locator('textarea').first();
    const phoneInput = page.locator('input[type="tel"], input[name*="tel"], input[name*="phone"]').first();

    if (await emailInput.count() === 0 && await msgInput.count() === 0) {
      return { success: false, reason: 'フォームなし' };
    }

    if (await nameInput.count() > 0) await nameInput.fill(MY_NAME).catch(() => {});
    if (await emailInput.count() > 0) await emailInput.fill(MY_EMAIL).catch(() => {});
    if (await phoneInput.count() > 0) await phoneInput.fill('090-0000-0000').catch(() => {});
    if (await msgInput.count() > 0) await msgInput.fill(MESSAGE).catch(() => {});

    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("送信"), button:has-text("確認")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click({ force: true });
      await page.waitForTimeout(3000);
      return { success: true, reason: '送信完了' };
    }
    return { success: false, reason: '送信ボタンなし' };
  } catch (e) {
    return { success: false, reason: e.message.slice(0, 50) };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'ja-JP',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  // Collect companies
  let companies = [];
  for (const area of todayAreas) {
    console.log(`\n📍 ${area}`);
    const found = await getCompaniesWithUrls(page, area);
    companies = companies.concat(found);
  }
  companies = companies.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);

  console.log(`\n合計 ${companies.length} 社 → 問い合わせフォーム送信開始\n`);

  // Submit forms
  const log = [];
  let sent = 0;
  for (const company of companies) {
    process.stdout.write(`  ${company.name.slice(0, 25)}... `);
    const result = await submitContactForm(page, company);
    console.log(result.reason);
    if (result.success) sent++;
    log.push({ date: new Date().toISOString().slice(0, 10), ...company, ...result });
    await page.waitForTimeout(3000);
  }

  await browser.close();

  // Save log
  const logPath = path.resolve(__dirname, 'outreach-history.json');
  const existing = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
  fs.writeFileSync(logPath, JSON.stringify([...existing, ...log], null, 2));

  console.log(`\n🎉 本日の送信完了: ${sent}/${companies.length}社`);
  console.log(`📊 累計送信記録: ${existing.length + log.length}件`);
})();
