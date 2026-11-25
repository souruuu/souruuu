import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Core 2.3.1 only exports the fetch-and-render API. Resolve relative to its
// locked entry point to use the pure functions without loading its fetchers.
const require = createRequire(import.meta.url)
const build = dirname(require.resolve('@stats-organization/github-readme-stats-core'))

export const languageColors = Object.freeze({
  ...require('./linguist-labels.json'),
  ...require(join(build, 'common/languageColors.json')),
})

export const CARD_STYLE = Object.freeze({
  card_width: 495, border_radius: 10, bg_color: '161b22', title_color: 'ad91ff',
  text_color: 'e6edf3', border_color: '30363d', disable_animations: true,
})

export const loadCore = (file) => import(pathToFileURL(join(build, file)))
