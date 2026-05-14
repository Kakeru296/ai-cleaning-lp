'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const BASE_URL = 'https://kakeru296.github.io/ai-cleaning-lp';

function updateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const blogFiles = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

  const urls = [
    `  <url><loc>${BASE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${BASE_URL}/blog/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`,
    ...blogFiles.map(f => {
      const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
      const lastmod = dateMatch ? dateMatch[1] : today;
      return `  <url><loc>${BASE_URL}/blog/${f}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`;
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  fs.writeFileSync(SITEMAP, xml);
  console.log(`✓ sitemap.xml: ${blogFiles.length + 2}URL`);
}

module.exports = { updateSitemap };

if (require.main === module) { updateSitemap(); }
