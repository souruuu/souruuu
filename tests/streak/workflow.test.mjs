import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('keeps Streak verification, artifacts and publishing gated independently of Languages', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/update-streak.yml', import.meta.url), 'utf8')
  const [generate, publish] = workflow.split(/^  publish:$/m)
  assert.match(generate, /default: false/)
  assert.match(generate, /contents: read/)
  assert.match(generate, /else\s+node scripts\/stats\/streak.mjs verify/)
  assert.match(generate, /id: upload\s+if: vars\.STATS_PUBLISH_STREAK == 'true'/)
  assert.match(publish, /vars\.STATS_PUBLISH_STREAK == 'true'/)
  assert.match(publish, /contents: write/)
  assert.match(publish, /digest-mismatch: error/)
  assert.match(publish, /git push origin HEAD:refs\/heads\/main/)
  assert.doesNotMatch(workflow, /secrets\.|STATS_PUBLISH_LANGUAGES|--force|pull_request/)
  assert.equal(workflow.match(/github\.ref == 'refs\/heads\/main'/g)?.length, 2)
})
