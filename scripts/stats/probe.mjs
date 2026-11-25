const OWNER = 'souruuu'
const ORIGIN = 'https://api.github.com'
const REPOSITORY = 'databaseId visibility isFork owner { login }'
const DAY = 86_400_000
const count = (value) => Number.isSafeInteger(value) && value >= 0

export function parseInventory(inventory) {
  try {
    const ids = JSON.parse(inventory)
    if (Array.isArray(ids) && ids.length && ids.every((id) => count(id) && id > 0)
        && new Set(ids).size === ids.length) return new Set(ids)
  } catch {
    // JSON errors can contain part of the secret inventory.
  }
  throw new Error('Invalid approved repository inventory.')
}

export function validateCredential(token) {
  if (!/^[\x21-\x7e]+$/.test(token ?? '')) throw new Error('TOKEN_UNAVAILABLE')
  return token
}

export function readGitHub(token, fetch = globalThis.fetch) {
  async function request(path, body) {
    let response
    try {
      const url = new URL(path, ORIGIN)
      if (url.origin !== ORIGIN || url.username || url.password) throw new Error()
      response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body && JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new Error('REQUEST_FAILED')
    }
    if (response.status !== 200) throw new Error(`HTTP_${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new Error('INVALID_RESPONSE')
    }
  }

  return {
    rest: (path) => request(path),
    async graph(query, variables) {
      const result = await request('/graphql', { query, variables })
      if (result?.errors != null && (!Array.isArray(result.errors) || result.errors.length)) {
        throw new Error('PARTIAL_OR_ERROR')
      }
      const user = result?.data?.user
      if (user?.login !== OWNER || !user.result) throw new Error('INVALID_RESPONSE')
      return user.result
    },
  }
}

function repositoryScope(repo, approved, external = false) {
  if (!count(repo?.databaseId) || repo.databaseId === 0 || typeof repo.owner?.login !== 'string'
      || typeof repo.isFork !== 'boolean') return 'unverified'
  const owned = repo.owner.login.toLowerCase() === OWNER
  if (repo.visibility === 'PUBLIC' && !approved.has(repo.databaseId) && (!external || !owned)) return 'public'
  if (!external && repo.visibility === 'PRIVATE' && approved.has(repo.databaseId) && owned && !repo.isFork) return 'approved'
  return 'unverified'
}

function activityStatus(complete, positive) {
  if (!complete) return positive ? 'INCOMPLETE_WITH_APPROVED_ACTIVITY' : 'INCOMPLETE'
  return positive ? 'APPROVED_ACTIVITY_OBSERVED' : 'NO_APPROVED_ACTIVITY_OBSERVED'
}

const query = (field, args = '') => `query(${args}) { user(login: "${OWNER}") { login result: ${field} } }`.replace('query()', 'query')

async function connection(api, field, approved, external = false) {
  const selections = external ? `id ${REPOSITORY}` : `id repository { ${REPOSITORY} }`
  const operation = query(`${field} { totalCount nodes { ${selections} } pageInfo { hasNextPage endCursor } }`, '$cursor: String')
  const seen = new Set()
  const cursors = new Set()
  let cursor = null
  let expected
  let positive = false
  for (let page = 0; page < 3; page++) {
    const { nodes, totalCount, pageInfo } = await api.graph(operation, { cursor })
    if (!count(totalCount) || (expected != null && totalCount !== expected) || !Array.isArray(nodes)
        || nodes.length > 50 || typeof pageInfo?.hasNextPage !== 'boolean') return 'INCOMPLETE'
    expected = totalCount
    for (const node of nodes) {
      if (typeof node?.id !== 'string' || !node.id || seen.has(node.id)) return 'INCOMPLETE'
      seen.add(node.id)
      const scope = repositoryScope(external ? node : node.repository, approved, external)
      if (scope === 'unverified') return 'SCOPE_UNVERIFIED'
      positive ||= scope === 'approved'
    }
    if (!pageInfo.hasNextPage) {
      if (seen.size === expected && external) return 'VISIBLE'
      return activityStatus(seen.size === expected, positive)
    }
    cursor = pageInfo.endCursor
    if (!nodes.length || seen.size >= expected || typeof cursor !== 'string' || !cursor || cursors.has(cursor)) {
      return activityStatus(false, positive)
    }
    cursors.add(cursor)
  }
  return activityStatus(false, positive)
}

async function contributions(api, approved, field, total, dates = {}) {
  const hasDates = !!dates.from
  const args = hasDates ? '(from: $from, to: $to)' : ''
  const result = await api.graph(query(`contributionsCollection${args} { ${total}
    groups: ${field}(maxRepositories: 50) { repository { ${REPOSITORY} } contributions { totalCount } }
  }`, hasDates ? '$from: DateTime!, $to: DateTime!' : ''), dates)
  if (!count(result[total]) || !Array.isArray(result.groups) || result.groups.length > 50) return 'INCOMPLETE'
  let visible = 0
  let positive = false
  const seen = new Set()
  for (const { repository, contributions } of result.groups) {
    const scope = repositoryScope(repository, approved)
    if (scope === 'unverified') return 'SCOPE_UNVERIFIED'
    if (seen.has(repository.databaseId) || !count(contributions?.totalCount)) return 'INCOMPLETE'
    seen.add(repository.databaseId)
    visible += contributions.totalCount
    positive ||= scope === 'approved' && contributions.totalCount > 0
  }
  return activityStatus(visible === result[total], positive)
}

async function calendar(api, now, to) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dates = Array.from({ length: 30 }, (_, i) => new Date(today - (29 - i) * DAY).toISOString().slice(0, 10))
  const result = await api.graph(query(`contributionsCollection(from: $from, to: $to) {
    restrictedContributionsCount contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
  }`, '$from: DateTime!, $to: DateTime!'), { from: `${dates[0]}T00:00:00Z`, to })
  const { restrictedContributionsCount: restricted, contributionCalendar: value } = result
  if (!count(restricted) || !count(value?.totalContributions) || !Array.isArray(value.weeks)
      || value.weeks.some((week) => !Array.isArray(week?.contributionDays))) return 'INCOMPLETE'
  const days = value.weeks.flatMap((week) => week.contributionDays)
  if (days.length !== dates.length || days.some((day, index) => day?.date !== dates[index] || !count(day.contributionCount))
      || days.reduce((sum, day) => sum + day.contributionCount, 0) !== value.totalContributions) return 'INCOMPLETE'
  return restricted ? 'VISIBLE_WITH_RESTRICTED_COUNT' : 'VISIBLE_WITHOUT_RESTRICTED_COUNT'
}

async function check(label, operation) {
  try {
    return [label, await operation()]
  } catch (error) {
    const safe = /^(?:HTTP_[1-5][0-9]{2}|PARTIAL_OR_ERROR|INVALID_RESPONSE)$/.test(error?.message)
    return [label, safe ? error.message : 'REQUEST_FAILED']
  }
}

export async function probe(api, approved, now) {
  const from = `${now.getUTCFullYear()}-01-01T00:00:00Z`
  const to = now.toISOString().slice(0, 19) + 'Z'
  const result = []
  result.push(await check('followers', async () => {
    const user = await api.rest(`/users/${OWNER}`)
    return user?.login === OWNER && count(user.followers) ? 'VISIBLE' : 'INVALID_RESPONSE'
  }))
  result.push(await check('public-stars-metadata', async () => {
    const repo = await api.rest(`/repos/${OWNER}/${OWNER}`)
    return repo?.private === false && repo.visibility === 'public' && repo.owner?.login === OWNER
      && count(repo.stargazers_count) ? 'VISIBLE' : 'INVALID_RESPONSE'
  }))
  result.push(await check('private-stars-metadata', async () => {
    for (const id of approved) {
      const repo = await api.rest(`/repositories/${id}`)
      if (repo?.id !== id || repo.owner?.login !== OWNER || repo.private !== true
          || repo.visibility !== 'private' || repo.fork !== false) return 'SCOPE_UNVERIFIED'
      if (!count(repo.stargazers_count)) return 'INVALID_RESPONSE'
    }
    return 'VISIBLE'
  }))
  result.push(await check('commits', () => contributions(api, approved, 'commitContributionsByRepository',
    'totalCommitContributions', { from, to })))
  result.push(await check('reviews', () => contributions(api, approved, 'pullRequestReviewContributionsByRepository',
    'totalPullRequestReviewContributions')))
  result.push(await check('prs', () => connection(api, 'pullRequests(first: 50, after: $cursor)', approved)))
  result.push(await check('issues', () => connection(api, 'issues(states: [OPEN, CLOSED], first: 50, after: $cursor)', approved)))
  result.push(await check('contributed-to', () => connection(api,
    'repositoriesContributedTo(first: 50, after: $cursor, includeUserRepositories: false, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY])',
    approved, true)))
  result.push(await check('calendar', () => calendar(api, now, to)))
  return result
}

if (import.meta.main) {
  const token = process.env.PROBE_TOKEN
  const inventory = process.env.PROBE_APPROVED_IDS
  delete process.env.PROBE_TOKEN
  delete process.env.PROBE_APPROVED_IDS
  try {
    const reports = await probe(readGitHub(validateCredential(token)), parseInventory(inventory), new Date())
    for (const [label, status] of reports) console.log(`${label}: ${status}`)
  } catch (error) {
    console.error(error?.message === 'TOKEN_UNAVAILABLE' ? 'Stats probe credential unavailable.' : 'Stats probe setup failed.')
    process.exitCode = 1
  }
}
