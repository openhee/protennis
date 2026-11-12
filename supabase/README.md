# Supabase DB

- `migrations/`: 원격에 적용된 변경 이력. 파일 버전은 원격 migration history와 일치한다.
- `schema.sql`: 최초 구조 참고본. 이미 적용된 DB에 다시 실행하지 않는다.
- `tests/schema-smoke.sql`: 트랜잭션 안에서 가상 테스트 행을 만들고 ROLLBACK하는 제약·권한 검사.
- `../docs/database-status.md`: 적용 결과, 검증 범위와 후속 작업.

프로젝트 비밀번호나 키는 이 폴더에 저장하지 않는다. Google 원본 시트는 변경하지 않았다.
