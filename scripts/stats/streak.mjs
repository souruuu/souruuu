import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { publishAsset } from './publish-asset.mjs'
import { collectStreak, StreakError } from './streak-calendar.mjs'
import { renderStreak, validateStreakSvg } from './streak-card.mjs'

const FILE = 'streak.svg'

export function publishStreak(artifactDir, cwd = process.cwd()) {
  return publishAsset(artifactDir, {
    file: FILE,
    validate: validateStreakSvg,
    commitMessage: 'chore: refresh profile contribution streak',
    oversizedMessage: 'Invalid streak SVG.',
  }, cwd)
}

if (import.meta.main) {
  const token = process.env.STREAK_READ_TOKEN
  delete process.env.STREAK_READ_TOKEN
  const [mode, path] = process.argv.slice(2)
  try {
    if (mode === 'publish' && path) {
      console.log(publishStreak(path) ? 'Prepared streak SVG commit.' : 'Streak SVG is current.')
    } else {
      if (mode !== 'verify' && (mode !== 'generate' || !path)) throw new Error('Invalid streak mode.')
      const { stats, today } = await collectStreak(token, new Date())
      const svg = renderStreak(stats, today)
      validateStreakSvg(svg)
      if (mode === 'generate') {
        await mkdir(path)
        await writeFile(join(path, FILE), svg, { flag: 'wx', mode: 0o600 })
      }
      console.log('Full account calendar coverage and streak SVG validation passed.')
    }
  } catch (error) {
    // Never print renderer, filesystem or API diagnostics that may contain input.
    console.error(error instanceof StreakError ? `Streak collection failed (${error.message}).` : 'Streak operation failed.')
    process.exitCode = 1
  }
}
