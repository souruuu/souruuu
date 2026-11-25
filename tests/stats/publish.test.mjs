import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { renderLanguages } from '../../scripts/stats/cards.mjs'
import { publishLanguages } from '../../scripts/stats/publish.mjs'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'stats-publish-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'repo')
  const incoming = join(root, 'incoming')
  mkdirSync(cwd)
  mkdirSync(incoming)
  git(cwd, 'init', '-q', '-b', 'main')
  git(cwd, 'config', 'user.name', 'Fixture')
  git(cwd, 'config', 'user.email', 'fixture@example.invalid')
  git(cwd, 'config', 'commit.gpgSign', 'false')
  writeFileSync(join(cwd, 'README.md'), '# Fixture')
  git(cwd, 'add', 'README.md')
  git(cwd, 'commit', '-qm', 'test: add fixture')
  return { cwd, incoming }
}

test('preserves the last good SVG and commits only a validated change exactly once', (t) => {
  const { cwd, incoming } = workspace(t)
  const valid = renderLanguages(new Map([['Python', 200], ['Lua', 300]]))
  const source = join(incoming, 'languages.svg')
  writeFileSync(source, valid)
  assert.equal(publishLanguages(incoming, cwd), true)
  assert.equal(git(cwd, 'show', '--name-only', '--format=', 'HEAD'), 'assets/stats/languages.svg')
  assert.equal(git(cwd, 'log', '-1', '--format=%an'), 'github-actions[bot]')
  const head = git(cwd, 'rev-parse', 'HEAD')
  const destination = join(cwd, 'assets', 'stats', 'languages.svg')
  assert.equal(publishLanguages(incoming, cwd), false)

  const staged = join(cwd, 'unrelated.txt')
  writeFileSync(staged, 'fixture')
  git(cwd, 'add', 'unrelated.txt')
  const next = renderLanguages(new Map([['TypeScript', 200], ['Lua', 300]]))
  writeFileSync(source, next)
  assert.throws(() => publishLanguages(incoming, cwd), /already has staged changes/)
  git(cwd, 'reset', '-q', 'HEAD', '--', 'unrelated.txt')

  writeFileSync(join(incoming, 'unexpected.svg'), valid)
  assert.throws(() => publishLanguages(incoming, cwd), /Unexpected artifact contents/)
  rmSync(join(incoming, 'unexpected.svg'))
  writeFileSync(source, '<svg><script/></svg>')
  assert.throws(() => publishLanguages(incoming, cwd), /Invalid language SVG/)
  assert.equal(readFileSync(destination, 'utf8'), valid)
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), head)
  assert.equal(git(cwd, 'diff', '--cached', '--name-only'), '')
})

test('a stale Git reference update preserves the competing generated commit', (t) => {
  const { cwd, incoming } = workspace(t)
  const originalHead = git(cwd, 'rev-parse', 'HEAD')
  git(cwd, 'branch', 'waiting')
  const existing = renderLanguages(new Map([['Lua', 100]]))
  writeFileSync(join(incoming, 'languages.svg'), existing)
  assert.equal(publishLanguages(incoming, cwd), true)
  const competingHead = git(cwd, 'rev-parse', 'HEAD')
  git(cwd, 'switch', '-q', 'waiting')
  writeFileSync(join(incoming, 'languages.svg'), renderLanguages(new Map([['Python', 100]])))
  assert.equal(publishLanguages(incoming, cwd), true)
  assert.throws(() => execFileSync('git', ['update-ref', 'refs/heads/main', 'HEAD', originalHead], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
  }), /cannot lock ref/)
  assert.equal(git(cwd, 'rev-parse', 'refs/heads/main'), competingHead)
  assert.equal(git(cwd, 'show', 'main:assets/stats/languages.svg'), existing.trim())
})
