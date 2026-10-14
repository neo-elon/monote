const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const source = fs.readFileSync('app-cover.js', 'utf8');
function authContext(extra = {}) {
  const alerts = [];
  const context = vm.createContext({
    URLSearchParams, Promise, setTimeout, clearTimeout, console,
    alert: value => alerts.push(value), currentLang: 'ko',
    window: { location: { origin: 'https://neo-elon.github.io', pathname: '/monote/', search: '', hash: '' } },
    history: { replaceState() {} }, ...extra
  });
  vm.runInContext(source.slice(source.indexOf('function authWithTimeout('), source.indexOf('async function saveProfileToCloud(')), context);
  return { context, alerts };
}
test('all shipped scripts parse as ES2017; loader as ES5', () => {
  for (const file of ['app-compat.js', 'vendor/supabase.js', 'vendor/abortcontroller.js']) {
    acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2017 });
  }
  acorn.parse(fs.readFileSync('browser-bootstrap.js', 'utf8'), { ecmaVersion: 5 });
});
test('OAuth cancellation and browser rejection are understandable and tokens are not shown', () => {
  const { context, alerts } = authContext();
  context.showAuthError({ code: 'access_denied' });
  context.showAuthError({ code: 'disallowed_useragent' });
  assert.match(alerts[0], /취소/);
  assert.match(alerts[1], /Chrome/);
});
test('OAuth return removes error fields and preserves unrelated URL fields', () => {
  let replaced;
  const { context, alerts } = authContext({
    window: { location: { pathname: '/monote/', search: '?keep=1', hash: '#error=access_denied&error_description=secret' } },
    history: { replaceState: (_state, _title, url) => { replaced = url; } }
  });
  context.showOAuthReturnError();
  assert.equal(alerts.length, 1);
  assert.equal(replaced, '/monote/?keep=1');
  assert.ok(!alerts[0].includes('secret'));
});
test('login flushes edits and keeps existing provider/redirect flow', async () => {
  let flushed = false;
  let request;
  const { context } = authContext({
    supabaseClient: { auth: { signInWithOAuth: async value => {
      assert.equal(flushed, true); request = value; return { error: null };
    } } }, flushPendingSave: () => { flushed = true; }
  });
  vm.runInContext(source.slice(source.indexOf('async function handleGoogleLogin('), source.indexOf('async function handleLogout(')), context);
  await context.handleGoogleLogin();
  assert.equal(request.provider, 'google');
  assert.equal(request.options.redirectTo, 'https://neo-elon.github.io/monote/');
  assert.equal(request.options.skipBrowserRedirect, undefined);
});
test('auth callback returns immediately and defers Supabase calls until after the lock', async () => {
  let callback, insideCallback = false, loads = 0;
  const { context } = authContext({
    supabaseClient: { auth: {
      onAuthStateChange: fn => { callback = fn; },
      getSession: async () => ({ data: { session: null }, error: null })
    } }, updateAuthUI: () => { assert.equal(insideCallback, false); },
    loadProjects: async () => { assert.equal(insideCallback, false); loads++; }
  });
  vm.runInContext(source.slice(source.indexOf('async function checkAuthState('), source.indexOf('function authWithTimeout(')), context);
  await context.checkAuthState();
  insideCallback = true;
  assert.equal(callback('SIGNED_IN', { user: { id: 'test' } }), undefined);
  insideCallback = false;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(loads, 1);
});
test('failed session lookup is visible and listener stays registered for retry', async () => {
  let callback;
  const { context, alerts } = authContext({
    supabaseClient: { auth: {
      onAuthStateChange: fn => { callback = fn; },
      getSession: async () => { throw new Error('Network unavailable'); }
    } }, updateAuthUI() {}, loadProjects: async () => {}
  });
  vm.runInContext(source.slice(source.indexOf('async function checkAuthState('), source.indexOf('function authWithTimeout(')), context);
  await context.checkAuthState();
  assert.equal(typeof callback, 'function');
  assert.match(alerts[0], /인터넷/);
});
test('stalled authentication times out with no storage mutation', async () => {
  const { context } = authContext({ setTimeout: fn => setTimeout(fn, 1) });
  await assert.rejects(context.authWithTimeout(new Promise(() => {})), /auth_timeout/);
});
