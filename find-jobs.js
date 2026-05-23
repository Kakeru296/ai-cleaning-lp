'use strict';

/**
 * 毎朝実行: ランサーズ+CrowdWorksからIT案件を抽出してCSV出力
 *
 * ランサーズ: 提案数は非公開 → NEWバッジ付き（投稿直後=競合ほぼ0）IT案件を抽出
 * CrowdWorks: 応募数が表示される → 10件以下のIT案件を抽出
 *
 * 初回セットアップ: node find-jobs.js --setup
 * 毎朝の実行:       node find-jobs.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MAX_PROPOSALS = 10; // CrowdWorks用
const SESSION_FILE = path.join(__dirname, '.find-jobs-session.json');

// ランサーズITカテゴリURL（プロジェクト型・新着順）
const LANCERS_URLS = [
  'https://www.lancers.jp/work/search/system?open=1&sort=new&work_type%5B%5D=3',  // AI・システム開発
  'https://www.lancers.jp/work/search/web?open=1&sort=new&work_type%5B%5D=3'       // Web制作
];

async function scrapeLancers(page) {
  const jobs = [];
  console.log('\n🔍 ランサーズ (NEW案件・IT系) を検索中...');

  for (const baseUrl of LANCERS_URLS) {
    for (let pageNum = 1; pageNum <= 3; pageNum++) {
      const url = pageNum === 1 ? baseUrl : `${baseUrl}&page=${pageNum}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (e) { break; }
      await page.waitForTimeout(1500);

      const items = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('.p-search-job-media.c-media--item').forEach(c => {
          const titleEl = c.querySelector('a.p-search-job-media__title');
          if (!titleEl) return;
          if (!titleEl.href.includes('/work/detail/')) return; // POD案件を除外

          const txt = c.textContent.replace(/\s+/g, ' ').trim();
          const isNew = txt.includes(' NEW ');
          const isProject = txt.includes('プロジェクト');

          // 当選者数・募集人数を抽出
          const slotMatch = txt.match(/募集人数\s*(\d+)\s*人/);
          const slots = slotMatch ? parseInt(slotMatch[1], 10) : 1;

          // 価格抽出
          const priceMatch = txt.match(/([\d,]+)\s*円/);
          const price = priceMatch ? priceMatch[0] : '';

          // 締切
          const deadlineMatch = txt.match(/あと(\d+[日時間]+)/);
          const deadline = deadlineMatch ? deadlineMatch[0] : '';

          const title = titleEl.textContent.trim().replace(/\s+/g, ' ').replace(/^(NEW|PR|注目|限定公開|生成AI使用可)\s*/g, '').replace(/^\d+回目\s+/g, '').trim();

          // 非IT案件を除外（買い付け・主婦作業・ライター等）
          const NON_IT = /主婦|ママ大歓迎|初心者大歓迎|買い付け|バイマ|輸入転売|せどり|データ入力|文字起こし|テープ起こし|アンケート|口コミ|ライター募集|翻訳|動画編集|YouTube|TikTok|Instagram|SNS投稿|ポスティング|バナー作成|パワポ|パワーポイント|SNS運用代行|LinkedIn|運用代行|LP構成|コピーライ/i;
          if (NON_IT.test(title)) return;

          results.push({
            title,
            url: titleEl.href,
            proposals: 0, // ランサーズは非公開（NEW案件=ほぼ0）
            isNew,
            isProject,
            slots,
            price,
            deadline,
            platform: 'ランサーズ'
          });
        });
        return results;
      });

      const newProjects = items.filter(j => j.isNew && j.isProject);
      for (const job of newProjects) {
        jobs.push(job);
        console.log(`  ✓ [NEW] ${job.title.slice(0, 55)} (募集${job.slots}名)`);
      }

      if (newProjects.length === 0 && pageNum > 1) break;
      console.log(`  ページ${pageNum}: ${items.length}件中 NEW案件${newProjects.length}件`);
    }
  }

  return jobs;
}

