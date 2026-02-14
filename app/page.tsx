"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Home() {
  const [config, setConfig] = useState("local");
  const [latency, setLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const getLatencyUrl = () => {
    if (config === "vercel-edge") {
      return "/api/latency";
    }
    const backendUrl = config === "local"
      ? process.env.NEXT_PUBLIC_BACKEND_LOCAL
      : process.env.NEXT_PUBLIC_BACKEND_HETZNER;
    return `${backendUrl}/api/latency`;
  };

  const testLatency = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = getLatencyUrl();
      console.log('Fetching from:', url);
      const response = await fetch(url);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      console.log('Response data:', data);
      setLatency(data.rtt_ms);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getScanUrl = () => {
    if (config === "vercel-edge") {
      return "/api/scan"; // For now, assume edge function will handle this too
    }
    const backendUrl = config === "local"
      ? process.env.NEXT_PUBLIC_BACKEND_LOCAL
      : process.env.NEXT_PUBLIC_BACKEND_HETZNER;
    return `${backendUrl}/api/scan`;
  };

  const scanMarkets = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const url = getScanUrl();
      console.log('Scanning markets from:', url);
      const response = await fetch(url);
      console.log('Scan response status:', response.status);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      console.log('Scan response data:', data);
      setMarkets(data.markets || []);
    } catch (err) {
      console.error('Scan error:', err);
      setScanError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Polymarket Arb Monitor</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Select your backend configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={config} onValueChange={setConfig}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vercel-edge">Vercel Edge</SelectItem>
                <SelectItem value="local">Local Internet</SelectItem>
                <SelectItem value="hetzner">Hetzner Server</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Test Latency</CardTitle>
            <CardDescription>Measure RTT to clob.polymarket.com</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={testLatency} disabled={loading}>
              {loading ? "Testing..." : "Test Latency"}
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Scan Markets</CardTitle>
            <CardDescription>Fetch active short-term crypto markets</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={scanMarkets} disabled={scanning}>
              {scanning ? "Scanning..." : "Scan Markets"}
            </Button>
          </CardContent>
        </Card>

        {(latency !== null || error) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Latency Result</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <p className="text-red-600">{error}</p>
              ) : (
                <p className="text-green-600">RTT: {latency?.toFixed(2)} ms</p>
              )}
            </CardContent>
          </Card>
        )}

        {(markets.length > 0 || scanError) && (
          <Card>
            <CardHeader>
              <CardTitle>Markets Found ({markets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {scanError ? (
                <p className="text-red-600">{scanError}</p>
              ) : (
                <div className="space-y-2">
                  {markets.map((market, index) => (
                    <div key={market.id} className="p-3 bg-gray-50 rounded">
                      <p className="font-medium">{market.question}</p>
                      <p className="text-sm text-gray-600">ID: {market.id}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}