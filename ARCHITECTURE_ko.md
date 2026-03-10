# 아키텍처 가이드 — oh-my-teammates

> Version 0.5.1 | Runtime: Bun | Language: TypeScript (strict mode)

## 개요

**oh-my-teammates**는 [oh-my-customcode](https://github.com/baekenough/oh-my-customcode)의 팀 협업 애드온입니다. 개인 에이전트 하네스 모델을 개발팀 전체로 확장하며 다음 기능을 제공합니다:

- **팀 설정** — 역할 및 도메인 할당이 포함된 멤버 레지스트리 (`team.yaml`)
- **세션 로깅** — SQLite 기반 개발자 세션별 활동 추적
- **도메인 스튜어드십** — 8도메인 소유권 모델과 자동 CODEOWNERS 생성
- **작업 관리** — 우선순위 수준과 스튜어드 기반 자동 할당이 있는 팀 TODO
- **프로젝트 스캐폴딩** — 자동 프로젝트 스캔 및 설정 부트스트랩
- **CLI** — 일상적인 팀 운영을 위한 `omcustom-team` 바이너리
- **대시보드** — 팀의 에이전트/스킬/규칙 인벤토리를 위한 SvelteKit 시각화 레이어
- **에이전트 추천** — 기술 스택 분석을 위한 4계층 신뢰도 점수 엔진 (`recommender.ts`)
- **리포트 생성** — 팀, 세션, 스튜어드, TODO 데이터를 집계하는 정적 HTML 리포트 (`report.ts`)

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                          omcustom-team CLI                           │
│                              (cli.ts)                                │
│      init  │  todo  │  recommend  │  report  │  status               │
├────────────┴────────┴─────────────┴──────────┴───────────────────────┤
│                                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ TeamConfig  │  │ Stewards │  │ SessionLogger │  │  TeamTodo   │  │
│  │ team.yaml   │  │STEWARDS  │  │  bun:sqlite   │  │  TODO.md    │  │
│  │ CRUD +      │  │.yaml +   │  │  WAL mode     │  │  priority + │  │
│  │ validation  │←→│CODEOWNERS│←─│  sessions +   │  │  auto-      │  │
│  └─────────────┘  │generation│  │  events       │  │  assign     │──┤
│                    └─────┬───┘  └───────────────┘  └─────────────┘  │
│                          │              │                  │          │
│                          │              ▼                  │          │
│  ┌─────────────┐         │    ┌───────────────┐           │          │
│  │ Recommender │         │    │ReportGenerator│◄──────────┘          │
│  │ 4-layer     │         │    │ HTML output   │                      │
│  │ scoring     │         └───►│ aggregates    │                      │
│  │             │              │ all modules   │                      │
│  └──────┬──────┘              └───────────────┘                      │
│         │                                                             │
│  ┌──────┴──────┐  ┌──────────────┐                                   │
│  │AgentCatalog │  │ManifestParser│                                   │
│  │ 41 agents   │  │ package.json │                                   │
│  │ detection   │  │ go.mod, etc  │                                   │
│  │ rules       │  │              │                                   │
│  └─────────────┘  └──────────────┘                                   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                          init.ts                              │   │
│  │   scanProject() → scaffoldTeamDir() → scaffoldClaudeMd()      │   │
│  └───────────────────────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────────────────────────┤
│                        Public API (index.ts)                          │
│  TeamConfig │ SessionLogger │ Stewards │ TeamTodo │ Recommender       │
│  ReportGenerator │ AgentCatalog │ ManifestParser                      │
├───────────────────────────────────────────────────────────────────────┤
│                       SvelteKit 대시보드                              │
│             dashboard/ → adapter-static → GitHub Pages                │
└───────────────────────────────────────────────────────────────────────┘
```

## 핵심 모듈

### TeamConfig (`src/team-config.ts`)

`team.yaml`을 관리하는 팀 멤버 레지스트리입니다.

**주요 타입:**

```typescript
interface TeamMember {
  github: string;           // GitHub 사용자명 (기본 키)
  name: string;             // 표시 이름
  role: 'admin' | 'member'; // 접근 계층
  domains: string[];        // 도메인 책임 범위
}

interface TeamConfigData {
  team: { name: string; version: string; members: TeamMember[] };
}
```

**역할:**
- `team.yaml` 로드 및 파싱 (모든 필드를 런타임에서 검증)
- CRUD 연산: `addMember`, `removeMember`, `updateMember`, `getMember`
- 역할 기반 조회: `getAdmins()`, `getMembersByDomain(domain)`
- 지연 로딩과 인메모리 캐시; `save()` 호출 시 YAML에 플러시
- 프로젝트 부트스트랩을 위한 정적 팩토리 `createTemplate()`

**데이터 흐름:** `load()` → 검증 → 캐시 → 메모리에서 변경 → `save()`로 YAML에 저장

---

### SessionLogger (`src/session-logger.ts`)

WAL 모드의 `bun:sqlite`를 사용해 개발자별 Claude Code 세션을 추적합니다.

**스키마:**

```
sessions
  id TEXT PK        — "{date}-{pid}-{uuid8}"
  started_at TEXT   — ISO 8601
  ended_at TEXT     — ISO 8601 (nullable)
  user TEXT         — GitHub 사용자명
  branch TEXT       — 세션 시작 시 Git 브랜치
  summary TEXT      — 세션 종료 요약 (nullable)

session_events
  id INTEGER PK AUTOINCREMENT
  session_id TEXT FK → sessions.id
  timestamp TEXT    — ISO 8601
  type TEXT         — file_change | command | agent_spawn | error | note
  data TEXT         — JSON 페이로드
```

**역할:**
- `startSession(user, branch)` — 새 세션 행 생성, 세션 ID 반환
- `logEvent(type, data)` — 활성 세션에 이벤트 추가
- `endSession(summary?)` — 타임스탬프 및 선택적 요약과 함께 세션 종료
- `listSessions({ user?, limit? })` — 필터링된 세션 히스토리
- `getSessionEvents(sessionId)` — 세션의 전체 이벤트 타임라인
- WAL 저널 모드로 활성 세션 중 동시 읽기 안전성 보장

**데이터 흐름:** `startSession` → `logEvent` (여러 번) → `endSession` → `getSession` / `listSessions`로 내보내기

---

### Stewards (`src/stewards.ts`)

도메인 소유권 레지스트리인 `STEWARDS.yaml`을 관리하고 `.github/CODEOWNERS`를 생성합니다.

**주요 타입:**

```typescript
interface DomainSteward {
  primary: string;      // 주 소유자 GitHub 사용자명
  backup: string | null; // 대체 소유자
  paths: string[];      // 이 도메인의 glob 패턴
}

interface StewardsData {
  stewards: { version: string; domains: Record<string, DomainSteward> };
}
```

**8개 기본 도메인:**

| 도메인 | 기본 경로 패턴 |
|--------|---------------|
| `languages` | `**/*.ts`, `**/*.py`, `**/*.go`, `**/*.kt`, `**/*.rs`, `**/*.java` |
| `frontend` | `src/components/**`, `dashboard/**`, `**/*.svelte`, `**/*.tsx` |
| `backend` | `src/api/**`, `src/server/**`, `routes/**` |
| `data-engineering` | `dags/**`, `pipelines/**`, `models/**` |
| `infrastructure` | `Dockerfile`, `.github/**`, `terraform/**` |
| `database` | `**/*.sql`, `migrations/**`, `schema/**` |
| `quality` | `**/*.test.ts`, `**/*.spec.ts`, `__tests__/**` |
| `documentation` | `docs/**`, `**/*.md`, `guides/**` |

**역할:**
- 엄격한 런타임 검증과 함께 `STEWARDS.yaml` 로드/저장
- `findDomainForPath(filePath)` — glob으로 파일을 도메인에 매칭 (커스텀 glob 엔진)
- `findStewardForFile(filePath)` — 파일에 대한 `{ domain, primary, backup }` 반환
- `generateCodeowners()` — 로드된 데이터에서 전체 CODEOWNERS 파일 콘텐츠 렌더링
- `writeCodeowners(outputPath?)` — `.github/CODEOWNERS`에 CODEOWNERS 작성
- 정적 `createTemplate()` — 8개 도메인에 플레이스홀더 값으로 스캐폴딩

**Glob 엔진:** `**`, `*`, 디렉토리 접두사, 확장자 와일드카드를 처리하는 커스텀 문자별 파서 (이중 치환 버그 방지).

**데이터 흐름:** `STEWARDS.yaml` → `load()` → `validate()` → `generateCodeowners()` → `.github/CODEOWNERS`

---

### TeamTodo (`src/team-todo.ts`)

구조화된 git 추적 공유 작업 목록인 `.claude/team/TODO.md`를 파싱하고 관리합니다.

**TodoItem 구조:**

```typescript
interface TodoItem {
  scope: 'team' | 'personal'; // 가시성 범위
  priority: 'P0' | 'P1' | 'P2'; // P0 = 긴급, P2 = 낮음
  description: string;
  assignee: string | null;    // GitHub 사용자명
  domain: string | null;      // 자동 할당을 위한 도메인
  completed: boolean;
}
```

**TODO.md의 라인 형식:**

```
## team: [P0] Fix Guardian CI false positive — @john-doe (languages)
## ~~personal: [P2] Review session logs — @john-doe~~   ← 완료됨
```

**역할:**
- `load()` — 정규식 기반 라인 파서, 파일 헤더 라인 보존
- `add(item)` — 새 항목 추가 (항상 `completed: false`)
- `complete(index)` — 항목을 완료로 표시 (`~~취소선~~`으로 렌더링)
- `list(filter?)` — 범위, 우선순위, 담당자별 필터링된 뷰
- `autoAssign(stewardsPath?)` — 도메인은 있지만 담당자가 없는 항목에 `STEWARDS.yaml`의 주 스튜어드를 담당자로 설정; 반환값은 업데이트된 항목 수
- 정적 `createTemplate()` — 예제 TODO.md 작성

**Stewards와의 통합:** `autoAssign()`은 내부적으로 `Stewards` 객체를 생성합니다. `STEWARDS.yaml`이 없으면 예외를 던지지 않고 0을 반환합니다.

---

## 스튜어드 개념 심층 분석

### 목적

스튜어드는 팀의 근본적인 질문에 답합니다: **"이 코드의 책임자는 누구인가?"**

CODEOWNERS를 파일 수준에서 수동으로 관리하는 대신, 스튜어드는 **도메인 추상화 레이어**를 도입합니다. 도메인 수준에서 소유권을 선언하면, 시스템이 파일-소유자 매핑을 자동으로 처리합니다.

### 핵심 가치 제안

| 관점 | 기존 방식 (CODEOWNERS) | 스튜어드 시스템 |
|------|----------------------|----------------|
| 세분화 | 파일/디렉토리 경로 | **도메인** (8개 시맨틱 카테고리) |
| 유지보수 | 수동 편집, 쉽게 오래됨 | 선언적 YAML, CODEOWNERS 자동 생성 |
| 작업 할당 | 작업별 수동 할당 | 도메인 조회로 자동 할당 |
| 탐색성 | CODEOWNERS를 grep | `findStewardForFile(path)` API |
| 커버리지 가시성 | 없음 | 리포트에서 미할당 도메인 강조 |

### 매핑 작동 방식

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   파일 변경       │     │   도메인 매치      │     │  스튜어드 확인    │
│                   │     │                   │     │                  │
│ src/api/auth.ts   │────►│ backend           │────►│ primary: alice   │
│                   │ glob│ (src/api/**)       │     │ backup:  bob     │
└──────────────────┘매치  └──────────────────┘     └──────────────────┘
```

`findStewardForFile()` 메서드:
1. `STEWARDS.yaml`의 모든 도메인을 순회
2. 각 도메인에 대해 파일 경로를 `paths[]`의 모든 glob 패턴과 비교
3. 첫 번째로 매칭되는 도메인의 `primary`와 `backup` 스튜어드 반환
4. 매칭되는 도메인이 없으면 `undefined` 반환 (커버리지 갭)

### 통합 지점

```
STEWARDS.yaml ─────────────────────────────────┐
     │                                          │
     ├─► generateCodeowners()                   │
     │     └─► .github/CODEOWNERS               │
     │           └─► GitHub가 자동으로           │
     │               PR 리뷰어 지정              │
     │                                          │
     ├─► TeamTodo.autoAssign()                  │
     │     └─► 도메인은 있지만 담당자 없는       │
     │         TODO 항목에 primary 스튜어드 할당  │
     │                                          │
     ├─► ReportGenerator                        │
     │     └─► 커버리지 갭 분석                  │
     │         (스튜어드 없는 도메인)             │
     │                                          │
     └─► findStewardForFile(path)               │
           └─► 런타임 조회: "이 파일 소유자?"    │
```

### 실제 예시

다음 `STEWARDS.yaml`이 주어졌을 때:

```yaml
stewards:
  version: "1.0"
  domains:
    frontend:
      primary: carol
      backup: dave
      paths:
        - src/components/**
        - "**/*.svelte"
        - "**/*.tsx"
    backend:
      primary: alice
      backup: bob
      paths:
        - src/api/**
        - src/server/**
```

**시나리오 1: PR 리뷰**
PR이 `src/api/auth.ts`를 수정 → Stewards가 CODEOWNERS 생성 → GitHub이 `@alice`와 `@bob`을 리뷰어로 자동 지정.

**시나리오 2: TODO 자동 할당**
```
전: ## team: [P0] Fix auth bug — (backend)     ← 담당자 없음
후: ## team: [P0] Fix auth bug — @alice (backend) ← 자동 할당됨
```

**시나리오 3: 커버리지 갭 감지**
`data-engineering` 도메인의 `primary: null`이면, 리포트에서 주의가 필요한 미할당 도메인으로 표시합니다.

---

### init (`src/init.ts`)

프로젝트 스캔 및 부트스트랩 진입점입니다.

**역할:**
- `scanProject(rootDir?)` — 프로젝트 트리 워크 (`node_modules`, `.git`, `dist` 등 제외):
  - `detectedDomains` — 매칭 파일이 있는 8개 기본 도메인
  - `filePatterns` — 확장자 빈도 맵 (`{ '.ts': 42, '.py': 7, ... }`)
  - `dependencies` — 감지된 매니페스트 파일 (`package.json`, `go.mod`, `Cargo.toml` 등)
  - `suggestedStewards` — STEWARDS.yaml 시딩을 위한 도메인별 매칭 파일 경로
- `scaffoldTeamDir(rootDir?)` — 스타터 `TODO.md`와 함께 `.claude/team/` 생성
- `initTeam(rootDir?)` — 전체 초기화 흐름 조율:
  1. `scanProject()`
  2. `scaffoldTeamDir()`
  3. `TeamConfig.createTemplate()` (`team.yaml` 없을 시)
  4. `Stewards.createTemplate()` (`STEWARDS.yaml` 없을 시)
- `detectProjectName(rootDir)` — `package.json` name 읽기 또는 디렉토리 basename으로 폴백

**디렉토리 워커:** 심볼릭 링크의 무한 루프를 피하기 위해 `statSync` 대신 `lstatSync` 사용.

---

### CLI (`src/cli.ts`)

`omcustom-team` 바이너리의 진입점으로, `dist/cli.js`에서 내보냅니다.

**명령어:**

| 명령어 | 동작 |
|--------|------|
| `omcustom-team init` | `initTeam()` 실행, 감지된 도메인 및 출력 경로 출력 |
| `omcustom-team todo list` | 모든 TODO 항목을 상태 표시와 함께 출력 |
| `omcustom-team todo add <description>` | TODO.md에 `team` / `P1` 항목 추가 |

**종료 코드:** 필수 인수 누락 또는 `init` 전에 `list` 호출 시 코드 `1`로 종료.

---

### Recommender (`src/recommender.ts`)

프로젝트 디렉토리를 스캔하고 기술 스택 분석을 기반으로 순위가 매겨진 에이전트 추천 목록을 생성합니다.

**주요 타입:**

```typescript
interface AgentRecommendation {
  agent: string;         // Agent name from catalog
  category: AgentCategory;
  description: string;
  confidence: number;    // 0.0 - 1.0
  reasons: string[];     // Human-readable match reasons
}
```

**4계층 신뢰도 점수:**

| 계층 | 신호 | 최대 신뢰도 | 예시 |
|------|------|------------|------|
| 1. 파일 확장자 | `*.ts`, `*.py`, `*.go` | 0.5 | "42 .ts files found" |
| 2. 설정 파일 | `tsconfig.json`, `Cargo.toml` | 0.8 | "tsconfig.json found" |
| 3. 디렉토리 패턴 | `dags/`, `migrations/` | 0.6 | "dags/ directory found" |
| 4. 매니페스트 의존성 | `react` in package.json | 0.9 | "react, next in package.json" |

**점수 알고리즘:** 각 계층이 신뢰도 점수를 생성합니다. 최종 신뢰도는 `max(모든 계층 점수)`이며 1.0으로 제한됩니다. 상위 계층(의존성)이 존재하면 하위 계층(확장자)을 덮어씁니다.

**데이터 흐름:** `scanFiles()` → `parseManifests()` → 카탈로그 항목별 `scoreAgent()` → 신뢰도 순 정렬 → `minConfidence`로 필터링

---

### ReportGenerator (`src/report.ts`)

모든 핵심 모듈의 데이터를 집계하여 독립형 정적 HTML 리포트를 생성합니다.

**데이터 소스:**

| 소스 | 수집 데이터 |
|------|------------|
| `TeamConfig` | 팀 이름, 멤버 목록 |
| `Stewards` | 도메인 소유권 맵, 커버리지 갭 |
| `TeamTodo` | 미완료/완료 항목, 우선순위 분포 |
| `SessionLogger` | 최근 세션, 이벤트 통계, 사용자 활동 |

**리포트 섹션:** 팀 개요, 도메인 스튜어드십 매트릭스, TODO 요약, 세션 활동, 커버리지 갭 분석.

**출력:** `.claude/team/report.html`에 단일 `.html` 파일 생성 (설정 가능). 외부 의존성 없음 — 모든 CSS/JS가 인라인으로 포함됩니다.

**점진적 성능 저하:** 각 데이터 소스는 독립적으로 수집됩니다. `team.yaml`이 없어도 사용 가능한 데이터로 리포트를 생성합니다. 단일 파일 누락이 리포트 생성을 막지 않습니다.

---

## 데이터 흐름

```
omcustom-team init
  │
  ├─ scanProject()
  │     파일 트리 워크 → 도메인, 확장자, 매니페스트 감지
  │
  ├─ scaffoldTeamDir()
  │     mkdir .claude/team/ + TODO.md 템플릿 작성
  │
  ├─ TeamConfig.createTemplate(team.yaml)
  │     플레이스홀더 멤버로 team.yaml 작성
  │
  └─ Stewards.createTemplate(STEWARDS.yaml)
        8개 도메인으로 STEWARDS.yaml 작성

──── team.yaml / STEWARDS.yaml 수동 편집 후 ────

TeamTodo.autoAssign()
  │
  ├─ Stewards.load()로 STEWARDS.yaml 로드
  └─ 도메인은 있지만 담당자 없는 각 TODO 항목에 대해:
        stewards.getDomain(domain).primary → item.assignee

SessionLogger.startSession(user, branch)
  │
  ├─ sessions 테이블에 INSERT
  ├─ logEvent(type, data) → session_events에 INSERT
  └─ endSession(summary) → sessions.ended_at UPDATE

Stewards.writeCodeowners()
  │
  ├─ generateCodeowners() → 각 도메인의 경로 + 소유자 포맷
  └─ .github/CODEOWNERS에 작성

Recommender.recommend()
  │
  ├─ scanFiles()
  │     walk project tree → collect extensions, config files, directories
  │
  ├─ parseManifests()
  │     detect package.json, go.mod, etc. → extract dependencies
  │
  └─ scoreAgent() × N catalog entries
        4-layer scoring → sort by confidence → return recommendations

ReportGenerator.generate()
  │
  ├─ collectTeamConfig()    → team.yaml data
  ├─ collectDomains()       → STEWARDS.yaml data
  ├─ collectTodos()         → TODO.md items
  ├─ collectSessionData()   → SQLite session stats
  ├─ computeCoverageGaps()  → unowned domains
  └─ generateReportHtml()   → single HTML file output
```

## 대시보드

`dashboard/` 서브디렉토리는 독립형 SvelteKit 애플리케이션입니다.

**아키텍처:**
- **프레임워크:** `@sveltejs/adapter-static`을 사용하는 SvelteKit
- **출력:** 완전한 정적 HTML/CSS/JS 번들 (서버 불필요)
- **배포:** `main` 브랜치 푸시 시 GitHub Actions로 GitHub Pages에 자동 배포
- **데이터 소스:** 프로젝트의 `.claude/` 디렉토리에서 생성된 `data.json` 파일 (에이전트, 스킬, 규칙, 가이드)

**뷰:**
- 에이전트 — frontmatter 세부 정보 및 역량 설명과 함께 등록된 에이전트 탐색
- 스킬 — 스킬 정의 및 에이전트 연관 관계 탐색
- 규칙 — 우선순위 수준으로 정렬된 MUST/SHOULD/MAY 규칙 조회
- 가이드 — 개발자 가이드 및 레퍼런스 문서 접근

**기능:** 다크 모드, 모바일 반응형 레이아웃.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 런타임 | Bun >= 1.0.0 |
| 언어 | TypeScript (strict mode) |
| 데이터베이스 | bun:sqlite (WAL 저널 모드) |
| 설정 형식 | YAML via `yaml` ^2.7.0 |
| 대시보드 | SvelteKit + @sveltejs/adapter-static |
| 린트 / 포맷 | Biome ^1.9.0 (strict 규칙셋) |
| Git 훅 | Husky ^9.1.7 + lint-staged ^16.3.2 |
| 테스트 커버리지 | Bun test, 99% 커버리지 게이트 |
| CI/CD | GitHub Actions |
| 패키지 레지스트리 | npm (공개, 스코프: `@oh-my-customcode/`) |

## 디렉토리 구조

```
oh-my-teammates/
├── src/
│   ├── index.ts           — 공개 API 내보내기
│   ├── cli.ts             — omcustom-team CLI 진입점
│   ├── team-config.ts     — TeamConfig 클래스 (team.yaml)
│   ├── session-logger.ts  — SessionLogger 클래스 (bun:sqlite)
│   ├── stewards.ts        — Stewards 클래스 (STEWARDS.yaml + CODEOWNERS)
│   ├── team-todo.ts       — TeamTodo 클래스 (TODO.md)
│   └── init.ts            — scanProject + initTeam
├── dashboard/
│   ├── src/               — SvelteKit 앱 소스
│   └── package.json       — 대시보드 의존성
├── templates/             — 배포되는 설정 템플릿
├── dist/                  — 빌드 출력 (gitignored)
│   ├── index.js           — 라이브러리 진입점
│   ├── index.d.ts         — 타입 선언
│   └── cli.js             — CLI 바이너리
├── .claude/
│   ├── agents/            — oh-my-customcode 에이전트 정의
│   ├── skills/            — 스킬 정의
│   ├── rules/             — MUST/SHOULD/MAY 규칙
│   └── team/              — 공유 팀 데이터 (sessions.db, TODO.md)
├── guides/                — 개발자 레퍼런스 가이드
├── team.yaml              — 팀 멤버 레지스트리 (프로젝트 루트)
├── STEWARDS.yaml          — 도메인 소유권 (프로젝트 루트)
├── package.json
├── CHANGELOG.md
└── README.md
```

## CI/CD 워크플로

| 워크플로 | 트리거 | 작업 |
|----------|--------|------|
| `ci.yml` | PR | Lint (Biome) → Typecheck → Test (99% 게이트) → Build |
| `guardian.yml` | PR (`.claude/**` 변경) | 에이전트, 스킬, STEWARDS.yaml, team.yaml 검증 |
| `claude-native-check.yml` | 주간 / 수동 | 공식 문서 컴플라이언스 확인 |
| `security-audit.yml` | 주간 / PR | 의존성 취약점 스캔 |
| `release.yml` | 태그 푸시 (`v*`) | Build → npm 배포 → GitHub Release |
