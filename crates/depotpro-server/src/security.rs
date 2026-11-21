// ============================================================================
// Validation d'origine, en-têtes de sécurité et middleware HTTP Axum
// ============================================================================

use std::net::SocketAddr;
use std::time::Instant;

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Json, Response};

use crate::state::AppState;

// ----------------------------------------------------------------------------
// 1. Parsing strict des origines et comparaison hôte/port
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedOrigin {
    scheme: String,
    host: String,
    port: Option<u16>,
}

fn parse_origin(raw: &str) -> Option<ParsedOrigin> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.contains('@')
        || trimmed.contains('?')
        || trimmed.contains('#')
        || trimmed.contains('\\')
    {
        return None;
    }

    let (scheme_raw, rest) = trimmed.split_once("://")?;
    let scheme = scheme_raw.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    if rest.is_empty() || rest.contains('/') {
        return None;
    }

    let (host, port) = parse_host_port(rest)?;
    let default_port = if scheme == "https" { 443 } else { 80 };
    let normalized_port = match port {
        Some(p) if p == default_port => None,
        other => other,
    };

    Some(ParsedOrigin {
        scheme,
        host,
        port: normalized_port,
    })
}

fn parse_host_port(raw: &str) -> Option<(String, Option<u16>)> {
    let s = raw.trim();
    if s.is_empty() || s.contains('/') || s.contains('@') || s.contains(char::is_whitespace) {
        return None;
    }

    if let Some(after_open) = s.strip_prefix('[') {
        let (addr, remainder) = after_open.split_once(']')?;
        if addr.is_empty() {
            return None;
        }
        let host = format!("[{}]", addr.to_ascii_lowercase());
        if remainder.is_empty() {
            return Some((host, None));
        }
        let port_str = remainder.strip_prefix(':')?;
        let port = port_str.parse::<u16>().ok().filter(|p| *p > 0)?;
        return Some((host, Some(port)));
    }

    if let Some((h, p_str)) = s.rsplit_once(':') {
        if h.is_empty() || h.contains(':') {
            return None;
        }
        let port = p_str.parse::<u16>().ok().filter(|p| *p > 0)?;
        if !is_valid_hostname(h) {
            return None;
        }
        Some((h.to_ascii_lowercase(), Some(port)))
    } else {
        if !is_valid_hostname(s) {
            return None;
        }
        Some((s.to_ascii_lowercase(), None))
    }
}

fn is_valid_hostname(h: &str) -> bool {
    !h.is_empty()
        && !h.starts_with('.')
        && !h.ends_with('.')
        && h.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

pub(crate) fn is_allowed_origin(
    origin: &str,
    host_header: &str,
    forwarded_host_header: Option<&str>,
    trust_proxy: bool,
    extra_allowed: &str,
) -> bool {
    let Some(parsed) = parse_origin(origin) else {
        return false;
    };

    if is_loopback_host(&parsed.host) {
        return true;
    }

    if trust_proxy {
        let effective_host = forwarded_host_header
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(host_header);
        if let Some((h, p)) = parse_host_port(effective_host) {
            let default_port = if parsed.scheme == "https" { 443 } else { 80 };
            let host_norm_port = match p {
                Some(port) if port == default_port => None,
                other => other,
            };
            if parsed.host == h && parsed.port == host_norm_port {
                return true;
            }
        }
    }

    extra_allowed
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .any(|allowed| match parse_origin(allowed) {
            Some(allowed_parsed) => allowed_parsed == parsed,
            None => false,
        })
}

fn trust_proxy_enabled() -> bool {
    std::env::var("DEPOTPRO_TRUST_PROXY")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false)
}

// ----------------------------------------------------------------------------
// 2. Middleware de sécurité (Origin, Rate Limit, Security Headers)
// ----------------------------------------------------------------------------

pub(crate) async fn security_middleware(
    State(state): State<AppState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().clone();
    let is_mutating = matches!(
        method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );
    let trust_proxy = trust_proxy_enabled();

    if is_mutating {
        if let Some(origin) = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
        {
            let host = req
                .headers()
                .get(header::HOST)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let forwarded_host = if trust_proxy {
                req.headers()
                    .get("x-forwarded-host")
                    .and_then(|v| v.to_str().ok())
            } else {
                None
            };
            let extra = std::env::var("DEPOTPRO_ALLOWED_ORIGINS").unwrap_or_default();
            if !is_allowed_origin(origin, host, forwarded_host, trust_proxy, &extra) {
                let mut resp = (
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({
                        "code": "FORBIDDEN_ORIGIN",
                        "message": "Origine requête non autorisée."
                    })),
                )
                    .into_response();
                apply_security_headers(resp.headers_mut(), &path);
                return resp;
            }
        }
    }

    if path == "/api/auth/setup" || path == "/api/auth/login" || path == "/api/auth/change-pin" {
        let peer_ip = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ci| ci.0.ip().to_string());
        let forwarded_ip = if trust_proxy {
            req.headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        } else {
            None
        };
        let client_ip = forwarded_ip
            .or(peer_ip)
            .unwrap_or_else(|| "local".to_string());
        let client_key = format!("{client_ip}:{path}");
        let allowed = state
            .auth_limiter
            .write()
            .await
            .check(&client_key, Instant::now());
        if !allowed {
            let mut resp = (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({
                    "code": "RATE_LIMITED",
                    "message": "Trop de requêtes d’authentification. Patientez une minute."
                })),
            )
                .into_response();
            apply_security_headers(resp.headers_mut(), &path);
            return resp;
        }
    }

    let mut resp = next.run(req).await;
    apply_security_headers(resp.headers_mut(), &path);
    resp
}

fn apply_security_headers(headers: &mut HeaderMap, path: &str) {
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("SAMEORIGIN"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    if path.starts_with("/api") {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
}
