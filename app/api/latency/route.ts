import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const startTime = performance.now();

    // Use Gamma API as a test endpoint to measure latency to Polymarket
    const response = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=1', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const endTime = performance.now();
    const rttMs = endTime - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Verify we got a valid response
    const data = await response.json();

    return NextResponse.json({
      rtt_ms: rttMs,
      endpoint: 'gamma-api.polymarket.com',
      note: 'Measured via HTTP request timing (not ICMP ping)'
    });
  } catch (error) {
    console.error('Edge latency measurement failed:', error);
    return NextResponse.json(
      { error: 'Failed to measure latency' },
      { status: 500 }
    );
  }
}