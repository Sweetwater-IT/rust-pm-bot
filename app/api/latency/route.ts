import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] Edge latency request started`);

  try {
    const startTime = performance.now();
    console.log(`[${requestId}] Fetching from gamma-api.polymarket.com`);

    // Use Gamma API as a test endpoint to measure latency to Polymarket
    const response = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=1', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const endTime = performance.now();
    const rttMs = endTime - startTime;
    console.log(`[${requestId}] Fetch completed in ${rttMs.toFixed(2)}ms, status: ${response.status}`);

    if (!response.ok) {
      console.error(`[${requestId}] HTTP error: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Verify we got a valid response
    const data = await response.json();
    console.log(`[${requestId}] Response parsed successfully, markets count: ${Array.isArray(data) ? data.length : 'N/A'}`);

    const result = {
      rtt_ms: rttMs,
      endpoint: 'gamma-api.polymarket.com',
      note: 'Measured via HTTP request timing (not ICMP ping)'
    };

    console.log(`[${requestId}] Edge latency request completed successfully`);
    return NextResponse.json(result);

  } catch (error) {
    const err = error as Error;
    console.error(`[${requestId}] Edge latency measurement failed:`, {
      error: err.message,
      stack: err.stack,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      {
        error: 'Failed to measure latency',
        requestId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
