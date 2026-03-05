#!/usr/bin/env bun
import { runCli } from './src/cli';

if (import.meta.main) {
  runCli(process.argv.slice(2)).catch(console.error);
}
