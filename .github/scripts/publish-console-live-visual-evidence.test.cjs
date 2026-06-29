const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { _test } = require('./publish-console-live-visual-evidence.cjs')

test('prepares visual evidence manifest and raw screenshot URLs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'console-live-artifacts-'))
  const publishDir = fs.mkdtempSync(path.join(os.tmpdir(), 'console-live-publish-'))
  try {
    const screenshotDir = path.join(root, 'web', 'test-results', 'screenshots')
    fs.mkdirSync(screenshotDir, { recursive: true })
    fs.writeFileSync(path.join(screenshotDir, 'test-failed-1.png'), 'not-a-real-png-but-a-file')
    fs.writeFileSync(path.join(screenshotDir, 'notes.txt'), 'ignore')

    const manifest = _test.prepareVisualEvidence({
      artifactRoot: root,
      publishDir,
      repository: 'DavidDiaz0317/console',
      branch: 'console-live-visual-evidence',
      runId: '123',
      maxImages: 4,
      maxBytes: 1024,
    })

    assert.equal(manifest.imageCount, 1)
    assert.equal(manifest.images[0].sourcePath, 'web/test-results/screenshots/test-failed-1.png')
    assert.match(manifest.images[0].rawUrl, /raw\.githubusercontent\.com\/DavidDiaz0317\/console\/console-live-visual-evidence\/runs\/123/)
    assert.equal(fs.existsSync(path.join(root, 'visual-evidence-manifest.json')), true)
    assert.equal(fs.existsSync(path.join(publishDir, 'runs', '123', 'manifest.json')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(publishDir, { recursive: true, force: true })
  }
})

test('prioritizes failed screenshots over lower-signal images', () => {
  assert.ok(_test.imagePriority('web/test-results/test-failed-1.png') < _test.imagePriority('web/assets/logo.png'))
})
