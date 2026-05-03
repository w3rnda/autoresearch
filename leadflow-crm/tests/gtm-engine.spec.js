// @ts-check
/**
 * E2E test for the GTM Engine pipeline.
 *
 * Covers the full happy path:
 *   login → create workspace → ingest entities → verify dedup →
 *   promote entity → verify lead in CRM with GTM_ENGINE source.
 *
 * Run: npx playwright test gtm-engine
 *
 * Prerequisites:
 *   - Backend running at BACKEND_URL (default http://localhost:3001)
 *   - Frontend running at FRONTEND_URL (default http://localhost:5173)
 *   - Demo seed already loaded (admin@demo.com / password123)
 */

const { test, expect } = require('@playwright/test')
const { loginAs, apiRequest, sampleEntity } = require('./helpers')

test.describe('GTM Engine', () => {
  let workspaceId

  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test.afterEach(async ({ page }) => {
    if (workspaceId) {
      await apiRequest(page, 'DELETE', `/gtm/workspaces/${workspaceId}`)
      workspaceId = null
    }
  })

  test('creates a workspace via UI', async ({ page }) => {
    await page.goto('/gtm')
    await expect(page.getByRole('heading', { name: 'GTM Engine' })).toBeVisible()

    await page.getByRole('button', { name: /new workspace/i }).first().click()

    const wsName = `Playwright Test ${Date.now()}`
    await page.getByPlaceholder(/Miami Restaurants/i).fill(wsName)
    await page.getByPlaceholder(/Local restaurants with 4/i).fill(
      'Test ICP — restaurants with high ratings'
    )
    await page.getByPlaceholder(/restaurants in Miami FL/i).fill(
      'restaurants in test city'
    )

    await page.getByRole('button', { name: /create workspace/i }).click()

    await expect(page.getByRole('heading', { name: wsName })).toBeVisible({
      timeout: 5000,
    })

    // Capture ID for cleanup
    const { body } = await apiRequest(page, 'GET', '/gtm/workspaces')
    workspaceId = body.data.find((w) => w.name === wsName)?.id
  })

  test('ingest → dedup → promote → CRM lead', async ({ page }) => {
    // 1. Create workspace via API (faster)
    const wsName = `E2E Test ${Date.now()}`
    const { body: createRes } = await apiRequest(page, 'POST', '/gtm/workspaces', {
      name: wsName,
      icpNatural: 'Test businesses for E2E pipeline',
      sourcingConfig: { sources: ['google_maps'], queries: ['test query'] },
    })
    expect(createRes.success).toBe(true)
    workspaceId = createRes.data.id

    // 2. Ingest 3 sample entities
    const entities = [
      sampleEntity({ title: 'Alpha Corp', name: 'Alpha Corp' }),
      sampleEntity({ title: 'Beta Inc', name: 'Beta Inc' }),
      sampleEntity({ title: 'Gamma LLC', name: 'Gamma LLC' }),
    ]
    const { body: ingestRes } = await apiRequest(
      page,
      'POST',
      `/gtm/workspaces/${workspaceId}/ingest`,
      { query: 'test query', source: 'GOOGLE_MAPS', entities }
    )
    expect(ingestRes.success).toBe(true)
    expect(ingestRes.data.created).toBe(3)
    expect(ingestRes.data.duplicates).toBe(0)

    // 3. Verify dedup — re-ingesting same data should produce 0 created
    const { body: dedupRes } = await apiRequest(
      page,
      'POST',
      `/gtm/workspaces/${workspaceId}/ingest`,
      { query: 'test query', source: 'GOOGLE_MAPS', entities }
    )
    expect(dedupRes.data.created).toBe(0)
    expect(dedupRes.data.duplicates).toBe(3)

    // 4. List entities — should show 3
    const { body: listRes } = await apiRequest(
      page,
      'GET',
      `/gtm/workspaces/${workspaceId}/entities`
    )
    expect(listRes.data.length).toBe(3)

    // 5. Verify entities visible in UI
    await page.goto(`/gtm/${workspaceId}`)
    await expect(page.getByText('Alpha Corp')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Beta Inc')).toBeVisible()
    await expect(page.getByText('Gamma LLC')).toBeVisible()

    // 6. Promote first entity to a CRM Lead
    const alphaId = listRes.data.find((e) => e.name === 'Alpha Corp').id
    const { body: promoteRes } = await apiRequest(
      page,
      'POST',
      `/gtm/workspaces/${workspaceId}/entities/${alphaId}/promote`
    )
    expect(promoteRes.success).toBe(true)
    expect(promoteRes.data.source).toBe('GTM_ENGINE')

    // 7. Verify lead exists in CRM
    const { body: leadsRes } = await apiRequest(page, 'GET', '/leads?limit=50')
    const promotedLead = leadsRes.data.find(
      (l) => l.source === 'GTM_ENGINE' && l.company === 'Alpha Corp'
    )
    expect(promotedLead).toBeDefined()
    expect(promotedLead.customFields.gtmEntityId).toBe(alphaId)
  })

  test('workspace status breakdown reflects entity states', async ({ page }) => {
    const wsName = `Stats Test ${Date.now()}`
    const { body: created } = await apiRequest(page, 'POST', '/gtm/workspaces', {
      name: wsName,
      sourcingConfig: { sources: ['google_maps'], queries: ['x'] },
    })
    workspaceId = created.data.id

    // Ingest 5 entities
    const entities = Array.from({ length: 5 }, (_, i) =>
      sampleEntity({ name: `Co ${i}`, title: `Co ${i}` })
    )
    await apiRequest(page, 'POST', `/gtm/workspaces/${workspaceId}/ingest`, {
      query: 'x',
      entities,
    })

    // Verify breakdown
    const { body: detail } = await apiRequest(
      page,
      'GET',
      `/gtm/workspaces/${workspaceId}`
    )
    expect(detail.data.entityStatusBreakdown.NEW).toBe(5)
    expect(detail.data._count.entities).toBe(5)
  })

  test('rejects invalid workspace creation', async ({ page }) => {
    const { status, body } = await apiRequest(page, 'POST', '/gtm/workspaces', {
      // Missing required name
      icpNatural: 'no name',
    })
    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })

  test('rejects empty entity ingest', async ({ page }) => {
    const { body: created } = await apiRequest(page, 'POST', '/gtm/workspaces', {
      name: `Empty Test ${Date.now()}`,
    })
    workspaceId = created.data.id

    const { status } = await apiRequest(
      page,
      'POST',
      `/gtm/workspaces/${workspaceId}/ingest`,
      { entities: [] }
    )
    expect(status).toBe(400)
  })
})

test.describe('GTM Engine — workspace lifecycle', () => {
  let workspaceId

  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test.afterEach(async ({ page }) => {
    if (workspaceId) {
      await apiRequest(page, 'DELETE', `/gtm/workspaces/${workspaceId}`)
      workspaceId = null
    }
  })

  test('DRAFT → ACTIVE on activate', async ({ page }) => {
    const { body: created } = await apiRequest(page, 'POST', '/gtm/workspaces', {
      name: `Lifecycle ${Date.now()}`,
      sourcingConfig: { sources: ['google_maps'], queries: ['test'] },
    })
    workspaceId = created.data.id
    expect(created.data.status).toBe('DRAFT')

    const { body: activated } = await apiRequest(
      page,
      'POST',
      `/gtm/workspaces/${workspaceId}/activate`
    )
    expect(activated.data.status).toBe('ACTIVE')
  })

  test('cannot activate without sourcingConfig', async ({ page }) => {
    const { body: created } = await apiRequest(page, 'POST', '/gtm/workspaces', {
      name: `No Config ${Date.now()}`,
      // No sourcingConfig
    })
    workspaceId = created.data.id

    const { status } = await apiRequest(
      page,
      'POST',
      `/gtm/workspaces/${workspaceId}/activate`
    )
    expect(status).toBe(400)
  })
})
