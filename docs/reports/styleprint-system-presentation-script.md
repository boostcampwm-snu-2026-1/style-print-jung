# StylePrint 시스템 발표 대본

## 발표 흐름

문제 제기 → 서비스 데모 → 시스템 아키텍처 → Agent workflow → 차별점 및 향후 개선

## 0:00-0:30 프로젝트 소개 / 문제 정의

안녕하세요, 지능정보융합학과 이정입니다.

저는 기말 프로젝트로 UI 레퍼런스 스크린샷을 보고 디자인 특징을 추출한 뒤, 이를 조합해 React와 Tailwind 기반 UI 코드를 생성하는 서비스인 StylePrint를 제작했습니다.

이 프로젝트의 문제의식은 두 가지입니다.

첫째, AI 개발 과정에서 디자인을 어떻게 더 잘 만들 수 있는가입니다. 바이브코딩으로 1인 개발이 늘어나면서, 예전처럼 기획, 디자인, 개발이 완전히 분리되지 않고 한 사람이 함께 처리하는 경우가 많아졌습니다. 이때 가장 먼저 필요한 것은 좋은 레퍼런스를 찾는 일입니다.

하지만 디자인 전공자가 아닌 이상, 레퍼런스의 어떤 요소가 좋은 디자인을 만드는지 판단하기 어렵습니다. 또 그 레퍼런스를 AI 개발 과정에 어떻게 반영해야 실제 UI 품질이 좋아지는지도 명확하지 않습니다.

둘째, AI 디자인의 추적 가능성입니다. 레퍼런스를 가져와도, AI가 어떤 부분을 어떤 원리로 디자인에 적용했는지 확인하기가 쉽지 않습니다. 결과는 나오지만, 그 결과가 어떤 레퍼런스의 어떤 요소에서 왔는지 설명하기 어렵다는 문제가 있습니다.

그래서 StylePrint는 이 과정을 Agent workflow로 나눴습니다. 레퍼런스에서 디자인 facet을 추출하고, 사용자가 원하는 조합을 IntentSpec으로 정규화한 뒤, 충돌을 검증하고, 최종적으로 실행 가능한 UI 코드를 생성합니다.

## 0:30-2:00 서비스 데모

이제 실제 사용 흐름을 먼저 보여드리겠습니다.

데모 영상은 아래 흐름으로 보시면 됩니다.

- 사용자 화면에서는 레퍼런스를 업로드합니다.
- 내부에서는 facet 추출이 진행되고, 색상과 레이아웃, 타이포그래피가 구조화됩니다.
- 그다음에는 추천 recipe를 보거나 facet별 source를 직접 조정합니다.
- 조합이 끝나면 coherence score와 repair plan으로 충돌 여부를 먼저 확인합니다.
- 마지막으로 Generate UI를 실행해서 preview, code, audit/provenance를 확인합니다.

특히 사용자 시나리오는 화면 조작과 내부 처리를 함께 말해 주는 편이 좋습니다.

- 사용자: 레퍼런스를 올리고 추천 레시피를 선택한 뒤, 미리보기와 감사를 확인합니다.
- 웹: `/api/references/upload`부터 `/api/audit/analyze`까지 필요한 API를 순서대로 호출합니다.
- 백엔드와 도구: `ReferenceAsset`, `FacetPack`, `IntentSpec`, `GeneratedCode`, `AuditReport`를 차례로 쌓고, `sharp`, OpenAI, v0, Playwright가 각 단계를 분담합니다.
- 핵심 메시지: 화면은 단순하지만, 내부는 분석 → 계획 → 생성 → 감사로 이어지는 흐름입니다.

첫 번째 단계는 reference 업로드입니다. 사용자는 참고하고 싶은 UI 스크린샷 2-3장을 업로드합니다. 이 이미지는 이후 색상, 타이포그래피, 레이아웃, 간격, 컴포넌트 스타일을 뽑는 기준이 됩니다.

업로드 후 Extract Facets 버튼을 누르면 시스템이 이미지를 분석합니다. 색상은 이미지 픽셀에서 직접 추출하고, 타이포그래피나 레이아웃 같은 시각적 특징은 OpenAI 모델을 사용해 구조화합니다. 결과는 FacetPack이라는 중간 데이터로 저장됩니다.

다음은 Recipe Builder 단계입니다. 여기서는 추천된 recipe를 선택하거나, 사용자가 직접 facet별 출처를 지정할 수 있습니다. 예를 들어 색상은 첫 번째 레퍼런스에서 가져오고, 레이아웃은 두 번째 레퍼런스에서 가져오는 방식입니다.

