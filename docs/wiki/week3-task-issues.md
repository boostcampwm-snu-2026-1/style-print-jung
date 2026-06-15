# 3주차 Task 계획

3주차 목표는 새 기능을 넓히기보다 StylePrint 프로토타입이 실제로 성공적으로 생성되고, 배포 환경에서 확인 가능하며, 핵심 흐름을 테스트로 보호하는 것이다.

## 완료 기준

- v0 생성 요청 후 `generatedCode.previewUrl`이 만들어지고 `PreviewPane` iframe에서 결과가 렌더링된다.
- screenshot capture 실패는 생성 성공 응답을 막지 않고 `screenshotError`로만 남는다.
- Vercel frontend와 Railway backend production 배포가 완료된다.
- Vercel 화면에서 Railway `/api/...` 요청과 `/generated-previews/...` asset 접근이 동작한다.
- 현재 frontend component test에 더해 API/preview artifact 테스트가 추가된다.
- Agent 작업은 PRD/Issue 중심으로 쪼개고, 검증 기준과 commit 단위를 작업 전에 고정한다.

## 현재 상태

- 배포 설정 기반은 있다.
  - `vercel.json`: `npm run build:web`, `apps/web/dist`
  - `railway.json`: `npm run start`, `/health`
  - frontend production API 연결은 `VITE_API_BASE_URL`을 사용한다.
  - API는 `/health`, `/api/...`, `/uploads/...`, `/generated-previews/...`를 제공한다.
- preview 기반은 있다.
  - API가 generated code를 preview artifact로 bundle한다.
  - frontend는 `PreviewPane` iframe으로 `previewUrl`을 표시한다.
  - local Vite dev server는 `/generated-previews`를 API로 proxy한다.
- 테스트 기반은 아직 좁다.
  - `npm run test` 기준 frontend component test 2개 파일, 7개 테스트가 통과한다.
  - 대상은 `PreviewPane`, `ManualFacetSelector`다.
  - API route, preview artifact, deployment smoke test는 아직 부족하다.

## Task 1. 프로토타입 생성 안정화

목표:

- 실제 생성 흐름에서 결과 preview가 빈 화면으로 끝나지 않게 한다.

작업 범위:

- `/api/generate/v0` 성공 응답에 `generatedCode.previewUrl`이 포함되는지 확인한다.
- `/api/preview/build`가 generated code를 다시 preview artifact로 만들 수 있는지 확인한다.
- `/generated-previews/:previewId/index.html`와 bundled `preview.js`가 API에서 제공되는지 확인한다.
- screenshot capture는 best-effort로 유지한다.

검증 기준:

- 생성 성공 시 result tab에 iframe preview가 렌더링된다.
- preview build 실패 시 frontend가 명확한 error UI를 보여준다.
- screenshot capture 실패가 `/api/generate/v0` 성공 응답을 실패로 바꾸지 않는다.
- `npm run test`, `npm run typecheck`, `npm run build`가 통과한다.

## Task 2. Vercel/Railway production 배포 완료

목표:

- local demo가 아니라 외부 URL에서 prototype을 확인 가능한 상태로 만든다.

작업 범위:

- Vercel frontend project 설정을 `vercel.json`과 맞춘다.
- Railway backend project 설정을 `railway.json`과 맞춘다.
- production env를 정리한다.
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `V0_API_KEY`
  - `V0_MODEL`
  - `WEB_ORIGIN`
  - `VITE_API_BASE_URL`
- Railway `/health`와 Vercel에서 Railway API 호출을 확인한다.

검증 기준:

- Vercel production build가 성공한다.
- Railway `/health`가 200으로 응답한다.
- Vercel frontend에서 `/api/...` 요청이 Railway backend로 전달된다.
- generated preview asset이 production URL에서 열린다.

주의:

- 현재 저장소는 `data/*.json`과 `public/uploads` 기반이다.
- Railway filesystem은 재배포/재시작 시 영속 저장소로 보기 어렵다.
- production DB/object storage는 별도 issue로 분리한다.

## Task 3. 테스트 코드 확장

목표:

- preview 생성과 배포에 필요한 핵심 경로를 테스트로 보호한다.

작업 범위:

- API/preview 전용 Vitest 설정을 추가한다.
- 기존 `npm run test`가 frontend component test와 API preview test를 함께 실행하게 한다.
- 우선순위 테스트:
  - `writePreviewArtifact()`가 `index.html`, `preview.js`, 선택적 `preview.css`를 생성한다.
  - `readPreviewArtifactFile()`이 허용된 preview file만 반환한다.
  - path traversal 성격의 filename은 preview file로 처리하지 않는다.
  - `/api/preview/build`가 id/code 누락 시 400을 반환한다.
  - `/api/preview/build`가 정상 입력 시 `previewUrl`을 반환한다.
  - 기존 `PreviewPane` 테스트는 유지한다.

검증 기준:

- `npm run test`가 frontend/API 테스트를 모두 실행한다.
- `npm run typecheck`가 통과한다.
- `npm run build`가 통과한다.

## Task 4. Agent/AI 작업 방식 개선

목표:

- AI에게 큰 작업을 한 번에 던지는 방식에서 벗어나, 사람이 리뷰하고 되돌리기 쉬운 단위로 작업한다.

채택:

- AI가 스스로 의심한 지점을 cross-check하게 한다.
- PRD 또는 Issue 중심으로 목표, 범위, 성공 기준, 검증 명령을 먼저 고정한다.
- 코드 작업 전 `test.todo` 또는 checklist로 단계를 나눈다.
- 30분 이상 걸리는 작업은 중간 상태를 요약한다.
- 의미 있는 검증 지점에서 commit을 분리한다.
- 문서, workflow, skill 후보는 가능한 한 repo 안에서 관리한다.
- 리뷰를 AI에게 대신 맡기기보다 사람이 리뷰하기 쉬운 diff, 체크리스트, 실행 결과를 만들게 한다.

보류:

- tRPC 전환
  - 현재는 `/api/...` route 호환성이 더 중요하다.
  - API 문서화 비용이 커질 때 다시 검토한다.
- Electron 앱
  - 지금은 웹 배포 prototype을 먼저 끝낸다.
  - offline/local-first 요구가 명확해지면 검토한다.
- Storybook
  - UI 상태 검증 후보로 기록하되, 이번 주 필수 작업은 아니다.
- 본격 멀티 에이전트 병렬화
  - worktree 기반 작업 분리 원칙은 기록한다.
  - 이번 주에는 충돌 비용보다 prototype 안정화와 배포 완료가 우선이다.

별도 Issue 후보:

- 인증과 사용자별 데이터 분리
- production DB와 object storage 전환
- local browser storage 또는 IndexedDB 기반 개인화 저장
- Storybook 또는 visual regression test 도입
- worktree 기반 병렬 Agent 실험

## 작업 순서

1. Week 3 문서와 issue 후보를 repo에 남긴다.
2. preview artifact/API 테스트를 추가한다.
3. `npm run test`, `npm run typecheck`, `npm run build`로 local 안정성을 확인한다.
4. prototype 생성 흐름을 local smoke test로 확인한다.
5. Vercel/Railway production 배포를 완료한다.
6. 배포 URL 기준으로 `/health`, frontend load, API call, generated preview asset 접근을 확인한다.
7. 남은 인증/저장소/Storybook/worktree 실험은 별도 issue로 분리한다.
