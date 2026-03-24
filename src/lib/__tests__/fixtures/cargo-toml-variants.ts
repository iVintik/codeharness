/**
 * Named Cargo.toml string constants for test fixtures.
 *
 * Extracted from inline literals in rust.test.ts and other stack tests.
 * Each constant represents a distinct Cargo.toml configuration variant.
 */

/** Minimal Cargo.toml with only [package] and a single dependency */
export const CARGO_TOML_MINIMAL = `[package]
name = "myapp"
version = "0.1.0"

[dependencies]
serde = "1"
`;

/** Cargo.toml with actix-web server framework */
export const CARGO_TOML_ACTIX_WEB = `[package]
name = "myapp"

[dependencies]
actix-web = "4"
`;

/** Cargo.toml with axum server framework */
export const CARGO_TOML_AXUM = `[package]
name = "myapp"

[dependencies]
axum = "0.7"
`;

/** Cargo.toml with async-openai AI/agent dependency */
export const CARGO_TOML_ASYNC_OPENAI = `[package]
name = "myapp"
version = "0.1.0"

[dependencies]
async-openai = "0.18"
`;

/** Cargo.toml workspace with multiple members */
export const CARGO_TOML_WORKSPACE = `[workspace]
members = ["crate-a", "crate-b"]
`;

/** Cargo.toml with [[bin]] section (CLI binary) */
export const CARGO_TOML_BINARY = `[package]
name = "myapp"

[[bin]]
name = "myapp"
path = "src/main.rs"

[dependencies]
clap = "4"
`;

/** Cargo.toml with [lib] section (library crate) */
export const CARGO_TOML_LIBRARY = `[package]
name = "mylib"

[lib]
name = "mylib"

[dependencies]
serde = "1"
`;

/** Generic Cargo.toml with only a package name and version */
export const CARGO_TOML_GENERIC = `[package]
name = "myapp"
version = "0.1.0"
`;
