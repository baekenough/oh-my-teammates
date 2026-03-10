#!/usr/bin/env bun
/**
 * Release Notes Generator Script for oh-my-teammates
 * - Uses Claude API to generate release notes from git commits and CHANGELOG.md
 * - Analyzes changes between tags/commits
 * - Produces structured markdown release notes
 * - Falls back to CHANGELOG.md if API key is unavailable
 */

import { existsSync, readFileSync } from 'node:fs';
import { $ } from 'bun';

const GIT_LOG_FORMAT = '--pretty=format:%h %s';

async function getCommitsSinceTag(tag?: string): Promise<string> {
  if (tag) {
    try {
      const result = await $`git log ${{ raw: `${tag}..HEAD` }} ${GIT_LOG_FORMAT}`.text();
      if (result.trim()) return result;
    } catch {
      // Tag not found, fall through to auto-detection
    }
  }

  try {
    const tagsResult = await $`git tag --sort=-version:refname`.text();
    const tags = tagsResult
      .trim()
      .split('\n')
      .filter((t) => t);

    if (tags.length >= 2) {
      const prevTag = tags[1];
      return await $`git log ${{ raw: `${prevTag}..HEAD` }} ${GIT_LOG_FORMAT}`.text();
    }
    if (tags.length === 1) {
      return await $`git log ${GIT_LOG_FORMAT}`.text();
    }
    return await $`git log -50 ${GIT_LOG_FORMAT}`.text();
  } catch {
    return await $`git log -50 ${GIT_LOG_FORMAT}`.text();
  }
}

async function getChangedFiles(tag?: string): Promise<string> {
  if (tag) {
    try {
      const result = await $`git diff --name-status ${{ raw: `${tag}..HEAD` }}`.text();
      if (result.trim()) return result;
    } catch {
      // Tag not found, fall through to auto-detection
    }
  }

  try {
    const tagsResult = await $`git tag --sort=-version:refname`.text();
    const tags = tagsResult
      .trim()
      .split('\n')
      .filter((t) => t);

    if (tags.length >= 2) {
      const prevTag = tags[1];
      return await $`git diff --name-status ${{ raw: `${prevTag}..HEAD` }}`.text();
    }
    return await $`git diff --name-status HEAD~50..HEAD`.text();
  } catch {
    return await $`git diff --name-status HEAD~50..HEAD`.text();
  }
}

function extractChangelogSection(version: string): string {
  if (!existsSync('CHANGELOG.md')) return '';

  const content = readFileSync('CHANGELOG.md', 'utf-8');
  const lines = content.split('\n');
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.match(new RegExp(`^## \\[${version}\\]`))) {
      inSection = true;
      continue;
    }
    if (inSection && line.match(/^## \[/)) {
      break;
    }
    if (inSection) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

function buildFallbackNotes(version: string, changelogSection: string, commits: string): string {
  const header = `# Release v${version}\n`;
  const installSection = `
## Installation

\`\`\`bash
bun add -d @oh-my-customcode/oh-my-teammates
\`\`\`
`;

  if (changelogSection) {
    return `${header}\n${changelogSection}\n${installSection}`;
  }

  const commitList = commits
    .trim()
    .split('\n')
    .slice(0, 20)
    .map((c) => `- ${c}`)
    .join('\n');

  return `${header}
## Changes

${commitList || '_No commits found_'}
${installSection}`;
}

function buildPrompt(
  version: string,
  commits: string,
  changedFiles: string,
  changelogSection: string,
): string {
  return `당신은 oh-my-teammates 프로젝트의 릴리스 노트 작성 전문가입니다.

## 프로젝트 정보

oh-my-teammates는 oh-my-customcode의 팀 협업 애드온 npm 패키지입니다.
- 패키지명: @oh-my-customcode/oh-my-teammates
- 런타임: Bun
- 설치: \`bun add -d @oh-my-customcode/oh-my-teammates\`
- 주요 기능: AI 에이전트 팀 협업, 워크플로우 자동화, CI/CD 파이프라인

## 릴리스 버전

${version}

## CHANGELOG.md 섹션

\`\`\`
${changelogSection || '_CHANGELOG 없음_'}
\`\`\`

## 커밋 히스토리

\`\`\`
${commits.substring(0, 5000)}
\`\`\`

## 변경된 파일

\`\`\`
${changedFiles.substring(0, 3000)}
\`\`\`

## 작성 지침

1. **Conventional Commits 기반 분류**:
   - 🚀 Features (feat:)
   - 🐛 Bug Fixes (fix:)
   - 📚 Documentation (docs:)
   - ♻️ Refactoring (refactor:)
   - 🧪 Tests (test:)
   - 🔧 Chores (chore:)

2. **사용자 친화적 설명**: 기술적 변경을 사용자 관점에서 설명

3. **Breaking Changes**: 있다면 별도 섹션으로 강조

4. **마이그레이션 가이드**: 필요 시 포함

## 응답 형식 (Markdown)

# Release v${version}

## Highlights

(이번 릴리스의 주요 특징 1-3개)

## 🚀 Features

- (새로운 기능들)

## 🐛 Bug Fixes

- (버그 수정들)

## 📚 Documentation

- (문서 변경사항)

## ♻️ Other Changes

- (기타 변경사항)

## ⚠️ Breaking Changes

(해당사항 없으면 섹션 생략)

## Installation

\`\`\`bash
bun add -d @oh-my-customcode/oh-my-teammates
\`\`\`

## 📋 Full Changelog

(주요 커밋 요약)

---
_이 릴리스 노트는 Claude API에 의해 자동 생성되었습니다._
`;
}

async function generateReleaseNotes(version?: string): Promise<string> {
  const releaseVersion = version || process.env.RELEASE_VERSION || 'X.X.X';
  const previousTag = process.env.PREVIOUS_TAG;

  const [commits, changedFiles] = await Promise.all([
    getCommitsSinceTag(previousTag),
    getChangedFiles(previousTag),
  ]);

  const changelogSection = extractChangelogSection(releaseVersion);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('⚠️ ANTHROPIC_API_KEY not set — falling back to changelog-based notes');
    return buildFallbackNotes(releaseVersion, changelogSection, commits);
  }

  if (!commits.trim()) {
    return buildFallbackNotes(releaseVersion, changelogSection, commits);
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: buildPrompt(releaseVersion, commits, changedFiles, changelogSection),
      },
    ],
  });

  const resultParts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      resultParts.push(block.text);
    }
  }

  return resultParts.join('\n');
}

// Main execution
if (import.meta.main) {
  const version = process.argv[2];

  try {
    const result = await generateReleaseNotes(version);
    console.log(result);
  } catch (error) {
    const Anthropic = await import('@anthropic-ai/sdk');
    if (error instanceof Anthropic.default.APIError) {
      console.error(`⚠️ Claude API 호출 중 오류가 발생했습니다: ${error.message}`);
      process.exit(1);
    } else {
      console.error(`⚠️ 예기치 않은 오류: ${error}`);
      process.exit(1);
    }
  }
}
