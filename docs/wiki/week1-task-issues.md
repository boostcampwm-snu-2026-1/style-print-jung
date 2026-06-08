# 1주차 GitHub Issue Task 초안

아래 Task는 GitHub issue로 등록할 개발 작업 초안이다.

## 1. Reference 업로드 metadata 보강

목표:

- 업로드한 reference 이미지의 width/height를 저장한다.
- reference 목록에서 이미지 크기를 확인할 수 있게 한다.

검증 기준:

- 이미지 업로드 후 `data/references.json`에 width/height가 기록된다.
- 기존 업로드/삭제 흐름이 유지된다.
- `npm run typecheck`가 통과한다.

## 2. Facet 추출 결과 UI 개선

목표:

- 추출된 color, typography, layout, spacing, component style을 사용자가 구분해서 볼 수 있게 한다.
- reference별 facet pack 표시를 더 명확히 한다.

검증 기준:

- facet 추출 후 각 facet type이 화면에 표시된다.
- 빈 상태와 loading 상태가 깨지지 않는다.
- `npm run typecheck`가 통과한다.

## 3. Recipe 직접 조합 기능 추가

목표:

- 추천 recipe 외에 사용자가 facet별 reference를 직접 선택할 수 있게 한다.
- 선택 결과를 intent spec 생성 API에 전달한다.

검증 기준:

- color/typography/layout/spacing/component style별 source reference를 선택할 수 있다.
- 직접 조합으로 intent spec이 생성된다.
- 기존 추천 recipe 선택 흐름이 유지된다.

## 4. Conflict/Repair rule 보강

목표:

- contrast, density/typography mismatch, spacing scale mismatch 검사 기준을 보강한다.
- repair plan 설명을 사용자가 이해하기 쉬운 문장으로 정리한다.

검증 기준:

- 낮은 contrast 조합에서 conflict가 표시된다.
- repair 적용 후 coherence score가 갱신된다.
- `npm run typecheck`가 통과한다.

## 5. Generate & Audit 결과 저장/조회 흐름 개선

목표:

- 생성 코드와 audit report의 연결 관계를 명확히 저장한다.
- 최근 생성 결과를 다시 볼 수 있는 기반을 만든다.

검증 기준:

- generatedCodeId가 audit report에 연결된다.
- 생성 후 audit diff와 provenance badge가 표시된다.
- API response type과 frontend state type이 일치한다.

## 6. Agent 개발 workflow 문서화 및 적용

목표:

- Agent에게 요청할 때 사용할 prompt pattern과 검증 체크포인트를 정리한다.
- 실제 개발 Task 하나에 workflow를 적용해 기록한다.

검증 기준:

- GitHub wiki에 Agent workflow 문서가 등록된다.
- 작업 단위 분리 기준이 문서에 포함된다.
- 사람이 직접 검증할 체크포인트가 포함된다.
