import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

let CollectionError
try {
  const token = process.env.STATS_READ_TOKEN
  const inventory = process.env.STATS_PRIVATE_REPOSITORY_IDS
  delete process.env.STATS_READ_TOKEN
  delete process.env.STATS_PRIVATE_REPOSITORY_IDS

  const [mode, output] = process.argv.slice(2)
  if (mode !== 'verify' && (mode !== 'generate' || !output)) throw new Error('Invalid generation mode.')
  const collector = await import('./collect.mjs')
  CollectionError = collector.CollectionError
  const api = collector.createGitHub(token)
  const aggregate = await collector.collectLanguages(api, collector.parseApprovedIds(inventory))
  const { renderLanguages, validateLanguagesSvg } = await import('./cards.mjs')
  const svg = renderLanguages(aggregate)
  validateLanguagesSvg(svg)
  if (mode === 'generate') {
    await mkdir(output)
    await writeFile(join(output, 'languages.svg'), svg, { flag: 'wx', mode: 0o600 })
  }
  console.log('Approved private language coverage and SVG validation passed.')
} catch (error) {
  console.error(CollectionError && error instanceof CollectionError
    ? error.message : 'Language SVG generation or validation failed.')
  process.exitCode = 1
}
