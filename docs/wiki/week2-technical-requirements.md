# StylePrint 2주차 기술 요구사항 실행 계획

## 목적

2주차에는 Agent 기반 개발 workflow를 개선하고, 개발 Task를 GitHub Issue로 관리하며, frontend/backend 배포를 가능한 범위부터 시도한다. 배포 조합은 Vercel frontend와 Railway backend로 잡는다.

## 진행 순서

1. GitHub Issue 등록
   - Agent workflow 평가/검증 루프 개선
   - Reference 업로드 metadata 보강
   - Facet 추출 결과 UI 개선
   - Vercel/Railway FE-BE 배포 구성 및 시도

2. Branch 생성
   - 작업 branch: `feature/week2-vercel-railway`
   - 기존 원칙은 `main -> dev -> feature/*` 흐름이다.
   - 현재 원격 `dev` branch가 없으면 먼저 `dev` branch 생성 여부를 정리한 뒤 feature branch를 연결한다.

3. Agent workflow 개선
   - 작업 전 목표와 성공 기준을 먼저 작성한다.
   - Agent가 변경 전 관련 파일을 읽었는지 확인한다.
   - API 계약 변경은 `packages/shared/src/types.ts`를 먼저 수정한다.
   - 기능 구현 후 `npm run typecheck`를 실행한다.
   - frontend/backend를 모두 건드리면 `npm run build`까지 확인한다.
   - 완료된 코드에 대해 코드 리뷰 프롬프트로 버그, 회귀 가능성, 타입/계약 불일치, 검증 누락을 점검한다.

4. 기능 Task 진행
   - 2주차에는 모든 issue를 끝내기보다 작은 기능 1-2개를 끝까지 완료하는 것을 우선한다.
   - 우선순위는 Reference metadata 보강, Facet 추출 결과 UI 개선 순서로 둔다.
   - 각 Task는 issue 단위로 branch/commit/PR 기록을 남긴다.

5. Vercel/Railway 배포 시도
   - frontend는 Vercel에 배포한다.
   - backend는 Railway에 배포한다.
   - `/health` 응답과 frontend에서 Railway API 호출 가능 여부를 확인한다.
   - 파일 기반 저장소 한계는 배포 결과에 포함해 별도 개선 issue로 분리한다.

## Agent workflow 개선 내용

### 발견한 문제점

- 요구사항이 넓으면 Agent가 기능 구현, 문서, 배포를 한 번에 섞어서 진행할 수 있다.
- 코드 변경 전 성공 기준이 약하면 검증이 `typecheck` 수준에서 끝나고 실제 사용자 흐름 확인이 빠질 수 있다.
- frontend/backend/shared type이 함께 있는 구조에서는 API 계약 변경 순서가 흐트러지기 쉽다.
- 배포 환경에서는 로컬 JSON 저장소와 업로드 파일 저장 방식이 production 요구사항과 다를 수 있다.

### 적용할 개선점

- 작업 시작 전 아래 항목을 먼저 적는다.
  - 목표
  - 작업 범위
  - 수정 금지 범위
  - 성공 기준
  - 검증 명령
- API 계약 변경 시 `packages/shared -> apps/api -> apps/web` 순서로 진행한다.
- 기능 완료 후 최소 검증은 `npm run typecheck`로 둔다.
- 배포 또는 frontend/backend 변경이 포함되면 `npm run build`와 `/health` 확인을 추가한다.
- Agent 작업 결과는 코드 리뷰 프롬프트로 한 번 더 점검한다.

### 코드 리뷰 프롬프트

```text
다음 변경사항을 리뷰해줘.

우선순위:
- 버그
- 회귀 가능성
- 타입/계약 불일치
- 테스트 또는 검증 누락

출력 형식:
- 심각도 순 findings
- 파일/라인 근거
- 마지막에 짧은 요약
```

## GitHub Issue 계획

### 1. Agent workflow 평가/검증 루프 개선

목표:

- Agent 기반 개발 방식에서 발견한 문제점과 개선 지점을 정리한다.
- 실제 개발 Task에 적용 가능한 평가/검증 루프를 workflow에 반영한다.

검증 기준:

- 2주차 Wiki 문서에 Agent workflow 개선 내용이 정리되어 있다.
- 실제 개발 Task 최소 1개에 성공 기준과 검증 결과가 기록되어 있다.
- 관련 없는 refactor를 막기 위한 제약 조건이 workflow에 포함되어 있다.

### 2. Reference 업로드 metadata 보강

목표:

- 업로드한 reference 이미지의 metadata를 보강해 이후 facet 분석과 UI 표시에서 활용할 수 있게 한다.

검증 기준:

- 이미지 업로드 후 `data/references.json`에 width/height가 기록된다.
- reference 삭제 시 metadata와 업로드 파일 정리 흐름이 유지된다.
- `npm run typecheck`가 통과한다.
- 필요 시 `npm run build`가 통과한다.

### 3. Facet 추출 결과 UI 개선

목표:

- 추출된 facet 정보를 사용자가 더 쉽게 비교하고 확인할 수 있도록 frontend 표시 방식을 개선한다.

검증 기준:

- facet 추출 후 각 facet type이 화면에 구분되어 표시된다.
- reference가 없거나 추출 중인 상태에서 UI가 깨지지 않는다.
- `npm run typecheck`가 통과한다.
- 필요 시 `npm run build`가 통과한다.

### 4. Vercel/Railway FE-BE 배포 구성 및 시도

목표:

- frontend는 Vercel, backend는 Railway 조합으로 배포 환경을 구성하고 가능한 범위부터 배포를 시도한다.

검증 기준:

- Vercel에서 frontend production build가 성공한다.
- Railway에서 backend `/health`가 응답한다.
- frontend에서 Railway backend API로 요청 가능한지 확인한다.
- 배포 성공/실패 결과와 남은 이슈가 2주차 Wiki에 기록되어 있다.

## Vercel/Railway 배포 계획

### Frontend: Vercel

대상:

- `apps/web`
- Vite React frontend

예상 설정:

```text
Framework Preset: Vite
Build Command: npm run build:web
Output Directory: apps/web/dist
```

확인 항목:

- Vercel production build 성공
- frontend가 Railway backend URL을 API base로 사용
- CORS origin이 Railway backend 설정과 맞는지 확인

### Backend: Railway

대상:

- `apps/api`
- Fastify backend

예상 설정:

```text
Start Command: npm run start
Health Check Path: /health
```

필요 환경 변수:

```text
OPENAI_API_KEY
OPENAI_MODEL
V0_API_KEY
V0_MODEL
WEB_ORIGIN
```

확인 항목:

- Railway가 제공하는 `PORT`와 서버 port 설정이 맞는지 확인
- `/health`가 응답하는지 확인
- Vercel frontend에서 `/api/...` 요청이 Railway backend로 전달되는지 확인

## 배포 리스크

- 현재 저장소는 `data/*.json`과 `public/uploads`를 사용한다.
- Railway의 ephemeral filesystem에서는 재배포 또는 재시작 시 저장 데이터 보존이 제한될 수 있다.
- production 저장소가 필요하면 SQLite/PostgreSQL과 S3/R2 같은 외부 저장소를 별도 issue로 분리한다.

## 이번 주 완료 기준

- GitHub Issue 3-4개 등록 또는 등록 가능한 초안 작성
- `feature/week2-vercel-railway` branch 생성
- 2주차 Wiki 문서 작성
- 최소 1개 개발 Task에 workflow 적용
- `npm run typecheck` 실행
- 가능한 경우 `npm run build` 실행
- Vercel/Railway 배포 시도 결과 기록
