import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderLanguages, validateLanguagesSvg } from './cards.mjs'
import { CollectionError, collectLanguages, createGitHub, parseApprovedIds } from './collect.mjs'

try {
  const [mode, output] = process.argv.slice(2)
  if (mode !== 'verify' && (mode !== 'generate' || !output)) throw new Error('Invalid generation mode.')
  const api = createGitHub(process.env.STATS_READ_TOKEN)
  const approvedIds = parseApprovedIds(process.env.STATS_PRIVATE_REPOSITORY_IDS)
  const aggregate = await collectLanguages(api, approvedIds)
  const svg = renderLanguages(aggregate)
  validateLanguagesSvg(svg)
  if (mode === 'generate') {
    await mkdir(output)
    await writeFile(join(output, 'languages.svg'), svg, { flag: 'wx', mode: 0o600 })
  }
  console.log('Approved private language coverage and SVG validation passed.')
} catch (error) {
  console.error(error instanceof CollectionError ? error.message : 'Language SVG generation or validation failed.')
  process.exitCode = 1
}
