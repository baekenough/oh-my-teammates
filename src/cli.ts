import { initTeam } from './init';
import { TeamTodo } from './team-todo';

export async function runCli(args: string[]): Promise<void> {
  const command = args[0];
  const subcommand = args[1];

  switch (command) {
    case 'init': {
      const skipPrompts = args.includes('--yes') || args.includes('-y');

      const { detectProjectName } = await import('./init');
      const defaultName = detectProjectName('.');

      let projectName = defaultName;
      let adminUsername = '';

      if (!skipPrompts) {
        try {
          const { promptInit } = await import('./prompts');
          const answers = await promptInit(defaultName);
          projectName = answers.projectName;
          adminUsername = answers.adminUsername;
        } catch {
          // If stdin is not interactive (piped), fall back to defaults
        }
      }

      const result = await initTeam();

      // Update team.yaml with admin username if provided
      if (adminUsername) {
        const { readFileSync, writeFileSync } = await import('node:fs');
        const teamContent = readFileSync(result.teamConfigPath, 'utf-8');
        const updated = teamContent.replace(/^admin: ~.*$/m, `admin: ${adminUsername}`);
        writeFileSync(result.teamConfigPath, updated, 'utf-8');
      }

      console.log('Team initialized!');
      console.log(`Project: ${projectName}`);
      console.log(`Detected domains: ${result.scanResult.detectedDomains.join(', ')}`);
      console.log(`Team config: ${result.teamConfigPath}`);
      console.log(`Stewards: ${result.stewardsPath}`);

      if (result.claudeMdResult.created) {
        console.log(`CLAUDE.md: ${result.claudeMdPath} (created)`);
      } else if (result.claudeMdResult.appended) {
        console.log(`CLAUDE.md: ${result.claudeMdPath} (team section appended)`);
      }

      break;
    }
    case 'todo': {
      const todo = new TeamTodo();
      switch (subcommand) {
        case 'list': {
          if (!todo.exists()) {
            console.log("No TODO.md found. Run 'omcustom-team init' first.");
            process.exit(1);
          }
          const items = todo.list();
          if (items.length === 0) {
            console.log('No TODO items.');
          } else {
            for (const item of items) {
              const status = item.completed ? '✓' : '○';
              const assignee = item.assignee ? ` — @${item.assignee}` : '';
              console.log(`${status} [${item.priority}] ${item.description}${assignee}`);
            }
          }
          break;
        }
        case 'add': {
          const desc = args.slice(2).join(' ');
          if (!desc) {
            console.error('Usage: omcustom-team todo add <description>');
            process.exit(1);
          }
          if (!todo.exists()) {
            TeamTodo.createTemplate('.claude/team/TODO.md');
          } else {
            todo.load();
          }
          todo.add({
            scope: 'team',
            priority: 'P1',
            description: desc,
            assignee: null,
            domain: null,
          });
          todo.save();
          console.log(`Added: ${desc}`);
          break;
        }
        default: {
          console.error('Usage: omcustom-team todo [list|add]');
          process.exit(1);
        }
      }
      break;
    }
    case 'report': {
      const { ReportGenerator } = await import('./report');
      const generator = new ReportGenerator();

      // Parse options
      const outputIdx =
        args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
      const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

      const daysIdx = args.indexOf('--days') !== -1 ? args.indexOf('--days') : args.indexOf('-d');
      const days = daysIdx !== -1 ? Number.parseInt(args[daysIdx + 1] ?? '', 10) : undefined;

      const open = args.includes('--open');

      const outputPath = await generator.generate({
        output,
        days: days && !Number.isNaN(days) ? days : undefined,
        open,
      });
      console.log(`Report generated: ${outputPath}`);
      break;
    }
    default: {
      console.log('Usage: omcustom-team [init|todo|report]');
      console.log('');
      console.log('Commands:');
      console.log('  init [--yes|-y]    Initialize team configuration');
      console.log('  todo [list|add]    Manage team tasks');
      console.log('  report [options]       Generate team report');
      console.log('');
      console.log('Report options:');
      console.log('    --output, -o <path>  Output file path');
      console.log('    --days, -d <n>       Filter to last N days');
      console.log('    --open               Open report in browser');
      process.exit(1);
    }
  }
}
