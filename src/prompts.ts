import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';

export interface InitAnswers {
  projectName: string;
  adminUsername: string;
}

/**
 * Prompt user for project initialization details.
 * Accepts an optional readline interface for testing.
 */
export async function promptInit(
  defaultProjectName: string,
  rl?: ReadlineInterface,
): Promise<InitAnswers> {
  const ownRl = !rl;
  if (!rl) {
    rl = createInterface({ input, output });
  }

  try {
    const projectName =
      (await rl.question(`Project name (${defaultProjectName}): `)) || defaultProjectName;
    const adminUsername = await rl.question('Admin username: ');

    return { projectName, adminUsername: adminUsername.trim() };
  } finally {
    if (ownRl) {
      rl.close();
    }
  }
}
