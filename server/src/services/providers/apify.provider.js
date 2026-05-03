'use strict';

/**
 * Apify Google Maps Scraper Provider
 *
 * Integrates with the Apify Google Maps Scraper actor to fetch business data
 * for a given search query. This provider is used by the sourcing worker.
 *
 * Uses the Apify MCP tool or REST API depending on availability.
 */

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass/crawler-google-places'; // Google Maps scraper actor

/**
 * Run Google Maps search via Apify API.
 *
 * @param {object} params
 * @param {string} params.query - Search query (e.g., "restaurants in Miami")
 * @param {number} [params.maxResults=100] - Max results to fetch
 * @param {string} [params.language='en'] - Language for results
 * @param {number} [params.maxCrawledPlacesPerSearch=100] - Places per search
 * @returns {Promise<{ runId: string, entities: Array }>}
 */
async function runGoogleMapsSearch({ query, maxResults = 100, language = 'en' }) {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN environment variable is not configured');
  }

  // Start the actor run
  const runResponse = await fetch(`${APIFY_BASE_URL}/acts/${ACTOR_ID}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: maxResults,
      language,
      includeWebResults: false,
      skipClosedPlaces: true,
    }),
  });

  if (!runResponse.ok) {
    const errorBody = await runResponse.text();
    throw new Error(`Apify actor start failed: ${runResponse.status} - ${errorBody}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data?.id;

  if (!runId) {
    throw new Error('Apify run did not return a run ID');
  }

  // Wait for run to complete (polling with backoff)
  const results = await waitForRunCompletion(runId, apiToken);

  // Transform Apify results to our standard entity format
  const entities = results.map(transformApifyResult);

  return { runId, entities };
}

/**
 * Poll Apify run until completion.
 * Max wait: 5 minutes with exponential backoff.
 */
async function waitForRunCompletion(runId, apiToken, maxWaitMs = 300000) {
  const startTime = Date.now();
  let delay = 5000; // Start with 5s polling

  while (Date.now() - startTime < maxWaitMs) {
    const statusResp = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    });

    if (!statusResp.ok) {
      throw new Error(`Failed to check run status: ${statusResp.status}`);
    }

    const statusData = await statusResp.json();
    const runStatus = statusData.data?.status;

    if (runStatus === 'SUCCEEDED') {
      // Fetch dataset items
      const datasetId = statusData.data?.defaultDatasetId;
      return fetchDatasetItems(datasetId, apiToken);
    }

    if (runStatus === 'FAILED' || runStatus === 'ABORTED' || runStatus === 'TIMED-OUT') {
      throw new Error(`Apify run ${runStatus}: ${statusData.data?.statusMessage || 'Unknown error'}`);
    }

    // Wait before next poll
    await sleep(delay);
    delay = Math.min(delay * 1.5, 30000); // Cap at 30s
  }

  throw new Error(`Apify run timed out after ${maxWaitMs / 1000}s`);
}

/**
 * Fetch all items from an Apify dataset.
 */
async function fetchDatasetItems(datasetId, apiToken) {
  const resp = await fetch(`${APIFY_BASE_URL}/datasets/${datasetId}/items?format=json`, {
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch dataset: ${resp.status}`);
  }

  return resp.json();
}

/**
 * Transform an Apify Google Maps result into our standard entity format.
 * Normalizes field names and extracts key data.
 */
function transformApifyResult(item) {
  return {
    // Identity
    name: item.title || item.searchString || 'Unknown',
    placeId: item.placeId || null,
    website: item.website || null,
    email: item.email || item.emails?.[0] || null,
    phone: item.phone || item.phoneUnformatted || null,

    // Location
    address: item.address || null,
    city: item.city || null,
    state: item.state || null,
    country: item.countryCode || null,
    postalCode: item.postalCode || null,
    latitude: item.location?.lat || null,
    longitude: item.location?.lng || null,

    // Business data
    category: item.categoryName || null,
    categories: item.categories || [],
    rating: item.totalScore || null,
    reviewCount: item.reviewsCount || 0,
    priceLevel: item.price || null,

    // Hours & status
    isOpen: !item.permanentlyClosed,
    openingHours: item.openingHours || null,

    // Social & web
    socialProfiles: item.socialProfiles || [],

    // Raw reference
    title: item.title,
    searchString: item.searchString,
    url: item.url,
    imageUrl: item.imageUrl || null,

    // Additional metadata from Apify
    claimThisBusiness: item.claimThisBusiness || false,
    isAdvertisement: item.isAdvertisement || false,
  };
}

/**
 * Utility: sleep for specified milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  runGoogleMapsSearch,
  transformApifyResult,
};
