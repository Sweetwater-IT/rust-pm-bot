"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LatencyResult {
  rtt_ms: number | null;
  error: string | null;
  loading: boolean;
}

interface ScanResult {
  markets: any[];
  count: number;
  error: string | null;
  loading: boolean;
}

export default function Home() {
  const [latencyResults, setLatencyResults] = useState<{
    vercel: LatencyResult;
    local: LatencyResult;
    hetzner: LatencyResult;
  }>({
    vercel: { rtt_ms: null, error: null, loading: false },
    local: { rtt_ms: null, error: null, loading: false },
    hetzner: { rtt_ms: null, error: null, loading: false },
  });

  const [latencyProgress, setLatencyProgress] = useState<{
    current: number;
    total: number;
    currentBackend: 'vercel' | 'local' | 'hetzner' | null;
    testing: boolean;
  }>({
    current: 0,
    total: 3,
    currentBackend: null,
    testing: false,
  });

  const [scanResults, setScanResults] = useState<{
    vercel: ScanResult;
    local: ScanResult;
    hetzner: ScanResult;
  }>({
    vercel: { markets: [], count: 0, error: null, loading: false },
    local: { markets: [], count: 0, error: null, loading: false },
    hetzner: { markets: [], count: 0, error: null, loading: false },
  });

  const [expandedAccordions, setExpandedAccordions] = useState<{
    vercel: boolean;
    local: boolean;
    hetzner: boolean;
  }>({
    vercel: false,
    local: false,
    hetzner: false,
  });

  const getLatencyUrl = (backend: 'vercel' | 'local' | 'hetzner') => {
    if (backend === "vercel") {
      return "/api/latency";
    }
    return backend === "local"
      ? process.env.NEXT_PUBLIC_BACKEND_LOCAL || "http://localhost:8080/api/latency"
      : `${process.env.NEXT_PUBLIC_BACKEND_HETZNER || "https://your-hetzner-server.com"}/api/latency`;
  };

  const getScanUrl = (backend: 'vercel' | 'local' | 'hetzner') => {
    if (backend === "vercel") {
      return "/api/scan";
    }
    return backend === "local"
      ? (process.env.NEXT_PUBLIC_BACKEND_LOCAL || "http://localhost:8080/api/latency").replace('/api/latency', '/api/scan')
      : `${process.env.NEXT_PUBLIC_BACKEND_HETZNER || "https://your-hetzner-server.com"}/api/scan`;
  };

  const testLatency = async () => {
    // Reset all results and progress
    setLatencyResults({
      vercel: { rtt_ms: null, error: null, loading: false },
      local: { rtt_ms: null, error: null, loading: false },
      hetzner: { rtt_ms: null, error: null, loading: false },
    });

    setLatencyProgress({
      current: 0,
      total: 3,
      currentBackend: null,
      testing: true,
    });

    // Test backends sequentially: vercel → local → hetzner
    const backends: ('vercel' | 'local' | 'hetzner')[] = ['vercel', 'local', 'hetzner'];

    for (let i = 0; i < backends.length; i++) {
      const backend = backends[i];

      // Update progress
      setLatencyProgress(prev => ({
        ...prev,
        current: i + 1,
        currentBackend: backend,
      }));

      // Set loading state for current backend
      setLatencyResults(prev => ({
        ...prev,
        [backend]: { ...prev[backend], loading: true }
      }));

      try {
        const url = getLatencyUrl(backend);
        console.log(`Testing latency from ${backend}:`, url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();

        // Update result for this backend
        setLatencyResults(prev => ({
          ...prev,
          [backend]: { rtt_ms: data.rtt_ms, error: null, loading: false }
        }));
      } catch (err) {
        console.error(`Latency error for ${backend}:`, err);

        // Update error for this backend
        setLatencyResults(prev => ({
          ...prev,
          [backend]: {
            rtt_ms: null,
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false
          }
        }));
      }

      // Small delay between tests to avoid interference
      if (i < backends.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Complete progress
    setLatencyProgress(prev => ({
      ...prev,
      testing: false,
      currentBackend: null,
    }));
  };

  const scanMarkets = async () => {
    // Reset all results
    setScanResults({
      vercel: { markets: [], count: 0, error: null, loading: true },
      local: { markets: [], count: 0, error: null, loading: true },
      hetzner: { markets: [], count: 0, error: null, loading: true },
    });

    // Scan all backends simultaneously
    const backends: ('vercel' | 'local' | 'hetzner')[] = ['vercel', 'local', 'hetzner'];

    const promises = backends.map(async (backend) => {
      try {
        const url = getScanUrl(backend);
        console.log(`Scanning markets from ${backend}:`, url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        return { backend, markets: data.markets || [], count: data.count || 0, error: null };
      } catch (err) {
        console.error(`Scan error for ${backend}:`, err);
        return { backend, markets: [], count: 0, error: err instanceof Error ? err.message : "Unknown error" };
      }
    });

    const results = await Promise.all(promises);

    setScanResults(prev => ({
      vercel: { ...prev.vercel, loading: false },
      local: { ...prev.local, loading: false },
      hetzner: { ...prev.hetzner, loading: false },
      ...Object.fromEntries(results.map(r => [r.backend, { markets: r.markets, count: r.count, error: r.error, loading: false }]))
    }));
  };

  const toggleAccordion = (backend: 'vercel' | 'local' | 'hetzner') => {
    setExpandedAccordions(prev => ({
      ...prev,
      [backend]: !prev[backend]
    }));
  };

  const getBackendDisplayName = (backend: 'vercel' | 'local' | 'hetzner') => {
    switch (backend) {
      case 'vercel': return 'Vercel Edge';
      case 'local': return 'Local';
      case 'hetzner': return 'Hetzner';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Polymarket Arb Monitor</h1>

        {/* Header with endpoint info */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>Current API endpoints being tested</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Latency Testing:</strong>
                <div className="mt-1 space-y-1">
                  <div>Vercel Edge: {getLatencyUrl('vercel')}</div>
                  <div>Local: {getLatencyUrl('local')}</div>
                  <div>Hetzner: {getLatencyUrl('hetzner')}</div>
                </div>
              </div>
              <div>
                <strong>Market Scanning:</strong>
                <div className="mt-1 space-y-1">
                  <div>Vercel Edge: {getScanUrl('vercel')}</div>
                  <div>Local: {getScanUrl('local')}</div>
                  <div>Hetzner: {getScanUrl('hetzner')}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Latency Testing Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Test Latency</CardTitle>
            <CardDescription>Measure RTT to clob.polymarket.com across all backends</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={testLatency}
              disabled={latencyProgress.testing}
              className="mb-6"
            >
              {latencyProgress.testing
                ? `Testing ${getBackendDisplayName(latencyProgress.currentBackend!)} (${latencyProgress.current}/${latencyProgress.total})`
                : "Test All Latencies"
              }
            </Button>

            {latencyProgress.testing && (
              <div className="mb-6">
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(latencyProgress.current / latencyProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 text-center">
                  Testing {getBackendDisplayName(latencyProgress.currentBackend!)} ({latencyProgress.current}/{latencyProgress.total})
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['vercel', 'local', 'hetzner'] as const).map((backend) => (
                <Card key={backend} className="border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{getBackendDisplayName(backend)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {latencyResults[backend].loading ? (
                      <p className="text-gray-500">Testing...</p>
                    ) : latencyResults[backend].error ? (
                      <p className="text-red-600 text-sm">{latencyResults[backend].error}</p>
                    ) : latencyResults[backend].rtt_ms !== null ? (
                      <p className="text-green-600 font-medium">
                        {latencyResults[backend].rtt_ms?.toFixed(2)} ms
                      </p>
                    ) : (
                      <p className="text-gray-400">Not tested</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Market Scanning Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Scan Markets</CardTitle>
            <CardDescription>Fetch all BTC/ETH 5-min markets across all backends</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={scanMarkets}
              disabled={scanResults.vercel.loading || scanResults.local.loading || scanResults.hetzner.loading}
              className="mb-6"
            >
              {scanResults.vercel.loading ? "Scanning..." : "Scan All Markets"}
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['vercel', 'local', 'hetzner'] as const).map((backend) => (
                <Card key={backend} className="border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{getBackendDisplayName(backend)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scanResults[backend].loading ? (
                      <p className="text-gray-500">Scanning...</p>
                    ) : scanResults[backend].error ? (
                      <p className="text-red-600 text-sm">{scanResults[backend].error}</p>
                    ) : (
                      <p className="text-blue-600 font-medium">
                        {scanResults[backend].count} markets found
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Results Accordions */}
        <div className="space-y-4">
          {(['vercel', 'local', 'hetzner'] as const).map((backend) => (
            <Card key={backend}>
              <CardHeader
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleAccordion(backend)}
              >
                <CardTitle className="flex items-center justify-between">
                  <span>{getBackendDisplayName(backend)} Markets ({scanResults[backend].count})</span>
                  <span className="text-xl">{expandedAccordions[backend] ? '▼' : '▶'}</span>
                </CardTitle>
              </CardHeader>
              {expandedAccordions[backend] && (
                <CardContent>
                  {scanResults[backend].error ? (
                    <p className="text-red-600">{scanResults[backend].error}</p>
                  ) : scanResults[backend].markets.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {scanResults[backend].markets.map((market) => (
                        <div key={market.id} className="p-3 bg-gray-50 rounded border">
                          <p className="font-medium">{market.question}</p>
                          <p className="text-sm text-gray-600">ID: {market.id}</p>
                          {market.end_date_iso && (
                            <p className="text-sm text-gray-500">
                              Ends: {new Date(market.end_date_iso).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No markets found</p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
