// Keep this loader ES5 so even an unsupported engine can explain the problem.
(function () {
    var message = '이 브라우저에서 로그인 기능을 시작하지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요. 계속 실패하면 이 기기의 최신 Chrome 등 지원 브라우저에서 monote를 열어 주세요. 기존 로컬 원고는 삭제되지 않습니다.';
    var badge = document.getElementById('cloud-sync-status');
    function explain() { window.alert(message); }
    if (badge) badge.onclick = explain;
    function notice() {
        var container = document.getElementById('auth-container');
        if (!container) return;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'google-login-btn';
        button.textContent = '로그인 도움말';
        button.onclick = explain;
        container.appendChild(button);
    }
    function load(src, next, fail) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = next;
        script.onerror = fail || notice;
        document.body.appendChild(script);
    }
    // Chromium 55 is the syntax baseline of the committed compatibility build.
    try { new Function('const a = () => 1; let {b} = {b:1};'); }
    catch (error) { notice(); return; }
    if (!window.Promise || !window.fetch || !window.URL || !window.URLSearchParams || !window.Headers) {
        notice(); return;
    }
    if (!window.globalThis) window.globalThis = window;
    if (!Object.fromEntries) {
        Object.fromEntries = function (entries) {
            var result = {};
            Array.from(entries).forEach(function (pair) {
                Object.defineProperty(result, pair[0], { value: pair[1], writable: true, enumerable: true, configurable: true });
            });
            return result;
        };
    }
    function app() { load('app-compat.js', function () {}); }
    function sdk() { load('vendor/supabase.js', app, app); }
    if (!window.AbortController) load('vendor/abortcontroller.js', sdk);
    else sdk();
}());
