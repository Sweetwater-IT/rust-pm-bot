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

  const backendUrl = config === "local"
    ? process.env.NEXT_PUBLIC_BACKEND_LOCAL
    : process.env.NEXT_PUBLIC_BACKEND_HETZNER;

  const testLatency = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/latency`);
      if (!response.ok) throw new Error("Failed to fetch latency");
      const data = await response.json();
      setLatency(data.rtt_ms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
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

        {(latency !== null || error) && (
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
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
      </div>
    </div>
  );
}