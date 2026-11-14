# 프로테니스 · 랠리

테니스 레슨 예약 및 코치 주간 일정 관리 시연입니다. 로그인과 역할 검사는 서버에서 처리하고, 예약·출석 변경은 브라우저 안에 저장합니다. 실제 예약, 결제, 알림, Google Sheets 쓰기 기능은 없습니다.

## 로그인과 권한

- `/` → 로그인한 계정의 역할에 맞는 화면으로 이동합니다.
- `/login.html` → 이메일·비밀번호 로그인.
- `/coach.html` 및 코치 데이터·스크립트 → `coach` 역할만 접근 가능합니다.
- `/index.html` → `student` 역할만 접근 가능합니다. 코치는 직접 주소를 입력해도 403 응답을 받습니다.
- 비밀번호는 Supabase Auth가 검증합니다. 역할은 DB의 활성 `members` 행에서 결정하며, 코치는 활성 `coaches` 행도 필요합니다. 요청 본문이나 user_metadata로 역할을 바꿀 수 없습니다.
- 세션은 HttpOnly/SameSite 쿠키이며 HTTPS에서는 Secure 속성을 사용합니다. 공식 SSR SDK가 세션 갱신을 처리합니다.
- 보호된 페이지 요청마다 서명된 Auth 토큰과 현재 DB 역할을 확인합니다. 지원되는 서명키에서는 캐시된 공개키로 토큰을 검증합니다. 로그아웃은 해당 Supabase 세션을 종료하고 쿠키를 삭제합니다.
- 기본 계정·공용 비밀번호·회원가입은 없습니다. 설정이 없으면 로그인할 수 없습니다.

## 계정 설정과 로컬 실행

Node.js 24에서 프로젝트 폴더의 터미널을 열고 실행합니다.

```sh
npm ci
npm run dev
```

`.env.example`을 참고해 `.env.local`에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 설정합니다. 이 파일은 Git 제외 대상입니다. 계정 생성 및 DB 회원 연결은 [계정 설정 문서](docs/auth-setup.md)를 참고하세요. 기존 `AUTH_SECRET`, `AUTH_ACCOUNTS_JSON`은 사용하지 않습니다.

`http://localhost:3000/login.html`에 접속합니다. HTML 직접 열기나 정적 서버 대신 이 서버를 이용하세요.

## Vercel 배포

기존 정적 배포에서 서버 권한 검사 방식으로 변경됐습니다.

| 설정 | 값 |
|---|---|
| Framework Preset | Other |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `public` — 기존 `dist` 사용 금지 |
| Node.js | 24.x |

`vercel.json`에 빌드, 공개 출력 폴더, 함수 파일, 라우팅 설정이 들어 있습니다. 대시보드의 이전 Override는 해제하거나 위 값으로 맞춥니다.

Vercel **Settings → Environment Variables**에 `.env.local`의 다음 값을 추가하세요.

1. `SUPABASE_URL`: Supabase 프로젝트 URL.
2. `SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_`로 시작하는 공개 API 키.

Production과 필요한 Preview 환경에 설정한 뒤 **Redeploy**합니다. 이후 Supabase의 회원 역할/활성 상태 변경은 다음 요청부터 적용되며 재배포할 필요가 없습니다. 로그인 서버에는 service_role/secret 키가 필요하지 않습니다.

보호된 페이지는 Vercel Function이 세션과 역할을 검사한 뒤 반환합니다. CSS·화면 스크립트·가상 시연 데이터는 인증 조회 없이 제공하지만, 실제 데이터 파일 `dist/coach-data.js`는 함수 번들과 공개 배포에서 제외됩니다.

## 기능

코치 선택, 20분 단위 시간표, 레슨 등록, 예정 회차, 출석·불참, 예약 가능·불가 시간 설정, 브라우저 저장 및 초기화. 복잡한 기록은 원문 확인 대상으로 분리합니다. 출석은 예정 회차와 별개입니다.

## 데이터

Git에는 가상 시연 데이터 `dist/coach-data.sample.js`만 포함합니다. 실제 명단이 있는 `dist/coach-data.js`는 로컬에만 보관하며 인증 서버를 통해서도 제공하지 않습니다. 실제 데이터를 공개 저장소에 추가하지 마세요. 변경 내역은 계정별 브라우저 저장 공간에 보관하므로 다른 기기와 동기화되지 않습니다. 코치 역할은 모든 시연 코치 일정을 볼 수 있습니다. 개별 코치별 데이터 소유권 제한은 별도 기능입니다.

## 검증

```sh
npm test
npm run build
```

인증·권한·세션 만료·변조·직접 URL 접근·출처 검사 및 일정 데이터/이벤트 처리를 검사합니다. 실제 Vercel 배포 및 브라우저 시각 검증은 별도로 확인해야 합니다.

로그인 실패 제한은 Supabase Auth 제한과 함수 인스턴스의 보조 제한을 사용합니다. 앱의 메모리 제한은 여러 인스턴스가 공유하지 않습니다. 예약 저장은 아직 localStorage 시연 방식입니다. Supabase의 발급된 액세스 토큰은 로그아웃 후 만료까지 Data API에서 유효할 수 있으므로 민감한 쓰기 API 구현 시 세션 유효성도 검증해야 합니다.
