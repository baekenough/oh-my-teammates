#!/usr/bin/env bun

/**
 * GitHub Issue Analysis Script for oh-my-teammates
 *
 * Analyzes GitHub issues using Claude API and posts analysis comments.
 *
 * Environment Variables:
 * - ANTHROPIC_API_KEY: Required
 * - GITHUB_TOKEN: Required
 * - GITHUB_REPOSITORY: Required (format: owner/repo)
 * - ISSUE_NUMBER: Optional if passed as CLI arg
 * - ISSUE_TITLE, ISSUE_BODY, ISSUE_AUTHOR, ISSUE_LABELS: Optional overrides
 */

// ============================================================================
// Interfaces
// ============================================================================

interface IssueData {
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
}

interface AnalysisResult {
  summary: string;
  type: string;
  priority: string;
  priority_reason: string;
  technical_points: string[];
  challenges: string[];
  suggested_approach: string[];
  related_areas: string[];
  questions: string[];
  duplicate_risk: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  githubRepo: process.env.GITHUB_REPOSITORY,
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
  maxTokens: 8000,
};

const PROJECT_CONTEXT =
  'oh-my-teammates is a TypeScript/Bun npm package that is a team collaboration addon for oh-my-customcode. ' +
  'It manages organizational harnesses (agent configurations) for Claude Code AI agent teams. ' +
  'Key features: harness management (add/remove/list), team configuration, GitHub Actions workflows. ' +
  'Tech: TypeScript, Bun runtime, YAML parsing, GitHub Actions, npm. ' +
  'Peer dependency: oh-my-customcode >= 0.23.0.';

// ============================================================================
// Helper Functions
// ============================================================================

function validateEnvironment(): void {
  const missing: string[] = [];

  if (!CONFIG.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (!CONFIG.githubToken) missing.push('GITHUB_TOKEN');
  if (!CONFIG.githubRepo) missing.push('GITHUB_REPOSITORY');

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function getIssueNumber(): number {
  const issueNum = process.argv[2] || process.env.ISSUE_NUMBER;

  if (!issueNum) {
    console.error('Issue number not provided. Pass as CLI arg or set ISSUE_NUMBER env var.');
    process.exit(1);
  }

  const num = Number.parseInt(issueNum, 10);
  if (Number.isNaN(num) || num <= 0) {
    console.error(`Invalid issue number: ${issueNum}`);
    process.exit(1);
  }

  return num;
}

async function fetchIssueFromGitHub(issueNumber: number): Promise<IssueData> {
  console.log(`Fetching issue #${issueNumber} from GitHub...`);

  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues/${issueNumber}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CONFIG.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'oh-my-teammates-issue-analyzer',
    },
  });

  if (!response.ok) {
    console.error(`GitHub API error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const issue = await response.json();

  return {
    number: issue.number,
    title: issue.title || '',
    body: issue.body || '',
    author: issue.user?.login || 'unknown',
    labels: issue.labels?.map((l: { name: string }) => l.name) || [],
  };
}

async function fetchOpenIssueTitles(): Promise<string[]> {
  console.log('Fetching open issues for duplicate detection...');

  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues?state=open&per_page=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CONFIG.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'oh-my-teammates-issue-analyzer',
    },
  });

  if (!response.ok) {
    console.warn(`Warning: Failed to fetch open issues for duplicate check: ${response.status}`);
    return [];
  }

  const issues = await response.json();
  return issues.map((i: { title: string }) => i.title || '');
}

function getIssueData(issueNumber: number): Promise<IssueData> {
  if (process.env.ISSUE_TITLE) {
    console.log('Using issue data from environment variables');
    return Promise.resolve({
      number: issueNumber,
      title: process.env.ISSUE_TITLE,
      body: process.env.ISSUE_BODY || '',
      author: process.env.ISSUE_AUTHOR || 'unknown',
      labels: process.env.ISSUE_LABELS
        ? process.env.ISSUE_LABELS.split(',').map((l) => l.trim())
        : [],
    });
  }

  return fetchIssueFromGitHub(issueNumber);
}

function buildPrompt(issue: IssueData, openIssueTitles: string[]): string {
  const otherTitles = openIssueTitles.filter((t) => t !== issue.title);
  const titlesSection =
    otherTitles.length > 0
      ? otherTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : 'No other open issues';

  return `GitHub 이슈를 분석하고 한국어로 인사이트를 제공하세요.
기술 용어, 파일명, 코드 참조는 영어 그대로 유지하세요.

## Project Context
${PROJECT_CONTEXT}

## Issue Details
**Number**: #${issue.number}
**Title**: ${issue.title}
**Author**: @${issue.author}
**Labels**: ${issue.labels.length > 0 ? issue.labels.join(', ') : 'none'}
**Body**:
${issue.body}

## Existing Open Issues (for duplicate detection)
${titlesSection}

## 분석 항목

다음 구조로 한국어 분석을 제공하세요:

1. **요약**: 이 이슈가 무엇에 대한 것인지 간략히
2. **유형**: upstream-sync, bug, feature, chore, documentation, question, enhancement, refactor, other 중 하나
3. **우선순위**: High/Medium/Low + 명확한 이유
4. **기술적 고려사항**: 고려할 핵심 기술 측면
5. **예상 난관**: 잠재적 어려움이나 차단 요소
6. **제안 접근법**: 단계별 구현 제안
7. **연관 영역**: 영향받을 수 있는 코드베이스 영역
8. **질문**: 이슈 작성자에게 명확화 질문 (필요 시)
9. **중복 위험**: 기존 이슈와의 유사성 평가 (none/low/medium/high + 이유)

JSON 형식으로 응답:
{
  "summary": "...",
  "type": "...",
  "priority": "...",
  "priority_reason": "...",
  "technical_points": ["...", "..."],
  "challenges": ["...", "..."],
  "suggested_approach": ["...", "..."],
  "related_areas": ["...", "..."],
  "questions": ["...", "..."],
  "duplicate_risk": "..."
}

중요:
- 실행 가능하고 구체적인 인사이트 제공
- 간결하지만 포괄적으로
- 정보가 부족하면 질문에 기재
- 기술 용어(API, CLI, TypeScript 등), 파일명(*.ts, CLAUDE.md 등), 코드(함수명, 변수명)는 영어 유지`;
}

async function analyzeIssueWithClaude(
  issue: IssueData,
  openIssueTitles: string[],
): Promise<AnalysisResult> {
  console.log('Analyzing issue with Claude API...');

  const prompt = buildPrompt(issue, openIssueTitles);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.anthropicApiKey as string,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CONFIG.model,
      max_tokens: CONFIG.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Claude API error: ${response.status} - ${errorText}`);
    process.exit(1);
  }

  const data = await response.json();

  const textContent = data.content
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
    .join('\n');

  let jsonStr = textContent.trim();

  const jsonMatch = jsonStr.match(/```json?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\w*\s*\n/, '').replace(/\n```\s*$/, '');
  }

  const analysis: AnalysisResult = JSON.parse(jsonStr);

  if (!analysis.summary || !analysis.type) {
    console.error('Invalid analysis structure: missing required fields');
    process.exit(1);
  }

  const arrayFields = [
    'technical_points',
    'challenges',
    'suggested_approach',
    'related_areas',
    'questions',
  ] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(analysis[field])) {
      analysis[field] = [];
    }
  }

  console.log('Analysis completed successfully');
  return analysis;
}

