// Test cases for rust-catch-without-tracing Semgrep rule

fn bad_match_no_logging(result: Result<i32, String>) {
    match result {
        Ok(val) => println!("{}", val),
        // ruleid: rust-catch-without-tracing
        Err(e) => {
            cleanup();
        }
    }
}

fn bad_match_wildcard(result: Result<i32, String>) {
    match result {
        Ok(val) => println!("{}", val),
        // ruleid: rust-catch-without-tracing
        Err(_) => {
            fallback();
        }
    }
}

fn good_match_with_tracing_error(result: Result<i32, String>) {
    match result {
        Ok(val) => println!("{}", val),
        // ok: rust-catch-without-tracing
        Err(e) => {
            tracing::error!("operation failed: {}", e);
            cleanup();
        }
    }
}

fn good_match_with_tracing_warn(result: Result<i32, String>) {
    match result {
        Ok(val) => println!("{}", val),
        // ok: rust-catch-without-tracing
        Err(e) => {
            tracing::warn!("operation failed: {}", e);
            cleanup();
        }
    }
}

fn good_match_with_bare_error(result: Result<i32, String>) {
    match result {
        Ok(val) => println!("{}", val),
        // ok: rust-catch-without-tracing
        Err(e) => {
            error!("operation failed: {}", e);
            cleanup();
        }
    }
}

fn good_match_with_bare_warn(result: Result<i32, String>) {
    match result {
        Ok(val) => println!("{}", val),
        // ok: rust-catch-without-tracing
        Err(e) => {
            warn!("operation failed: {}", e);
            cleanup();
        }
    }
}
