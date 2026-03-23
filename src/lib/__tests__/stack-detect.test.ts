import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack, detectAppType } from '../stack-detect.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-stack-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('detectStack', () => {
  it('returns "nodejs" when package.json exists', () => {
    writeFileSync(join(testDir, 'package.json'), '{}', 'utf-8');
    expect(detectStack(testDir)).toBe('nodejs');
  });

  it('returns "python" when requirements.txt exists', () => {
    writeFileSync(join(testDir, 'requirements.txt'), '', 'utf-8');
    expect(detectStack(testDir)).toBe('python');
  });

  it('returns "python" when pyproject.toml exists', () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '', 'utf-8');
    expect(detectStack(testDir)).toBe('python');
  });

  it('returns "python" when setup.py exists', () => {
    writeFileSync(join(testDir, 'setup.py'), '', 'utf-8');
    expect(detectStack(testDir)).toBe('python');
  });

  it('returns null when no indicators found', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const result = detectStack(testDir);
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No recognized stack detected'));
    consoleSpy.mockRestore();
  });

  it('Node.js takes priority over Python when both exist', () => {
    writeFileSync(join(testDir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(testDir, 'requirements.txt'), '', 'utf-8');
    expect(detectStack(testDir)).toBe('nodejs');
  });
});

describe('detectAppType', () => {
  // --- CLI detection ---
  it('returns "cli" for Node.js project with bin and no start script', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-cli', bin: { 'my-cli': './dist/cli.js' }, scripts: { build: 'tsc' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('cli');
  });

  it('returns "cli" for Node.js project with bin string and no start script', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-cli', bin: './dist/cli.js' }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('cli');
  });

  // --- Web detection ---
  it('returns "web" for Node.js project with react dependency', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '^18.0.0' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('web');
  });

  it('returns "web" for Node.js project with vue dependency', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { vue: '^3.0.0' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('web');
  });

  it('returns "web" for Node.js project with vite devDependency', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-app', devDependencies: { vite: '^5.0.0' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('web');
  });

  it('returns "web" when index.html exists in project root', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'my-app' }));
    writeFileSync(join(testDir, 'index.html'), '<html></html>');
    expect(detectAppType(testDir, 'nodejs')).toBe('web');
  });

  it('returns "web" when index.html exists in public/', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'my-app' }));
    mkdirSync(join(testDir, 'public'), { recursive: true });
    writeFileSync(join(testDir, 'public', 'index.html'), '<html></html>');
    expect(detectAppType(testDir, 'nodejs')).toBe('web');
  });

  it('returns "web" when index.html exists in src/', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'my-app' }));
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'index.html'), '<html></html>');
    expect(detectAppType(testDir, 'nodejs')).toBe('web');
  });

  // --- Agent detection ---
  it('returns "agent" for Node.js project with openai dependency', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-agent', dependencies: { openai: '^4.0.0' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('agent');
  });

  it('returns "agent" for Node.js project with @anthropic-ai/sdk dependency', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-agent', dependencies: { '@anthropic-ai/sdk': '^0.20.0' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('agent');
  });

  it('returns "agent" for Node.js project with langchain dependency', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-agent', dependencies: { langchain: '^0.1.0' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('agent');
  });

  it('returns "agent" for Python project with anthropic in requirements.txt', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'anthropic>=0.20.0\nflask>=2.0');
    expect(detectAppType(testDir, 'python')).toBe('agent');
  });

  it('returns "agent" for Python project with openai in pyproject.toml', () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '[project]\ndependencies = ["openai>=1.0"]');
    expect(detectAppType(testDir, 'python')).toBe('agent');
  });

  it('returns "agent" for Python project with traceloop-sdk', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'traceloop-sdk>=0.5.0');
    expect(detectAppType(testDir, 'python')).toBe('agent');
  });

  // --- Agent takes priority over web/cli ---
  it('agent takes priority over web when both signals present', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'ai-dashboard',
        dependencies: { react: '^18.0.0', openai: '^4.0.0' },
      }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('agent');
  });

  it('agent takes priority over cli when both signals present', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'ai-cli',
        bin: { 'ai-cli': './dist/cli.js' },
        dependencies: { anthropic: '^0.20.0' },
      }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('agent');
  });

  // --- Server detection ---
  it('returns "server" for Node.js project with start script and no framework deps', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'my-server', scripts: { start: 'node server.js' } }),
    );
    expect(detectAppType(testDir, 'nodejs')).toBe('server');
  });

  it('returns "server" for Python project with flask but no templates dir', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'flask>=2.0');
    expect(detectAppType(testDir, 'python')).toBe('server');
  });

  it('returns "server" for Python project with app.py entry point', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests>=2.0');
    writeFileSync(join(testDir, 'app.py'), 'print("hello")');
    expect(detectAppType(testDir, 'python')).toBe('server');
  });

  // --- Python web detection ---
  it('returns "web" for Python project with flask and templates dir', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'flask>=2.0');
    mkdirSync(join(testDir, 'templates'), { recursive: true });
    expect(detectAppType(testDir, 'python')).toBe('web');
  });

  it('returns "web" for Python project with django and static dir', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'django>=4.0');
    mkdirSync(join(testDir, 'static'), { recursive: true });
    expect(detectAppType(testDir, 'python')).toBe('web');
  });

  // --- Generic fallback ---
  it('returns "generic" for empty Node.js project', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'empty' }));
    expect(detectAppType(testDir, 'nodejs')).toBe('generic');
  });

  it('returns "generic" for empty Python project', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'requests>=2.0');
    expect(detectAppType(testDir, 'python')).toBe('generic');
  });

  it('returns "generic" when stack is null', () => {
    expect(detectAppType(testDir, null)).toBe('generic');
  });

  it('returns "generic" for unrecognized stack', () => {
    expect(detectAppType(testDir, 'java')).toBe('generic');
  });

  // --- Python false positive prevention ---
  it('does not false-positive on substring matches in Python deps', () => {
    // "myopenai" should NOT match "openai"
    writeFileSync(join(testDir, 'requirements.txt'), 'myopenai>=1.0\nrequests>=2.0');
    expect(detectAppType(testDir, 'python')).not.toBe('agent');
  });

  it('matches Python dep with version specifier', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'openai>=1.0');
    expect(detectAppType(testDir, 'python')).toBe('agent');
  });

  it('matches Python dep with extras bracket', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'langchain[all]>=0.1.0');
    expect(detectAppType(testDir, 'python')).toBe('agent');
  });

  // --- Edge cases ---
  it('returns "generic" when package.json is invalid JSON', () => {
    writeFileSync(join(testDir, 'package.json'), 'not json');
    expect(detectAppType(testDir, 'nodejs')).toBe('generic');
  });

  it('bin with start script returns "server" not "cli"', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'my-tool',
        bin: { 'my-tool': './dist/cli.js' },
        scripts: { start: 'node server.js' },
      }),
    );
    // Has start script, so not CLI. Agent/web don't match either. Has start => server.
    expect(detectAppType(testDir, 'nodejs')).toBe('server');
  });

  // --- Rust app type detection ---
  it('returns "cli" for Rust project with [[bin]] and no web framework deps', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-cli"\nversion = "0.1.0"\n\n[[bin]]\nname = "my-cli"\npath = "src/main.rs"\n\n[dependencies]\nclap = "4.0"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('cli');
  });

  it('returns "server" for Rust project with axum in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-server"\nversion = "0.1.0"\n\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('server');
  });

  it('returns "server" for Rust project with actix-web in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-server"\nversion = "0.1.0"\n\n[dependencies]\nactix-web = "4"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('server');
  });

  it('returns "generic" for Rust library crate with [lib] and no [[bin]]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-lib"\nversion = "0.1.0"\n\n[lib]\nname = "my_lib"\npath = "src/lib.rs"\n\n[dependencies]\nserde = "1.0"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('generic');
  });

  it('returns "agent" for Rust project with async-openai in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-agent"\nversion = "0.1.0"\n\n[dependencies]\nasync-openai = "0.18"\ntokio = "1"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('agent');
  });

  it('returns "agent" for Rust project with llm-chain in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-agent"\nversion = "0.1.0"\n\n[dependencies]\nllm-chain = "0.13"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('agent');
  });

  it('agent takes priority over server for Rust project', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "ai-server"\nversion = "0.1.0"\n\n[dependencies]\naxum = "0.7"\nasync-openai = "0.18"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('agent');
  });

  it('returns "generic" for Rust project with no distinguishing features', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "basic"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('generic');
  });

  it('returns "generic" for Rust project when Cargo.toml is missing', () => {
    // No Cargo.toml written — readTextSafe returns null
    expect(detectAppType(testDir, 'rust')).toBe('generic');
  });

  // --- Rust false positive prevention ---
  it('does not false-positive on agent dep in [dev-dependencies]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n\n[dev-dependencies]\nasync-openai = "0.18"\n`,
    );
    expect(detectAppType(testDir, 'rust')).not.toBe('agent');
  });

  it('does not false-positive on web framework in [dev-dependencies]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n\n[dev-dependencies]\naxum = "0.7"\n`,
    );
    expect(detectAppType(testDir, 'rust')).not.toBe('server');
  });

  it('does not false-positive on substring match for anthropic', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nanthropic-sdk = "1.0"\n`,
    );
    expect(detectAppType(testDir, 'rust')).not.toBe('agent');
  });

  it('does not false-positive on substring match for rocket', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nsprocket = "1.0"\n`,
    );
    expect(detectAppType(testDir, 'rust')).not.toBe('server');
  });

  it('does not false-positive on [[bin]] in a comment', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-lib"\nversion = "0.1.0"\n# this is not a [[bin]] project\n\n[lib]\nname = "my_lib"\n\n[dependencies]\nserde = "1.0"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('generic');
  });

  it('returns "cli" for Rust project with both [lib] and [[bin]]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-tool"\nversion = "0.1.0"\n\n[lib]\nname = "my_tool"\npath = "src/lib.rs"\n\n[[bin]]\nname = "my-tool"\npath = "src/main.rs"\n\n[dependencies]\nclap = "4.0"\n`,
    );
    // [[bin]] takes priority over [lib] per detection order
    expect(detectAppType(testDir, 'rust')).toBe('cli');
  });

  it('returns "server" for Rust project with rocket in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-server"\nversion = "0.1.0"\n\n[dependencies]\nrocket = "0.5"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('server');
  });

  it('returns "server" for Rust project with warp in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-server"\nversion = "0.1.0"\n\n[dependencies]\nwarp = "0.3"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('server');
  });

  it('returns "server" for Rust project with tide in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-server"\nversion = "0.1.0"\n\n[dependencies]\ntide = "0.17"\n`,
    );
    expect(detectAppType(testDir, 'rust')).toBe('server');
  });

  it('does not false-positive on agent dep in [build-dependencies]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n\n[build-dependencies]\nasync-openai = "0.18"\n`,
    );
    expect(detectAppType(testDir, 'rust')).not.toBe('agent');
  });
});

describe('detectStack — Rust', () => {
  it('returns "rust" when Cargo.toml exists', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "foo"\n');
    expect(detectStack(testDir)).toBe('rust');
  });

  it('returns "rust" for workspace Cargo.toml', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[workspace]\nmembers = ["crate-a", "crate-b"]\n');
    expect(detectStack(testDir)).toBe('rust');
  });

  it('does not detect Rust when no Cargo.toml exists', () => {
    // Empty dir — should not return 'rust'
    const consoleSpy = vi.spyOn(console, 'log');
    const result = detectStack(testDir);
    expect(result).not.toBe('rust');
    consoleSpy.mockRestore();
  });

  it('Node.js takes priority over Rust when both exist', () => {
    writeFileSync(join(testDir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "foo"\n');
    expect(detectStack(testDir)).toBe('nodejs');
  });

  it('Python takes priority over Rust when both exist', () => {
    writeFileSync(join(testDir, 'requirements.txt'), '', 'utf-8');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "foo"\n');
    expect(detectStack(testDir)).toBe('python');
  });
});
