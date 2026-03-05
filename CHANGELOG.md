# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-05

### Added
- **Team Configuration** (`team-config.ts`): Parse and manage `team.yaml` with CRUD operations, admin roles, and schema validation
- **Session Logger** (`session-logger.ts`): `bun:sqlite`-based session tracking with event logging
- **Domain Stewards** (`stewards.ts`): `STEWARDS.yaml` management with 8-domain model and CODEOWNERS generation
- **Project Init** (`init.ts`): Project scanning, dependency analysis, and team configuration scaffolding
- **Team TODO** (`team-todo.ts`): Team-level task management with priority levels, steward-based auto-assignment
- **CLI** (`cli.ts`): `omcustom-team init` and `omcustom-team todo` commands
- **SvelteKit Dashboard**: Agent/skill/rule/guide visualization with dark mode and mobile support
- **Quality Tooling**: Biome strict, TypeScript strict, Husky + lint-staged, 99% coverage enforcement
- **CI Enhancement**: Typecheck job, 99% coverage gate, build verification, dashboard auto-deploy

### Changed
- CI workflow now includes parallel lint/typecheck/test jobs with build gate
- Guardian CI now validates STEWARDS.yaml and team.yaml when present

## [0.1.0] - 2026-03-05

### Added
- Initial project setup with oh-my-customcode framework
- README (EN/KO) with project banner
- npm release pipeline
- CI workflows (ci, guardian, security-audit, claude-native-check)
