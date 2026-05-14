'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');
const SITE_URL = 'https://kakeru296.github.io/ai-cleaning-lp/';

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { generated: [], gsc: null };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function collectGscData() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    console.log('GOOGLE_SERVICE_ACCOUNT_KEY 未設定 → GSC収集スキップ');
    return null;
  }

  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
  });

  const sc = google.searchconsole({ version: 'v1', auth });
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];

  const [pageRes, queryRes] = await Promise.all([
    sc.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate, endDate,
        dimensions: ['page'],
        rowLimit: 200,
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: '/blog/' }] }]
      }
    }),
    sc.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate, endDate,
        dimensions: ['query', 'page'],
        rowLimit: 500
      }
    })
  ]);

  const gscData = {
    collectedAt: new Date().toISOString(),
    period: { start: startDate, end: endDate },
    pages: (pageRes.data.rows || []).map(r => ({
      url: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10
    })),
    queries: (queryRes.data.rows || []).map(r => ({
      query: r.keys[0],
      page: r.keys[1],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10
    }))
  };

  const state = loadState();
  state.gsc = gscData;
  saveState(state);

  // サマリー表示
  const topPages = [...gscData.pages].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  console.log(`✓ GSCデータ: ${gscData.pages.length}ページ / ${gscData.queries.length}クエリ`);
  if (topPages.length) {
    console.log('  トップページ:');
    topPages.forEach(p => console.log(`  ${p.clicks}clicks ${p.impressions}imp CTR${p.ctr}% pos${p.position} ${p.url.split('/blog/')[1] || p.url}`));
  }

  return gscData;
}

module.exports = { collectGscData };

if (require.main === module) {
  collectGscData().catch(console.error);
}
