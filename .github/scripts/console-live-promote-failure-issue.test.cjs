const test = require('node:test')
const assert = require('node:assert/strict')
const { _test } = require('./console-live-promote-failure-issue.cjs')

function classify(liveUiFailures, logText = '') {
  return _test.classifyFailure({
    failures: [],
    evidenceItems: [],
    liveUiFailures,
    logText,
  })
}

test('classifies dashboard mismatches before generic network failures', () => {
  assert.equal(classify({
    dashboardMismatches: [{
      field: 'dashboard-namespaces-total',
      expected: 16,
      actual: 0,
      route: '/',
    }],
    unexpectedNetworkResponses: ['GET /api/agent/auto-update/status 502'],
  }), 'dashboard-groundtruth-mismatch')
})

test('classifies API/UI mismatches as UI/API evidence', () => {
  assert.equal(classify({
    apiUiMismatches: [{
      route: '/deployments',
      field: 'deployments-total',
      expected: 4,
      actual: 0,
      reason: 'mismatch',
    }],
  }), 'ui-api-mismatch')
})

test('classifies rate limits as live data loss', () => {
  assert.equal(classify({
    networkClassifications: [{
      classification: 'live-rate-limit-data-loss',
      status: 429,
      url: '/api/namespaces?cluster=ks-console-ci-1',
    }],
  }), 'live-rate-limit-data-loss')
})

test('classifies raw GET 429 API responses as live data loss', () => {
  assert.equal(classify({
    unexpectedNetworkResponses: [
      'GET 429 http://127.0.0.1:18080/api/mcp/clusters',
      'GET 401 http://127.0.0.1:18080/api/mcp/gpu-nodes/stream',
    ],
  }), 'live-rate-limit-data-loss')
})

test('classifies structured rate limit evidence as live data loss', () => {
  assert.equal(_test.classifyFailure({
    failures: [],
    evidenceItems: [{
      network: {
        rateLimitEvents: [{
          method: 'GET',
          status: 429,
          url: 'http://127.0.0.1:18080/api/mcp/pods',
          retryAfter: '60',
        }],
      },
    }],
    liveUiFailures: {},
    logText: '',
  }), 'live-rate-limit-data-loss')
})

test('prioritizes rate-limit data loss over secondary text-collision evidence', () => {
  assert.equal(classify({
    textCollisions: [{
      first: 'Press Ctrl+K to search dashboards, cards, clusters, and more',
      second: 'This project is fully autonomous — maintained by AI agents.',
      ratio: 0.9,
    }],
    unexpectedNetworkResponses: [
      'GET 429 http://127.0.0.1:18080/api/mcp/clusters',
    ],
  }, 'Error: live UI visible text must not severely overlap'), 'live-rate-limit-data-loss')
})

test('classifies browser semantic field mismatches distinctly', () => {
  assert.equal(classify({
    browserMatrixFailures: [{
      classification: 'browser-semantic-field-mismatch',
      route: '/nodes',
      reason: 'route semantic fields do not match expected live data',
    }],
  }), 'browser-semantic-field-mismatch')
})

test('keeps canary setup as fallback when no parsed product evidence exists', () => {
  assert.equal(classify({}, 'canary browser matrix port-forward did not become healthy'), 'canary-setup')
})

test('prioritizes canary setup over product-looking log noise', () => {
  assert.equal(classify({}, 'Candidate image is not available in GHCR: ghcr.io/daviddiaz0317/console:missing\nGET 429 /api/mcp/pods'), 'canary-setup')
})

test('does not let unexecuted canary setup command text override parsed network evidence', () => {
  assert.equal(classify({
    unexpectedNetworkResponses: [
      'GET 401 http://127.0.0.1:18080/api/mcp/gpu-nodes/stream',
    ],
  }, [
    'echo "::error::Canary browser matrix port-forward did not become healthy"',
    'echo "::error::Candidate image is not available in GHCR: $candidate_image"',
  ].join('\n')), 'live-network-error')
})
