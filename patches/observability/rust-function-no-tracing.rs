// Test cases for rust-function-no-tracing Semgrep rule

// ruleid: rust-function-no-tracing
fn process_data(input: &str) -> String {
    input.trim().to_string()
}

// ruleid: rust-function-no-tracing
pub fn handle_request(req: Request) -> Response {
    let result = compute(req);
    result
}

// ruleid: rust-function-no-tracing
async fn fetch_data(url: &str) -> Result<String, Error> {
    let resp = client.get(url).send().await?;
    resp.text().await
}

// ruleid: rust-function-no-tracing
pub async fn serve(addr: &str) -> Result<(), Error> {
    let listener = TcpListener::bind(addr).await?;
    loop {
        let (stream, _) = listener.accept().await?;
        handle(stream).await;
    }
}

// ok: rust-function-no-tracing
fn process_with_debug(input: &str) -> String {
    tracing::debug!("processing input");
    input.trim().to_string()
}

// ok: rust-function-no-tracing
pub fn handle_with_info(req: Request) -> Response {
    tracing::info!("handling request");
    let result = compute(req);
    result
}

// ok: rust-function-no-tracing
async fn fetch_with_warn(url: &str) -> Result<String, Error> {
    tracing::warn!("fetching data from {}", url);
    let resp = client.get(url).send().await?;
    resp.text().await
}

// ok: rust-function-no-tracing
pub async fn serve_with_error(addr: &str) -> Result<(), Error> {
    tracing::error!("starting server on {}", addr);
    let listener = TcpListener::bind(addr).await?;
    loop {
        let (stream, _) = listener.accept().await?;
        handle(stream).await;
    }
}

// ok: rust-function-no-tracing
fn process_with_bare_debug(input: &str) -> String {
    debug!("processing input");
    input.trim().to_string()
}

// ok: rust-function-no-tracing
pub fn handle_with_bare_info(req: Request) -> Response {
    info!("handling request");
    let result = compute(req);
    result
}

// ok: rust-function-no-tracing
async fn fetch_with_bare_error(url: &str) -> Result<String, Error> {
    error!("fetching data from {}", url);
    let resp = client.get(url).send().await?;
    resp.text().await
}

// ok: rust-function-no-tracing
fn traced_with_namespaced_trace(input: &str) -> String {
    tracing::trace!("trace-level log");
    input.trim().to_string()
}

// ok: rust-function-no-tracing
fn traced_with_bare_trace(input: &str) -> String {
    trace!("trace-level log");
    input.trim().to_string()
}

// ok: rust-function-no-tracing
#[tracing::instrument]
fn instrumented_function(input: &str) -> String {
    input.trim().to_string()
}

// ok: rust-function-no-tracing
#[instrument]
pub fn instrumented_pub_function(req: Request) -> Response {
    let result = compute(req);
    result
}

// ok: rust-function-no-tracing
#[tracing::instrument]
async fn instrumented_async(url: &str) -> Result<String, Error> {
    let resp = client.get(url).send().await?;
    resp.text().await
}

// ok: rust-function-no-tracing
#[instrument]
pub async fn instrumented_pub_async(addr: &str) -> Result<(), Error> {
    let listener = TcpListener::bind(addr).await?;
    loop {
        let (stream, _) = listener.accept().await?;
        handle(stream).await;
    }
}
