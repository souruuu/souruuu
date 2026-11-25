import { execFileSync } from 'node:child_process'
import {
  lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export function publishAsset(artifactDir, { file, validate, commitMessage, oversizedMessage }, cwd = process.cwd()) {
  if (!/^[a-z]+\.svg$/.test(file)) throw new Error('Invalid generated asset name.')
  const destinationPath = 'assets/stats/' + file
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const entries = readdirSync(artifactDir, { withFileTypes: true })
  if (entries.length !== 1 || entries[0].name !== file || !entries[0].isFile()) {
    throw new Error('Unexpected artifact contents.')
  }
  const source = join(artifactDir, file)
  if (lstatSync(source).size > 32_768) throw new Error(oversizedMessage)
  const bytes = readFileSync(source)
  validate(new TextDecoder('utf-8', { fatal: true }).decode(bytes))

  const stagedPaths = () => git('diff', '--cached', '--name-only', '--no-renames', '-z')
  if (stagedPaths()) throw new Error('The checkout already has staged changes.')
  if (git('status', '--porcelain=v1', '--untracked-files=all', '--', destinationPath)) {
    throw new Error('The generated asset has local changes.')
  }
  for (const name of ['assets', 'assets/stats']) {
    const directory = join(cwd, name)
    const entry = lstatSync(directory, { throwIfNoEntry: false })
    if (entry && !entry.isDirectory()) throw new Error('Invalid generated asset directory.')
    if (!entry) mkdirSync(directory)
  }
  const destination = join(cwd, destinationPath)
  const existing = lstatSync(destination, { throwIfNoEntry: false })
  if (existing && !existing.isFile()) throw new Error('Invalid generated asset destination.')
  if (existing && bytes.equals(readFileSync(destination))) return false
  writeFileSync(destination, bytes)
  git('add', '--', destinationPath)
  const staged = stagedPaths()
  if (!staged) return false
  if (staged !== `${destinationPath}\0`
      || !/^100644 [0-9a-f]+ 0$/.test(
        git('ls-files', '--stage', '-z', '--', destinationPath).split('\t')[0],
      )
      || git('show', `:${destinationPath}`) !== bytes.toString('utf8')) {
    throw new Error('Unexpected staged publish diff.')
  }
  git('-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', commitMessage)
  return true
}
