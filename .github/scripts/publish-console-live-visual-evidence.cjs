const fs = require('fs')
const os = require('os')
const path = require('path')

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|webp)$/i
const DEFAULT_BRANCH = 'console-live-visual-evidence'
const DEFAULT_MAX_IMAGES = 12
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return [fullPath]
  })
}

function sanitizePathSegment(value) {
  const cleaned = String(value || '')
    .replace(/^[A-Za-z]:/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'artifact'
}

function normalizeRelativePath(file, root) {
  return path.relative(root, file).split(path.sep).map(sanitizePathSegment).join('/')
}

function imagePriority(file) {
  const normalized = file.replace(/\\/g, '/').toLowerCase()
  let score = 100
  if (/test-failed|failure|failed|error-context/.test(normalized)) score -= 60
  if (/macos-popup|browser-matrix|visual-login-intensive/.test(normalized)) score -= 25
  if (/screenshots?/.test(normalized)) score -= 20
  if (/trace|video|baseline|expected|actual/.test(normalized)) score += 10
  return score
}

function collectImages({ artifactRoot, maxImages = DEFAULT_MAX_IMAGES, maxBytes = DEFAULT_MAX_BYTES }) {
  const root = path.resolve(artifactRoot)
  const candidates = walk(root)
    .filter((file) => IMAGE_EXTENSION_PATTERN.test(file))
    .map((file) => {
      const stat = fs.statSync(file)
      return {
        file,
        size: stat.size,
        relativePath: normalizeRelativePath(file, root),
        priority: imagePriority(file),
      }
    })
    .filter((candidate) => candidate.size > 0 && candidate.size <= maxBytes)
    .sort((left, right) => left.priority - right.priority || left.relativePath.localeCompare(right.relativePath))

  return candidates.slice(0, maxImages)
}

function rawUrlFor({ repository, branch, publishedPath }) {
  return `https://raw.githubusercontent.com/${repository}/${branch}/${publishedPath}`
}

function prepareVisualEvidence({
  artifactRoot,
  publishDir,
  repository,
  branch,
  runId,
  maxImages = DEFAULT_MAX_IMAGES,
  maxBytes = DEFAULT_MAX_BYTES,
}) {
  const sourceRoot = path.resolve(artifactRoot)
  const outputRoot = path.resolve(publishDir)
  const runPath = `runs/${sanitizePathSegment(runId)}`
  const runDir = path.join(outputRoot, runPath)
  fs.mkdirSync(runDir, { recursive: true })

  const images = collectImages({ artifactRoot: sourceRoot, maxImages, maxBytes }).map((image, index) => {
    const publishedPath = `${runPath}/${String(index + 1).padStart(2, '0')}-${image.relativePath}`
    const destination = path.join(outputRoot, ...publishedPath.split('/'))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(image.file, destination)
    return {
      label: path.basename(image.relativePath),
      sourcePath: image.relativePath,
      publishedPath,
      sizeBytes: image.size,
      rawUrl: rawUrlFor({ repository, branch, publishedPath }),
    }
  })

  const manifestPath = `${runPath}/manifest.json`
  const readmePath = `${runPath}/README.md`
  const manifest = {
    generatedAt: new Date().toISOString(),
    repository,
    branch,
    runId: String(runId),
    imageCount: images.length,
    manifestPath,
    manifestRawUrl: rawUrlFor({ repository, branch, publishedPath: manifestPath }),
    readmeRawUrl: rawUrlFor({ repository, branch, publishedPath: readmePath }),
    images,
  }

  fs.writeFileSync(path.join(outputRoot, ...manifestPath.split('/')), `${JSON.stringify(manifest, null, 2)}\n`)
  fs.writeFileSync(
    path.join(outputRoot, ...readmePath.split('/')),
    [
      `# Console Live Visual Evidence for Run ${runId}`,
      '',
      'These images are copied from sanitized GitHub Actions artifacts so issue-fixing agents can view failures without downloading artifact zips.',
      '',
      ...images.flatMap((image, index) => [
        `## ${index + 1}. ${image.label}`,
        '',
        `Source artifact path: \`${image.sourcePath}\``,
        '',
        `![${image.label}](${image.rawUrl})`,
        '',
      ]),
    ].join('\n')
  )

  const artifactManifestPath = path.join(sourceRoot, 'visual-evidence-manifest.json')
  fs.mkdirSync(path.dirname(artifactManifestPath), { recursive: true })
  fs.writeFileSync(artifactManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return manifest
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function main() {
  const artifactRoot = process.env.ARTIFACT_ROOT || 'console-live-promote-artifacts'
  const repository = process.env.GITHUB_REPOSITORY || 'DavidDiaz0317/console'
  const branch = process.env.VISUAL_EVIDENCE_BRANCH || DEFAULT_BRANCH
  const runId = process.env.SOURCE_RUN_ID || process.env.GITHUB_RUN_ID || 'local'
  const publishDir = process.env.VISUAL_EVIDENCE_PUBLISH_DIR
    || path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'console-live-visual-evidence-publish')
  const maxImages = numberFromEnv('VISUAL_EVIDENCE_MAX_IMAGES', DEFAULT_MAX_IMAGES)
  const maxBytes = numberFromEnv('VISUAL_EVIDENCE_MAX_BYTES', DEFAULT_MAX_BYTES)

  const manifest = prepareVisualEvidence({
    artifactRoot,
    publishDir,
    repository,
    branch,
    runId,
    maxImages,
    maxBytes,
  })

  console.log(`Prepared ${manifest.imageCount} visual evidence image(s) in ${publishDir}`)
  console.log(`Manifest: ${path.join(artifactRoot, 'visual-evidence-manifest.json')}`)
}

if (require.main === module) {
  main()
}

module.exports = {
  _test: {
    collectImages,
    imagePriority,
    normalizeRelativePath,
    prepareVisualEvidence,
    sanitizePathSegment,
  },
}
