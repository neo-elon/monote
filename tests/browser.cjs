const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const manuscript = { id: 'local-test', title: '보존 검증 원고', chapters: [{ id: 'ch-test', title: '첫 장', content: '원고 보존 확인' }], updatedAt: '2026-10-14T00:00:00Z', createdAt: '2026-10-14T00:00:00Z', coverColor: 'charcoal' };
async function main() {
  const server = http.createServer((req, res) => {
    const file = path.join(process.cwd(), decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(process.cwd() + path.sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.MONOTE_BROWSER_CHANNEL ? { channel: process.env.MONOTE_BROWSER_CHANNEL } : {}) });
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const scenario of ['desktop', 'mobile', 'missing-sdk', 'legacy-apis', 'signed-in', 'cancelled']) {
      const context = await browser.newContext({ viewport: scenario === 'mobile' ? { width: 412, height: 915 } : { width: 1000, height: 750 } });
      await context.addInitScript(({ manuscript, scenario }) => {
        localStorage.setItem('monote-projects', JSON.stringify([manuscript]));
        if (scenario === 'legacy-apis') { window.AbortController = undefined; window.globalThis = undefined; Object.fromEntries = undefined; }
        if (scenario === 'signed-in') {
          localStorage.setItem('sb-opucvfqiavvcujtzwzvz-auth-token', JSON.stringify({
            access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer',
            expires_at: Math.floor(Date.now()/1000) + 3600,
            user: { id: 'test-user', email: 'test@example.com', user_metadata: { pen_name: '검증 작가' } }
          }));
        }
      }, { manuscript, scenario });
      await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
      let oauthURL;
      await context.route('https://opucvfqiavvcujtzwzvz.supabase.co/**', route => {
        if (route.request().url().includes('/auth/v1/authorize')) {
          oauthURL = route.request().url();
          return route.fulfill({ contentType: 'text/html', body: '<h1>OAuth navigation captured</h1>' });
        }
        return route.fulfill({ contentType: 'application/json', body: '[]' });
      });
      if (scenario === 'missing-sdk') await context.route('**/vendor/supabase.js', route => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [], dialogs = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
      await page.goto(base + (scenario === 'cancelled' ? '/#error=access_denied' : '/'));
      await page.waitForFunction(() => document.querySelector('#google-login-btn') || document.querySelector('#auth-container').textContent === 'G');
      await page.waitForFunction(() => document.body.textContent.includes('보존 검증 원고'));
      assert.deepEqual(errors, [], scenario);
      const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('monote-projects')));
      assert.equal(saved.find(p => p.id === 'local-test').chapters[0].content, manuscript.chapters[0].content);
      if (scenario === 'signed-in') {
        assert.equal(await page.locator('#auth-container').textContent(), 'G');
      } else if (scenario === 'missing-sdk') {
        await page.locator('#cloud-sync-status').click();
        assert.ok(dialogs.some(value => value.includes('지원 브라우저')));
      } else if (scenario === 'cancelled') {
        assert.ok(dialogs.some(value => value.includes('취소')));
        assert.equal(new URL(page.url()).hash, '');
      } else {
        await page.locator('#cloud-sync-status').click();
        await page.waitForURL('**/auth/v1/authorize**');
        assert.equal(new URL(oauthURL).searchParams.get('provider'), 'google');
        assert.equal(new URL(oauthURL).searchParams.get('redirect_to'), base + '/');
      }
      console.log('PASS ' + scenario + ': no page errors, local manuscript preserved');
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
