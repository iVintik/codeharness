// Test cases for catch-without-logging Semgrep rule

// ruleid: catch-without-logging
try { doSomething(); } catch (e) { /* no logging at all */ }

// ruleid: catch-without-logging
try {
  riskyOperation();
} catch (err) {
  cleanup();
}

// ok: catch-without-logging
try { doSomething(); } catch (e) { console.error('failed', e); }

// ok: catch-without-logging
try {
  riskyOperation();
} catch (err) {
  console.warn('operation failed', err);
  cleanup();
}

// ok: catch-without-logging
try {
  riskyOperation();
} catch (err) {
  logger.error('operation failed', err);
}

// ok: catch-without-logging
try {
  riskyOperation();
} catch (err) {
  logger.warn('operation failed', err);
}
