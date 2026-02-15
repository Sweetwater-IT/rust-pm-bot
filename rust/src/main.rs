use axum::{routing::get, Router};
use tower_http::cors::CorsLayer;
use serde::{Serialize, Deserialize};
use reqwest::Client;
use clap::{Parser, Subcommand};
use chrono::{DateTime, Duration, Utc};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;

#[derive(Parser)]
#[command(name = "rust-pm-bot")]
#[command(about = "Polymarket arbitrage bot")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the web server
    Web {
        /// Port to bind the web server
        #[arg(long, default_value = "8080")]
        port: u16,
    },
    /// Run the arbitrage bot
    Bot {
        /// Arbitrage threshold (default 0.995)
        #[arg(long, default_value = "0.995")]
        threshold: f64,
    },
}

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

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct Market {
    id: String,
    question: String,
    created_at: String,
    end_date: Option<String>,
    #[serde(default, deserialize_with = "deserialize_clob_token_ids")]
    clob_token_ids: Option<Vec<String>>,
}

fn deserialize_clob_token_ids<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s: Option<String> = serde::Deserialize::deserialize(deserializer)?;
    match s {
        Some(s) => serde_json::from_str(&s).map(Some).map_err(serde::de::Error::custom),
        None => Ok(None),
    }
}

#[derive(Deserialize, Debug)]
struct OrderBook {
    asset_id: String,
    bids: Vec<[String; 2]>, // [price, size]
    asks: Vec<[String; 2]>,
}

#[derive(Deserialize, Debug)]
struct WsMessage {
    event_type: String,
    asset_id: String,
    bids: Vec<[String; 2]>,
    asks: Vec<[String; 2]>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_default_env().filter_level(log::LevelFilter::Info).init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Web { port } => {
            run_web_server(port).await?;
        }
        Commands::Bot { threshold } => {
            run_bot(threshold).await?;
        }
    }

    Ok(())
}

async fn run_web_server(port: u16) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/api/latency", get(latency_handler))
        .route("/api/scan", get(scan_handler))
        .layer(CorsLayer::permissive()); // Allow all origins for dev

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    log::info!("Server running on http://{}", addr);
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
    let url = "https://gamma-api.polymarket.com/markets?active=true&tags=crypto&order_by=created_at_desc";

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

async fn fetch_new_crypto_markets(max_markets: usize) -> anyhow::Result<Vec<Market>> {
    let url = format!(
        "https://gamma-api.polymarket.com/markets?active=true&limit={}&tags=crypto&order_by=created_at_desc",
        max_markets.max(300)  // get more to cover recent blocks
    );

    let client = reqwest::Client::new();
    log::info!("Fetching from URL: {}", url);
    let resp = client.get(&url).send().await?;
    log::info!("API response status: {}", resp.status());

    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("Gamma API status: {}", resp.status()));
    }

    let markets: Vec<Market> = resp.json().await?;
    let total_count = markets.len();
    log::info!("Total markets fetched: {}", total_count);

    let now = Utc::now();
    let twenty_four_hours_ago = now - Duration::hours(24);
    let fifteen_min = Duration::minutes(15);

    let filtered: Vec<Market> = markets.into_iter()
        .filter(|m| {
            // Log some market info for debugging
            if total_count <= 5 { // Only log if we have few markets
                log::debug!("Market: {} created: {} end: {:?} clob_ids: {:?}",
                    m.question, m.created_at, m.end_date, m.clob_token_ids);
            }

            if let (Ok(created), Some(end_date)) = (
                DateTime::parse_from_rfc3339(&m.created_at).map(|dt| dt.with_timezone(&Utc)),
                m.end_date.as_ref(),
            ) {
                if let Ok(end) = DateTime::parse_from_rfc3339(end_date).map(|dt| dt.with_timezone(&Utc)) {
                    let duration = end - created;
                    let is_recent = created >= twenty_four_hours_ago;
                    let is_short = duration <= fifteen_min;

                    if total_count <= 5 {
                        log::debug!("  Duration: {} min, Recent: {}, Short: {}", duration.num_minutes(), is_recent, is_short);
                    }

                    is_recent && is_short
                } else {
                    false
                }
            } else {
                false
            }
        })
        .collect();

    Ok(filtered)
}

