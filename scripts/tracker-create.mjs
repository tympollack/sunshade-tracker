#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('create', process.argv.slice(2));