function formatComment(analysis: AnalysisResult): string {
  let comment = '## AI Issue Analysis\n\n';
  comment += `### 요약\n${analysis.summary}\n\n`;
  comment += '### 분류\n';
  comment += `- **유형**: \`${analysis.type}\`\n`;
  comment += `- **우선순위**: ${analysis.priority}\n`;
  comment += `- **이유**: ${analysis.priority_reason}\n`;

  if (analysis.duplicate_risk && analysis.duplicate_risk !== 'none') {
    comment += `- **중복 위험**: ${analysis.duplicate_risk}\n`;
  }
  comment += '\n';

  if (analysis.technical_points.length > 0) {
    comment += '### 기술적 고려사항\n';
    for (const point of analysis.technical_points) {
      comment += `- ${point}\n`;
    }
    comment += '\n';
  }

  if (analysis.challenges.length > 0) {
    comment += '### 예상 난관\n';
    for (const challenge of analysis.challenges) {
      comment += `- ${challenge}\n`;
    }
    comment += '\n';
  }

  if (analysis.suggested_approach.length > 0) {
    comment += '### 제안 접근법\n';
    analysis.suggested_approach.forEach((step, idx) => {
      comment += `${idx + 1}. ${step}\n`;
    });
    comment += '\n';
  }

  if (analysis.related_areas.length > 0) {
    comment += '### 연관 영역\n';
    for (const area of analysis.related_areas) {
      comment += `- ${area}\n`;
    }
    comment += '\n';
  }

  if (analysis.questions.length > 0) {
    comment += '### 작성자에게 질문\n';
    for (const question of analysis.questions) {
      comment += `- ${question}\n`;
    }
    comment += '\n';
  }

  comment += '---\n*이 분석은 이슈 트리아지를 돕기 위해 Claude AI가 생성했습니다.*\n';

  return comment;
}

async function postComment(issueNumber: number, body: string): Promise<void> {
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/issues/${issueNumber}/comments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CONFIG.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'oh-my-teammates-issue-analyzer',
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to post comment: ${response.status} - ${errorText}`);
    throw new Error(`GitHub API error: ${response.status}`);
  }

  console.log('Comment posted successfully');
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('Starting GitHub Issue Analysis\n');

  validateEnvironment();

  const issueNumber = getIssueNumber();
  console.log(`Target issue: #${issueNumber}\n`);

  const [issue, openIssueTitles] = await Promise.all([
    getIssueData(issueNumber),
    fetchOpenIssueTitles(),
  ]);

  console.log(`Issue: "${issue.title}"`);
  console.log(`Author: @${issue.author}`);
  console.log(`Labels: ${issue.labels.join(', ') || 'none'}\n`);

  const analysis = await analyzeIssueWithClaude(issue, openIssueTitles);

  const comment = formatComment(analysis);

  console.log('\nPosting comment to GitHub...');
  await postComment(issueNumber, comment);

  console.log('\nIssue analysis completed successfully!');
}

main().catch((error) => {
  console.error('\nUnexpected error:', error);
  process.exit(1);
});
