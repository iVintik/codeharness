# Rust OTLP Instrumentation

## Packages to Install

```bash
cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber
```

## Setup Code

Add the following to your `main.rs` to initialize the OTLP tracing pipeline:

```rust
use opentelemetry::trace::TracerProvider;
use opentelemetry_otlp::WithExportConfig;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

fn init_tracing() {
    let otlp_exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_endpoint(
            std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:4318".into()),
        )
        .build()
        .expect("failed to create OTLP exporter");

    let provider = opentelemetry::sdk::trace::TracerProvider::builder()
        .with_batch_exporter(otlp_exporter)
        .build();

    let tracer = provider.tracer("app");
    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    tracing_subscriber::registry()
        .with(otel_layer)
        .with(tracing_subscriber::fmt::layer())
        .init();
}
```

Call `init_tracing()` at the start of `main()`.

## Function Instrumentation

Use the `#[tracing::instrument]` attribute to trace individual functions:

```rust
#[tracing::instrument]
fn process_request(id: u64, payload: &str) -> Result<(), Error> {
    tracing::info!("processing request");
    // ...
    Ok(())
}
```

## Environment Variables

Set these in `.env.codeharness` or your environment:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME={project_name}
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
```

## Verification

After starting the application, verify traces are being exported:

```bash
# Check logs are flowing
curl 'localhost:9428/select/logsql/query?query=*&limit=5'

# Check metrics are flowing
curl 'localhost:8428/api/v1/query?query=up'
```
