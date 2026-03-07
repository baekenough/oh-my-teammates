import { describe, expect, it, mock } from 'bun:test';
import type { Interface as ReadlineInterface } from 'node:readline/promises';
import { promptInit } from '../prompts';

function createMockRl(answers: string[]): ReadlineInterface {
  let callIndex = 0;
  return {
    question: async (_prompt: string) => answers[callIndex++] ?? '',
    close: () => {},
  } as unknown as ReadlineInterface;
}

describe('promptInit', () => {
  it('returns user-provided project name and admin', async () => {
    const rl = createMockRl(['my-project', 'admin-user']);
    const result = await promptInit('default-name', rl);
    expect(result.projectName).toBe('my-project');
    expect(result.adminUsername).toBe('admin-user');
  });

  it('uses default project name when user provides empty input', async () => {
    const rl = createMockRl(['', 'some-admin']);
    const result = await promptInit('fallback-name', rl);
    expect(result.projectName).toBe('fallback-name');
    expect(result.adminUsername).toBe('some-admin');
  });

  it('trims whitespace from admin username', async () => {
    const rl = createMockRl(['proj', '  spaced-user  ']);
    const result = await promptInit('default', rl);
    expect(result.adminUsername).toBe('spaced-user');
  });

  it('returns empty admin username when user provides empty input', async () => {
    const rl = createMockRl(['proj', '']);
    const result = await promptInit('default', rl);
    expect(result.adminUsername).toBe('');
  });

  it('exports promptInit function', () => {
    expect(typeof promptInit).toBe('function');
  });

  it('closes the readline interface it creates internally', async () => {
    let closeCalled = false;
    const mockRl = {
      question: async (_prompt: string) => 'answer',
      close: () => {
        closeCalled = true;
      },
    } as unknown as ReadlineInterface;

    mock.module('node:readline/promises', () => ({
      createInterface: () => mockRl,
    }));

    // Re-import to pick up the module mock
    const { promptInit: promptInitFresh } = await import('../prompts');
    await promptInitFresh('default');
    expect(closeCalled).toBe(true);

    mock.restore();
  });
});
