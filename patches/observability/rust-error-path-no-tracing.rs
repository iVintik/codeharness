// Test cases for rust-error-path-no-tracing Semgrep rule

fn bad_map_err() {
    // ruleid: rust-error-path-no-tracing
    let result = some_operation().map_err(|e| {
        CustomError::new(e)
    });
}

fn bad_unwrap_or_else() {
    // ruleid: rust-error-path-no-tracing
    let value = some_operation().unwrap_or_else(|e| {
        default_value()
    });
}

fn good_map_err_with_tracing_error() {
    // ok: rust-error-path-no-tracing
    let result = some_operation().map_err(|e| {
        tracing::error!("operation failed: {}", e);
        CustomError::new(e)
    });
}

fn good_map_err_with_tracing_warn() {
    // ok: rust-error-path-no-tracing
    let result = some_operation().map_err(|e| {
        tracing::warn!("operation failed: {}", e);
        CustomError::new(e)
    });
}

fn good_map_err_with_bare_error() {
    // ok: rust-error-path-no-tracing
    let result = some_operation().map_err(|e| {
        error!("operation failed: {}", e);
        CustomError::new(e)
    });
}

fn good_map_err_with_bare_warn() {
    // ok: rust-error-path-no-tracing
    let result = some_operation().map_err(|e| {
        warn!("operation failed: {}", e);
        CustomError::new(e)
    });
}

fn good_unwrap_or_else_with_tracing_error() {
    // ok: rust-error-path-no-tracing
    let value = some_operation().unwrap_or_else(|e| {
        tracing::error!("falling back: {}", e);
        default_value()
    });
}

fn good_unwrap_or_else_with_tracing_warn() {
    // ok: rust-error-path-no-tracing
    let value = some_operation().unwrap_or_else(|e| {
        tracing::warn!("falling back: {}", e);
        default_value()
    });
}

fn good_unwrap_or_else_with_bare_error() {
    // ok: rust-error-path-no-tracing
    let value = some_operation().unwrap_or_else(|e| {
        error!("falling back: {}", e);
        default_value()
    });
}

fn good_unwrap_or_else_with_bare_warn() {
    // ok: rust-error-path-no-tracing
    let value = some_operation().unwrap_or_else(|e| {
        warn!("falling back: {}", e);
        default_value()
    });
}
