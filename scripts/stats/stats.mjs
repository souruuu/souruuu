import { CARD_STYLE, loadCore } from './upstream.mjs'

const { calculateRank } = await loadCore('calculateRank.js')
const { renderStatsCard } = await loadCore('cards/stats.js')

export function commitContributionWindow(asOf) {
  const year = asOf.getUTCFullYear()
  if (!Number.isSafeInteger(year) || year < 2008 || year > 9999) throw new Error('Invalid contribution date.')
  return {
    year,
    from: `${year}-01-01T00:00:00Z`,
    to: asOf.toISOString().slice(0, 19) + 'Z',
  }
}

// This adapter is exercised with synthetic aggregates while collection awaits
// private coverage validation. Omitting the username disables search links.
export function renderStats(metrics, asOf) {
  const { year } = commitContributionWindow(asOf)
  const { commits, prs, issues, reviews, stars, followers, contributedTo, ownedRepos } = metrics
  if ([commits, prs, issues, reviews, stars, followers, contributedTo, ownedRepos]
    .some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Invalid aggregate stats metrics.')
  }
  const rank = calculateRank({ all_commits: false, commits, prs, issues, reviews, stars, followers, repos: ownedRepos })
  const svg = renderStatsCard({
    name: 'souruuu', totalCommits: commits, totalPRs: prs, totalIssues: issues,
    totalReviews: reviews, totalStars: stars, contributedTo, rank,
  }, {
    ...CARD_STYLE, show_icons: true, hide_rank: false, custom_title: "souruuu's GitHub Stats",
    icon_color: 'ad91ff', ring_color: 'ad91ff', include_all_commits: false, commits_year: year,
  })
  return { svg, rank }
}
