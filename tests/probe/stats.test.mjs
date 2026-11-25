import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInventory, probe, readGitHub } from '../../scripts/stats/probe.mjs'

test('validates the approved inventory without echoing it on failure', () => {
  assert.deepEqual(parseInventory('[11,12]'), new Set([11, 12]))
  for (const bad of ['[]', '[11,11]', 'private/witness', '[0]', '["11"]']) {
    assert.throws(() => parseInventory(bad), /^Error: Invalid approved repository inventory\.$/)
  }
})

test('blocks redirects and rejects partial GraphQL data without showing the response', async () => {
  let request
  const api = readGitHub('fixture', async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ data: { user: { login: 'souruuu' } }, errors: ['private/details'] }))
  })
  await assert.rejects(api.graph('query { user(login: "souruuu") { login } }'), /^Error: PARTIAL_OR_ERROR$/)
  assert.equal(request.url.origin, 'https://api.github.com')
  assert.equal(request.options.redirect, 'error')
  assert.equal(request.options.headers.Authorization, 'Bearer fixture')
  await assert.rejects(api.rest('https://example.org/'), /^Error: REQUEST_FAILED$/)
})

const repo = (id, visibility, login = 'souruuu') => ({
  databaseId: id, visibility, owner: { login }, isFork: false,
})
const page = (totalCount, nodes, endCursor = null) => ({
  totalCount, nodes, pageInfo: { hasNextPage: !!endCursor, endCursor },
})
const now = new Date('2026-11-26T01:00:00Z')

test('checks pagination, repository scope and fixed diagnostic output', async () => {
  const report = await probe({
    async rest(path) {
      if (path === '/users/souruuu') return { login: 'souruuu', followers: 3 }
      if (path === '/repos/souruuu/souruuu') return { private: false, visibility: 'public', owner: { login: 'souruuu' }, stargazers_count: 1 }
      return { id: 11, private: true, visibility: 'private', fork: false, owner: { login: 'souruuu' }, stargazers_count: 0 }
    },
    async graph(query, { cursor } = {}) {
      if (query.includes(' pullRequests(')) {
        return cursor
          ? page(2, [{ id: 'second', repository: repo(11, 'PRIVATE') }])
          : page(2, [{ id: 'first', repository: repo(10, 'PUBLIC') }], 'next')
      }
      if (query.includes(' issues(')) return page(1, [{ id: 'sample', repository: repo(99, 'PRIVATE') }])
      if (query.includes('repositoriesContributedTo(')) return page(1, [{ ...repo(10, 'PUBLIC', 'other'), id: 'r' }])
      if (query.includes('totalCommitContributions')) return {
        totalCommitContributions: 3,
        groups: [{ repository: repo(11, 'PRIVATE'), contributions: { totalCount: 2 } }],
      }
      if (query.includes('totalPullRequestReviewContributions')) return { totalPullRequestReviewContributions: 0, groups: [] }
      throw Error('private identifier must not be printed')
    },
  }, new Set([11]), now)
  assert.deepEqual(report, [
    ['followers', 'VISIBLE'],
    ['public-stars-metadata', 'VISIBLE'],
    ['private-stars-metadata', 'VISIBLE'],
    ['commits', 'INCOMPLETE_WITH_APPROVED_ACTIVITY'],
    ['reviews', 'NO_APPROVED_ACTIVITY_OBSERVED'],
    ['prs', 'APPROVED_ACTIVITY_OBSERVED'],
    ['issues', 'SCOPE_UNVERIFIED'],
    ['contributed-to', 'VISIBLE'],
    ['calendar', 'REQUEST_FAILED'],
  ])
})

test('reports inaccessible metadata, truncated pagination and a visible restricted counter', async () => {
  const contributionDays = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 9, 28 + i)).toISOString().slice(0, 10),
    contributionCount: 0,
  }))
  const report = new Map(await probe({
    async rest(path) {
      if (path === '/users/souruuu') return { login: 'souruuu', followers: 0 }
      throw Error('HTTP_404')
    },
    async graph(query) {
      if (query.includes('contributionCalendar')) return {
        restrictedContributionsCount: 1,
        contributionCalendar: { totalContributions: 0, weeks: [{ contributionDays }] },
      }
      if (query.includes(' pullRequests(')) return page(1000, [], 'repeated')
      throw Error('raw error')
    },
  }, new Set([11]), now))
  assert.equal(report.get('private-stars-metadata'), 'HTTP_404')
  assert.equal(report.get('prs'), 'INCOMPLETE')
  assert.equal(report.get('calendar'), 'VISIBLE_WITH_RESTRICTED_COUNT')
})
