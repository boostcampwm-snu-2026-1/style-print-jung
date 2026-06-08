# 1주차 Agent 개발 Workflow 초안

## 목적

Agent를 사용해 StylePrint를 개발할 때, 요청 단위를 작게 나누고 사람이 검증해야 할 지점을 명확히 둔다. Agent는 구현 속도를 높이는 도구로 사용하되, 기획 판단, UX 판단, 보안/품질 판단은 개발자가 직접 확인한다.

## 기본 Workflow

1. 작업 목표 정의
   - 구현할 기능 또는 수정할 문제를 한 문장으로 정리한다.
   - 성공 기준을 명확히 적는다.
   - 예: "reference 삭제 시 화면 목록과 저장소 metadata가 함께 삭제된다."

2. 현재 코드 맥락 제공
   - 관련 파일, API endpoint, shared type, 화면 컴포넌트를 Agent에게 알려준다.
   - 모르는 부분은 Agent가 먼저 파일을 읽게 한다.

3. 작업 단위 분리
   - 기능 단위 또는 컴포넌트 단위로 쪼갠다.
   - shared type 변경이 필요한 작업은 type -> backend -> frontend 순서로 진행한다.

4. 구현 요청
   - Agent에게 구체적인 변경 범위와 금지 범위를 함께 준다.
   - 불필요한 refactor를 하지 않도록 제한한다.

5. 검증
   - typecheck/build를 실행한다.
   - 화면 흐름을 직접 확인한다.
   - API 요청/응답이 shared type과 맞는지 확인한다.

6. 회고 및 다음 Task 도출
   - 구현 중 발견한 부족한 부분을 다음 issue로 분리한다.
   - 현재 Task에 직접 필요하지 않은 개선은 바로 구현하지 않는다.

## GitHub 기반 개발 흐름

1. GitHub Issue 등록
   - 개발 Task는 구현 전에 issue로 등록한다.
   - issue에는 목표, 작업 범위, 검증 기준을 적는다.

2. Branch 생성
   - branch는 `main` -> `dev` -> `feature/*` 흐름으로 관리한다.
   - `main`은 안정화 branch, `dev`는 개발 통합 branch로 둔다.
   - 개별 기능은 `dev`에서 `feature/기능명` branch를 생성해 작업한다.

3. Feature PR 생성
   - 기능 구현 후 `feature/*`에서 `dev`로 PR을 생성한다.
   - PR 설명에는 관련 issue, 변경 내용, 검증 결과를 적는다.
   - 기능 단위 PR을 원칙으로 하고, 여러 기능을 한 PR에 섞지 않는다.

4. Wiki 문서 관리
   - 기획서, 주차별 산출물, Agent workflow는 GitHub Wiki에 정리한다.
   - README에는 프로젝트 소개, 실행 방법, 개발 workflow처럼 저장소 진입에 필요한 정보를 둔다.

## 작업 단위 쪼개기 기준

### 기능 단위

기능 단위로 나누는 경우:

- API endpoint가 새로 생기거나 request/response 계약이 바뀌는 작업
- 업로드, facet 추출, intent 생성, repair 적용, 코드 생성, audit처럼 사용자 흐름이 독립적인 작업
- backend와 frontend를 함께 수정해야 하는 작업

예시:

- reference 이미지 metadata 저장 개선
- intent evaluate API의 conflict rule 보강
- generated code audit 결과 저장 및 조회 기능 추가

### 컴포넌트 단위

컴포넌트 단위로 나누는 경우:

- 화면 일부 표시 방식만 바뀌는 작업
- 기존 API 계약을 바꾸지 않는 UI 개선
- 같은 데이터를 다른 방식으로 보여주는 작업

예시:

- FacetPackViewer에서 color token 표시 개선
- ConflictList에서 severity badge 추가
- PreviewPane loading/error 상태 정리

### shared type 우선 기준

