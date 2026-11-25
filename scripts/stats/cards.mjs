import { deepStrictEqual } from 'node:assert/strict'
import { SaxesParser } from 'saxes'
import { CARD_STYLE, languageColors, loadCore } from './upstream.mjs'

const { getLongestLang, renderTopLanguages } = await loadCore('cards/top-languages.js')
const { measureText } = await loadCore('common/render.js')
const LANGUAGE_LIMIT = 8
// The prose entries come from the same Linguist v9.7.0 snapshot as our labels.
// Rich Text Format is a document format that Linguist classifies as markup.
const EXCLUDED_LANGUAGES = new Set([
  'AsciiDoc',
  'Creole',
  'Gemini',
  'Gettext Catalog',
  'Markdown',
  'Muse',
  'Org',
  'Pod',
  'Pod 6',
  'RDoc',
  'RMarkdown',
  'reStructuredText',
  'Rich Text Format',
  'Sweave',
  'Texinfo',
  'Text',
  'Textile',
  'Vim Help File',
  'Wikitext',
])

export function renderLanguages(bytes) {
  const entries = [...bytes]
  if (!entries.length || entries.some(([name, size]) => !Object.hasOwn(languageColors, name)
      || !Number.isSafeInteger(size) || size <= 0)
      || !Number.isSafeInteger(entries.reduce((sum, [, size]) => sum + size, 0))) {
    throw new Error('Invalid aggregate language metrics.')
  }
  const eligible = entries.filter(([name]) => !EXCLUDED_LANGUAGES.has(name))
  if (!eligible.length) throw new Error('No eligible language bytes to render.')

  eligible.sort(([a, left], [b, right]) => right - left || (a < b ? -1 : 1))
  const data = Object.fromEntries(eligible.map(([name, size]) => [
    name, { name, size, color: languageColors[name] },
  ]))
  return renderTopLanguages(data, { ...CARD_STYLE, layout: 'compact', langs_count: LANGUAGE_LIMIT })
}

const invalidSvg = () => new Error('Invalid language SVG.')

function parseSvg(svg) {
  if (typeof svg !== 'string' || Buffer.byteLength(svg) > 32_768) throw invalidSvg()
  const document = { children: [] }
  const stack = [document]
  const labels = []
  const bars = []
  let items
  const parser = new SaxesParser({ xmlns: true })
  const reject = () => { throw invalidSvg() }
  for (const event of ['doctype', 'processinginstruction', 'xmldecl', 'comment', 'cdata', 'error']) {
    parser.on(event, reject)
  }
  parser.on('opentag', (tag) => {
    if (tag.uri !== 'http://www.w3.org/2000/svg' || tag.prefix || stack.length > 15) reject()
    const attrs = Object.fromEntries(Object.values(tag.attributes).map(({ name, value }) => [name, value]))
    const node = { name: tag.name, attrs, children: [] }
    if (node.name === 'text' && attrs['data-testid'] === 'lang-name') labels.push(node)
    if (node.name === 'rect' && attrs['data-testid'] === 'lang-progress') bars.push(node)
    if (node.name === 'svg' && attrs['data-testid'] === 'lang-items') items = node
    stack.at(-1).children.push(node)
    stack.push(node)
  })
  parser.on('closetag', () => { stack.pop() })
  parser.on('text', (value) => { if (value.trim()) stack.at(-1).children.push(value.trim()) })
  parser.write(svg).close()
  return { document, labels, bars, items }
}

function describeLanguages(labels) {
  const names = new Set()
  const percentages = []
  for (const label of labels) {
    const match = label.children.length === 1 && typeof label.children[0] === 'string'
      && /^(.+) ((?:0|[1-9][0-9]{0,2})\.[0-9]{2})%$/.exec(label.children[0])
    if (!match || !Object.hasOwn(languageColors, match[1]) || EXCLUDED_LANGUAGES.has(match[1]) || names.has(match[1])
        || Number(match[2]) > 100) throw invalidSvg()
    names.add(match[1])
    percentages.push(Number(match[2]))
    label.children[0] = match[1]
  }
  if (names.size < 1 || names.size > LANGUAGE_LIMIT
      || Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 0.041
      || percentages.some((value, index) => index > 0 && value > percentages[index - 1])) throw invalidSvg()
  return { names: [...names], percentages }
}

function checkBars(bars, percentages) {
  if (bars.length !== percentages.length) throw invalidSvg()
  const span = CARD_STYLE.card_width - 50
  let offset = 0
  for (const [index, bar] of bars.entries()) {
    const displayWidth = Number(bar.attrs.width)
    const center = percentages[index] * span / 100
    // Compact layout rounds each bar to .01px and adds 10px to bars under
    // 10px. The label independently rounds to .01 percentage points.
    const width = displayWidth - (displayWidth - center > 5 ? 10 : 0)
    const rounded = Math.round(width * 100) / 100
    const padded = rounded < 10 ? rounded + 10 : rounded
    if (!Number.isFinite(displayWidth) || rounded < 0 || rounded > span
        || Math.abs(rounded - center) > 0.028 || bar.attrs.width !== String(padded)
        || bar.attrs.x !== String(offset)) throw invalidSvg()
    offset += rounded
    delete bar.attrs.x
    delete bar.attrs.width
  }
  if (Math.abs(offset - span) > 0.041) throw invalidSvg()
}

function checkColumnLayout(items, { names, percentages }) {
  if (names.length === 1) return
  const secondColumn = items?.children.at(-1)?.children?.[1]
  const { name } = getLongestLang(names.map((name) => ({ name })))
  const label = `${name} ${percentages[names.indexOf(name)].toFixed(2)}%`
  // The locked compact renderer positions the second column using the
  // longest name and its actual formatted percentage.
  const gap = Math.max(150, 20 + measureText(label, 11))
  if (secondColumn?.attrs?.transform !== `translate(${gap}, 0)`) throw invalidSvg()
  delete secondColumn.attrs.transform
}

export function validateLanguagesSvg(svg) {
  try {
    const actual = parseSvg(svg)
    const info = describeLanguages(actual.labels)
    checkBars(actual.bars, info.percentages)
    checkColumnLayout(actual.items, info)
    const expected = parseSvg(renderLanguages(new Map(
      info.names.map((name, index) => [name, info.names.length - index]),
    )))
    const reference = describeLanguages(expected.labels)
    checkBars(expected.bars, reference.percentages)
    checkColumnLayout(expected.items, reference)
    // Exact parsed structure, namespaces, CSS, colors and static text from
    // the locked renderer. Only checked percentages and their geometry vary.
    deepStrictEqual(actual.document, expected.document)
  } catch {
    // XML and assertion diagnostics can contain the input. Never forward them.
    throw invalidSvg()
  }
}
