#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('list', process.argv.slice(2));
