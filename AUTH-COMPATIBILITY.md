# Google 로그인 및 구형 브라우저 호환성

## 확인된 코드 원인

- `cloud-sync-status`는 클릭 동작이 없는 div였다.
- Google 버튼은 `getSession()` 성공 후에만 등록되었고, SDK 누락 또는 세션 조회 실패는 버튼 없이 끝났다.
- 앱 및 CDN Supabase v2 SDK에 구형 엔진이 파싱하지 못하는 optional chaining 등이 있었다. Dolphin의 실제 엔진 버전과 오류는 실기기 확인 전에는 확정할 수 없다.
- `onAuthStateChange` 안에서 Supabase API를 await하여 인증 잠금 교착 가능성이 있었다.
- 기존 로그인은 팝업이 아닌 동일 탭 Redirect였다.

## 변경과 빌드

`browser-bootstrap.js`는 ES5 안내 및 API 감지, `globalThis`, `Object.fromEntries`, AbortController 호환 처리를 담당한다. Chromium 55 문법을 기준으로 빌드한 앱과 고정된 공식 Supabase SDK를 순서대로 로드한다. 원본은 `app-cover.js`, 생성 파일은 `app-compat.js`, SDK와 라이선스는 `vendor/`에 있다.

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

설치된 Edge로 검증할 때는 PowerShell에서 `$env:MONOTE_BROWSER_CHANNEL='msedge'`를 지정한다. 배포 전에 원본 변경 후 반드시 다시 빌드한다. SDK 업데이트는 package-lock.json을 갱신하고 동일 검증을 실행한다.

OAuth provider, redirectTo, 세션 저장 키 및 로컬 원고 저장·병합 로직은 유지했다. 로그인 직전 마지막 저장을 실행한다. OAuth 오류는 사용자에게 고정된 안내문으로 표시하며 토큰이나 원문 오류 URL을 출력하지 않는다. Google에서 차단 페이지가 표시되고 앱으로 돌아오지 않으면 앱은 그 내용을 읽을 수 없다.

## 검증 범위

자동 검증: 배포 JS의 ES2017 파싱과 loader의 ES5 파싱, 인증 취소·브라우저 차단 안내, 오류 URL 정리, Redirect 요청, 저장 호출 순서, 인증 콜백 잠금 회피, 세션 조회 실패 및 시간 초과. 실제 Chromium의 PC/모바일 화면에서 원고 보존, SDK 누락, 호환 API 누락, 모의 저장 세션의 G 표시, OAuth 취소 복귀를 검증한다. 서버·계정 응답은 테스트에서 모의 처리한다.

별도 확인 필요: 크레마 페블 Dolphin 실제 엔진 실행, 실제 Google 계정의 로그인 완료와 기존 계정 원고 동기화, 실제 Android/PC 브라우저 계정 로그인 완료. 모바일 화면 크기 검증은 Android 기기 검증을 대신하지 않는다. 다른 브라우저나 기기의 로그인은 Dolphin 세션으로 전달되지 않으며 로컬 원고도 브라우저별로 분리된다. 전환 전 필요한 로컬 원고는 내보내기로 보관한다.

Google이 `disallowed_useragent` 또는 안전하지 않은 브라우저 오류를 표시하면 User-Agent 위장이나 보안 우회 없이 해당 기기의 최신 지원 브라우저를 사용한다.

근거: [Supabase Google Redirect](https://supabase.com/docs/guides/auth/social-login/auth-google), [인증 이벤트 콜백 주의사항](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Google OAuth 정책](https://developers.google.com/identity/protocols/oauth2/policies).
