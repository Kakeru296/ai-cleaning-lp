'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const TOPICS_FILE = path.join(__dirname, 'topics.json');
const STATE_FILE = path.join(__dirname, 'state.json');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { generated: [], gsc: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function slugify(str) {
  const map = {
    'ハウスクリーニング': 'house-cleaning', 'エアコン': 'aircon', 'ネイルサロン': 'nail-salon',
    '問い合わせ': 'inquiry', '自動化': 'automation', 'LINE': 'line', '見積もり': 'quote',
    '集客': 'marketing', '清掃': 'cleaning', 'リフォーム': 'reform', '便利屋': 'handy-man',
    '通知': 'notify', '方法': 'how', '設定': 'setup', '使い方': 'usage', '比較': 'compare',
    '害虫駆除': 'pest-control', '引越し': 'moving', '不用品回収': 'junk-removal',
    '整骨院': 'clinic', 'マッサージ': 'massage', '家事代行': 'housework', 'サービス業': 'service'
  };
  let s = str;
  for (const [ja, en] of Object.entries(map)) s = s.split(ja).join(en);
  return s.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60).toLowerCase();
}

function getDate() {
  return new Date().toISOString().split('T')[0];
}

function htmlTemplate(meta, bodyContent) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${meta.title}</title>
<meta name="description" content="${meta.description}">
<link rel="canonical" href="https://kakeru296.github.io/ai-cleaning-lp/blog/${meta.filename}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XGXL8YP9MT"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-XGXL8YP9MT');</script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Hiragino Sans','Meiryo',sans-serif; color: #1a1a2e; background: #fff; line-height: 1.8; }
.header { background: #1a1a2e; color: white; padding: 16px 24px; }
.header a { color: #ffd700; text-decoration: none; font-size: 14px; }
.container { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; }
h1 { font-size: 26px; line-height: 1.5; margin-bottom: 16px; }
h2 { font-size: 20px; margin: 40px 0 16px; padding-left: 12px; border-left: 4px solid #e65100; }
h3 { font-size: 17px; margin: 28px 0 10px; color: #333; }
p { margin-bottom: 16px; color: #333; }
.meta { font-size: 13px; color: #888; margin-bottom: 32px; }
.highlight { background: #fff8e1; border-left: 4px solid #ffd700; padding: 16px 20px; margin: 24px 0; border-radius: 4px; }
.cta { background: linear-gradient(135deg, #e65100, #ff6f00); color: white; text-align: center; padding: 32px 24px; border-radius: 12px; margin-top: 48px; }
.cta h3 { color: white; margin: 0 0 12px; font-size: 20px; }
.cta a { display: inline-block; background: white; color: #e65100; font-weight: 700; padding: 14px 36px; border-radius: 50px; text-decoration: none; margin-top: 16px; font-size: 16px; }
ul, ol { padding-left: 24px; margin-bottom: 16px; }
li { margin-bottom: 8px; color: #333; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { padding: 10px 14px; border: 1px solid #ddd; font-size: 14px; }
th { background: #f5f5f5; font-weight: 700; }
</style>
</head>
<body>
<div class="header"><a href="../index.html">← トップページへ戻る</a></div>
<div class="container">
  <p class="meta">${meta.date} | Kakeru｜問合わせを逃さない仕組み屋</p>
  <h1>${meta.title}</h1>
${bodyContent}
  <div class="cta">
    <h3>無料モニター募集中（先着1社限定）</h3>
    <p>自動見積もり＋LINE通知の仕組みを、先着1社限定で無料で構築します。</p>
    <a href="../index.html">詳しくはこちら</a>
  </div>
</div>
</body>
</html>`;
}

async function generateArticle(keyword, intent) {
  const intentGuide = {
    'how-to': '具体的な手順・ステップを示す実践ガイド',
    'info': '読者の疑問に答える情報提供記事',
    'problem': '問題→原因→解決策の流れで書く課題解決記事',
    'comparison': '選択肢を比較して判断を助ける比較記事',
    'case': '具体的な事例・効果を示すケーススタディ'
  };

  // LSI keywords to enrich content naturally
  const lsiMap = {
    'LINE': '公式アカウント, チャット, メッセージ, 通知, 無料プラン',
    '自動化': '効率化, 省力化, システム化, DX, デジタル化',
    '見積もり': '料金表, 価格, コスト, 費用, 相見積もり',
    '問い合わせ': 'お問い合わせ, 問合せ, コンタクト, 集客, 顧客獲得',
    '清掃': 'ハウスクリーニング, 掃除, 清掃業者, 清掃会社',
    'GAS': 'Google Apps Script, スプレッドシート, Googleフォーム',
  };
  const lsiKws = Object.entries(lsiMap)
    .filter(([k]) => keyword.includes(k))
    .map(([,v]) => v).join(', ') || '問い合わせ自動化, LINE通知, 業務効率化';

  // Collect recent blog filenames for internal links
  let internalLinks = '';
  try {
    const files = fs.readdirSync(BLOG_DIR)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .sort().reverse().slice(0, 3);
    internalLinks = files.map(f => {
      const c = fs.readFileSync(path.join(BLOG_DIR, f), 'utf8');
      const t = (c.match(/<title>(.*?)<\/title>/) || [])[1] || f;
      return `<li><a href="${f}">${t}</a></li>`;
    }).join('');
  } catch {}

  const internalLinkSection = internalLinks
    ? `<h2>関連記事</h2><ul>${internalLinks}</ul>`
    : '';

  const prompt = `あなたはSEOに強い日本語ライターです。以下のキーワードで検索するサービス業の経営者向けに、検索上位を狙える高品質な記事を書いてください。

キーワード: ${keyword}
関連キーワード（自然に含める）: ${lsiKws}
記事スタイル: ${intentGuide[intent] || '情報提供記事'}

必ずJSON形式で返してください（他のテキストは不要）:
{
  "title": "タイトル（キーワードを含む60文字以内・数字か疑問形を使う）",
  "description": "メタディスクリプション（キーワードを含む120文字以内・ベネフィットを明記）",
  "body": "HTML本文"
}

本文要件（全て必須）:
1. 冒頭: <div class="highlight"><strong>この記事でわかること</strong><br>・ポイント1<br>・ポイント2<br>・ポイント3</div>
2. H2見出し5〜6個（キーワードの検索意図を完全網羅）
3. 各H2配下にH3を1〜2個設ける
4. 具体的な数字・比較・ステップを含める（「○○%削減」「○分で完了」等）
5. FAQ セクション（H2「よくある質問」＋3問、各Q/Aを<dt><dd>タグで）
6. 最後のH2は「まとめ」
7. 2000〜2500文字（必ず守ること）
8. 架空の企業名・サービス名は使わない
9. h1タグとCTAは含めない（外部から追加される）`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  const result = JSON.parse(match[0]);
  if (internalLinkSection) result.body += internalLinkSection;
  return result;
}

function updateBlogIndex() {
  const files = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort().reverse();

  const cards = files.slice(0, 100).map(filename => {
    const content = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8');
    const titleMatch = content.match(/<title>(.*?)<\/title>/);
    const dateMatch = content.match(/class="meta">(\d{4}-\d{2}-\d{2})/);
    const title = titleMatch ? titleMatch[1] : filename;
    const date = dateMatch ? dateMatch[1] : '';
    return `  <div class="card"><h2><a href="${filename}">${title}</a></h2><p class="card-meta">${date}</p></div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ブログ | 問合わせ自動化・LINE通知・見積もり自動化の情報</title>
<meta name="description" content="サービス業向けの問い合わせ自動化・LINE通知・自動見積もりの実践情報。${files.length}記事掲載中。">
<link rel="canonical" href="https://kakeru296.github.io/ai-cleaning-lp/blog/">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XGXL8YP9MT"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-XGXL8YP9MT');</script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Hiragino Sans','Meiryo',sans-serif; color: #1a1a2e; background: #fff; }
.header { background: #1a1a2e; color: white; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
.header a { color: #ffd700; text-decoration: none; font-size: 14px; }
.container { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; }
h1 { font-size: 24px; margin-bottom: 8px; }
.subtitle { color: #666; font-size: 14px; margin-bottom: 40px; }
.card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
.card h2 { font-size: 15px; margin-bottom: 4px; }
.card h2 a { color: #1a1a2e; text-decoration: none; }
.card h2 a:hover { color: #e65100; }
.card-meta { font-size: 12px; color: #999; }
.cta-banner { background: linear-gradient(135deg, #e65100, #ff6f00); color: white; border-radius: 12px; padding: 24px; margin-top: 48px; text-align: center; }
.cta-banner a { display: inline-block; background: white; color: #e65100; font-weight: 700; padding: 12px 32px; border-radius: 50px; text-decoration: none; margin-top: 12px; }
</style>
</head>
<body>
<div class="header">
  <span style="color:white;font-weight:700;">Kakeru｜問合わせを逃さない仕組み屋</span>
  <a href="../index.html">← トップページへ</a>
</div>
<div class="container">
  <h1>ブログ</h1>
  <p class="subtitle">サービス業の問合わせ自動化・LINE通知・自動見積もりの実践情報（${files.length}記事）</p>
${cards}
  <div class="cta-banner">
    <h3>無料モニター募集中（先着1社限定）</h3>
    <a href="../index.html">詳しくはこちら</a>
  </div>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), html);
  console.log(`✓ blog/index.html 更新 (${files.length}記事)`);
}

async function generateArticles(count = 25) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  const state = loadState();
  const topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8')).seeds;
  const generated = new Set(state.generated || []);

  // 未生成トピックを優先、足りなければバリエーション生成
  const remaining = topics.filter(t => !generated.has(t.kw));
  const queue = remaining.slice(0, count);

  if (queue.length < count) {
    const variants = ['費用と相場', '選び方', '失敗しない方法', 'プロが教えるコツ', '初心者向け解説'];
    for (const t of topics) {
      for (const v of variants) {
        const kw = `${t.kw.split(' ')[0]} ${v}`;
        if (!generated.has(kw) && queue.length < count) {
          queue.push({ kw, intent: 'info' });
        }
      }
      if (queue.length >= count) break;
    }
  }

  console.log(`生成開始: ${queue.length}本`);
  const newFiles = [];

  for (let i = 0; i < queue.length; i++) {
    const { kw, intent } = queue[i];
    process.stdout.write(`[${i + 1}/${queue.length}] ${kw} ... `);

    try {
      const article = await generateArticle(kw, intent);
      const slug = slugify(kw);
      const date = getDate();
      const filename = `${date}-${slug}.html`;
      const filepath = path.join(BLOG_DIR, filename);

      fs.writeFileSync(filepath, htmlTemplate({ title: article.title, description: article.description, filename, date }, article.body + internalLinkSection));
      generated.add(kw);
      newFiles.push({ filename, title: article.title, date });
      state.generated = [...generated];
      saveState(state);
      console.log('✓');
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }

    if (i < queue.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  updateBlogIndex();
  console.log(`\n完了: ${newFiles.length}本生成`);
  return newFiles;
}

module.exports = { generateArticles, updateBlogIndex };

if (require.main === module) {
  const count = parseInt(process.argv[2] || '25');
  generateArticles(count).catch(console.error);
}
