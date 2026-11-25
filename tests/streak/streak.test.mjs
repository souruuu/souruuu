import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bangkokDay, collectStreak, summarizeStreak } from '../../scripts/stats/streak-calendar.mjs'
import { renderStreak, validateStreakSvg } from '../../scripts/stats/streak-card.mjs'

const daily = (dates, counts = []) => dates.map((date, index) => ({ date, contributionCount: counts[index] ?? 0 }))
const calendar = (days, total = days.reduce((sum, day) => sum + day.contributionCount, 0)) => ({
  data: { user: { login: 'souruuu', contributionsCollection: {
    restrictedContributionsCount: 99,
    contributionCalendar: { totalContributions: total, weeks: [{ contributionDays: days }] },
  } } },
})
const account = (createdAt) => ({ data: { user: { login: 'souruuu', createdAt } } })
const show = (from, to) => {
  const result = []
  for (let t = Date.parse(from); t <= Date.parse(to.slice(0, 10)); t += 86_400_000) {
    result.push(new Date(t).toISOString().slice(0, 10))
  }
  return result
}

test('validates created-at history across leap day and window boundaries without double counting restricted activity', async () => {
  const queries = []
  const result = await collectStreak('synthetic', new Date('2025-01-01T02:00:00Z'), async (url, options) => {
    assert.equal(url, 'https://api.github.com/graphql')
    assert.equal(options.redirect, 'error')
    const { query, variables } = JSON.parse(options.body)
    if (query.includes('createdAt')) return Response.json(account('2024-02-28T12:00:00Z'))
    queries.push(variables)
    assert.doesNotMatch(query, /restrictedContributionsCount|repository/i)
    const days = daily(show(variables.from, variables.to))
    for (const day of days) if (['2024-02-29', '2024-12-31', '2025-01-01'].includes(day.date)) day.contributionCount = 1
    return Response.json(calendar(days))
  })
  assert.ok(queries.length > 1)
  assert.equal(result.stats.total, 3)
  assert.equal(result.stats.first, '2024-02-29')
  assert.deepEqual(result.stats.longest, { start: '2024-12-31', end: '2025-01-01', length: 2 })
  assert.deepEqual(result.stats.current, result.stats.longest)
})

test('rejects missing days, duplicate dates, mismatched totals and partial GraphQL data', async () => {
  const dates = ['2024-02-28', '2024-02-29', '2024-03-01']
  const responses = [
    calendar(daily([dates[0], dates[2]])),
    calendar(daily([dates[0], dates[0], dates[2]])),
    calendar(daily(dates), 50),
    { ...calendar(daily(dates)), errors: [{ message: 'untrusted data' }] },
  ]
  for (const response of responses) {
    await assert.rejects(collectStreak('synthetic', new Date('2024-03-01T12:00Z'), async (_url, opts) => (
      Response.json(JSON.parse(opts.body).query.includes('createdAt') ? account('2024-02-28T12:00:00Z') : response)
    )), /^Error: (?:INCOMPLETE_CALENDAR|GRAPHQL_ERROR)$/)
  }
})

test('bisects a resource-limited calendar window and validates every returned day', async () => {
  let windows = 0
  const result = await collectStreak('synthetic', new Date('2024-03-01T00:00Z'), async (_url, opts) => {
    const { query, variables } = JSON.parse(opts.body)
    if (query.includes('createdAt')) return Response.json(account('2024-02-20T12:00:00Z'))
    windows++
    if (windows === 1) return Response.json({ errors: [{ type: 'RESOURCE_LIMITS_EXCEEDED', path: ['user', 'contributionsCollection'] }] })
    return Response.json(calendar(daily(show(variables.from, variables.to))))
  })
  assert.equal(windows, 3)
  assert.equal(result.stats.total, 0)
})

test('preserves the yesterday grace period, earliest tie and positive lookahead under Bangkok day boundaries', () => {
  const days = daily(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'], [1, 0, 1, 0, 0])
  assert.equal(bangkokDay(new Date('2024-02-29T16:59:59Z')), '2024-02-29')
  assert.equal(bangkokDay(new Date('2024-02-29T17:00:00Z')), '2024-03-01')
  assert.equal(summarizeStreak(days, '2024-03-01').current.length, 1)
  assert.equal(summarizeStreak(days, '2024-03-02').current.length, 0)
  assert.equal(summarizeStreak(days, '2024-03-01').longest.start, '2024-02-27')
  const future = daily(['2024-02-29', '2024-03-01', '2024-03-02'], [1, 0, 1])
  assert.equal(summarizeStreak(future, '2024-03-01').current.end, '2024-03-02')
})

test('renders the existing theme and rejects changes outside the visible aggregate fields', () => {
  const svg = renderStreak({
    total: 1234, first: '2024-02-29',
    current: { start: '2025-01-01', end: '2025-01-02', length: 2 },
    longest: { start: '2024-02-29', end: '2024-03-03', length: 4 },
  }, '2025-01-02')
  validateStreakSvg(svg)
  assert.match(svg, /width='495px' height='180px'/)
  assert.match(svg, /#AD91FF/)
  assert.match(svg, /1,234/)
  for (const bad of [
    svg.replace('</svg>', '<script>bad()</script></svg>'),
    svg.replace('1,234', 'private/detail'),
    svg.replace('#AD91FF', '#aabbcc'),
    svg.replace('1,234', '1'),
    svg.replace('Feb 29, 2024 - Present', 'Feb 30, 2024 - Present'),
  ]) assert.throws(() => validateStreakSvg(bad), /^Error: Invalid streak SVG\.$/)
})
