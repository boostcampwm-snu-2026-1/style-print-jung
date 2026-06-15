# StylePrint

UI reference screenshot에서 디자인 특징을 추출하고, 여러 reference의 스타일 요소를 조합해 React + Tailwind UI 코드를 생성하는 프로토타입입니다.

현재 구조는 **Vite React frontend + Fastify TypeScript backend**로 분리되어 있습니다.

## 프로젝트 정보

- 서비스 주제: UI reference screenshot의 디자인 facet을 추출하고 조합해 React + Tailwind UI 코드를 생성합니다.
- 핵심 기능: reference 업로드, facet 추출, recipe 선택, conflict/repair 평가, UI 코드 생성, audit 비교
- 문서 관리: 기획서, 주차별 산출물, Agent 개발 workflow는 GitHub Wiki에서 관리합니다.
- Task 관리: 개발 Task는 GitHub Issue로 등록하고 진행 상태를 관리합니다.
- PR 관리: 기능 단위로 branch를 나누고 `feature/*` branch에서 `dev` branch로 PR을 생성합니다.

## 구조

```text
apps/
  web/        Vite + React + TypeScript UI
  api/        Fastify + TypeScript API server
packages/
  shared/     frontend/backend 공용 타입
data/         JSON 기반 로컬 저장소
public/
  uploads/    업로드 이미지 저장소
```

## 개발 Workflow

브랜치는 아래 흐름으로 관리합니다.

```text
main -> dev -> feature/*
```

- `main`: 안정화된 결과를 유지하는 branch
- `dev`: 기능 개발 결과를 통합하는 branch
- `feature/*`: 개별 기능 또는 issue 작업 branch

진행 방식:

1. GitHub Issue로 개발 Task를 등록합니다.
2. `dev`에서 `feature/기능명` branch를 생성합니다.
3. 기능 단위로 구현하고 `npm run typecheck`로 검증합니다.
4. 필요한 경우 `npm run build`까지 확인합니다.
5. `feature/*`에서 `dev`로 PR을 생성합니다.
6. 기획/문서/주차별 산출물은 GitHub Wiki에 정리합니다.

## 로컬 실행

```bash
cd /Users/Owner/hcclab/style-print-jung
npm install
cp .env.local.example .env.local
```

프로젝트 루트의 `.env.local`에 실제 API key를 입력합니다.

개발 서버를 실행합니다.

```bash
npm run dev
```

접속 및 확인:

```bash
open http://localhost:5173
curl http://localhost:4000/health
```

API와 Web을 터미널 두 개로 나눠 실행할 수도 있습니다.

```bash
npm run dev:api
```

```bash
npm run dev:web
```

## 환경 변수

`.env.local` 위치는 프로젝트 루트입니다.

```text
/Users/Owner/hcclab/style-print-jung/.env.local
```

파일이 없으면 `.env.local.example`에서 복사합니다.

```bash
cp .env.local.example .env.local
```

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
V0_API_KEY=...
V0_MODEL=v0-mini
API_PORT=4000
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=
```

`OPENAI_API_KEY`와 `V0_API_KEY`는 필수입니다. 누락되거나 API 호출이 실패하면 임의 데이터로 진행하지 않고 해당 API 요청이 실패합니다.

`WEB_ORIGIN`은 쉼표로 여러 frontend origin을 지정할 수 있습니다. 예를 들어 Vercel production URL과 preview URL을 함께 허용해야 하면 `https://style-print-jung.vercel.app,https://style-print-jung-git-dev.vercel.app`처럼 설정합니다.

## 주요 흐름

1. Web에서 screenshot을 base64 data URL로 변환해 API에 업로드합니다.
2. API는 이미지를 `public/uploads`에 저장하고 metadata를 `data/references.json`에 기록합니다.
3. API가 `sharp`로 screenshot 픽셀 기반 color token을 추출합니다.
4. OpenAI Responses API가 typography, layout, spacing, component style, mood keyword를 JSON facet으로 분석합니다.
5. Web에서 recipe를 선택하면 API가 IntentSpec으로 정규화합니다.
6. API가 rule-based contrast/density/spacing conflict를 평가하고 repair plan을 저장합니다.
7. 생성 요청 시 v0가 React + Tailwind 코드를 반환합니다.
8. OpenAI audit이 생성 코드에서 facet을 역추출하고 intent와 비교합니다.

## API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | `GET` | API 상태 확인 |
| `/uploads/:filename` | `GET` | 업로드 이미지 제공 |
| `/api/references/upload` | `GET` | reference 목록 조회 |
| `/api/references/upload` | `POST` | reference 이미지 업로드 |
| `/api/references/upload?id=...` | `DELETE` | reference 삭제 |
| `/api/facets/extract` | `POST` | reference에서 facet 추출 |
| `/api/intents/create` | `POST` | 선택한 recipe로 intent 생성 |
| `/api/intents/evaluate` | `POST` | intent 충돌 평가 및 repair 저장 |
| `/api/intents/apply-repair` | `POST` | repair 적용 |
| `/api/generate/v0` | `POST` | UI 코드 생성 |
| `/api/audit/analyze` | `POST` | 생성 코드 audit |

## 검증

```bash
npm run typecheck
npm run test
npm run build
```

`npm run build`는 backend/frontend 타입체크 후 Vite production build를 수행합니다.

로컬 또는 배포 환경 smoke check는 아래 명령으로 확인합니다.

```bash
npm run smoke:deploy
```

배포 URL을 확인할 때는 환경 변수로 대상 URL을 넘깁니다.

```bash
SMOKE_API_BASE_URL=https://style-print-jung-api.up.railway.app \
SMOKE_WEB_BASE_URL=https://style-print-jung.vercel.app \
npm run smoke:deploy
```

## 현재 한계

- OpenAI/v0 API key가 없거나 외부 API 호출이 실패하면 관련 API 요청은 실패합니다.
- 저장소는 JSON 파일 기반이라 다중 사용자/배포 환경에는 SQLite/PostgreSQL/S3/R2 같은 저장소가 필요합니다.
- 인증과 사용자별 데이터 분리는 아직 없습니다.
