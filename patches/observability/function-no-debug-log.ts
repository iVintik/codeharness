// Test cases for function-no-debug-log Semgrep rule

// ruleid: function-no-debug-log
function processData(input: string) {
  return input.trim();
}

// ruleid: function-no-debug-log
function handleRequest(req: any) {
  const result = compute(req);
  return result;
}

// ruleid: function-no-debug-log
const transformData = (input: string) => {
  return input.toUpperCase();
};

// ok: function-no-debug-log
function processDataWithLog(input: string) {
  console.log('processing data', input);
  return input.trim();
}

// ok: function-no-debug-log
function handleRequestWithDebug(req: any) {
  console.debug('handling request', req);
  const result = compute(req);
  return result;
}

// ok: function-no-debug-log
function serviceCall(params: any) {
  logger.debug('service call', params);
  return fetch(params.url);
}

// ok: function-no-debug-log
function anotherService(params: any) {
  logger.info('another service call', params);
  return fetch(params.url);
}

// ok: function-no-debug-log
const transformWithLog = (input: string) => {
  console.log('transforming', input);
  return input.toUpperCase();
};

// ok: function-no-debug-log
const arrowWithDebug = (input: string) => {
  logger.debug('arrow function', input);
  return input.toLowerCase();
};
