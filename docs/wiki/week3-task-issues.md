# 3주차 Task 계획

3주차 목표는 새 기능을 넓히기보다 StylePrint 프로토타입이 실제로 성공적으로 생성되고, 배포 환경에서 확인 가능하며, 핵심 흐름을 테스트로 보호하는 것이다.

## 목표

- v0 생성 결과를 iframe preview로 확인 가능한 end-to-end 흐름으로 안정화한다.
- preview artifact, API route, coherence 평가, audit 연결을 테스트와 문서로 추적 가능하게 만든다.
- Vercel frontend와 Railway backend 배포 상태를 smoke check로 확인한다.
- 이번 주 구현 결과를 GitHub Issue 단위로 정리하고, 완료된 항목은 close 가능한 근거를 남긴다.

## 완료 기준

- v0 생성 요청 후 `generationJobId`가 반환되고, polling 결과의 `generatedCode.previewUrl`이 `PreviewPane` iframe에서 렌더링된다.
- preview build 실패는 frontend error UI로 표시되고, screenshot capture 실패는 생성 성공 응답을 막지 않는다.
- Vercel frontend와 Railway backend production 배포가 완료된다.
- Vercel 화면에서 Railway `/api/...` 요청과 `/generated-previews/...` asset 접근이 동작한다.
- frontend component test에 더해 API/preview artifact/coherence route 테스트가 실행된다.
- Agent 작업은 PRD/Issue 중심으로 쪼개고, 검증 기준과 commit 단위를 작업 전에 고정한다.

## 현재 상태

- 완료된 구현:
  - `/api/generate/v0`는 긴 v0 생성을 background job으로 처리하고 `/api/generate/jobs/:jobId`로 상태를 조회한다.
  - API는 generated code를 preview artifact로 bundle하고 `/generated-previews/:previewId/:filename`으로 제공한다.
  - `PreviewPane`은 `previewUrl`이 있으면 iframe을 바로 렌더링하고, 없으면 `/api/preview/build`를 호출해 preview를 다시 만든다.
  - audit report는 `generatedCodeId`와 연결된다.
  - coherence 평가는 rule-based dimension score, shadow judge 결과, human feedback 저장 흐름을 갖는다.
  - 배포 smoke script가 `/health`, frontend HTML, preview build, preview asset 접근을 확인한다.
- 배포 설정:
  - `vercel.json`: `npm run build:web`, `apps/web/dist`
  - `railway.json`: `npm run start`, `/health`
  - frontend production API 연결은 `VITE_API_BASE_URL`을 사용한다.
  - API는 `/health`, `/api/...`, `/uploads/...`, `/generated-previews/...`를 제공한다.
- 남은 운영 한계:
  - `data/*.json`과 `public/uploads`는 local runtime data다.
  - Railway filesystem은 재배포/재시작 시 영속 저장소로 보기 어렵다.
  - production DB/object storage, 인증, 사용자별 데이터 분리는 후속 issue로 분리한다.

## Task 1. 프로토타입 생성 안정화

목표:

- 실제 생성 흐름에서 결과 preview가 빈 화면으로 끝나지 않게 한다.

작업 범위:

- `/api/generate/v0`가 생성 job을 만들고 `/api/generate/jobs/:jobId`가 결과를 반환하는지 확인한다.
- `/api/preview/build`가 generated code를 다시 preview artifact로 만들 수 있는지 확인한다.
- `/generated-previews/:previewId/index.html`와 bundled `preview.js`가 API에서 제공되는지 확인한다.
- screenshot capture는 best-effort로 유지한다.

검증 기준:

- 생성 성공 시 result tab에 iframe preview가 렌더링된다.
- preview build 실패 시 frontend가 명확한 error UI를 보여준다.
- screenshot capture 실패가 generation job 성공 결과를 실패로 바꾸지 않는다.
- `npm run test`, `npm run typecheck`, `npm run build`가 통과한다.

상태:

- 완료.
- 근거 commit:
  - `6bb9156` `fix: run v0 generation as background job`
  - `d906c9c` `test: add preview workflow coverage`
  - `2a812bb` `Document implemented generation workflow`

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

상태:

- 완료.
- 검증 명령:
  - `SMOKE_API_BASE_URL=https://style-print-jung-api-production.up.railway.app SMOKE_WEB_BASE_URL=https://style-print.vercel.app npm run smoke:deploy`
- 검증 결과:
  - `health 200`
  - `web 200`
  - `preview build 200`
  - `preview asset 200`
- 주의:
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

상태:

- 완료.
- 근거:
  - `apps/api/vitest.config.ts`
  - `apps/api/src/preview/artifact.test.ts`
  - `apps/web/src/components/preview-pane.test.tsx`
  - `scripts/smoke-deploy.mjs`

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

상태:

- 완료.
- 근거:
  - `AGENTS.md`에 작업 전 성공 기준, scoped change, verification loop 원칙을 정리했다.
  - `.agents/skills/styleprint-weekly-docs`는 로컬 skill 후보로 관리한다.

## GitHub Issue 등록 및 해결 기록

기존 open issue는 push된 commit과 검증 결과를 comment로 남긴 뒤 close했다.

