/**
 * Types for the infra module.
 */

/** Options for project initialization */
export interface InitOptions {
  readonly projectDir: string;
  readonly template?: string;
  readonly force?: boolean;
}

/** Result of project initialization */
export interface InitResult {
  readonly projectDir: string;
  readonly configPath: string;
  readonly created: string[];
}

/** Status of the infrastructure stack */
export interface StackStatus {
  readonly running: boolean;
  readonly services: ReadonlyArray<{
    readonly name: string;
    readonly healthy: boolean;
  }>;
}