async function scrapeCrowdworks(page) {
  const jobs = [];
  console.log('\n🔍 CrowdWorks (応募10件以下・IT系) を検索中...');

  // IT系カテゴリ: サイト構築・ウェブ開発(2), 業務システム・ソフトウェア(83)
  const CW_URLS = [
    'https://crowdworks.jp/public/jobs/category/2?order=new&work_type=1',
    'https://crowdworks.jp/public/jobs/category/83?order=new&work_type=1'
  ];

  for (const baseUrl of CW_URLS) {
    for (let pageNum = 1; pageNum <= 3; pageNum++) {
      const url = pageNum === 1 ? baseUrl : `${baseUrl}&page=${pageNum}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (e) { break; }
      await page.waitForTimeout(1500);

      const items = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('._root_b2jur_2').forEach(card => {
          const titleEl = card.querySelector('a[href*="/public/jobs/"]');
          if (!titleEl || !/\/public\/jobs\/\d+/.test(titleEl.href)) return;

          const txt = card.textContent.replace(/\s+/g, ' ').trim();

          // 応募数抽出
          const countMatch = txt.match(/応募数(\d+)\s*人/);
          const proposals = countMatch ? parseInt(countMatch[1], 10) : 999;

          // 価格
          const priceMatch = txt.match(/([\d,]+)\s*円/);
          const price = priceMatch ? priceMatch[0] : '';

          // 締切
          const deadlineMatch = txt.match(/あと\s*\d+\s*日/);
          const deadline = deadlineMatch ? deadlineMatch[0] : '';

          results.push({
            title: titleEl.textContent.trim(),
            url: titleEl.href,
            proposals,
            price,
            deadline,
            platform: 'CrowdWorks'
          });
        });
        return results;
      });

      if (items.length === 0) {
        await page.screenshot({ path: path.join(__dirname, 'cw-debug.png') });
        console.log(`  ⚠ 取得失敗 → cw-debug.png確認 (URL: ${url.slice(0, 60)})`);
        break;
      }

      let found = 0;
      for (const job of items) {
        if (job.proposals <= MAX_PROPOSALS) { jobs.push(job); found++; }
      }
      console.log(`  ページ${pageNum}: ${items.length}件中 ${found}件が${MAX_PROPOSALS}件以下`);
      if (found === 0 && pageNum > 1) break;
    }
  }

  return jobs;
}

function saveCSV(jobs) {
  const today = new Date().toISOString().split('T')[0];
  const filepath = path.join(__dirname, `jobs-${today}.csv`);
  const header = 'プラットフォーム,状態,タイトル,予算,締切,URL\n';
  const rows = jobs
    .map(j => [
      j.platform,
      j.platform === 'ランサーズ' ? 'NEW案件' : `応募${j.proposals}件`,
      `"${j.title.replace(/"/g, '""')}"`,
      `"${(j.price || '').replace(/"/g, '""')}"`,
      `"${(j.deadline || '').replace(/"/g, '""')}"`,
      j.url
    ].join(','))
    .join('\n');
  fs.writeFileSync(filepath, '﻿' + header + rows, 'utf8');
  return filepath;
}

async function setup() {
  console.log('\n📱 セットアップモード - ブラウザが開きます');
  console.log('ランサーズ と CrowdWorks にGoogleログインしてください。\n');

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo'
  });

  const page = await context.newPage();
  await page.goto('https://www.lancers.jp/mypage');
  console.log('[1/2] ランサーズにログインして、マイページが開いたらこのターミナルで Enter を押してください。');
  await waitForEnter();

  await page.goto('https://crowdworks.jp/dashboard');
  console.log('[2/2] CrowdWorksにログインして、マイページが開いたら Enter を押してください。');
  await waitForEnter();

  await context.storageState({ path: SESSION_FILE });
  console.log(`✅ セッション保存: ${SESSION_FILE}`);
  await browser.close();
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
  });
}

async function main() {
  if (process.argv.includes('--setup')) return setup();

  if (!fs.existsSync(SESSION_FILE)) {
    console.log('❌ セッションがありません。先に実行してください: node find-jobs.js --setup');
    process.exit(1);
  }

  console.log(`\n📋 案件選定スクリプト v2`);
  console.log('='.repeat(50));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    storageState: SESSION_FILE,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo'
  });
  const page = await context.newPage();

  try {
    const lancersJobs = await scrapeLancers(page);
    const cwJobs = await scrapeCrowdworks(page);
    const allJobs = [...lancersJobs, ...cwJobs];

    if (allJobs.length === 0) {
      console.log('\n❌ 条件に合う案件が見つかりませんでした。');
      return;
    }

    const csvPath = saveCSV(allJobs);
    console.log('\n' + '='.repeat(50));
    console.log(`✅ 完了: ランサーズNEW案件 ${lancersJobs.length}件 / CrowdWorks低競合 ${cwJobs.length}件`);
    console.log(`📄 CSV: ${path.basename(csvPath)}`);

    console.log('\n🎯 今日の提案候補:');
    lancersJobs.slice(0, 10).forEach((j, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. [ランサーズ NEW] ${j.title.slice(0, 60)}`);
      console.log(`      ${j.price || '要確認'} | ${j.deadline || ''} | ${j.url}`);
    });
    cwJobs.slice(0, 10).forEach((j, i) => {
      console.log(`  ${String(lancersJobs.length + i + 1).padStart(2)}. [CW 応募${j.proposals}件] ${j.title.slice(0, 55)}`);
      console.log(`      ${j.price || '要確認'} | ${j.url}`);
    });
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('エラー:', err.message); process.exit(1); });
