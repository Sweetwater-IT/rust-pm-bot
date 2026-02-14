use axum::{routing::get, Router};
use tower_http::cors::CorsLayer;
use serde::Serialize;

#[derive(Serialize)]
struct LatencyResponse {
    rtt_ms: f64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_default_env().filter_level(log::LevelFilter::Info).init();

    let app = Router::new()
        .route("/api/latency", get(latency_handler))
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