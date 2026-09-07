#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('complete', process.argv.slice(2));
