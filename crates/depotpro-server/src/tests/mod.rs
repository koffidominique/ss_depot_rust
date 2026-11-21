// ============================================================================
// Suite de tests HTTP Axum (sécurité, RBAC & parité Lot 9)
// ============================================================================

use std::net::SocketAddr;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

mod lot9_parity_tests;
mod orders_http_tests;
mod security_tests;

pub(super) async fn send_http(
    addr: SocketAddr,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: Option<&str>,
) -> (u16, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let body_bytes = body.unwrap_or("");
    let mut req = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n");
    for (k, v) in headers {
        req.push_str(&format!("{k}: {v}\r\n"));
    }
    if !body_bytes.is_empty() {
        req.push_str("Content-Type: application/json\r\n");
        req.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
    }
    req.push_str("\r\n");
    req.push_str(body_bytes);
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status_line = text.lines().next().unwrap_or("");
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let body_text = text.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");
    (status, body_text.to_string())
}
