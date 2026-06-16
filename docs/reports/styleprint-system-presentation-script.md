# StylePrint 시스템 발표 대본

## 발표 흐름

문제 제기 → 서비스 데모 → 시스템 아키텍처 → Agent workflow → 차별점 및 향후 개선

## 0:00-0:30 프로젝트 소개 / 문제 정의

안녕하세요. 저희 프로젝트 StylePrint는 UI 레퍼런스 스크린샷을 보고 디자인 특징을 추출한 뒤, 이를 조합해 React와 Tailwind 기반 UI 코드를 생성하는 서비스입니다.

기존에는 디자이너나 개발자가 레퍼런스 이미지를 직접 보면서 색상, 폰트 크기, 여백, 카드 스타일 같은 규칙을 수동으로 정리해야 했습니다. 특히 여러 레퍼런스의 장점을 섞으려고 하면 어떤 요소가 어느 이미지에서 왔는지 추적하기 어렵고, 스타일 충돌도 자주 발생합니다.

그래서 저희는 이 과정을 Agent workflow로 나눴습니다. 먼저 레퍼런스에서 디자인 facet을 추출하고, 사용자가 원하는 조합을 IntentSpec으로 정규화한 다음, 충돌을 검증하고 최종적으로 실행 가능한 UI 코드를 생성합니다.

## 0:30-2:00 서비스 데모

이제 실제 사용 흐름을 먼저 보여드리겠습니다.

첫 번째 단계는 reference 업로드입니다. 사용자는 참고하고 싶은 UI 스크린샷 2-3장을 업로드합니다. 이 이미지는 이후 색상, 타이포그래피, 레이아웃, 간격, 컴포넌트 스타일을 뽑는 기준이 됩니다.

업로드 후 Extract Facets 버튼을 누르면 시스템이 이미지를 분석합니다. 색상은 이미지 픽셀에서 직접 추출하고, 타이포그래피나 레이아웃 같은 시각적 특징은 OpenAI 모델을 사용해 구조화합니다. 결과는 FacetPack이라는 중간 데이터로 저장됩니다.

다음은 Recipe Builder 단계입니다. 여기서는 추천된 recipe를 선택하거나, 사용자가 직접 facet별 출처를 지정할 수 있습니다. 예를 들어 색상은 첫 번째 레퍼런스에서 가져오고, 레이아웃은 두 번째 레퍼런스에서 가져오는 방식입니다.

recipe를 선택하면 시스템이 coherence를 평가합니다. 색상 대비가 부족한지, 폰트 크기와 밀도가 어긋나는지, spacing scale이 충돌하는지 검사하고, 문제가 있으면 repair plan을 제안합니다. 이 단계가 중요한 이유는 생성 전에 스타일 조합이 실제 코드로 만들기 적합한지 확인할 수 있기 때문입니다.

마지막으로 Generate UI를 실행하면 v0를 통해 React + Tailwind 코드가 생성됩니다. 생성 결과는 preview iframe으로 바로 확인할 수 있고, 코드 탭에서는 실제 생성된 코드를 볼 수 있습니다. Audit 탭에서는 생성된 코드가 원래 IntentSpec을 얼마나 잘 반영했는지 diff와 provenance로 확인할 수 있습니다.

즉, 데모의 핵심 흐름은 업로드, facet 추출, recipe 선택, coherence 검증, UI 생성, audit 확인입니다.

## 2:00-3:00 아키텍처 / 기술 스택

방금 보신 기능은 크게 Frontend, Backend API, Agent Orchestrator, Tools and Models, Runtime Artifacts로 나뉩니다.

Frontend는 Vite React와 TypeScript로 만들었습니다. 사용자는 여기서 이미지를 업로드하고, recipe를 선택하고, 생성 결과와 audit 결과를 확인합니다.

Backend는 Fastify와 TypeScript로 구성했습니다. 주요 API는 `/api/references/upload`, `/api/facets/extract`, `/api/intents/create`, `/api/intents/evaluate`, `/api/generate/v0`, `/api/audit/analyze`입니다. 이 API들이 사용자의 요청을 받아 Agent workflow를 실행합니다.

