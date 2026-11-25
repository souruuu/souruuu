import { languageColors } from './upstream.mjs'

export class CollectionError extends Error {}

export const OWNER = 'souruuu'
const ORIGIN = 'https://api.github.com'
const PAGE_SIZE = 100
const MAX_PAGES = 100

export function parseApprovedIds(value) {
  try {
    const ids = JSON.parse(value)
    if (Array.isArray(ids) && ids.length && ids.every((id) => Number.isSafeInteger(id) && id > 0)
        && new Set(ids).size === ids.length) return new Set(ids)
  } catch {
    // Never include an invalid secret or the parser's diagnostic.
  }
  throw new CollectionError('Missing or invalid approved private repository inventory.')
}

export function createGitHub(token, { fetch = globalThis.fetch, pause = (ms) => new Promise(
  (resolve) => setTimeout(resolve, ms),
) } = {}) {
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(token ?? '')) {
    throw new CollectionError('Missing or invalid fine-grained STATS_READ_TOKEN.')
  }

  return {
    async get(path, params = {}) {
      const url = new URL(path, ORIGIN)
      if (url.origin !== ORIGIN || url.username || url.password) throw new CollectionError('Invalid API endpoint.')
      url.search = new URLSearchParams(params).toString()
      for (let attempt = 0; attempt < 3; attempt++) {
        let response
        let failure
        try {
          response = await fetch(url, {
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${token}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
          })
        } catch (error) {
          failure = error?.name === 'TimeoutError' ? 'GitHub API request timed out.' : 'GitHub API request failed.'
        }
        if (response?.status === 200) {
          try {
            return { body: await response.json(), link: response.headers.get('link') }
          } catch (error) {
            if (error?.name !== 'TimeoutError' && error?.name !== 'AbortError') {
              throw new CollectionError('Invalid GitHub API response.')
            }
            failure = 'GitHub API request timed out.'
          }
        } else if (response) {
          const { status, headers } = response
          const rateLimited = status === 429 || (status === 403
            && (headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')))
          const retryable = rateLimited || [500, 502, 503, 504].includes(status)
          const retryAfter = Number(headers.get('retry-after') ?? 0) * 1000
          const reset = Number(headers.get('x-ratelimit-reset') ?? 0) * 1000 - Date.now()
          const delay = Math.max(retryAfter, rateLimited ? reset : 0)
          failure = rateLimited ? 'GitHub API rate limit.' : `GitHub API HTTP ${status}.`
          if (response.body) await response.body.cancel().catch(() => {})
          if (!retryable || !Number.isFinite(delay) || delay > 5000) throw new CollectionError(failure)
          if (attempt < 2) {
            await pause(Math.max(delay, 500 * (attempt + 1)))
            continue
          }
        }
        if (attempt === 2) throw new CollectionError(failure)
        await pause(500 * (attempt + 1))
      }
    },
  }
}

function hasNextPage(link, page, path, ownerId) {
  if (!link) return false
  const parts = link.split(',')
  const links = new Map()
  for (const part of parts) {
    const match = /^\s*<([^>]+)>;\s*rel="(first|prev|next|last)"\s*$/.exec(part)
    const invalid = () => new CollectionError('Invalid GitHub repository pagination.')
    if (!match || links.has(match[2])) throw invalid()
    let url
    try {
      url = new URL(match[1])
    } catch {
      throw invalid()
    }
    const canonicalPath = `/user/${ownerId}/repos`
    if (url.origin !== ORIGIN || url.username || url.password || url.hash
        || (url.pathname !== path && url.pathname !== canonicalPath)) throw invalid()
    links.set(match[2], url.searchParams.get('page'))
  }
  if (links.has('next') && links.get('next') !== String(page + 1)) {
    throw new CollectionError('Invalid GitHub repository pagination.')
  }
  if (Number(links.get('last')) > page && !links.has('next')) {
    throw new CollectionError('Invalid GitHub repository pagination.')
  }
  return links.has('next')
}

function isOwnedRepository(repo, privateRepo) {
  return Number.isSafeInteger(repo?.id) && repo.id > 0 && typeof repo.owner?.login === 'string'
    && repo.owner.login.toLowerCase() === OWNER && repo.private === privateRepo
    && repo.visibility === (privateRepo ? 'private' : 'public') && typeof repo.fork === 'boolean'
}

async function listOwned(api, ownerId, path, params, privateRepo) {
  const repositories = new Map()
  let probing = false
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { body, link } = await api.get(path, {
      ...params, sort: 'full_name', direction: 'asc', per_page: PAGE_SIZE, page,
    })
    if (!Array.isArray(body) || body.length > PAGE_SIZE) throw new CollectionError('Invalid GitHub repository page.')
    const next = hasNextPage(link, page, path, ownerId)
    if (probing && (next || body.length) || next && body.length !== PAGE_SIZE
        || page > 1 && !probing && body.length === 0) {
      throw new CollectionError('Incomplete GitHub repository pagination.')
    }
    for (const repo of body) {
      if (!isOwnedRepository(repo, privateRepo) || repositories.has(repo.id)) {
        throw new CollectionError('Invalid or duplicate GitHub repository metadata.')
      }
      repositories.set(repo.id, repo.fork)
    }
    if (!next && body.length < PAGE_SIZE) return repositories
    probing = !next
  }
  throw new CollectionError('GitHub repository pagination exceeded its safety limit.')
}

