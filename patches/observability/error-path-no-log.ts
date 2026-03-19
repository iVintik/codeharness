// Test cases for error-path-no-log Semgrep rule

function badThrow() {
  // ruleid: error-path-no-log
  throw new Error('something went wrong');
}

function badReturn() {
  // ruleid: error-path-no-log
  return err('something went wrong');
}

function goodThrow() {
  // ok: error-path-no-log
  console.error('about to throw');
  throw new Error('something went wrong');
}

function goodReturn() {
  // ok: error-path-no-log
  console.error('returning error');
  return err('something went wrong');
}

function goodThrowWithLogger() {
  // ok: error-path-no-log
  logger.error('about to throw');
  throw new Error('something went wrong');
}

function goodReturnWithLogger() {
  // ok: error-path-no-log
  logger.error('returning error');
  return err('something went wrong');
}

function goodThrowWithWarn() {
  // ok: error-path-no-log
  console.warn('about to throw');
  throw new Error('something went wrong');
}

function goodReturnWithLoggerWarn() {
  // ok: error-path-no-log
  logger.warn('returning error');
  return err('something went wrong');
}
