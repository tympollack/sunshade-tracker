#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('update', process.argv.slice(2));
