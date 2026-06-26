#!/usr/bin/env node

import http from 'node:http'
import { Buffer } from 'node:buffer'
import { URL, URLSearchParams } from 'node:url'

const host = process.env.AUTH_DRIFT_FAKE_OAUTH_HOST || '127.0.0.1'
const port = Number(process.env.AUTH_DRIFT_FAKE_OAUTH_PORT || '4180')
const expectedClientId = process.env.GITHUB_CLIENT_ID || process.env.AUTH_DRIFT_FAKE_OAUTH_CLIENT_ID || 'auth-drift-client-id'
const expectedClientSecret =
  process.env.GITHUB_CLIENT_SECRET || process.env.AUTH_DRIFT_FAKE_OAUTH_CLIENT_SECRET || 'auth-drift-client-secret'
const issuedCodes = new Set()

const fakeUser = {
  id: Number(process.env.AUTH_DRIFT_FAKE_OAUTH_USER_ID || '424242'),
  login: process.env.AUTH_DRIFT_FAKE_OAUTH_USER_LOGIN || 'auth-drift-octocat',
  email: process.env.AUTH_DRIFT_FAKE_OAUTH_USER_EMAIL || 'auth-drift-octocat@example.com',
  avatar_url: process.env.AUTH_DRIFT_FAKE_OAUTH_USER_AVATAR || 'https://avatars.example.invalid/auth-drift-octocat.png',
}

const tokenValue = process.env.AUTH_DRIFT_FAKE_OAUTH_TOKEN || 'auth-drift-fake-gh-access-token'

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(body))
}

function writeError(response, statusCode, error, description) {
  writeJson(response, statusCode, {
    error,
    error_description: description,
  })
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function parseBasicAuth(header) {
  if (!header?.startsWith('Basic ')) return {}
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator === -1) return {}
  return {
    clientId: decoded.slice(0, separator),
    clientSecret: decoded.slice(separator + 1),
  }
}

function hasBearerToken(request) {
  return request.headers.authorization === `Bearer ${tokenValue}`
}

function logRequest(request, details = {}) {
  const message = {
    method: request.method,
    path: new URL(request.url, `http://${host}:${port}`).pathname,
    ...details,
  }
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`)

  if ((request.method === 'GET' || request.method === 'HEAD') && requestUrl.pathname === '/health') {
    logRequest(request)
    if (request.method === 'HEAD') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      })
      response.end()
      return
    }
    writeJson(response, 200, {
      status: 'ok',
      provider: 'fake-github-oauth',
      user: fakeUser.login,
    })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/login/oauth/authorize') {
    const clientId = requestUrl.searchParams.get('client_id')
    const redirectUri = requestUrl.searchParams.get('redirect_uri')
    const state = requestUrl.searchParams.get('state') || ''
    const scope = requestUrl.searchParams.get('scope') || ''

    logRequest(request, {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      has_state: !!state,
    })

    if (clientId !== expectedClientId) {
      writeError(response, 400, 'invalid_client', 'Unexpected client_id')
      return
    }
    if (!redirectUri) {
      writeError(response, 400, 'invalid_request', 'Missing redirect_uri')
      return
    }
    if (!state) {
      writeError(response, 400, 'invalid_request', 'Missing state')
      return
    }

    let callbackUrl
    try {
      callbackUrl = new URL(redirectUri)
    } catch {
      writeError(response, 400, 'invalid_request', 'Invalid redirect_uri')
      return
    }

    const code = `fake-code-${Date.now()}-${Math.random().toString(36).slice(2)}`
    issuedCodes.add(code)
    callbackUrl.searchParams.set('code', code)
    callbackUrl.searchParams.set('state', state)

    response.writeHead(302, {
      'Cache-Control': 'no-store',
      Location: callbackUrl.toString(),
    })
    response.end()
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/login/oauth/access_token') {
    const body = await readBody(request)
    const form = new URLSearchParams(body)
    const basicAuth = parseBasicAuth(request.headers.authorization)
    const clientId = form.get('client_id') || basicAuth.clientId || ''
    const clientSecret = form.get('client_secret') || basicAuth.clientSecret || ''
    const code = form.get('code') || ''

    logRequest(request, {
      client_id: clientId,
      has_client_secret: !!clientSecret,
      has_code: !!code,
      auth_style: request.headers.authorization?.startsWith('Basic ') ? 'basic' : 'params',
    })

    if (clientId !== expectedClientId || clientSecret !== expectedClientSecret) {
      writeError(response, 401, 'invalid_client', 'Unexpected client credentials')
      return
    }
    if (!issuedCodes.has(code)) {
      writeError(response, 400, 'bad_verification_code', 'Unknown or already-used code')
      return
    }

    issuedCodes.delete(code)
    writeJson(response, 200, {
      access_token: tokenValue,
      token_type: 'bearer',
      scope: 'user:email',
    })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v3/user') {
    logRequest(request, { authorized: hasBearerToken(request) })
    if (!hasBearerToken(request)) {
      writeError(response, 401, 'bad_credentials', 'Missing fake OAuth bearer token')
      return
    }
    writeJson(response, 200, fakeUser)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v3/user/emails') {
    logRequest(request, { authorized: hasBearerToken(request) })
    if (!hasBearerToken(request)) {
      writeError(response, 401, 'bad_credentials', 'Missing fake OAuth bearer token')
      return
    }
    writeJson(response, 200, [
      {
        email: fakeUser.email,
        primary: true,
        verified: true,
      },
    ])
    return
  }

  logRequest(request, { unmatched: true })
  writeError(response, 404, 'not_found', 'No fake provider route matched')
})

server.listen(port, host, () => {
  process.stdout.write(`Fake OAuth provider listening on http://${host}:${port}\n`)
})

function shutdown(signal) {
  process.stdout.write(`Fake OAuth provider received ${signal}, shutting down\n`)
  server.close(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
