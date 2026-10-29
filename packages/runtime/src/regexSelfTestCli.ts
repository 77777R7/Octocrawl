#!/usr/bin/env node
/**
 * The regular-expression checks' self-test (regexSelfTest.ts) as a command: run in a hosted image right after it is
 * built (cloudbuild.hosted-api.yaml, cloudbuild.hosted-chrome.yaml), so an image whose Node does not bound them as
 * promised is never pushed. `--corpus <file>` (`-` for standard input, as the build passes the repository's task files)
 * also judges every regular-expression check in that JSON as verify() and as RegExp do, on synthetic Markdown: the saved
 * pages stay under .w2l/, which the build does not have. Exit code 0 when everything holds, 1 with the failures otherwise.
 */
import { readFileSync } from 'node:fs'
import { regexBoundSelfTest, regexChecksIn, regexCorpusSelfTest } from './regexSelfTest.js'

const corpus = process.argv.flatMap((arg, index, args) => args[index - 1] === '--corpus' ? regexChecksIn(JSON.parse(readFileSync(arg === '-' ? 0 : arg, 'utf8'))) : [])
const bound = regexBoundSelfTest()
const judged = regexCorpusSelfTest(corpus)
const failures = [...bound.failures, ...judged.failures]
console.log(JSON.stringify({ event: 'regex_self_test', ok: failures.length === 0, failures, corpusChecks: corpus.length, node: process.version, v8: process.versions.v8 }))
process.exit(failures.length === 0 ? 0 : 1)
