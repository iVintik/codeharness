export interface OutputOptions {
  json?: boolean;
}

export function ok(message: string, options?: OutputOptions): void {
  if (options?.json) {
    jsonOutput({ status: 'ok', message });
    return;
  }
  console.log(`[OK] ${message}`);
}

export function fail(message: string, options?: OutputOptions): void {
  if (options?.json) {
    jsonOutput({ status: 'fail', message });
    return;
  }
  console.log(`[FAIL] ${message}`);
}

export function warn(message: string, options?: OutputOptions): void {
  if (options?.json) {
    jsonOutput({ status: 'warn', message });
    return;
  }
  console.log(`[WARN] ${message}`);
}

export function info(message: string, options?: OutputOptions): void {
  if (options?.json) {
    jsonOutput({ status: 'info', message });
    return;
  }
  console.log(`[INFO] ${message}`);
}

export function jsonOutput(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data));
}
