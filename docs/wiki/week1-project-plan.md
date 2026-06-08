# 1주차 프로젝트 기획서

## 서비스명

StylePrint

<img width="522" height="295" alt="스크린샷 2026-06-02 오후 6 51 12" src="https://github.com/user-attachments/assets/9be44c5b-d390-4b86-8a14-63b03a95bdff" />

## 서비스 주제

UI 레퍼런스 스크린샷에서 디자인 특징을 추출하고, 여러 레퍼런스의 스타일 요소를 조합해 React + Tailwind UI 코드를 생성하는 서비스.

사용자는 마음에 드는 UI 이미지를 업로드한 뒤 색상, 타이포그래피, 레이아웃, 간격, 컴포넌트 스타일 같은 디자인 facet을 확인한다. 이후 추천 조합(recipe)을 선택하면 서비스가 충돌 가능성을 검사하고, 보정안을 적용한 뒤 UI 코드를 생성한다.

## 문제 정의

UI를 만들 때 참고 이미지를 보고 "이 느낌으로 만들어줘"라고 요청해도 색상, 간격, 레이아웃, 컴포넌트 스타일이 섞여 결과물이 일관되지 않을 수 있다.

StylePrint는 참고 이미지의 디자인 요소를 구조화된 token으로 분리하고, 어떤 레퍼런스에서 어떤 스타일을 가져왔는지 추적 가능하게 만드는 것을 목표로 한다.

## 핵심 기능

1. 레퍼런스 스크린샷 업로드
   - PNG, JPEG, WEBP 이미지 업로드
   - 업로드 이미지 미리보기 및 삭제
   - 로컬 파일 저장 및 metadata 기록

2. 디자인 facet 추출
   - 색상 palette 추출
   - typography, layout, spacing, component style 분석
   - 각 token의 출처(reference)를 evidence로 보관

3. 스타일 recipe 생성
   - 단일 레퍼런스 기반 조합
   - 여러 레퍼런스의 색상/타이포그래피/레이아웃 조합
   - 조합별 coherence score 제공

4. 충돌 검사 및 보정
   - contrast 문제 검사
   - spacing density와 typography scale 불일치 검사
   - repair plan 제안 및 적용

5. UI 코드 생성
   - 선택한 intent spec을 기반으로 React + Tailwind 코드 생성
   - 생성 코드를 화면에서 확인

6. 생성 결과 audit
   - 생성 코드에서 facet을 다시 추출
   - 의도한 디자인 spec과 실제 코드 결과 차이 비교
   - provenance badge로 출처 표시

## 기술 스택

### Frontend

- Vite
- React
- TypeScript
- Tailwind CSS
- Radix UI
- lucide-react
- Sandpack

선택 이유:

- Vite는 개발 서버와 빌드가 빠르며 React MVP 개발에 적합하다.
- TypeScript는 frontend/backend/shared package 간 데이터 계약을 안전하게 맞추기 좋다.
- Tailwind CSS는 생성된 UI 코드와 서비스 UI가 같은 스타일 체계를 공유하기 쉽다.
- Radix UI는 접근성과 기본 상호작용을 갖춘 컴포넌트를 빠르게 구성할 수 있다.
- lucide-react는 버튼과 상태 표현에 필요한 아이콘을 일관되게 제공한다.
- Sandpack은 생성된 React 코드를 브라우저에서 미리보기하는 기능에 적합하다.

### Backend

- Fastify
- TypeScript
- sharp
- OpenAI Responses API
- v0 API

선택 이유:

- Fastify는 TypeScript 기반 API 서버를 단순하게 구성할 수 있고, 업로드/분석/생성 요청을 명확한 endpoint로 나누기 쉽다.
- sharp는 이미지 pixel 기반 색상 추출에 적합하다.
- OpenAI Responses API는 이미지 기반 디자인 facet 분석과 생성 코드 audit에 사용한다.
- v0 API는 React + Tailwind UI 코드 생성을 담당한다.

### Data / Shared

- JSON 파일 기반 로컬 저장소
- npm workspaces
- shared TypeScript package

선택 이유:

- 1주차 MVP에서는 DB 구축보다 핵심 흐름 검증이 우선이므로 JSON 저장소가 충분하다.
- npm workspaces는 web/api/shared 구조를 하나의 저장소에서 관리하기 쉽다.
- shared package는 API request/response와 domain type을 중복 없이 관리할 수 있다.

## 화면 흐름 초안

### 1. Upload & Extract

- 사용자가 UI reference screenshot을 업로드한다.
- 업로드된 reference 목록을 확인한다.
- Extract Facets 버튼으로 색상, typography, layout, spacing, component style을 추출한다.
- 추출된 facet pack을 확인한다.

### 2. Recipe Builder

- 서비스가 추천 recipe를 보여준다.
- 사용자는 조합을 선택한다.
- 선택한 recipe는 intent spec으로 정규화된다.
- 충돌 검사 결과와 coherence score를 확인한다.
- 필요한 repair plan을 적용한다.

### 3. Generate & Audit

- 보정된 intent spec을 기반으로 UI 코드를 생성한다.
- 생성된 React + Tailwind 코드를 확인한다.
- preview에서 결과를 확인한다.
- audit diff table로 의도한 facet과 생성 결과의 차이를 검토한다.
- provenance badge로 어떤 reference에서 어떤 요소가 왔는지 확인한다.

## 개발 범위

1주차 기준 MVP는 "reference 업로드 -> facet 추출 -> recipe 선택 -> 충돌 검사 -> 코드 생성 -> audit"의 end-to-end 흐름을 확인하는 데 집중한다.

## 협업 및 관리 방식

- 브랜치는 `main` -> `dev` -> `feature/*` 흐름으로 관리한다.
- `main`은 안정화된 결과를 유지하고, `dev`는 개발 통합 branch로 사용한다.
- 기능 개발은 `dev`에서 `feature/기능명` branch를 생성해 진행한다.
- feature별 구현이 끝나면 `feature/*`에서 `dev`로 PR을 생성한다.
- 개발 Task는 GitHub Issue로 등록해 관리한다.
- 기획서, 주차별 산출물, Agent workflow 문서는 GitHub Wiki에서 관리한다.
- README에는 프로젝트 소개, 실행 방법, 기술 흐름, 개발 workflow를 기록한다.

## 현재 한계와 이후 개선 방향

- 저장소가 JSON 파일 기반이므로 다중 사용자 환경에는 적합하지 않다.
- 인증과 사용자별 프로젝트 분리는 아직 없다.
- 레퍼런스 이미지의 width/height metadata 보강이 필요하다.
- recipe 생성은 현재 단순 rule 기반이며, 사용자 직접 조합 기능은 보강이 필요하다.
- 외부 API key가 없거나 API 호출이 실패하면 분석/생성 단계가 실패한다.
