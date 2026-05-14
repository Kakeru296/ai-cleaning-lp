/**
 * 毎日自動アウトリーチ v2
 * - 東京全23区 + 全国主要都市 (60エリア以上)
 * - 1日4エリア × 15社 = 最大60社/日
 * - 送信済み会社の重複スキップ
 * - URLバグ修正（各会社のURLを正しく取得）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MY_EMAIL = 'info.shopworld.team@gmail.com';
const MY_NAME  = 'Kakeru（清掃AI自動化）';
const LP_URL   = 'https://kakeru296.github.io/ai-cleaning-lp/';
const DEMO_URL = 'https://kakeru296.github.io/ai-cleaning-lp/demo-cleaning.html';

function buildMessage(companyName, area) {
  const areaShort = area
    .replace(/東京都|神奈川県|埼玉県|千葉県|大阪府|愛知県|福岡県|北海道|京都府|兵庫県|宮城県|広島県|静岡県|新潟県|茨城県|栃木県|群馬県|岡山県|熊本県|鹿児島県|沖縄県/g, '');
  return `突然失礼いたします。

清掃業専門でAI自動化を作っているKakeruと申します。
${companyName}様のことをGoogleマップで拝見し、ご連絡しました。

今だけ、1社限定で無料モニターを受け付けています。

仕組みはシンプルです。
お客様がスマホで選ぶだけ → 金額が即表示 → 社長のLINEに通知

▼ 30秒で動くデモはこちら（返信不要・押し付けなし）
${DEMO_URL}

夜間や休日の問い合わせを逃さなくなります。
ご興味あればお気軽にどうぞ。

Kakeru
${LP_URL}`;
}

// 東京全23区 + 全国主要都市（60エリア）
const ALL_AREAS = [
  // 東京 23区
  ['東京都世田谷区', '東京都練馬区', '東京都板橋区', '東京都足立区'],
  ['東京都江戸川区', '東京都葛飾区', '東京都杉並区', '東京都中野区'],
  ['東京都豊島区', '東京都北区', '東京都荒川区', '東京都墨田区'],
  ['東京都江東区', '東京都品川区', '東京都目黒区', '東京都大田区'],
  ['東京都渋谷区', '東京都新宿区', '東京都文京区', '東京都台東区'],
  ['東京都千代田区', '東京都中央区', '東京都港区', '東京都葛飾区'],
  // 東京 市部
  ['東京都八王子市', '東京都町田市', '東京都府中市', '東京都調布市'],
  ['東京都立川市', '東京都三鷹市', '東京都小金井市', '東京都国分寺市'],
  // 神奈川
  ['神奈川県横浜市', '神奈川県川崎市', '神奈川県相模原市', '神奈川県厚木市'],
  ['神奈川県藤沢市', '神奈川県横須賀市', '神奈川県平塚市', '神奈川県茅ヶ崎市'],
  // 埼玉
  ['埼玉県さいたま市', '埼玉県川口市', '埼玉県川越市', '埼玉県越谷市'],
  ['埼玉県所沢市', '埼玉県熊谷市', '埼玉県春日部市', '埼玉県草加市'],
  // 千葉
  ['千葉県千葉市', '千葉県船橋市', '千葉県松戸市', '千葉県柏市'],
  ['千葉県市川市', '千葉県浦安市', '千葉県習志野市', '千葉県我孫子市'],
  // 大阪
  ['大阪府大阪市北区', '大阪府大阪市中央区', '大阪府堺市', '大阪府東大阪市'],
  ['大阪府豊中市', '大阪府吹田市', '大阪府枚方市', '大阪府八尾市'],
  // 愛知
  ['愛知県名古屋市中区', '愛知県名古屋市中村区', '愛知県豊田市', '愛知県岡崎市'],
  ['愛知県一宮市', '愛知県春日井市', '愛知県豊橋市', '愛知県刈谷市'],
  // 福岡
  ['福岡県福岡市博多区', '福岡県福岡市中央区', '福岡県北九州市', '福岡県久留米市'],
  // 北海道・東北
  ['北海道札幌市', '北海道旭川市', '宮城県仙台市', '宮城県仙台市太白区'],
  // 関西
  ['京都府京都市', '兵庫県神戸市', '兵庫県姫路市', '滋賀県大津市'],
  // 中国・四国
  ['広島県広島市', '岡山県岡山市', '愛媛県松山市', '香川県高松市'],
  // 九州
  ['熊本県熊本市', '鹿児島県鹿児島市', '長崎県長崎市', '大分県大分市'],
  // 静岡・中部
  ['静岡県静岡市', '静岡県浜松市', '新潟県新潟市', '石川県金沢市'],
  // 北関東
  ['茨城県水戸市', '栃木県宇都宮市', '群馬県前橋市', '群馬県高崎市'],
];

// 今日のエリア（4エリア = 最大60社）
const dayIndex = (parseInt(process.env.RUN_DATE || String(new Date().getDate())) - 1) % ALL_AREAS.length;
const todayAreas = ALL_AREAS[dayIndex];

console.log(`📅 本日のエリア: ${todayAreas.join('、')}`);
console.log(`   (ローテーション ${dayIndex + 1}/${ALL_AREAS.length})\n`);

// 送信済みリストを読み込む（重複防止）
const historyPath = path.resolve(__dirname, 'outreach-history.json');
const sentNames = new Set(
  (fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [])
    .filter(r => r.success)
    .map(r => r.name)
);
console.log(`📋 送信済み: ${sentNames.size} 社（スキップ対象）\n`);

// フランチャイズ除外リスト
const SKIP_NAMES = ['おそうじ本舗', 'おそうじ革命', 'ダスキン', 'ベアーズ', 'カジタク', 'くらしのマーケット'];

async function getCompaniesWithUrls(page, area) {
  const results = [];
  const query = `ハウスクリーニング ${area}`;
  console.log(`\n📍 ${area}`);

  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded', timeout: 20000
  }).catch(() => {});
  await page.waitForTimeout(2500);

  // スクロールして結果を増やす（5回）
  for (let i = 0; i < 5; i++) {
    await page.locator('[role="main"]').first().evaluate(el => el.scrollBy(0, 800)).catch(() => {});
    await page.waitForTimeout(700);
  }

  const items = await page.locator('[role="article"]').all();
  console.log(`  → ${items.length} 件発見`);

  for (const item of items.slice(0, 15)) {
    const name = await item.getAttribute('aria-label').catch(() => '');
    if (!name || name.length < 2) continue;

    // フランチャイズ・送信済みをスキップ
    if (SKIP_NAMES.some(f => name.includes(f))) continue;
    if (sentNames.has(name.trim())) {
      console.log(`  ⏭️  ${name.slice(0, 30)} (送信済みスキップ)`);
      continue;
    }

    // 詳細クリックしてURLを取得
    await item.click().catch(() => {});
    await page.waitForTimeout(2000);

    // 複数のセレクタでウェブサイトURLを探す
    let webUrl = '';
    const selectors = [
      'a[data-item-id="authority"]',
      'a[aria-label*="ウェブサイト"]',
      'a[href*="http"]:not([href*="google"])',
    ];
    for (const sel of selectors) {
      const href = await page.locator(sel).first().getAttribute('href').catch(() => '');
      if (href && href.startsWith('http') && !href.includes('google.com')) {
        webUrl = href;
        break;
      }
    }

    if (webUrl) {
      results.push({ name: name.trim(), area, url: webUrl });
      console.log(`  ✓ ${name.slice(0, 35)}`);
    } else {
      console.log(`  ✗ ${name.slice(0, 35)} (URLなし)`);
    }

    // ESCで詳細を閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  return results;
}

async function submitContactForm(page, company) {
  try {
    await page.goto(company.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1200);

    // お問い合わせページを探す
    const contactSelectors = [
      'a:has-text("お問い合わせ")',
      'a:has-text("問い合わせ")',
      'a:has-text("contact")',
      'a[href*="contact"]',
      'a[href*="inquiry"]',
      'a[href*="form"]',
    ];
    for (const sel of contactSelectors) {
      const link = page.locator(sel).first();
      if (await link.count() > 0) {
        const href = await link.getAttribute('href').catch(() => '');
        if (href) {
          try {
            const contactUrl = href.startsWith('http') ? href : new URL(href, company.url).href;
            await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await page.waitForTimeout(1200);
          } catch (_) {}
          break;
        }
      }
    }

    // フォーム要素を探す
    const nameInput  = page.locator('input[name*="name"], input[placeholder*="名前"], input[placeholder*="お名前"], input[id*="name"]').first();
    const emailInput = page.locator('input[type="email"], input[name*="email"], input[name*="mail"], input[placeholder*="メール"]').first();
    const msgInput   = page.locator('textarea').first();
    const phoneInput = page.locator('input[type="tel"], input[name*="tel"], input[name*="phone"], input[placeholder*="電話"]').first();
    const submitBtn  = page.locator('button[type="submit"], input[type="submit"], button:has-text("送信"), button:has-text("確認"), button:has-text("送る")').first();

    const hasEmail = await emailInput.count() > 0;
    const hasMsg   = await msgInput.count() > 0;
    const hasBtn   = await submitBtn.count() > 0;

    if (!hasEmail && !hasMsg) return { success: false, reason: 'フォームなし' };
    if (!hasBtn) return { success: false, reason: '送信ボタンなし' };

    const msg = buildMessage(company.name, company.area);
    if (await nameInput.count()  > 0) await nameInput.fill(MY_NAME).catch(() => {});
    if (hasEmail)                      await emailInput.fill(MY_EMAIL).catch(() => {});
    if (await phoneInput.count() > 0)  await phoneInput.fill('0900000000').catch(() => {});
    if (hasMsg)                        await msgInput.fill(msg).catch(() => {});

    await submitBtn.click({ force: true });
    await page.waitForTimeout(3000);
    return { success: true, reason: '送信完了' };
  } catch (e) {
    return { success: false, reason: e.message.slice(0, 60) };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  // 各エリアから会社を収集
  let companies = [];
  for (const area of todayAreas) {
    const found = await getCompaniesWithUrls(page, area);
    companies = companies.concat(found);
  }
  // 重複除去
  companies = companies.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
  console.log(`\n合計 ${companies.length} 社 → 問い合わせフォーム送信開始\n`);

  // 送信
  const log = [];
  let sent = 0;
  for (const company of companies) {
    process.stdout.write(`  📧 ${company.name.slice(0, 28)}... `);
    const result = await submitContactForm(page, company);
    console.log(result.reason);
    if (result.success) {
      sent++;
      sentNames.add(company.name);
    }
    log.push({
      date: new Date().toISOString().slice(0, 10),
      ...company,
      ...result,
    });
    await page.waitForTimeout(2500);
  }

  await browser.close();

  // ログ保存
  const existing = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
  fs.writeFileSync(historyPath, JSON.stringify([...existing, ...log], null, 2));

  console.log(`\n🎉 本日の送信完了: ${sent}/${companies.length}社`);
  console.log(`📊 累計送信記録: ${existing.length + log.length}件`);
  console.log(`📁 ログ: ${historyPath}`);
})();
