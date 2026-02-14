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
  try {
    const url = 'https://gamma-api.polymarket.com/markets?active=true&limit=50&tags=crypto&order_by=created_at_desc';

    console.log('Edge scanning markets from:', url);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const markets: GammaMarket[] = await response.json();
    console.log(`Edge fetched ${markets.length} markets`);

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

    console.log(`Edge filtered to ${shortTermMarkets.length} short-term crypto markets`);

    const result: ScanResponse = {
      markets: shortTermMarkets,
      count: shortTermMarkets.length,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Edge scan failed:', error);
    return NextResponse.json(
      { error: 'Failed to scan markets' },
      { status: 500 }
    );
  }
}