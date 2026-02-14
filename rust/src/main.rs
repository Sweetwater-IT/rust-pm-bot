use axum::{routing::get, Router};
use tower_http::cors::CorsLayer;
use serde::{Serialize, Deserialize};
use reqwest::Client;

#[derive(Serialize)]
struct LatencyResponse {
    rtt_ms: f64,
}

#[derive(Deserialize, Debug)]
struct GammaMarket {
    id: String,
    question: String,
    active: bool,
    closed: bool,
    market_slug: String,
    tags: Vec<String>,
    end_date_iso: Option<String>,
}

#[derive(Serialize)]
struct MarketSummary {
    id: String,
    question: String,
    market_slug: String,
    tags: Vec<String>,
    end_date_iso: Option<String>,
}

#[derive(Serialize)]
struct ScanResponse {
    markets: Vec<MarketSummary>,
    count: usize,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_default_env().filter_level(log::LevelFilter::Info).init();

    let app = Router::new()
        .route("/api/latency", get(latency_handler))
        .route("/api/scan", get(scan_handler))
        .layer(CorsLayer::permissive()); // Allow all origins for dev

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    log::info!("Server running on http://0.0.0.0:8080");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn latency_handler() -> Result<axum::Json<LatencyResponse>, axum::http::StatusCode> {
    match measure_rtt().await {
        Ok(rtt_ms) => Ok(axum::Json(LatencyResponse { rtt_ms })),
        Err(e) => {
            log::error!("Latency measurement failed: {}", e);
            Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn measure_rtt() -> anyhow::Result<f64> {
    let output = tokio::process::Command::new("ping")
        .args(&["-c", "10", "clob.polymarket.com"])
        .output()
        .await?;

    let stdout = String::from_utf8(output.stdout)?;
    log::debug!("Ping stdout: {}", stdout);

    let rtt_line = stdout.lines()
        .find(|line| line.contains("round-trip min/avg/max"))
        .ok_or_else(|| anyhow::anyhow!("RTT line not found in ping output"))?;

    let parts: Vec<&str> = rtt_line.split(" = ").nth(1)
        .ok_or_else(|| anyhow::anyhow!("Invalid RTT format"))?
        .split('/')
        .collect();

    let avg_rtt: f64 = parts.get(1)
        .ok_or_else(|| anyhow::anyhow!("Avg RTT not found"))?
        .parse()?;

    Ok(avg_rtt)
}

async fn scan_handler() -> Result<axum::Json<ScanResponse>, axum::http::StatusCode> {
    match scan_markets().await {
        Ok(response) => Ok(axum::Json(response)),
        Err(e) => {
            log::error!("Market scan failed: {}", e);
            Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn scan_markets() -> anyhow::Result<ScanResponse> {
    let client = Client::new();
    let url = "https://gamma-api.polymarket.com/markets?active=true&limit=50&tags=crypto&order_by=created_at_desc";

    log::info!("Fetching markets from: {}", url);
    let response = client.get(url).send().await?;
    let markets: Vec<GammaMarket> = response.json().await?;

    log::info!("Fetched {} markets", markets.len());

    // Filter for short-duration crypto markets (5-min and 15-min BTC/ETH/SOL)
    let short_term_markets: Vec<MarketSummary> = markets
        .into_iter()
        .filter(|market| {
            market.active && !market.closed &&
            market.tags.contains(&"crypto".to_string()) &&
            (market.question.to_lowercase().contains("5 min") ||
             market.question.to_lowercase().contains("15 min") ||
             market.question.to_lowercase().contains("5-min") ||
             market.question.to_lowercase().contains("15-min"))
        })
        .map(|market| MarketSummary {
            id: market.id,
            question: market.question,
            market_slug: market.market_slug,
            tags: market.tags,
            end_date_iso: market.end_date_iso,
        })
        .collect();

    let count = short_term_markets.len();
    log::info!("Filtered to {} short-term crypto markets", count);

    Ok(ScanResponse {
        markets: short_term_markets,
        count,
    })
}
