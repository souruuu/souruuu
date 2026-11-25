import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CollectionError, collectLanguages, createGitHub, parseApprovedIds } from '../../scripts/stats/collect.mjs'

const repo = (id, { privateRepo = false, fork = false } = {}) => ({
  id, private: privateRepo, visibility: privateRepo ? 'private' : 'public',
  fork, name: `synthetic-${id}`, owner: { login: 'souruuu' },
})

const approved = parseApprovedIds('[21,22]')
const publicRepo = repo(1)
const selected = [repo(21, { privateRepo: true }), repo(22, { privateRepo: true })]
const unauthorized = repo(23, { privateRepo: true })

function fixture(overrides = {}) {
  const responses = {
    '/user': { login: 'souruuu', id: 9, public_repos: 2 },
    '/users/souruuu/repos': [publicRepo, repo(2, { fork: true })],
    '/user/repos': [...selected, unauthorized],
    '/repositories/1/languages': { JavaScript: 300, CSS: 100 },
    '/repositories/21/languages': { JavaScript: 50, Python: 200 },
    '/repositories/22/languages': {},
    ...Object.fromEntries([publicRepo, ...selected].map((item) => [`/repositories/${item.id}`, item])),
    ...overrides,
  }
  return async (url) => {
    assert.ok(Object.hasOwn(responses, url.pathname))
    return new Response(JSON.stringify(responses[url.pathname]))
  }
}

const client = (fetch) => createGitHub('github_pat_synthetic_test', { fetch, pause: async () => {} })

test('aggregates bytes from owned non-forks and approved private IDs only', async () => {
  const result = await collectLanguages(client(fixture()), approved)
  assert.deepEqual(result, new Map([['JavaScript', 350], ['Python', 200], ['CSS', 100]]))
})

test('fails when the inventory, owner, private byte evidence or response shape is wrong', async () => {
  for (const overrides of [
    { '/user/repos': [selected[0], unauthorized] },
    { '/user': { login: 'somebody-else' } },
    { '/users/souruuu/repos': [publicRepo] },
    { '/user/repos': [{ ...selected[0], fork: true }, selected[1]] },
    { '/repositories/21': { ...selected[0], id: 99 } },
    { '/repositories/21': { ...selected[0], visibility: 'internal' } },
    { '/repositories/21/languages': {} },
    { '/repositories/21/languages': { Python: null } },
    { '/repositories/21/languages': { 'synthetic-private-name': 50 } },
    { '/repositories/21/languages': { error: 'synthetic-private-name' } },
  ]) {
    await assert.rejects(collectLanguages(client(fixture(overrides)), approved),
      (error) => !error.message.includes('synthetic'))
  }
})

test('does not read a repository outside scope and rejects scope changes during a read', async () => {
  for (const failBefore of [true, false]) {
    let metadata = 0
    let languageRequests = 0
    const fetch = async (url) => {
      if (url.pathname === '/repositories/21/languages') languageRequests++
      if (url.pathname === '/repositories/21' && ++metadata === (failBefore ? 1 : 2)) {
        return new Response(JSON.stringify(repo(21)))
      }
      return fixture()(url)
    }
    await assert.rejects(collectLanguages(client(fetch), approved), /identity or scope/)
    assert.equal(languageRequests, failBefore ? 0 : 1)
  }
})

test('rejects missing credentials and malformed or duplicated private IDs', () => {
  for (const ids of ['', '[]', '[7,7]', '["synthetic-name"]', '[0]']) {
    assert.throws(() => parseApprovedIds(ids), /approved private repository inventory/i)
  }
  assert.throws(() => createGitHub(''), /STATS_READ_TOKEN/)
  assert.throws(() => createGitHub('ghp_synthetic_classic_token'), /fine-grained/)
})

test('paginates a full repository listing and checks a missing next link', async () => {
  const fetchPage = (includeLink) => async (url) => {
    if (url.pathname !== '/users/souruuu/repos') {
      return fixture({ '/user': { login: 'souruuu', id: 9, public_repos: 101 } })(url)
    }
    if (url.searchParams.get('page') === '2') return new Response(JSON.stringify([publicRepo]))
    const next = new URL(url)
    next.pathname = '/user/9/repos'
    next.searchParams.set('page', '2')
    const forks = Array.from({ length: 100 }, (_, i) => repo(100 + i, { fork: true }))
    return new Response(JSON.stringify(forks), {
      headers: includeLink ? { link: `<${next}>; rel="next"` } : {},
    })
  }
  assert.equal((await collectLanguages(client(fetchPage(true)), approved)).get('CSS'), 100)
  await assert.rejects(collectLanguages(client(fetchPage(false)), approved), /pagination/i)
})

test('rejects an unsafe next link and never sends credentials there', async () => {
  let requests = 0
  const fetch = async (url, options) => {
    assert.equal(url.hostname, 'api.github.com')
    assert.equal(options.redirect, 'error')
    requests++
    if (url.pathname === '/user') return fixture()(url)
    return new Response('[]', { headers: { link: '<https://example.invalid/>; rel="next"' } })
  }
  await assert.rejects(collectLanguages(client(fetch), approved), /pagination/i)
  assert.equal(requests, 2)
})

test('sanitizes HTTP and JSON failures and bounds retries on rate limits and timeouts', async () => {
  for (const [status, expectedCalls] of [[401, 1], [403, 1], [429, 3], [503, 3], [200, 1]]) {
    let calls = 0
    const api = client(async () => {
      calls++
      return new Response('synthetic-token-and-private-name', { status })
    })
    await assert.rejects(api.get('/user'), (error) => !error.message.includes('synthetic'))
    assert.equal(calls, expectedCalls)
  }
  let timeouts = 0
  const api = client(async () => {
    timeouts++
    throw new DOMException('synthetic-private-name', 'TimeoutError')
  })
  await assert.rejects(api.get('/user'), /timed out/)
  assert.equal(timeouts, 3)
})

test('rejects partial HTTP success even when the JSON body looks valid', async () => {
  const api = client(async () => new Response('{"Python":10}', { status: 206 }))
  await assert.rejects(api.get('/repositories/21/languages'), {
    constructor: CollectionError, message: 'GitHub API HTTP 206.',
  })
})