async fn run_bot(threshold: f64) -> anyhow::Result<()> {
    log::info!("Starting arbitrage bot with threshold: {}", threshold);

    // Fetch markets
    let markets = fetch_new_crypto_markets(500).await?;
    log::info!("Fetched {} new crypto short markets", markets.len());

    if markets.is_empty() {
        log::warn!("No markets found, exiting");
        return Ok(());
    }

    // Collect all token IDs
    let mut all_token_ids = Vec::new();
    for market in &markets {
        if let Some(ref token_ids) = market.clob_token_ids {
            all_token_ids.extend(token_ids.clone());
        }
    }
    log::info!("Subscribing to {} token IDs", all_token_ids.len());

    // Connect to WS
    connect_ws(all_token_ids, markets, threshold).await?;

    Ok(())
}

async fn connect_ws(token_ids: Vec<String>, markets: Vec<Market>, threshold: f64) -> anyhow::Result<()> {
    let url = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
    log::info!("Connecting to WS: {}", url);

    let (ws_stream, response) = connect_async(url).await?;
    log::info!("WS handshake response: {:?}", response);

    let (mut write, mut read) = ws_stream.split();

    // Subscribe to orderbooks
    let subscribe_msg = serde_json::json!({
        "channel": "orderbook",
        "token_ids": token_ids
    });
    write.send(Message::Text(subscribe_msg.to_string())).await?;
    log::info!("Sent subscription message");

    // Create market map for lookup
    let mut market_map = HashMap::new();
    for market in markets {
        if let Some(ref token_ids) = market.clob_token_ids {
            for token_id in token_ids {
                market_map.insert(token_id.clone(), market.clone());
            }
        }
    }

    // Track orderbooks
    let mut orderbooks: HashMap<String, OrderBook> = HashMap::new();

    // Read messages
    while let Some(message) = read.next().await {
        match message {
            Ok(Message::Text(text)) => {
                log::debug!("Received WS msg: {}", text);

                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if ws_msg.event_type == "book" {
                        // Update orderbook
                        let ob = OrderBook {
                            asset_id: ws_msg.asset_id.clone(),
                            bids: ws_msg.bids.clone(),
                            asks: ws_msg.asks.clone(),
                        };
                        orderbooks.insert(ws_msg.asset_id.clone(), ob);

                        // Check for arb if we have both sides
                        if let Some(market) = market_map.get(&ws_msg.asset_id) {
                            check_arbitrage(&market, &orderbooks, threshold);
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                log::info!("WS connection closed");
                break;
            }
            Err(e) => {
                log::error!("WS error: {}", e);
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

fn check_arbitrage(market: &Market, orderbooks: &HashMap<String, OrderBook>, threshold: f64) {
    let token_ids = match market.clob_token_ids.as_ref() {
        Some(ids) if ids.len() == 2 => ids,
        _ => return, // Not a binary market or no token IDs
    };

    let yes_token = &token_ids[0];
    let no_token = &token_ids[1];

    if let (Some(yes_book), Some(no_book)) = (orderbooks.get(yes_token), orderbooks.get(no_token)) {
        if let (Some(yes_ask), Some(no_ask)) = (get_best_ask(yes_book), get_best_ask(no_book)) {
            let spread = yes_ask + no_ask;

            if spread < 1.00 {
                log::info!(
                    "Potential spread detected: {:.4} (threshold: {}) Market: {} YES ask: {:.4} NO ask: {:.4}",
                    spread, threshold, market.question, yes_ask, no_ask
                );
                if spread < threshold {
                    log::info!("🎉 ARB THRESHOLD MET! Spread: {:.4} Profit: {:.4}", spread, 1.0 - spread);
                }
            }
        }
    }
}

fn get_best_ask(book: &OrderBook) -> Option<f64> {
    book.asks.first().and_then(|ask| ask[0].parse::<f64>().ok())
}
