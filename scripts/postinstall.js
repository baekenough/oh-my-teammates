#!/usr/bin/env node

// Skip postinstall message in CI environments
if (process.env.CI) process.exit(0);

const message = `
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║   ✨ oh-my-teammates installed!                  ║
  ║                                                  ║
  ║   Get started:                                   ║
  ║     bunx omcustom-team init                      ║
  ║                                                  ║
  ║   Learn more:                                    ║
  ║     https://github.com/baekenough/oh-my-teammates║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
`;

console.log(message);
