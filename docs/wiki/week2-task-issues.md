# 2주차 GitHub Issue Task 초안

아래 Task는 2주차 기술 요구사항을 GitHub Issue로 관리하기 위한 초안이다.

## 1. Agent workflow 평가/검증 루프 개선

목표:

- Agent 기반 개발 방식에서 발견한 문제점과 개선 지점을 정리한다.
- 실제 개발 Task에 적용 가능한 평가/검증 루프를 workflow에 반영한다.

작업 범위:

- Agent 요청 전 성공 기준 작성 방식 정리
- 코드 변경 전 관련 파일 확인 규칙 정리
- 완성 코드 검증 기준 정리
  - `npm run typecheck`
  - 필요 시 `npm run build`
  - API health check
  - 화면 흐름 직접 확인
- 코드 리뷰 요청 프롬프트와 체크포인트 추가
- 2주차 GitHub Wiki에 workflow 개선 내용 기록

검증 기준:

- 2주차 Wiki 문서에 Agent workflow 개선 내용이 정리되어 있다.
- 실제 개발 Task 최소 1개에 성공 기준과 검증 결과가 기록되어 있다.
- 관련 없는 refactor를 막기 위한 제약 조건이 workflow에 포함되어 있다.

## 2. Reference 업로드 metadata 보강

목표:

- 업로드한 reference 이미지의 metadata를 보강해 이후 facet 분석과 UI 표시에서 활용할 수 있게 한다.

작업 범위:

- reference 업로드 시 이미지 width/height 저장
- 저장된 metadata를 reference 목록 또는 상세 UI에서 확인 가능하게 표시
- 기존 업로드/삭제 흐름 유지
- API 계약 변경이 필요하면 `packages/shared/src/types.ts`를 먼저 수정

검증 기준:

- 이미지 업로드 후 `data/references.json`에 width/height가 기록된다.
- reference 삭제 시 metadata와 업로드 파일 정리 흐름이 유지된다.
- `npm run typecheck`가 통과한다.
- 필요 시 `npm run build`가 통과한다.

## 3. Facet 추출 결과 UI 개선

목표:

- 추출된 facet 정보를 사용자가 더 쉽게 비교하고 확인할 수 있도록 frontend 표시 방식을 개선한다.

작업 범위:

- color, typography, layout, spacing, component style 정보를 구분해서 표시
- reference별 facet pack 표시를 명확하게 정리
- loading, empty, error 상태 유지
- 기존 `/api/...` 경로와 API 계약 유지

검증 기준:

- facet 추출 후 각 facet type이 화면에 구분되어 표시된다.
- reference가 없거나 추출 중인 상태에서 UI가 깨지지 않는다.
- `npm run typecheck`가 통과한다.
- 필요 시 `npm run build`가 통과한다.

## 4. Vercel/Railway FE-BE 배포 구성 및 시도

목표:

- frontend는 Vercel, backend는 Railway 조합으로 배포 환경을 구성하고 가능한 범위부터 배포를 시도한다.

작업 범위:

- Vercel frontend 배포 설정 정리
  - build command
  - output directory
  - API base/proxy 설정
- Railway backend 배포 설정 정리
  - start command
  - `API_PORT` 또는 Railway 제공 `PORT` 처리
  - `/health` 확인
- 필요한 환경 변수 목록 정리
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `V0_API_KEY`
  - `V0_MODEL`
  - `WEB_ORIGIN`
- 파일 기반 저장소(`data/*.json`, `public/uploads`)의 배포 한계 정리

검증 기준:

- Vercel에서 frontend production build가 성공한다.
- Railway에서 backend `/health`가 응답한다.
- frontend에서 Railway backend API로 요청 가능한지 확인한다.
- 배포 성공/실패 결과와 남은 이슈가 2주차 Wiki에 기록되어 있다.
