import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../../.github/workflows/update-stats.yml', import.meta.url), 'utf8')

test('guards both jobs on trusted main and serializes runs without canceling an active publish', () => {
  assert.match(workflow, /concurrency:\s+group: profile-stats-main\s+cancel-in-progress: false/)
  assert.match(workflow, /cron: '17 23 \* \* \*'/)
  assert.doesNotMatch(workflow, /pull_request|--force(?:[\s-]|$)/)
  assert.equal(workflow.match(/github\.repository == 'souruuu\/souruuu'/g)?.length, 2)
  assert.equal(workflow.match(/github\.ref == 'refs\/heads\/main'/g)?.length, 2)
  assert.equal(workflow.match(/ref: \$\{\{ github\.sha \}\}/g)?.length, 2)
})

test('pins actions, gates artifact creation and isolates the private token from publishing', () => {
  const jobs = workflow.split(/^  publish:$/m)
  const [generate, publish] = jobs
  assert.equal(jobs.length, 2)
  assert.match(generate, /contents: read/)
  assert.match(publish, /contents: write/)
  assert.doesNotMatch(publish, /STATS_READ_TOKEN|STATS_PRIVATE_REPOSITORY_IDS/)
  assert.match(generate, /npm ci.*\n[\s\S]+STATS_READ_TOKEN: \$\{\{ secrets\.STATS_READ_TOKEN \}\}/)
  assert.match(generate, /default: false/)
  assert.match(generate, /vars\.STATS_PUBLISH_LANGUAGES/)
  assert.match(generate, /path: \$\{\{ runner\.temp \}\}\/stats-output\/languages\.svg/)
  assert.match(publish, /git push origin HEAD:refs\/heads\/main/)
  for (const action of workflow.matchAll(/uses:\s+(\S+)/g)) {
    assert.match(action[1], /@[0-9a-f]{40}$/)
  }
})
