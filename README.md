# Style Print Jung

UI reference screenshot에서 디자인 특징을 추출하고, 여러 reference의 스타일 요소를 조합해 React + Tailwind UI 코드를 생성하는 Next.js 프로토타입입니다.

## 핵심 기능

- UI screenshot 업로드
  - PNG, JPG, WebP 지원
  - 파일당 최대 5MB
  - 업로드 이미지는 `public/uploads`에 저장
- 디자인 facet 추출
  - color palette
  - typography scale
  - layout pattern
  - spacing scale
  - component style
- recipe 생성
  - 하나의 reference 스타일을 그대로 쓰거나
  - 여러 reference에서 color, typography, layout, spacing, component style을 섞어서 조합
- conflict detection
  - contrast 문제
  - layout density와 typography 불일치
  - spacing scale 불일치
- auto repair
  - 감지된 충돌에 대해 수정안을 적용
- UI code generation
  - React + Tailwind 코드 생성
  - `V0_API_KEY`가 없으면 mock 결과 사용
- live preview
  - Sandpack 기반 코드 preview
- audit and provenance
  - 생성 결과와 의도한 facet 비교
  - 어떤 reference에서 어떤 스타일 요소가 왔는지 추적

## 기술 스택

- Next.js 14 App Router
- TypeScript
- React 18
- Tailwind CSS
- shadcn/ui 스타일의 Radix UI 기반 컴포넌트
- Sandpack
- Chroma.js
- v0 API optional integration

## 실행 방법

### 요구 사항

- Node.js 18+
- npm

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

실제 v0 API를 사용하려면 `.env.local`을 생성합니다.

```env
V0_API_KEY=your_v0_api_key_here
```

`V0_API_KEY`가 없어도 앱은 mock 데이터를 사용해서 실행됩니다.

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 빠른 확인 플로우

1. UI screenshot을 업로드합니다.
2. `Extract Facets`를 실행합니다.
3. 추천 recipe를 선택합니다.
4. conflict가 있으면 repair를 적용합니다.
5. `Generate UI`로 코드를 생성하고 preview를 확인합니다.

### 4. production build

```bash
npm run build
npm start
```

## 사용 흐름

1. Upload
   - UI reference screenshot을 업로드합니다.
   - 업로드된 이미지는 `public/uploads`에 저장됩니다.

2. Extract Facets
   - reference별로 color, typography, layout, spacing, component style을 추출합니다.

3. Choose Recipe
   - 추천 recipe 중 하나를 선택합니다.
   - 여러 reference의 facet을 섞은 조합을 확인할 수 있습니다.

4. Review Conflicts
   - 대비, density, spacing 관련 충돌을 확인합니다.
   - 필요한 경우 repair를 적용합니다.

5. Generate UI
   - React + Tailwind 코드를 생성합니다.
   - Sandpack preview와 코드 탭에서 결과를 확인합니다.

6. Audit
   - 생성된 코드가 선택한 style intent를 얼마나 반영했는지 확인합니다.
   - provenance badge로 facet 출처를 추적합니다.

## 프로젝트 구조

```text
.
├── src
│   ├── app
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── api
│   │       ├── audit
│   │       ├── facets
│   │       ├── generate
│   │       ├── intents
│   │       └── references
│   ├── components
│   │   ├── ui
│   │   ├── audit-diff-table.tsx
│   │   ├── code-viewer.tsx
│   │   ├── conflict-list.tsx
│   │   ├── facet-pack-viewer.tsx
│   │   ├── preview-pane.tsx
│   │   ├── provenance-badges.tsx
│   │   ├── recipe-cards.tsx
│   │   └── reference-uploader.tsx
│   └── lib
│       ├── color-extractor.ts
│       ├── db.ts
│       ├── references.ts
│       ├── types.ts
│       ├── utils.ts
│       └── v0-client.ts
├── data
├── public
│   └── uploads
├── package.json
└── next.config.js
```

## 로컬 데이터 저장 방식

이 프로젝트는 MVP 단계라 별도 DB 대신 `data/*.json` 파일을 로컬 저장소처럼 사용합니다.

| 파일 | 역할 |
| --- | --- |
| `data/references.json` | 업로드한 reference 이미지의 메타데이터 |
| `data/facet-packs.json` | reference에서 추출한 facet token |
| `data/intents.json` | 선택한 recipe와 repair history |
| `data/generated-code.json` | 생성된 UI 코드 |
| `data/audit-reports.json` | 생성 결과 audit report |

이미지 원본은 JSON에 base64로 저장하지 않고 `public/uploads`에 파일로 저장합니다. `references.json`에는 파일 경로와 메타데이터만 저장합니다.

`data`와 `public/uploads`는 로컬 작업 데이터이므로 `.gitignore`에 포함되어 있습니다.

## Reference 선택 팁

- 깔끔한 UI screenshot을 사용합니다.
- 화면 폭이 너무 작지 않은 이미지를 사용합니다.
- 하나의 대표 화면을 담은 reference가 좋습니다.
- 로딩 화면, 모달만 있는 화면, 브라우저 UI가 많이 섞인 이미지는 피하는 편이 좋습니다.
- 여러 reference를 섞을 때는 density가 비슷한 화면끼리 조합하면 conflict가 줄어듭니다.

## API Routes

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/references/upload` | `GET` | reference 목록 조회 |
| `/api/references/upload` | `POST` | reference 이미지 업로드 |
| `/api/references/upload?id=...` | `DELETE` | reference 삭제 |
| `/api/facets/extract` | `POST` | reference에서 facet 추출 |
| `/api/intents/create` | `POST` | 선택한 recipe로 intent 생성 |
| `/api/intents/evaluate` | `POST` | intent 충돌 평가 |
| `/api/intents/apply-repair` | `POST` | repair 적용 |
| `/api/generate/v0` | `POST` | UI 코드 생성 |
| `/api/audit/analyze` | `POST` | 생성 코드 audit |

## 스크립트

```bash
npm run dev
npm run build
npm start
npm run lint
```

현재 `npm run lint`는 Next ESLint 설정 파일이 없으면 설정 프롬프트를 띄울 수 있습니다.

## 현재 한계

- color extraction은 서버 환경에서 간소화된 mock/hash 기반 로직을 사용합니다.
- 실제 이미지 분석 품질을 높이려면 `sharp` 또는 유사 이미지 처리 라이브러리 도입이 필요합니다.
- 데이터 저장은 JSON 파일 기반입니다. 다중 사용자 또는 배포 환경에서는 SQLite, PostgreSQL, S3/R2 같은 저장소로 분리하는 것이 좋습니다.
- 인증과 사용자별 데이터 분리는 아직 없습니다.

## 앞으로의 계획

### 단기

- 실제 픽셀 기반 color extraction 도입
- ESLint 설정 추가
- upload/extract/generate 실패 상황에 대한 UI feedback 개선
- generated code와 audit 결과의 test fixture 추가

### 중기

- JSON 파일 저장소를 SQLite 또는 PostgreSQL로 전환
- local `public/uploads` 대신 S3/R2 같은 object storage 지원
- recipe 조합 UI를 수동 선택 방식까지 확장
- staged generation flow 구현

### 장기

- 사용자 인증과 사용자별 프로젝트 분리
- provenance evidence를 bounding box 또는 sampled pixel 단위로 확장
- Figma/design token export
- 협업 및 공유 기능

## GitHub

Repository:

```text
https://github.com/boostcampwm-snu-2026-1/style-print-jung.git
```
