// Window partitioning, selective bisection and calendar checks adapted from
// shinpr/github-profile-stats (MIT). See streak-upstream-LICENSE.md.
const OWNER = 'souruuu'
const DAY = 86_400_000
const WINDOW_DAYS = 90
const MAX_REQUESTS = 256
const bangkokDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok',
  year: 'numeric', month: '2-digit', day: '2-digit' })
const dateAt = (time) => new Date(time).toISOString().slice(0, 10)
const dayTime = (date) => Date.parse(`${date}T00:00:00Z`)
const count = (value) => Number.isSafeInteger(value) && value >= 0

const ACCOUNT = 'query { user(login: "souruuu") { login createdAt } }'
const CALENDAR = `query($from: DateTime!, $to: DateTime!) {
  user(login: "souruuu") {
    login
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`

export class StreakError extends Error {}

export function bangkokDay(now) {
  const parts = Object.fromEntries(bangkokDate.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Daily mode from DenverCoder1/github-readme-streak-stats, with an explicit
// Bangkok day and GitHub-provided date labels. Equal maxima keep the first run.
export function summarizeStreak(days, today) {
  const yesterday = dateAt(dayTime(today) - DAY)
  const tomorrow = dateAt(dayTime(today) + DAY)
  const empty = { start: today, end: today, length: 0 }
  let total = 0
  let first = today
  let run = empty
  let last = empty
  let longest = empty
  for (const { date, contributionCount } of days) {
    if (date > tomorrow) break
    if (contributionCount === 0) {
      run = empty
      continue
    }
    if (total === 0) first = date
    total += contributionCount
    run = { start: run.length ? run.start : date, end: date, length: run.length + 1 }
    last = run
    if (run.length > longest.length) longest = run
  }
  if (!count(total)) throw new StreakError('INVALID_TOTAL')
  return { total, first, current: last.end >= yesterday ? last : empty, longest }
}

function decodeWindow(calendar, start, requiredEnd, requestedEnd) {
  if (!count(calendar?.totalContributions) || !Array.isArray(calendar.weeks)
      || calendar.weeks.some((week) => !Array.isArray(week?.contributionDays))) {
    throw new StreakError('INCOMPLETE_CALENDAR')
  }
  const days = calendar.weeks.flatMap((week) => week.contributionDays)
  const expected = (requiredEnd - start) / DAY + 1
  const maximum = (requestedEnd - start) / DAY + 1
  if (days.length < expected || days.length > maximum
      || days.some((day, index) => day?.date !== dateAt(start + index * DAY) || !count(day.contributionCount))
      || days.reduce((sum, day) => sum + day.contributionCount, 0) !== calendar.totalContributions) {
    throw new StreakError('INCOMPLETE_CALENDAR')
  }
  return days
}

export async function collectStreak(token, now, fetch = globalThis.fetch) {
  if (typeof token !== 'string' || !token || /[^\x21-\x7e]/.test(token)) throw new StreakError('TOKEN_UNAVAILABLE')
  let requests = 0
  async function query(operation, variables) {
    if (++requests > MAX_REQUESTS) throw new StreakError('REQUEST_LIMIT')
    let response
    try {
      response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: operation, variables }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new StreakError('NETWORK_ERROR')
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {})
      throw new StreakError(`HTTP_${response.status}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch {
      throw new StreakError('INVALID_RESPONSE')
    }
    const errors = payload?.errors
    if (errors != null && (!Array.isArray(errors) || errors.length)) {
      const limited = Array.isArray(errors) && errors.every((error) => error?.type === 'RESOURCE_LIMITS_EXCEEDED'
        && error.path?.[0] === 'user' && error.path?.[1] === 'contributionsCollection')
      throw new StreakError(limited ? 'RESOURCE_LIMIT' : 'GRAPHQL_ERROR')
    }
    if (payload?.data?.user?.login !== OWNER) throw new StreakError('ACCOUNT_UNVERIFIED')
    return payload.data.user
  }

  async function window(start, end, requestedEnd = end) {
    try {
      const user = await query(CALENDAR, { from: `${dateAt(start)}T00:00:00Z`, to: `${dateAt(requestedEnd)}T23:59:59Z` })
      return decodeWindow(user.contributionsCollection?.contributionCalendar, start, end, requestedEnd)
    } catch (error) {
      if (error.message !== 'RESOURCE_LIMIT' || (end - start) / DAY + 1 <= 7) throw error
      const right = start + Math.ceil(((end - start) / DAY + 1) / 2) * DAY
      return [...await window(start, right - DAY), ...await window(right, end, requestedEnd)]
    }
  }

  const { createdAt } = await query(ACCOUNT)
  const created = Date.parse(createdAt)
  if (typeof createdAt !== 'string' || !Number.isFinite(created) || created > now.getTime()) {
    throw new StreakError('ACCOUNT_UNVERIFIED')
  }
  const start = dayTime(dateAt(created))
  const end = dayTime(dateAt(now.getTime()))
  const today = bangkokDay(now)
  const lookahead = dayTime(today) + DAY
  const days = []
  for (let next = start; next <= end; next += WINDOW_DAYS * DAY) {
    const last = Math.min(next + (WINDOW_DAYS - 1) * DAY, end)
    days.push(...await window(next, last, last === end ? lookahead : last))
  }
  return { stats: summarizeStreak(days, today), today }
}
