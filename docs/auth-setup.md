# Supabase 로그인 연결

## 적용 상태

2026-11-12: 신홍경 코치의 Supabase Auth 계정을 2호점 `members.auth_user_id` 및 `coaches.member_id`에 연결했다. 이메일 확인 완료, 회원/코치 모두 활성 상태다. 비밀번호는 Supabase에서 설정한 값을 사용한다. 과거 환경변수 계정의 비밀번호/세션은 사용하지 않는다.

로컬 `.env.local`에 프로젝트 URL과 publishable key를 설정했다. Vercel 설정과 재배포는 별도다. 기존 예약·출석 화면은 여전히 가상 시연 데이터와 localStorage를 사용한다.

## 처리 흐름

1. 브라우저가 같은 출처의 `/auth/login`으로 이메일과 비밀번호를 전송한다.
2. 서버가 Supabase `signInWithPassword`로 검증한다.
3. 인증된 사용자 권한으로 `members`에서 본인의 활성 행을 조회한다. 코치는 같은 지점의 활성 `coaches` 행도 확인한다.
4. 역할이 coach이면 코치 화면, student이면 레슨생 화면으로 이동한다. 연결되지 않은 계정과 현재 별도 화면이 없는 admin은 거부한다.
5. 서버가 HttpOnly/SameSite=Lax 쿠키에 세션을 저장한다. HTTPS에서는 Secure를 적용한다. 브라우저 JS와 localStorage에는 토큰을 전달하지 않는다.
6. 보호된 요청마다 `getUser()`와 DB 권한 조회를 수행한다. SDK가 만료된 토큰을 갱신하면 새 쿠키를 오류/리다이렉트 응답에도 전달한다. 응답은 캐시하지 않는다.
7. 로그아웃은 `signOut({scope:'local'})`로 해당 세션을 종료하고 분할된 쿠키까지 삭제한다.

키는 publishable key만 사용하고 DB 조회는 사용자 JWT로 RLS를 적용한다. 사용자 입력의 role, 이메일 문자열만으로 권한을 부여하거나 `user_metadata`를 신뢰하지 않는다. 설정/DB 장애 시 예전 계정 인증으로 우회하지 않는다.

## Vercel 설정

Settings → Environment Variables에 로컬 `.env.local`의 다음 두 값을 등록한다.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Production과 필요한 Preview 환경을 선택하고 새 코드로 재배포한다. Output Directory는 `public`, Build Command는 `npm run build`, Node.js는 24.x다. 기존 `AUTH_SECRET`과 `AUTH_ACCOUNTS_JSON`은 새 코드에서 읽지 않으므로 전환 후 제거할 수 있다. `service_role`, secret key, DB 비밀번호는 필요하지 않다.

## 새 계정과 비밀번호

Supabase Authentication → Users에서 사용자를 생성하고, 운영자가 확인한 해당 사용자의 UUID를 DB 회원 행에 연결한다. 코치 회원은 `role='coach'`, `status='active'`와 활성 `coaches` 행이 필요하다. 공개 회원가입은 제공하지 않는다. 계정 생성만으로 코치 권한은 생기지 않는다.

비밀번호는 Supabase Auth에서 관리한다. 앱 내 비밀번호 재설정 UI와 이메일 전송 설정은 이번 범위에 포함하지 않는다. 기존 `npm run setup:auth` 명령은 새 절차 안내만 출력하며 `.env.local`을 덮어쓰지 않는다.

## 검증

실제 계정의 Auth UUID 연결과 RLS 상태를 SQL 트랜잭션에서 조회해 확인했다. SDK를 그대로 사용하고 외부 HTTP 응답만 대체한 자동 테스트에서 정상 로그인, 다른 역할 접근 금지, 메타데이터/쿠키 위조 거부, 미등록/비활성 계정, DB 장애, 세션 갱신, 분할 쿠키, 로그아웃, CSRF를 검사한다. 실제 비밀번호를 이용한 최종 로그인은 사용자가 로컬 또는 배포된 화면에서 확인한다.

참고: [공식 서버 쿠키 연동](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [비밀번호 로그인](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

보안 검사에서는 유출 비밀번호 보호가 비활성화된 WARN 1건이 확인됐다. [공식 문서](https://supabase.com/docs/guides/auth/password-security)에 따르면 Pro 이상에서 제공되는 기능이며, 이번 작업에서 요금제나 해당 설정을 변경하지 않았다.

로컬 로그인 중 연결 오류가 나면 서버의 외부 네트워크 접근도 확인한다. 이번 실행에서 샌드박스가 Supabase 요청을 EACCES로 차단해, 외부 연결이 가능한 환경에서 개발 서버를 다시 실행했다.
