#!/usr/bin/env node
import { run } from './tracker.mjs';
await run('ingest', process.argv.slice(2));