recipe를 선택하면 시스템이 coherence를 평가합니다. 색상 대비가 부족한지, 폰트 크기와 밀도가 어긋나는지, spacing scale이 충돌하는지 검사하고, 문제가 있으면 repair plan을 제안합니다. 이 단계가 중요한 이유는 생성 전에 스타일 조합이 실제 코드로 만들기 적합한지 확인할 수 있기 때문입니다.

마지막으로 Generate UI를 실행하면 v0를 통해 React + Tailwind 코드가 생성됩니다. 생성 결과는 preview iframe으로 바로 확인할 수 있고, 코드 탭에서는 실제 생성된 코드를 볼 수 있습니다. Audit 탭에서는 생성된 코드가 원래 IntentSpec을 얼마나 잘 반영했는지 diff와 provenance로 확인할 수 있습니다.

즉, 데모의 핵심 흐름은 업로드, facet 추출, recipe 선택, coherence 검증, UI 생성, audit 확인입니다.

## 2:00-3:20 아키텍처 / 시스템 파이프라인

이제 방금 보신 기능이 어떤 구조로 돌아가는지 설명드리겠습니다. 전체 시스템은 Frontend, Backend API, Agent Orchestrator, Tools and Models, Runtime Artifacts로 나뉩니다.

Frontend는 Vite React와 TypeScript로 만들었습니다. 사용자는 여기서 이미지를 업로드하고, recipe를 선택하고, 생성 결과와 audit 결과를 확인합니다.

Backend는 Fastify와 TypeScript로 구성했습니다. 주요 API는 `/api/references/upload`, `/api/facets/extract`, `/api/intents/create`, `/api/intents/evaluate`, `/api/generate/v0`, `/api/audit/analyze`입니다. 이 API들이 사용자의 요청을 받아 Agent workflow를 실행합니다.

전체 파이프라인은 여섯 단계입니다. 먼저 사용자가 reference 이미지를 업로드하면 `ReferenceAsset`이 저장됩니다. 다음으로 rule-based color extraction과 LLM vision analysis를 통해 `FacetPack`을 만듭니다. 여러 reference의 facet 조합 후보를 만들고 coherence 기준으로 recipe를 추천합니다. recipe를 선택하면 `IntentSpec`으로 정규화하고, coherence evaluator가 생성 가능성을 점검합니다. 이후 v0로 React + Tailwind 코드를 생성하고, preview artifact와 audit report를 만듭니다.

사용 모델과 API는 세 부분입니다. OpenAI Responses API는 기본적으로 `gpt-4.1-mini`를 사용하고, 이미지 기반 facet 분석, 생성 코드 audit, coherence judge에 사용합니다. v0 API는 `v0-mini` 모델로 React + Tailwind UI 코드를 생성합니다. 로컬 도구로는 `sharp`가 색상 추출을 담당하고, `esbuild`가 preview bundle을 만들고, Playwright가 생성 결과 screenshot을 캡처합니다.

Reference 분석은 rule-based와 LLM을 같이 사용합니다. rule-based 쪽에서는 `sharp`로 이미지 픽셀에서 주요 색상을 추출하고, primary, background, surface, text 같은 semantic role을 부여합니다. 색상 대비도 계산해서 이후 coherence 평가에 사용합니다. LLM 쪽에서는 이미지와 추출된 palette를 함께 넣고, typography, layout, spacing, component style, mood keyword를 JSON schema 형태로 받습니다.

현재 MVP 저장소는 `data/*.json`과 `public/uploads`를 사용합니다. 빠른 프로토타입에는 충분하지만, 실제 서비스로 확장하려면 PostgreSQL 같은 DB와 S3 또는 R2 같은 object storage로 전환할 계획입니다.

## 3:20-4:30 Agent Workflow / Coherence / LLM Judge

이 프로젝트에서 중요한 부분은 단순히 LLM을 한 번 호출하는 것이 아니라, Agent workflow가 단계별로 판단하고 중간 결과를 남긴다는 점입니다.

Workflow는 Planner, Extractor, Recipe Executor, Validator, Generator/Auditor로 나눌 수 있습니다.

먼저 Planner는 사용자의 reference와 생성 목표를 바탕으로 어떤 facet을 추출해야 하는지 계획합니다. 여기서 색상, 타이포그래피, 레이아웃, 간격, 컴포넌트 스타일이라는 분석 단위가 정해집니다.

Extractor는 실제 도구를 호출합니다. sharp로 색상 토큰을 뽑고, OpenAI 모델로 타이포그래피, 레이아웃, spacing, component style을 분석합니다. 이 결과가 FacetPack입니다.

Recipe Executor는 여러 reference의 facet을 조합합니다. 추천 recipe를 만들거나 사용자가 직접 선택한 조합을 IntentSpec으로 정규화합니다. IntentSpec은 이후 코드 생성의 기준이 되는 설계 명세입니다.

