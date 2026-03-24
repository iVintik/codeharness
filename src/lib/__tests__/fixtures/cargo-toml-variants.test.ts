import { describe, it, expect } from 'vitest';
import {
  CARGO_TOML_MINIMAL,
  CARGO_TOML_ACTIX_WEB,
  CARGO_TOML_AXUM,
  CARGO_TOML_ASYNC_OPENAI,
  CARGO_TOML_WORKSPACE,
  CARGO_TOML_BINARY,
  CARGO_TOML_LIBRARY,
  CARGO_TOML_GENERIC,
} from './cargo-toml-variants.js';

describe('cargo-toml-variants', () => {
  it('exports all 8 named variants', () => {
    const variants = [
      CARGO_TOML_MINIMAL,
      CARGO_TOML_ACTIX_WEB,
      CARGO_TOML_AXUM,
      CARGO_TOML_ASYNC_OPENAI,
      CARGO_TOML_WORKSPACE,
      CARGO_TOML_BINARY,
      CARGO_TOML_LIBRARY,
      CARGO_TOML_GENERIC,
    ];
    for (const v of variants) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('CARGO_TOML_MINIMAL contains [package] and [dependencies]', () => {
    expect(CARGO_TOML_MINIMAL).toContain('[package]');
    expect(CARGO_TOML_MINIMAL).toContain('[dependencies]');
    expect(CARGO_TOML_MINIMAL).toContain('serde');
  });

  it('CARGO_TOML_ACTIX_WEB contains actix-web dependency', () => {
    expect(CARGO_TOML_ACTIX_WEB).toContain('actix-web');
  });

  it('CARGO_TOML_AXUM contains axum dependency', () => {
    expect(CARGO_TOML_AXUM).toContain('axum');
  });

  it('CARGO_TOML_ASYNC_OPENAI contains async-openai dependency', () => {
    expect(CARGO_TOML_ASYNC_OPENAI).toContain('async-openai');
  });

  it('CARGO_TOML_WORKSPACE contains [workspace] section', () => {
    expect(CARGO_TOML_WORKSPACE).toContain('[workspace]');
    expect(CARGO_TOML_WORKSPACE).toContain('members');
  });

  it('CARGO_TOML_BINARY contains [[bin]] section', () => {
    expect(CARGO_TOML_BINARY).toContain('[[bin]]');
  });

  it('CARGO_TOML_LIBRARY contains [lib] section', () => {
    expect(CARGO_TOML_LIBRARY).toContain('[lib]');
  });

  it('CARGO_TOML_GENERIC has only [package] with name and version', () => {
    expect(CARGO_TOML_GENERIC).toContain('[package]');
    expect(CARGO_TOML_GENERIC).toContain('name');
    expect(CARGO_TOML_GENERIC).toContain('version');
    expect(CARGO_TOML_GENERIC).not.toContain('[dependencies]');
  });

  it('all variants are distinct strings', () => {
    const variants = [
      CARGO_TOML_MINIMAL,
      CARGO_TOML_ACTIX_WEB,
      CARGO_TOML_AXUM,
      CARGO_TOML_ASYNC_OPENAI,
      CARGO_TOML_WORKSPACE,
      CARGO_TOML_BINARY,
      CARGO_TOML_LIBRARY,
      CARGO_TOML_GENERIC,
    ];
    const unique = new Set(variants);
    expect(unique.size).toBe(variants.length);
  });
});
