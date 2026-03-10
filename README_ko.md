<div align="center">
  <img src="assets/banner.png" alt="oh-my-teammates 배너" width="800" />
</div>

# oh-my-teammates

> **팀의 에이전트 스택, 함께**

[![npm version](https://img.shields.io/npm/v/@oh-my-customcode/oh-my-teammates.svg)](https://www.npmjs.com/package/@oh-my-customcode/oh-my-teammates)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-teammates/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-teammates/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-teammates/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-teammates/actions/workflows/security-audit.yml)

**[English Documentation](./README.md)** | 📐 [아키텍처 가이드](ARCHITECTURE_ko.md)

**[oh-my-customcode](https://github.com/baekenough/oh-my-customcode)의 팀 협업 애드온 — 세션 공유, 하네스 보호, 함께 거버넌스.**

oh-my-customcode가 개인 에이전트 스택을 제공했다면, oh-my-teammates는 팀 전체가 함께 사용할 수 있게 합니다.

## 구현 모듈

| 모듈 | 설명 |
|------|------|
| `team-config.ts` | `team.yaml` CRUD 조작, 관리자 역할, 스키마 유효성 검사 |
| `session-logger.ts` | `bun:sqlite` 기반 세션 추적 및 이벤트 로깅 |
| `stewards.ts` | `STEWARDS.yaml` 관리, 8도메인 모델, CODEOWNERS 생성 |
| `init.ts` | 프로젝트 스캔, 의존성 분석, 팀 설정 스캐폴딩 |
| `team-todo.ts` | 우선순위 레벨 및 스튜어드 기반 자동 할당 팀 작업 관리 |
| `recommender.ts` | 에이전트 추천을 위한 4계층 신뢰도 점수 기반 프로젝트 스캔 엔진 |
| `report.ts` | 팀, 스튜어드, 세션, TODO 데이터를 집계하는 정적 HTML 리포트 생성기 |
| `cli.ts` | `omcustom-team init` 및 `omcustom-team todo` CLI 명령어 |
| 대시보드 | SvelteKit 기반 에이전트/스킬/규칙/가이드 시각화, 다크모드 및 모바일 지원 |

## 기능

| 기능 | 설명 |
|------|------|
| **세션 공유** | 선택적 심볼릭 링크를 통해 팀 간 Claude 세션 지식 공유 |
| **Guardian CI** | PR마다 자동 하네스 무결성 검증 (~860ms) |
| **스튜어드 시스템** | 도메인 기반 소유권, init 시 자동 할당 |
| **팀 TODO** | 스튜어드 및 이슈와 연동된 공유 작업 관리 |
| **품질 메트릭** | Rule Adherence Rate (RAR) 추적, 목표 98% |
| **적응형 확장** | 기술 스택 변화 자동 감지 후 새 에이전트/스킬 추천 |
| **에이전트 추천** | 프로젝트 구조를 스캔하여 기술 스택에 맞는 에이전트 추천 |
| **HTML 리포트** | 팀 데이터를 정적 대시보드 리포트로 집계 |

## 스튜어드 작동 방식

스튜어드는 **도메인 관리인**입니다 — 코드베이스 전반에 걸쳐 "누가 무엇을 책임지는가"를 선언합니다. `.github/CODEOWNERS`를 수동으로 편집하는 대신, `STEWARDS.yaml`에서 **도메인 단위**로 소유권을 정의합니다.

### 스튜어드가 해결하는 문제

| 스튜어드 없이 | 스튜어드 사용 시 |
|---------------|-----------------|
| `.github/CODEOWNERS`를 파일별 수동 편집 | **도메인** 단위로 소유권 정의 → CODEOWNERS 자동 생성 |
| "이 PR 누가 리뷰해야 해?" → 물어보기 | `findStewardForFile("src/api/auth.ts")` → `alice` |
| TODO 작업 수동 할당 | `autoAssign()`으로 도메인 기반 자동 할당 |
| 커버리지 갭 파악 불가 | 리포트에서 소유자 없는 도메인 표시 |

### 작동 원리

```
STEWARDS.yaml                        .github/CODEOWNERS
┌──────────────────────┐             ┌──────────────────────────┐
│ domains:             │             │ # 자동 생성               │
│   frontend:          │  ────────►  │ /src/components/** @carol │
│     primary: carol   │  CODEOWNERS │ /**/*.svelte @carol @dave │
│     backup: dave     │  생성       │                           │
│     paths:           │             │ /src/api/** @alice @bob   │
│       - src/comp/**  │             └──────────────────────────┘
│       - **/*.svelte  │
│   backend:           │             TODO.md (자동 할당)
│     primary: alice   │             ┌──────────────────────────┐
│     backup: bob      │  ────────►  │ [P0] Fix auth — @alice   │
│     paths:           │  autoAssign │   (backend 도메인)       │
│       - src/api/**   │             │ [P1] Update UI — @carol  │
└──────────────────────┘             │   (frontend 도메인)      │
                                     └──────────────────────────┘
```

### 파일 → 도메인 → 스튜어드 매핑

파일이 변경되면, 스튜어드가 체인을 추적합니다:

```
src/components/Button.tsx → frontend 도메인 → carol (주담당), dave (백업)
dags/daily_etl.py        → data-engineering → dave (주담당)
Dockerfile               → infrastructure   → eve (주담당)
src/api/auth.ts          → backend 도메인   → alice (주담당), bob (백업)
```

### 8개 기본 도메인

| 도메인 | 범위 | 예시 패턴 |
|--------|------|----------|
| `languages` | 언어별 코드 | `**/*.ts`, `**/*.py`, `**/*.go` |
| `frontend` | UI 컴포넌트 & 프레임워크 | `src/components/**`, `**/*.svelte` |
| `backend` | 서버 & API 코드 | `src/api/**`, `routes/**` |
| `data-engineering` | 파이프라인 & DAG | `dags/**`, `pipelines/**` |
| `infrastructure` | 배포 & CI/CD | `Dockerfile`, `terraform/**` |
| `database` | 스키마 & 마이그레이션 | `**/*.sql`, `migrations/**` |
| `quality` | 테스트 & 스펙 | `**/*.test.ts`, `__tests__/**` |
| `documentation` | 문서 & 가이드 | `docs/**`, `**/*.md` |

## 빠른 시작

```bash
# 설치 (oh-my-customcode >= 0.23.0 필요)
bun add -d @oh-my-customcode/oh-my-teammates

# 프로젝트에 팀 기능 초기화
bunx omcustom-team init
```

## CLI 사용법

### `omcustom-team init`

프로젝트의 팀 설정을 부트스트랩합니다:

```bash
bunx omcustom-team init
```

1. **스캔** — 프로젝트의 언어, 프레임워크, 파일 패턴 분석
2. **분석** — git 히스토리로 기여자-도메인 매핑
3. **생성** — `team.yaml` (멤버 매핑) + `STEWARDS.yaml` (도메인 소유권)
4. **구성** — `.claude/team/` 공유 지식 디렉토리 생성

### `omcustom-team todo`

팀 작업을 관리합니다:

```bash
# 모든 팀 TODO 목록 보기
bunx omcustom-team todo list

# 새 팀 작업 추가
bunx omcustom-team todo add API 요청 제한 수정
```

### `omcustom-team recommend`

프로젝트를 스캔하고 에이전트를 추천합니다:

```bash
bunx omcustom-team recommend
```

파일 확장자, 설정 파일, 디렉토리 패턴, 매니페스트 의존성을 분석하여 기술 스택에 가장 적합한 oh-my-customcode 에이전트를 추천합니다.

## 대시보드

`omcustom-team init` 실행 시 프로젝트에 SvelteKit 대시보드가 스캐폴딩됩니다. oh-my-customcode 하네스를 시각적으로 확인할 수 있습니다:

- **에이전트** — 등록된 모든 에이전트와 역량 탐색
- **스킬** — 스킬 정의 및 에이전트 연관 관계 확인
- **규칙** — MUST/SHOULD/MAY 규칙을 우선순위별로 조회
- **가이드** — 개발자 가이드 및 레퍼런스 문서 접근
- **스튜어드** — 도메인 소유권 배정 현황
- **팀** — 팀 멤버 상태

SvelteKit + adapter-static으로 구축되며, 다크모드와 모바일을 지원합니다. 각 프로젝트의 GitHub Pages에서 배포할 수 있습니다.

## 설정

### team.yaml

관리자가 설정하는 팀 멤버-계정 매핑:

```yaml
admin: john-doe
members:
  john-doe:
    github: baekenough
    email: john@example.com
    role: admin
  jane-doe:
    github: jane-gh
    email: jane@example.com
    role: member
```

### STEWARDS.yaml

자동 생성되는 도메인 소유권. 8개 도메인 x 2역할 (primary + backup):

| 도메인 | 범위 |
|--------|------|
| Languages | lang-* 에이전트, 언어별 스킬 |
| Backend | be-* 에이전트, API 프레임워크 스킬 |
| Frontend | fe-* 에이전트, UI/UX 스킬 |
| Data Engineering | de-* 에이전트, 파이프라인 스킬 |
| DB/Infra | db-*, infra-* 에이전트 |
| Tooling | tool-*, mgr-* 에이전트 |
| QA/Architecture | qa-*, arch-* 에이전트 |
| Governance | 규칙, CLAUDE.md, 팀 설정 |

init 시 자동 생성 예시:

```yaml
domains:
  languages:
    primary: john-doe    # .ts 커밋의 85%
    backup: jane-doe     # .ts 커밋의 12%
    active: true
  de:
    active: false        # 파이프라인 파일 미감지
```

## 세션 공유

외부 인프라 없이 Claude 세션 지식을 공유합니다:

```bash
# 선택적 심볼릭 링크 설정 (개발자별)
bunx omcustom-team link
```

### 공유 범위

| 콘텐츠 | 공유? | 이유 |
|--------|-------|------|
| `agent-memory/` (project scope) | Yes | 팀 공통 학습 |
| `MEMORY.md` | Yes | 세션 요약 |
| Session logs (Parquet) | Yes | 지식 파이프라인 |
| 아키텍처 결정 | Yes | 팀 정렬 |
| `settings.local.json` | No | 개인 설정 |
| API 키 / 인증 정보 | No | 보안 |

### 디렉토리 구조

```
.claude/team/
├── shared-memory/          # 팀 간 공유 학습
├── session-logs/           # 내보낸 세션 요약
├── employees/              # 멤버별 프로필
│   ├── john-doe/
│   │   ├── MEMORY.md
│   │   └── preferences.yaml
│   └── jane-doe/
│       └── ...
├── team.yaml               # 멤버 매핑
├── STEWARDS.yaml           # 도메인 소유권
└── TODO.md                 # 공유 팀 작업
```

## Guardian CI

`main` 또는 `develop` 대상 PR마다 하네스 무결성을 검증합니다:

- **에이전트 frontmatter** — YAML 헤더 존재 및 유효성
- **스킬 참조** — 참조된 모든 스킬 존재 확인
- **네이밍 규칙** — kebab-case 강제
- **STEWARDS.yaml / team.yaml** — 존재 시 자동 유효성 검사
- **실행 시간** — ~860ms (단일 job)

`.claude/` 파일 변경 시에만 트리거됩니다.

## 품질 메트릭

| 메트릭 | 목표 | 설명 |
|--------|------|------|
| **RAR** | 98% | Rule Adherence Rate = 위반 없는 작업 / 전체 작업 |
| 실행 오버헤드 | < 5% | 컴플라이언스의 시간 비용 |
| 토큰 낭비 | < 2% | 컴플라이언스의 토큰 비용 |

개발자별 before/after 페어 비교로 측정합니다.

## 팀 TODO

팀 기능이 강화된 `sys-naggy` 에이전트:

- `.claude/team/TODO.md` — Git 추적, 팀 전체 공유
- `team:` 접두사로 팀 작업과 개인 작업 구분
- 미완료 세션 작업에서 자동 TODO 생성
- 스튜어드 기반 작업 라우팅

## CI 워크플로

| 워크플로 | 트리거 | 설명 |
|----------|--------|------|
| CI | PR | Lint (Biome) + Typecheck + Test (Bun, 99% 커버리지 게이트) + Build |
| Guardian | PR (.claude/** 변경) | 하네스 무결성 + STEWARDS.yaml/team.yaml 유효성 검사 |
| Claude Native Check | 주간 / 수동 | 공식 문서 컴플라이언스 |
| Security Audit | 주간 / PR | 의존성 취약점 스캔 |
| Release | 태그 푸시 (v*) | 빌드 -> npm 배포 -> GitHub Release |

## 개발

```bash
bun install          # 의존성 설치
bun test             # 테스트 실행
bun run build        # 프로덕션 빌드
```

## 로드맵

| 단계 | 기능 | 상태 |
|------|------|------|
| V1 | Guardian CI, 세션 로깅, 스튜어드, 팀 TODO | **출시 (v0.2.0)** |
| V1.5 | 정적 HTML 리포트 (`omcustom-team report`) | **출시 (v0.5.0)** |
| V2 | 대시보드 고도화 — 온톨로지 그래프, 세션 타임라인, RAR 메트릭 | **출시 (v0.5.0)** |
| V3 | 적응형 확장 -- 자동 감지 및 추천 | **출시 (v0.5.0)** |

## 관련 프로젝트

- [oh-my-customcode](https://github.com/baekenough/oh-my-customcode) — 코어 에이전트 하네스 (개인용)
- [CHANGELOG](./CHANGELOG.md) — 릴리스 히스토리
- [Issue #203](https://github.com/baekenough/oh-my-customcode/issues/203) — 아키텍처 설계
- [Issue #205](https://github.com/baekenough/oh-my-customcode/issues/205) — 웹 대시보드 설계

## 라이선스

[MIT](LICENSE)

---

<p align="center">
  <strong>팀의 에이전트 스택. 공유된 지식. 함께하는 거버넌스.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>
