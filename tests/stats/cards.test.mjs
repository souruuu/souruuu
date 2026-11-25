import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderLanguages, validateLanguagesSvg } from '../../scripts/stats/cards.mjs'
import { renderStats } from '../../scripts/stats/stats.mjs'
import { CARD_STYLE, languageColors, loadCore } from '../../scripts/stats/upstream.mjs'

const { calculateRank } = await loadCore('calculateRank.js')
const { renderTopLanguages } = await loadCore('cards/top-languages.js')

const bytes = new Map([
  ['JavaScript', 350], ['Python', 200], ['CSS', 100], ['TypeScript', 50],
  ['HTML', 40], ['Lua', 30], ['C++', 20], ['Rust', 10], ['Ruby', 8],
])

test('renders eight byte-weighted percentages with the upstream top-eight denominator', () => {
  const svg = renderLanguages(new Map([...bytes, ['Rich Text Format', 900_000]]))
  validateLanguagesSvg(svg)
  assert.match(svg, /JavaScript 43\.75%/)
  assert.match(svg, /Rust 1\.25%/)
  assert.doesNotMatch(svg, /Ruby|Rich Text Format/)
  assert.equal(svg, renderLanguages(new Map([...bytes].reverse())))
  assert.match(svg, /width="495"/)
  assert.match(svg, /fill="#161b22"/)
  assert.match(svg, /stroke="#30363d"/)
  assert.match(svg, /rx="10"/)
})

test('removes document and prose bytes and preserves software markup', () => {
  const svg = renderLanguages(new Map([
    ['Rich Text Format', 900_000], ['Markdown', 45_000], ['Text', 20_000],
    ['HTML', 500], ['CSS', 300], ['Svelte', 200],
  ]))
  validateLanguagesSvg(svg)
  assert.doesNotMatch(svg, /Rich Text Format|Markdown|\bText \d/)
  assert.match(svg, /HTML 50\.00%/)
  assert.match(svg, /CSS 30\.00%/)
  assert.match(svg, /Svelte 20\.00%/)
})

test('fails closed when only excluded languages are present', () => {
  assert.throws(() => renderLanguages(new Map([
    ['Rich Text Format', 900_000], ['Markdown', 40],
  ])), /no eligible language bytes/i)
  assert.throws(() => renderLanguages(new Map([
    ['Rich Text Format', -1], ['HTML', 50],
  ])), /invalid aggregate/i)
})

test('rejects a structurally valid legacy card containing an excluded label', () => {
  for (const name of ['Rich Text Format', 'Markdown']) {
    const legacy = renderTopLanguages({ [name]: { name, size: 500, color: languageColors[name] } },
      { ...CARD_STYLE, layout: 'compact', langs_count: 8 })
    assert.throws(() => validateLanguagesSvg(legacy), /^Error: Invalid language SVG\.$/)
  }
})

test('renders known colorless languages and legitimate extreme or equal ratios', () => {
  for (const data of [
    new Map([['Python', 1]]),
    new Map([['C++', 999_997], ['CSS', 3], ['Lua', 3]]),
    new Map([['Python', 9_775], ['Lua', 225]]),
    new Map([['Python', 97_752], ['Lua', 2_248]]),
    new Map([['C++', 1], ['JavaScript', 1], ['Python', 1]]),
    new Map([['ABNF', 100]]),
    new Map([['Bluespec BH', 791906], ['IGOR Pro', 581756], ['Vespa Schema Definition', 58854],
      ['Julia REPL', 685344], ['Swift', 49706], ['ChucK', 44612], ['OpenQASM', 9454],
      ['OpenType Feature File', 345064]]),
  ]) {
    validateLanguagesSvg(renderLanguages(data))
  }
  assert.throws(() => renderLanguages(new Map([['synthetic-private-name', 100]])), /invalid aggregate/i)
  assert.throws(() => renderLanguages(new Map()), /invalid aggregate/i)
})

test('rejects active or external content, hidden details, incorrect values and malformed XML', () => {
  const svg = renderLanguages(bytes)
  for (const changed of [
    svg.replace('</svg>', '<script>alert(1)</script></svg>'),
    svg.replace('role="img"', 'onload="alert(1)" role="img"'),
    svg.replace('url(#rect-mask)', 'url(https://example.invalid/image)'),
    svg.replace('<defs>', '<defs><image href="file:///secret.svg"/>'),
    svg.replace('<defs>', '<defs><foreignObject/>'),
    svg.replace('<defs>', '<defs><metadata>synthetic-private-name</metadata>'),
    svg.replace('<defs>', '<defs><!-- synthetic-private-name -->'),
    svg.replace('.header {', '@import "https://example.invalid/x.css"; .header {'),
    svg.replace('JavaScript 43.75%', 'synthetic-private-name 43.75%'),
    svg.replace('JavaScript 43.75%', 'JavaScript 73.75%'),
    svg.replace('Rust 1.25%', 'Python 1.25%'),
    svg.replace('width="494"', 'width="493"'),
    svg.replace('Most Used Languages', 'Something went wrong'),
    svg.replace('Most Used Languages', '&private;'),
    svg.replace('<defs>', '<?test synthetic-private-name?><defs>'),
    '<!DOCTYPE svg [<!ENTITY private SYSTEM "file:///secret">]>' + svg,
    svg.slice(0, -15),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  ]) {
    assert.notEqual(changed, svg)
    assert.throws(() => validateLanguagesSvg(changed), /^Error: Invalid language SVG\.$/)
  }
})

test('passes the defined rank inputs to the exact upstream formula and renders the original stats design', () => {
  const metrics = {
    commits: 250, prs: 50, issues: 25, reviews: 2, stars: 50, followers: 10, contributedTo: 4, ownedRepos: 3,
  }
  const asOf = new Date('2027-01-01T00:00:00Z')
  const result = renderStats(metrics, asOf)
  assert.deepEqual(result.rank, calculateRank({ ...metrics, all_commits: false, repos: 3 }))
  assert.deepEqual(result.rank, { level: 'B+', percentile: 50 })
  assert.match(result.svg, /Total Commits \(2027\)/)
  assert.match(result.svg, /souruuu.+GitHub Stats/)
  assert.match(result.svg, /data-testid="rank-circle"/)
  assert.doesNotMatch(result.svg, /<a\b|github.com\//)
  assert.throws(() => renderStats({ ...metrics, commits: undefined }, asOf), /invalid aggregate/i)
})