Agent Orchestrator는 각 단계를 연결합니다. facet extraction, recipe recommendation, coherence evaluation, repair 적용, generation job 실행을 담당합니다.

Tools and Models 쪽에서는 sharp를 사용해 이미지 픽셀 기반 색상을 추출하고, OpenAI를 사용해 facet 분석과 coherence judge, audit을 수행합니다. 실제 React + Tailwind 코드 생성에는 v0를 사용했습니다.

현재 MVP 저장소는 `data/*.json`과 `public/uploads`를 사용합니다. 빠른 프로토타입에는 충분하지만, 실제 서비스로 확장하려면 PostgreSQL 같은 DB와 S3 또는 R2 같은 object storage로 전환할 계획입니다.

## 3:00-4:20 Agent Workflow

이 프로젝트에서 중요한 부분은 단순히 LLM을 한 번 호출하는 것이 아니라, Agent workflow가 단계별로 판단하고 중간 결과를 남긴다는 점입니다.

Workflow는 Planner, Extractor, Recipe Executor, Validator, Generator/Auditor로 나눌 수 있습니다.

먼저 Planner는 사용자의 reference와 생성 목표를 바탕으로 어떤 facet을 추출해야 하는지 계획합니다. 여기서 색상, 타이포그래피, 레이아웃, 간격, 컴포넌트 스타일이라는 분석 단위가 정해집니다.

Extractor는 실제 도구를 호출합니다. sharp로 색상 토큰을 뽑고, OpenAI 모델로 타이포그래피, 레이아웃, spacing, component style을 분석합니다. 이 결과가 FacetPack입니다.

Recipe Executor는 여러 reference의 facet을 조합합니다. 추천 recipe를 만들거나 사용자가 직접 선택한 조합을 IntentSpec으로 정규화합니다. IntentSpec은 이후 코드 생성의 기준이 되는 설계 명세입니다.

Validator는 IntentSpec을 검사합니다. 색상 대비, density와 typography의 불일치, spacing scale mismatch 같은 문제를 rule-based로 평가하고 coherence score를 계산합니다. 필요하면 repair plan도 함께 제안합니다.

Generator는 검증된 IntentSpec을 기반으로 v0에 UI 생성을 요청합니다. 생성된 결과는 preview artifact로 저장되고, Auditor가 다시 코드를 분석해 IntentSpec과 비교합니다.

이 구조 덕분에 사용자는 단순한 결과물뿐 아니라, 어떤 reference에서 어떤 facet을 가져왔는지, 생성 전에 어떤 충돌이 있었는지, 생성 후 결과가 의도를 얼마나 반영했는지까지 확인할 수 있습니다.

## 4:20-5:00 마무리 / 차별점 / 향후 개선

정리하면 StylePrint의 핵심 차별점은 네 가지입니다.

첫째, 디자인을 하나의 이미지 단위가 아니라 facet 단위로 나눠 추출합니다. 그래서 색상은 A 레퍼런스, 레이아웃은 B 레퍼런스처럼 조합할 수 있습니다.

둘째, provenance를 제공합니다. 생성 결과의 각 facet이 어떤 reference에서 왔는지 추적할 수 있습니다.

셋째, 생성 전에 coherence를 평가합니다. contrast나 spacing mismatch 같은 문제를 미리 발견하고 repair plan을 제안합니다.

넷째, 생성 후 audit을 수행합니다. 생성된 코드가 IntentSpec을 얼마나 잘 반영했는지 다시 검토할 수 있습니다.

향후에는 저장소를 JSON 기반에서 DB와 object storage로 전환하고, 사용자별 프로젝트 관리와 인증을 추가할 계획입니다. 또한 Storybook이나 visual regression test를 도입해 생성 UI 품질 검증을 강화하고, Planner, Validator, Generator를 더 명확한 multi-agent 구조로 분리할 예정입니다.

결론적으로 StylePrint는 레퍼런스 스크린샷과 자연어 요청을 바탕으로 UI 구현 초안을 만들고, 생성 전후 검증 루프로 결과의 신뢰도를 높이는 Agent 기반 UI 생성 시스템입니다.
