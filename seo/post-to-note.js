'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, 'note-drafts');

function getLatestDraft() {
  if (!fs.existsSync(DRAFTS_DIR)) { console.log('note-draftsディレクトリが存在しない'); return null; }
  const files = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
  if (files.length === 0) { console.log('下書きファイルなし'); return null; }
  const raw = fs.readFileSync(path.join(DRAFTS_DIR, files[0]), 'utf8');
  const lines = raw.split('\n');
  const title = lines[0].replace(/^#\s*/, '').trim();
  const body = lines.slice(2).join('\n').trim();
  return { title, body, filename: files[0] };
}

async function main() {
  const email = process.env.NOTE_EMAIL;
  const password = process.env.NOTE_PASSWORD;
  if (!email || !password) { console.log('NOTE_EMAIL/NOTE_PASSWORD 未設定'); process.exit(0); }

  const draft = getLatestDraft();
  if (!draft) { console.log('投稿する下書きなし'); process.exit(0); }
  console.log(`投稿予定: "${draft.title}"`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  try {
    // ログイン
    await page.goto('https://note.com/login?redirectPath=%2F', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('✓ ログイン完了');

    // 新規記事作成
    await page.goto('https://note.com/notes/new', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // タイトル入力
    const titleSel = 'textarea[placeholder="記事タイトル"], [data-placeholder="記事タイトル"]';
    await page.waitForSelector(titleSel, { timeout: 10000 });
    await page.click(titleSel);
    await page.fill(titleSel, draft.title);
    console.log('✓ タイトル入力');

    // 本文入力（ProseMirrorエディタ）
    const editorSel = '.ProseMirror';
    await page.waitForSelector(editorSel, { timeout: 10000 });
    await page.click(editorSel);
    await page.waitForTimeout(500);
    for (const line of draft.body.split('\n')) {
      if (line.trim()) await page.keyboard.type(line, { delay: 3 });
      await page.keyboard.press('Enter');
    }
    console.log('✓ 本文入力');

    // 公開
    const publishBtn = await page.$('button:has-text("公開する")');
    if (publishBtn) {
      await publishBtn.click();
      await page.waitForTimeout(2000);
      const confirmBtn = await page.$('button:has-text("投稿する")');
      if (confirmBtn) { await confirmBtn.click(); await page.waitForTimeout(2000); }
      console.log('✓ 公開完了:', page.url());
    } else {
      console.log('⚠ 公開ボタンが見つかりません');
    }
  } catch (err) {
    console.error('エラー:', err.message);
    await page.screenshot({ path: 'note-post-error.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