다음 조건이면 `packages/shared/src/types.ts`를 먼저 수정한다.

- API response shape이 바뀐다.
- frontend/backend가 같은 domain type을 써야 한다.
- 저장되는 데이터 구조가 바뀐다.

진행 순서:

1. shared type 수정
2. backend API와 저장 로직 수정
3. frontend fetch/상태/컴포넌트 수정
4. typecheck/build 검증

## AI 요청 프롬프트 패턴 초안

### 1. 기능 구현 요청

```text
현재 저장소는 Vite React frontend, Fastify backend, shared TypeScript package 구조입니다.

목표:
- [구현할 기능]

관련 파일:
- [파일 경로]

성공 기준:
- [사용자 행동 또는 API 결과]
- npm run typecheck 통과
- 필요하면 npm run build 통과

제약:
- 관련 없는 refactor 금지
- 기존 API path 유지
- shared type이 필요하면 먼저 수정

먼저 관련 파일을 읽고, 짧은 계획을 말한 뒤 구현해줘.
```

### 2. 버그 수정 요청

```text
문제:
- [재현되는 증상]

재현 방법:
- [클릭 순서 또는 API 요청]

예상 결과:
- [기대 동작]

실제 결과:
- [현재 동작]

관련 파일 후보:
- [파일 경로]

성공 기준:
- 문제가 재현되지 않음
- npm run typecheck 통과

가능하면 원인 설명 후 최소 수정으로 고쳐줘.
```

### 3. 코드 리뷰 요청

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

### 4. 문서 작성 요청

```text
다음 요구사항을 GitHub wiki에 올릴 Markdown 문서로 작성해줘.

대상 독자:
- 팀원과 멘토

포함할 내용:
- [필수 항목]

제약:
- 현재 구현된 내용과 앞으로 할 일을 구분
- 과장된 표현 금지
- 제출용으로 바로 붙여넣을 수 있는 Markdown 형식
```

## 내가 직접 검증/판단해야 할 체크포인트

### 기획 체크포인트

- 서비스 주제가 한 문장으로 설명되는가?
- 핵심 기능이 MVP 범위를 넘어서지 않는가?
- 사용자 흐름이 upload -> extract -> recipe -> generate -> audit으로 자연스러운가?
- 실제 구현된 기능과 앞으로 구현할 기능이 문서에서 구분되는가?

### 기술 체크포인트

- shared type과 API response가 일치하는가?
- frontend fetch 경로가 backend endpoint와 일치하는가?
- 외부 API key가 없을 때 실패 동작이 의도한 방식인가?
- JSON 저장소에 저장되는 데이터 구조가 타입과 맞는가?
- 업로드 파일 삭제 시 metadata와 실제 파일이 함께 정리되는가?

### UI/UX 체크포인트

- 각 단계에서 사용자가 다음 행동을 알 수 있는가?
- loading, empty, error 상태가 어색하지 않은가?
- recipe 선택 후 coherence/conflict 정보가 이해되는가?
- 생성 코드와 preview/audit 결과를 비교하기 쉬운가?

### Agent 사용 체크포인트

- Agent가 변경 전 관련 파일을 읽었는가?
- 요청 범위를 벗어난 refactor가 없는가?
- 변경된 모든 줄이 현재 Task와 직접 관련 있는가?
- typecheck/build 결과를 확인했는가?
- 불확실한 기획 판단을 Agent가 임의로 결정하지 않았는가?

## 1주차 Agent 활용 원칙

- 모호한 요구사항은 먼저 질문하거나 가정을 명시한다.
- 작은 Task부터 처리하고 end-to-end 흐름을 자주 검증한다.
- 구현보다 검증 기준을 먼저 정한다.
- Agent가 만든 결과를 그대로 신뢰하지 않고 사람이 화면과 타입을 확인한다.
- 지금 Task와 관련 없는 개선은 issue로 남기고 바로 수정하지 않는다.
