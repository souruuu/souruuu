import { validateLanguagesSvg } from './cards.mjs'
import { publishAsset } from './publish-asset.mjs'

export function publishLanguages(artifactDir, cwd = process.cwd()) {
  return publishAsset(artifactDir, {
    file: 'languages.svg',
    validate: validateLanguagesSvg,
    commitMessage: 'chore: refresh profile language statistics',
    oversizedMessage: 'Invalid language SVG.',
  }, cwd)
}

if (import.meta.main) {
  try {
    console.log(publishLanguages(process.argv[2]) ? 'Prepared language SVG commit.' : 'Language SVG is current.')
  } catch {
    console.error('Language publish preparation failed. Review the artifact, checkout and staged scope.')
    process.exitCode = 1
  }
}