async function verifyScope(api, path, id, privateRepo) {
  const { body } = await api.get(path)
  if (!isOwnedRepository(body, privateRepo) || body.id !== id || body.fork) {
    throw new CollectionError('Repository identity or scope changed during collection.')
  }
}

export async function collectLanguages(api, approvedIds) {
  const { body: viewer } = await api.get('/user')
  if (viewer?.login !== OWNER || !Number.isSafeInteger(viewer.id) || viewer.id <= 0
      || !Number.isSafeInteger(viewer.public_repos) || viewer.public_repos < 0) {
    throw new CollectionError('Read token owner could not be verified.')
  }
  const privateRepos = await listOwned(api, viewer.id, '/user/repos', { visibility: 'private', affiliation: 'owner' }, true)
  const selected = [...approvedIds]
  if (!selected.length || selected.some((id) => privateRepos.get(id) !== false)) {
    throw new CollectionError('Approved private repository coverage could not be verified.')
  }
  const publicRepos = await listOwned(api, viewer.id, `/users/${OWNER}/repos`, { type: 'owner' }, false)
  if (publicRepos.size !== viewer.public_repos) throw new CollectionError('Public repository inventory is incomplete.')
  if (selected.some((id) => publicRepos.has(id))) throw new CollectionError('Repository visibility changed during collection.')
  const publicNonForks = [...publicRepos].filter(([, fork]) => !fork).map(([id]) => id)
  const totals = new Map()
  let privateBytes = 0
  for (const id of publicNonForks.concat(selected)) {
    const privateRepo = approvedIds.has(id)
    // Bind the language request to the inventory ID and check scope on both
    // sides of the read so a rename cannot substitute a different repository.
    const path = `/repositories/${id}`
    await verifyScope(api, path, id, privateRepo)
    const { body, link } = await api.get(`${path}/languages`)
    if (!body || typeof body !== 'object' || Array.isArray(body) || link) {
      throw new CollectionError('Invalid GitHub language response.')
    }
    await verifyScope(api, path, id, privateRepo)
    for (const [name, bytes] of Object.entries(body)) {
      if (!Object.hasOwn(languageColors, name) || !Number.isSafeInteger(bytes) || bytes <= 0) {
        throw new CollectionError('Unexpected GitHub language label or byte count.')
      }
      const total = (totals.get(name) ?? 0) + bytes
      if (!Number.isSafeInteger(total)) throw new CollectionError('Language byte total exceeded its supported range.')
      totals.set(name, total)
      if (privateRepo) privateBytes += bytes
    }
  }
  if (!Number.isSafeInteger(privateBytes) || privateBytes === 0) {
    throw new CollectionError('Private language byte coverage could not be verified.')
  }
  if (!Number.isSafeInteger([...totals.values()].reduce((sum, bytes) => sum + bytes, 0))) {
    throw new CollectionError('Language byte total exceeded its supported range.')
  }
  return totals
}