Validator는 IntentSpec을 검사합니다. 색상 대비, density와 typography의 불일치, spacing scale mismatch 같은 문제를 rule-based로 평가하고 coherence score를 계산합니다. 필요하면 repair plan도 함께 제안합니다.

Generator는 검증된 IntentSpec을 기반으로 v0에 UI 생성을 요청합니다. 생성된 결과는 preview artifact로 저장되고, Auditor가 다시 코드를 분석해 IntentSpec과 비교합니다.

Agent 연결 방식은 별도 agent framework를 쓰는 방식이 아니라, Fastify route와 typed artifact를 통해 단계별 state를 넘기는 방식입니다. 즉 `FacetPack → IntentSpec → GeneratedCode → AuditReport` 순서로 중간 산출물이 저장되고, 각 API route가 다음 단계의 입력을 받습니다. 생성 작업은 시간이 걸릴 수 있기 때문에 generation job을 만들고, frontend가 job status를 polling합니다.

Coherence 점수는 rule-based baseline입니다. 기본적으로 100점에서 dimension별 deduction을 빼는 방식입니다. 평가 dimension은 accessibility, visual consistency, intent coverage, provenance coverage, source harmony, generation readiness입니다. 예를 들어 text/background contrast가 WCAG 기준보다 낮으면 accessibility 점수가 깎이고, compact layout인데 body text가 너무 작거나 spacing base unit이 맞지 않으면 visual consistency가 깎입니다. 여러 reference의 mood keyword가 많이 다르면 source harmony도 낮아집니다.

LLM as a judge는 현재 shadow mode로 붙어 있습니다. rule-based 결과를 baseline으로 만들고, OpenAI judge prompt에는 rubric, checklist, calibration anchor, IntentSpec, rule findings를 넣습니다. LLM은 0-100 숫자를 직접 주는 것이 아니라 strong, adequate, weak, fail 같은 ordinal rating과 checklist 결과를 JSON으로 반환합니다. 이 judge 결과는 baseline score를 대체하기보다 사람이 평가 루프를 개선하는 참고 정보로 저장됩니다.

이 구조 덕분에 사용자는 단순한 결과물뿐 아니라, 어떤 reference에서 어떤 facet을 가져왔는지, 생성 전에 어떤 충돌이 있었는지, 생성 후 결과가 의도를 얼마나 반영했는지까지 확인할 수 있습니다.

## 4:30-5:00 테스트 / 차별점 / 향후 개선

테스트는 API와 frontend component를 나눠서 Vitest로 작성했습니다. API 쪽에서는 preview artifact가 HTML과 JS bundle을 만드는지, 허용된 preview 파일만 읽는지, preview build route가 400과 200을 올바르게 반환하는지 확인했습니다. coherence evaluator는 contrast conflict, coverage gap, provenance gap을 테스트했고, LLM judge prompt는 prompt version과 baseline 포함 여부를 검증했습니다.

Frontend 쪽에서는 PreviewPane이 전달받은 preview URL로 iframe을 렌더링하는지, preview URL이 없을 때 build API를 호출하는지, zoom 옵션과 error UI가 동작하는지 테스트했습니다. App flow에서는 backend ranked recipe를 불러오는지, coherence 평가 중 loading state가 보이는지, 추천 실패 시 fallback recipe를 보여주지 않는지 확인했습니다.

정리하면 StylePrint의 핵심 차별점은 네 가지입니다.

첫째, 디자인을 하나의 이미지 단위가 아니라 facet 단위로 나눠 추출합니다. 그래서 색상은 A 레퍼런스, 레이아웃은 B 레퍼런스처럼 조합할 수 있습니다.

둘째, provenance를 제공합니다. 생성 결과의 각 facet이 어떤 reference에서 왔는지 추적할 수 있습니다.

셋째, 생성 전에 coherence를 평가합니다. contrast나 spacing mismatch 같은 문제를 미리 발견하고 repair plan을 제안합니다.

넷째, 생성 후 audit을 수행합니다. 생성된 코드가 IntentSpec을 얼마나 잘 반영했는지 다시 검토할 수 있습니다.

향후에는 저장소를 JSON 기반에서 DB와 object storage로 전환하고, 사용자별 프로젝트 관리와 인증을 추가할 계획입니다. 또한 Storybook이나 visual regression test를 도입해 생성 UI 품질 검증을 강화하고, Planner, Validator, Generator를 더 명확한 multi-agent 구조로 분리할 예정입니다.

결론적으로 StylePrint는 레퍼런스 스크린샷과 자연어 요청을 바탕으로 UI 구현 초안을 만들고, 생성 전후 검증 루프로 결과의 신뢰도를 높이는 Agent 기반 UI 생성 시스템입니다.
