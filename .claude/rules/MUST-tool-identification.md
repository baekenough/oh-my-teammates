# [MUST] Tool Usage Identification Rules

> **Priority**: MUST - ENFORCED | **ID**: R008

## Core Rule

Every tool call MUST be prefixed with agent and model identification:

```
[agent-name][model] → Tool: <tool-name>
[agent-name][model] → Target: <file/path/url>
```

For parallel calls: list ALL identifications BEFORE the tool calls.

### Common Violations to Avoid

```
❌ WRONG: Calling tools without identification
   "먼저 JD 내용을 확인하겠습니다."
   <tool_call>WebFetch(...)</tool_call>

❌ WRONG: Missing model in identification
   [secretary] → Tool: WebFetch
   [secretary] → Fetching: https://example.com/jd.md

✓ CORRECT: Always identify with agent AND model
   "먼저 JD 내용을 확인하겠습니다."
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: https://example.com/jd.md
   <tool_call>WebFetch(...)</tool_call>

❌ WRONG: Parallel calls without listing all identifications
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>

✓ CORRECT: List all identifications with models, then call
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: url1
   [secretary][opus] → Tool: WebFetch
   [secretary][opus] → Fetching: url2
   [secretary][opus] → Tool: Bash
   [secretary][opus] → Running: cmd
   <tool_call>WebFetch(url1)</tool_call>
   <tool_call>WebFetch(url2)</tool_call>
   <tool_call>Bash(cmd)</tool_call>

❌ WRONG: MCP tool call without identification
   mcp__plugin_claude-mem_mcp-search__save_memory(...)
   mcp__plugin_episodic-memory_episodic-memory__search(...)

✓ CORRECT: MCP tool call with agent and model identification
   [sys-memory-keeper][sonnet] → Tool: mcp__plugin_claude-mem_mcp-search__save_memory
   [sys-memory-keeper][sonnet] → Saving: session summary
```

## Models

| Model | Use |
|-------|-----|
| `opus` | Complex reasoning, architecture |
| `sonnet` | General tasks, code generation (default) |
| `haiku` | Fast simple tasks, file search |

## Tool Categories

| Category | Tools | Verb |
|----------|-------|------|
| File Read | Read, Glob, Grep | Reading / Searching |
| File Write | Write, Edit | Writing / Editing |
| Network | WebFetch | Fetching |
| Execution | Bash, Agent | Running / Spawning |
| MCP | mcp__* | Calling / Saving / Searching |

## Agent Tool Format

```
Agent(subagent_type):model → description
```

`subagent_type` MUST match actual Agent tool parameter. Custom names not allowed.

> **Note**: Claude Code v2.1.63+ renamed the Task tool to Agent tool. Both names refer to the same tool; `Agent(...)` is the current canonical form.

## MCP Tool Format

```
[agent-name][model] → Tool: mcp__{server}__{function}
[agent-name][model] → Action: <brief description>
```

MCP tools follow the same identification rules as all other tools. The `mcp__` prefix does NOT exempt a tool call from identification requirements.

## Example

```
[mgr-creator][sonnet] → Write: .claude/agents/new-agent.md
[secretary][opus] → Spawning:
  [1] Agent(lang-golang-expert):sonnet → Go code review
  [2] Agent(lang-python-expert):sonnet → Python code review
```
