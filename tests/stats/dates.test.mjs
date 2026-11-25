import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitContributionWindow, renderStats } from '../../scripts/stats/stats.mjs'

test('as-of time and year follow UTC through leap day and the Bangkok year boundary', () => {
  assert.deepEqual(commitContributionWindow(new Date('2024-02-29T23:59:58.999Z')), {
    year: 2024, from: '2024-01-01T00:00:00Z', to: '2024-02-29T23:59:58Z',
  })
  assert.deepEqual(commitContributionWindow(new Date('2027-01-01T06:17:00+07:00')), {
    year: 2026, from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:17:00Z',
  })
  assert.deepEqual(commitContributionWindow(new Date('2027-01-01T07:00:00+07:00')), {
    year: 2027, from: '2027-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z',
  })
})

test('the stats preview never turns mixed contributions into commit contributions', () => {
  const asOf = new Date('2027-01-01T07:00:00+07:00')
  const metrics = { commits: 12, prs: 1, issues: 2, reviews: 3, stars: 4, followers: 5, contributedTo: 6, ownedRepos: 7 }
  const base = renderStats(metrics, asOf)
  assert.deepEqual(renderStats({ ...metrics, restrictedContributionsCount: 99, totalContributions: 150 }, asOf), base)
  assert.match(base.svg, /data-testid="commits"\s*>12<\/text>/)
})
