import { execFileSync } from 'node:child_process'
import {
  lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { validateLanguagesSvg } from './cards.mjs'

const FILE = 'languages.svg'
const DESTINATION = 'assets/stats/languages.svg'

export function publishLanguages(artifactDir, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const entries = readdirSync(artifactDir, { withFileTypes: true })
  if (entries.length !== 1 || entries[0].name !== FILE || !entries[0].isFile()) {
    throw new Error('Unexpected artifact contents.')
  }
  const source = join(artifactDir, FILE)
  if (lstatSync(source).size > 32_768) throw new Error('Invalid language SVG.')
  const bytes = readFileSync(source)
  validateLanguagesSvg(new TextDecoder('utf-8', { fatal: true }).decode(bytes))

  const stagedPaths = () => git('diff', '--cached', '--name-only', '--no-renames', '-z')
  if (stagedPaths()) throw new Error('The checkout already has staged changes.')
  if (git('status', '--porcelain=v1', '--untracked-files=all', '--', DESTINATION)) {
    throw new Error('The generated asset has local changes.')
  }
  for (const name of ['assets', 'assets/stats']) {
    const directory = join(cwd, name)
    const entry = lstatSync(directory, { throwIfNoEntry: false })
    if (entry && !entry.isDirectory()) throw new Error('Invalid generated asset directory.')
    if (!entry) mkdirSync(directory)
  }
  const destination = join(cwd, DESTINATION)
  const existing = lstatSync(destination, { throwIfNoEntry: false })
  if (existing && !existing.isFile()) throw new Error('Invalid generated asset destination.')
  if (existing && bytes.equals(readFileSync(destination))) return false
  writeFileSync(destination, bytes)
  git('add', '--', DESTINATION)
  const staged = stagedPaths()
  if (!staged) return false
  if (staged !== `${DESTINATION}\0`
      || !/^100644 [0-9a-f]+ 0\tassets\/stats\/languages\.svg\0$/.test(
        git('ls-files', '--stage', '-z', '--', DESTINATION),
      )
      || git('show', `:${DESTINATION}`) !== bytes.toString('utf8')) {
    throw new Error('Unexpected staged publish diff.')
  }
  git('-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', 'chore: refresh profile language statistics')
  return true
}

if (import.meta.main) {
  try {
    console.log(publishLanguages(process.argv[2]) ? 'Prepared language SVG commit.' : 'Language SVG is current.')
  } catch {
    console.error('Language publish preparation failed. Review the artifact, checkout and staged scope.')
    process.exitCode = 1
  }
}
