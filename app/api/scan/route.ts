import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

interface GammaMarket {
  id: string;
  question: string;
  active: boolean;
  closed: boolean;
  market_slug: string;
  tags: string[];
  end_date_iso?: string;
}

interface MarketSummary {
  id: string;
  question: string;
  market_slug: string;
  tags: string[];
  end_date_iso?: string;
}

interface ScanResponse {
  markets: MarketSummary[];
  count: number;
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] Edge scan request started`);

  try {
    const url = 'https://gamma-api.polymarket.com/markets?active=true&limit=50&tags=crypto&order_by=created_at_desc';
    console.log(`[${requestId}] Scanning markets from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[${requestId}] Market API error: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const markets: GammaMarket[] = await response.json();
    console.log(`[${requestId}] Fetched ${markets.length} markets`);

    // Filter for short-duration crypto markets (5-min and 15-min BTC/ETH/SOL)
    const shortTermMarkets: MarketSummary[] = markets
      .filter(market => {
        return market.active && !market.closed &&
               market.tags.includes('crypto') &&
               (market.question.toLowerCase().includes('5 min') ||
                market.question.toLowerCase().includes('15 min') ||
                market.question.toLowerCase().includes('5-min') ||
                market.question.toLowerCase().includes('15-min'));
      })
      .map(market => ({
        id: market.id,
        question: market.question,
        market_slug: market.market_slug,
        tags: market.tags,
        end_date_iso: market.end_date_iso,
      }));

    console.log(`[${requestId}] Filtered to ${shortTermMarkets.length} short-term crypto markets`);

    const result: ScanResponse = {
      markets: shortTermMarkets,
      count: shortTermMarkets.length,
    };

    console.log(`[${requestId}] Edge scan request completed successfully`);
    return NextResponse.json(result);

  } catch (error) {
    const err = error as Error;
    console.error(`[${requestId}] Edge scan failed:`, {
      error: err.message,
      stack: err.stack,
      url: request.url,
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      {
        error: 'Failed to scan markets',
        requestId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
