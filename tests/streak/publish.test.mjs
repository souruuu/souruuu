import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { renderStreak } from '../../scripts/stats/streak-card.mjs'
import { publishStreak } from '../../scripts/stats/streak.mjs'

test('publishes only the streak asset and does not create a second commit for identical SVG', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'streak-publish-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'repo')
  const incoming = join(root, 'incoming')
  mkdirSync(join(cwd, 'assets/stats'), { recursive: true })
  mkdirSync(incoming)
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'commit.gpgSign', 'false')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(cwd, 'assets/stats/languages.svg'), 'existing asset')
  git('add', 'assets/stats/languages.svg')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'test: fixture')

  const date = '2026-11-26'
  const one = { start: date, end: date, length: 1 }
  const svg = renderStreak({ total: 1, first: date, current: one, longest: one }, date)
  const source = join(incoming, 'streak.svg')
  writeFileSync(source, svg)
  assert.equal(publishStreak(incoming, cwd), true)
  const head = git('rev-parse', 'HEAD')
  assert.equal(git('show', '--format=', '--name-only', head), 'assets/stats/streak.svg')
  assert.equal(readFileSync(join(cwd, 'assets/stats/languages.svg'), 'utf8'), 'existing asset')
  assert.equal(publishStreak(incoming, cwd), false)

  writeFileSync(join(incoming, 'languages.svg'), svg)
  assert.throws(() => publishStreak(incoming, cwd), /Unexpected artifact contents/)
  rmSync(join(incoming, 'languages.svg'))
  writeFileSync(source, svg.replace('</svg>', '<script>bad()</script></svg>'))
  assert.throws(() => publishStreak(incoming, cwd), /Invalid streak SVG/)
  assert.equal(git('rev-parse', 'HEAD'), head)
  assert.equal(readFileSync(join(cwd, 'assets/stats/streak.svg'), 'utf8'), svg)
})
