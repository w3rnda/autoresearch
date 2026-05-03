// @ts-check
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001'

/**
 * Login via the API and inject auth state into localStorage.
 * Faster and more reliable than UI-based login for E2E setup.
 */
async function loginAs(page, { email = 'admin@demo.com', password = 'password123' } = {}) {
  const res = await page.request.post(`${BACKEND}/api/v1/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`)
  }

  const body = await res.json()
  const tokens = body.data

  await page.goto('/')

  await page.evaluate((authState) => {
    localStorage.setItem('leadflow-auth', JSON.stringify({
      state: {
        accessToken: authState.accessToken,
        refreshToken: authState.refreshToken,
        user: authState.user,
        isAuthenticated: true,
      },
      version: 0,
    }))
  }, tokens)

  return tokens
}

/**
 * Authenticated API request helper.
 */
async function apiRequest(page, method, path, data = null) {
  const auth = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('leadflow-auth') || '{}')
    return stored.state?.accessToken
  })

  const res = await page.request[method.toLowerCase()](`${BACKEND}/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
    },
    ...(data && { data }),
  })

  return { status: res.status(), body: await res.json() }
}

/**
 * Generate sample entity for ingest tests.
 */
function sampleEntity(overrides = {}) {
  const id = Math.random().toString(36).slice(2, 10)
  return {
    title: `Test Business ${id}`,
    name: `Test Business ${id}`,
    placeId: `ChIJ_test_${id}`,
    website: `https://test-${id}.example.com`,
    phone: `+1 555 ${id.slice(0, 4)}`,
    address: '123 Test St',
    city: 'Test City',
    state: 'TS',
    country: 'US',
    categoryName: 'Test Category',
    totalScore: 4.5,
    reviewsCount: 100,
    ...overrides,
  }
}

module.exports = { loginAs, apiRequest, sampleEntity, BACKEND }
