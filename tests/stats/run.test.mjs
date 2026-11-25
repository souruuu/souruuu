import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../../scripts/stats/run.mjs', import.meta.url))
const marker = 'synthetic-private-repo'
const token = 'github_pat_synthetic_fixture_only'
const id = 1357913579
const inventory = JSON.stringify([id])
const repo = {
  id, name: marker, owner: { login: 'souruuu' }, private: true, visibility: 'private', fork: false,
}

function runWithFakeGitHub(mode, output, { failure = false, privateLanguages = { Python: 15 },
  publicLanguages } = {}) {
  const publicRepo = { ...repo, id: 42, name: 'synthetic-public-repo', private: false, visibility: 'public' }
  const responses = {
    '/user': { login: 'souruuu', id: 42, public_repos: publicLanguages ? 1 : 0 },
    '/user/repos': [repo],
    '/users/souruuu/repos': publicLanguages ? [publicRepo] : [],
    [`/repositories/${id}`]: repo,
    [`/repositories/${id}/languages`]: privateLanguages,
    '/repositories/42': publicRepo,
    '/repositories/42/languages': publicLanguages,
  }
  const preload = `
    const responses = ${JSON.stringify(responses)}
    globalThis.fetch = async (url, options) => {
      if ('STATS_READ_TOKEN' in process.env || 'STATS_PRIVATE_REPOSITORY_IDS' in process.env) {
        throw new Error('Credentials remained in the child environment.')
      }
      if (options.headers.Authorization !== ${JSON.stringify(`Bearer ${token}`)}) {
        throw new Error('Fixture credentials were unavailable to the HTTP client.')
      }
      if (!Object.hasOwn(responses, url.pathname)) throw new Error('Unexpected fixture route.')
      if (${failure} && url.pathname.endsWith('/languages')) {
        return new Response(${JSON.stringify(`${marker} https://example.invalid/${marker} ${id} ${token}`)}, {status: 403})
      }
      return new Response(JSON.stringify(responses[url.pathname]))
    }
  `
  return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, cli, mode, output], {
    env: { ...process.env, STATS_READ_TOKEN: token, STATS_PRIVATE_REPOSITORY_IDS: inventory },
    encoding: 'utf8',
  })
}

test('manual verify is read-only and reports only fixed diagnostics on both success and failure', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stats-verify-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const output = join(root, 'stats-output')
  const verified = runWithFakeGitHub('verify', output)
  assert.equal(verified.status, 0)
  assert.equal(verified.stdout.trim(), 'Approved private language coverage and SVG validation passed.')
  assert.equal(verified.stderr, '')
  assert.equal(existsSync(output), false)

  const failed = runWithFakeGitHub('generate', output, { failure: true })
  assert.equal(failed.status, 1)
  assert.equal(failed.stdout, '')
  assert.equal(failed.stderr.trim(), 'GitHub API HTTP 403.')
  assert.equal(existsSync(output), false)
})

test('private coverage accepts document bytes independently of display eligibility', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stats-filter-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const output = join(root, 'stats-output')
  const privateLanguages = { 'Rich Text Format': 90_000 }

  const verified = runWithFakeGitHub('verify', output, { privateLanguages, publicLanguages: { HTML: 15 } })
  assert.equal(verified.status, 0)
  assert.equal(verified.stdout.trim(), 'Approved private language coverage and SVG validation passed.')

  const failed = runWithFakeGitHub('generate', output, { privateLanguages })
  assert.equal(failed.status, 1)
  assert.equal(failed.stderr.trim(), 'Language SVG generation or validation failed.')
  assert.equal(existsSync(output), false)
})
