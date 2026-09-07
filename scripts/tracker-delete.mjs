#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('delete', process.argv.slice(2));