- [#2 [2주차] Agent workflow 평가/검증 루프 개선](https://github.com/boostcampwm-snu-2026-1/style-print-jung/issues/2): close 완료
- [#3 [2주차] Reference 업로드 metadata 보강](https://github.com/boostcampwm-snu-2026-1/style-print-jung/issues/3): close 완료
- [#5 [2주차] Vercel/Railway FE-BE 배포 구성 및 시도](https://github.com/boostcampwm-snu-2026-1/style-print-jung/issues/5): close 완료

아래 항목은 3주차 구현 결과를 issue 단위로 다시 추적할 때 사용할 수 있는 정리 초안이다.

### Issue 1. Prototype preview generation 안정화

목표:

- 생성된 React + Tailwind code가 빈 화면으로 끝나지 않고 preview iframe에서 열리게 한다.

작업 범위:

- `/api/generate/v0` generation job 도입
- `/api/generate/jobs/:jobId` polling route 추가
- generated code 저장 시 `previewUrl`, `screenshotUrl`, `screenshotError` 연결 유지
- `PreviewPane` fallback preview build 유지

검증 기준:

- generation job 성공 결과에 `generatedCode.previewUrl`이 포함된다.
- `/generated-previews/:previewId/index.html`가 200으로 열린다.
- screenshot capture 실패가 생성 성공 상태를 실패로 바꾸지 않는다.

해결 상태:

- 완료.
- 관련 commit: `6bb9156`, `d906c9c`, `2a812bb`

### Issue 2. Preview artifact/API 테스트 확장

목표:

- preview artifact 생성, safe file read, preview build route를 테스트로 보호한다.

작업 범위:

- API Vitest 설정 추가
- `writePreviewArtifact()` 생성 파일 검증
- `readPreviewArtifactFile()` 허용 파일 및 path traversal 방어 검증
- `/api/preview/build` 400/200 response 검증
- frontend `PreviewPane` iframe/fallback build 검증

검증 기준:

- `npm run test`가 frontend와 API 테스트를 모두 실행한다.
- `npm run typecheck`가 통과한다.
- `npm run build`가 통과한다.

해결 상태:

- 완료.
- 관련 commit: `d906c9c`

### Issue 3. Coherence evaluation loop 개선

목표:

- rule-based coherence 점수만으로 끝내지 않고 judge/feedback/report 흐름으로 평가 루프를 만든다.

작업 범위:

- `packages/shared/src/types.ts` coherence 계약 확장
- rule-based dimension score와 coverage gap 계산
- shadow coherence judge route 연동
- human feedback 저장 route 추가
- regression/agreement report script 추가

검증 기준:

- `/api/intents/evaluate`가 coherence score와 dimension 결과를 반환한다.
- `judgeMode: "shadow"`가 primary 결과를 막지 않고 judge 결과를 보조로 저장한다.
- `/api/coherence/feedback`이 사용자 평가를 저장한다.
- `npm run regression:intents`, `npm run agreement:coherence`로 저장 데이터 기준 보고서를 만들 수 있다.

해결 상태:

- 완료.
- 관련 commit: `0bf871e`, `1e5ec1d`, `04a09dd`, `fc34cdb`, `5f00149`, `a61c76f`

### Issue 4. Generation prompt와 audit provenance 연결

목표:

- 생성 prompt가 사용자의 brief/screen plan/source context를 반영하고, audit 결과가 generated code와 연결되게 한다.

작업 범위:

- generation brief를 `IntentSpec`에 저장
- selected reference context를 v0 prompt에 전달
- intent export prompt 테스트 추가
- audit report에 `generatedCodeId` 연결

검증 기준:

- 생성 전 prompt, screen plan, variant count 변경이 `generationBrief`에 저장된다.
- audit analyze 요청에 `generatedCodeId`가 포함되면 report에 연결된다.
- prompt export 테스트가 source context와 generation brief 반영을 확인한다.

해결 상태:

- 완료.
- 관련 commit: `270b08d`, `b697f36`, `8cd5102`

## 후속 Issue 후보

- production DB와 object storage 전환
- 인증과 사용자별 데이터 분리
- local browser storage 또는 IndexedDB 기반 개인화 저장
- Storybook 또는 visual regression test 도입
- worktree 기반 병렬 Agent 실험

## 리스크 및 보류

- production 저장소는 아직 JSON 파일과 local upload directory 기반이다.
- Railway 재시작/재배포 후 생성 preview와 upload 파일 보존은 보장하지 않는다.
- 인증과 사용자별 project 분리는 이번 주 완료 범위에서 제외한다.
- `judgeMode: "primary"`는 아직 활성화하지 않고, shadow judge와 feedback 수집으로 검증한다.

## 검증 결과

- `npm run test`: frontend 3개 파일 9개 테스트, API 3개 파일 18개 테스트 통과
- `npm run typecheck`: 통과
- `npm run build`: 통과
- `SMOKE_API_BASE_URL=https://style-print-jung-api-production.up.railway.app SMOKE_WEB_BASE_URL=https://style-print.vercel.app npm run smoke:deploy`: 통과

## 작업 순서

1. Week 3 Wiki와 issue 후보를 repo에 남긴다.
2. 관련 commit을 `dev`에 push한다.
3. GitHub Issue 1-4를 등록한다.
4. push된 commit과 검증 결과를 각 Issue에 comment로 남긴다.
5. 완료된 Issue 1-4를 close한다.
6. 후속 Issue 후보는 다음 주 계획으로 분리한다.
