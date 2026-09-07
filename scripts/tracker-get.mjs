#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('get', process.argv.slice(2));
