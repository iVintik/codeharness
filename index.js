#!/usr/bin/env node
import "./chunk-4I6FUK22.js";
import {
  checkCapabilityConflicts
} from "./chunk-NDYHATCA.js";
import {
  DEFAULT_MAX_ITERATIONS,
  DispatchError,
  HALT_ERROR_CODES,
  analyze,
  buildRetryPrompt,
  buildVerifyImage,
  checkObservabilityCoverageGate,
  checkPreconditions,
  checkStoryDocFreshness,
  checkVerifyEnv,
  cleanupVerifyEnv,
  closeBeadsIssue,
  completeExecPlan,
  createProofDocument,
  createValidationSprint,
  dispatchTaskCore,
  evaluateMetricsProgress,
  evaluateProgress,
  extractTag,
  getACById,
  getValidationProgress,
  handleDispatchError,
  isEngineError,
  isGateConfig,
  isLoopBlock,
  isLoopTaskCompleted,
  isTaskCompleted,
  nullTaskCore,
  parseObservabilityGaps,
  parseProof,
  parseStoryACs,
  parseVerdict,
  prepareVerifyWorkspace,
  printDocHealthOutput,
  readWorkflowState,
  recordErrorInState,
  runShowboatVerify,
  runValidationCycle,
  scanDocHealth,
  updateVerificationState,
  validateMerge,
  validateProofQuality,
  validateRuntime,
  writeWorkflowState
} from "./chunk-7ERLA7JD.js";
import {
  NODE_REQUIRE_FLAG,
  StateFileNotFoundError,
  checkRemoteEndpoint,
  cleanupContainers,
  detectStack,
  getCollectorHealth,
  getComposeFilePath,
  getElkComposeFilePath,
  getNestedValue,
  getPackageRoot,
  getStackDir,
  getStackHealth,
  getStackProvider,
  getStatePath,
  getStoryFilePath,
  initProject,
  isBmadInstalled,
  isCollectorRunning,
  isDockerAvailable,
  isSharedStackRunning,
  parseEpicsFile,
  parseValue,
  readState,
  readStateWithBody,
  setNestedValue,
  startCollectorOnly,
  startSharedStack,
  stopCollectorOnly,
  stopSharedStack,
  validateDockerfile,
  writeState
} from "./chunk-3DN5SUGY.js";
import {
  captureTimeoutReport,
  clearRunProgress,
  computeSprintCounts,
  generateReport,
  getSprintState,
  getStoryDrillDown,
  readSprintStatusFromState,
  reconcileState,
  updateRunProgress,
  updateSprintStatus,
  updateStoryStatus,
  validateStateConsistency,
  writeStateAtomic
} from "./chunk-Y7U7QWR4.js";
import {
  fail as fail2,
  isOk,
  ok as ok2
} from "./chunk-VTBY5DZA.js";
import {
  fail,
  info,
  jsonOutput,
  ok,
  warn
} from "./chunk-EY5YNRBY.js";
import {
  getDriver,
  listDrivers,
  registerDriver
} from "./chunk-VFOCHRND.js";

// src/index.ts
import { Command } from "commander";

// src/commands/init.ts
function registerInitCommand(program) {
  program.command("init").description("Initialize the harness in a project").option("--agent-runtime <runtime>", "Agent runtime: claude-code or codex").option("--codex", "Shortcut for --agent-runtime codex", false).option("--no-frontend", "Disable frontend enforcement").option("--no-database", "Disable database enforcement").option("--no-api", "Disable API enforcement").option("--no-observability", "Skip OTLP package installation").option("--force", "Overwrite existing generated files", false).option("--observability-backend <type>", "Observability backend: victoria, elk, or none (default: victoria)").option("--otel-endpoint <url>", "Remote OTLP endpoint (skips local Docker stack)").option("--opensearch-url <url>", "Remote OpenSearch URL (skips local Docker stack)").option("--logs-url <url>", "Remote VictoriaLogs URL").option("--metrics-url <url>", "Remote VictoriaMetrics URL").option("--traces-url <url>", "Remote Jaeger/VictoriaTraces URL").action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    const agentRuntime = options.codex ? "codex" : options.agentRuntime;
    const result = await initProject({
      projectDir: process.cwd(),
      agentRuntime,
      frontend: options.frontend,
      database: options.database,
      api: options.api,
      observability: options.observability,
      force: options.force,
      observabilityBackend: options.observabilityBackend,
      otelEndpoint: options.otelEndpoint,
      opensearchUrl: options.opensearchUrl,
      logsUrl: options.logsUrl,
      metricsUrl: options.metricsUrl,
      tracesUrl: options.tracesUrl,
      json: isJson
    });
    if (!isOk(result)) {
      if (isJson) {
        jsonOutput({ status: "fail", error: result.error });
      }
      process.exitCode = 1;
    }
  });
}

// src/commands/bridge.ts
import { existsSync } from "fs";
function registerBridgeCommand(program) {
  program.command("bridge").description("Bridge BMAD epics/stories into sprint planning").option("--epics <path>", "Path to BMAD epics markdown file").option("--dry-run", "Parse and display without importing").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json ?? false;
    const epicsPath = opts.epics;
    const dryRun = opts.dryRun ?? false;
    if (!epicsPath) {
      fail("Missing required option: --epics <path>", { json: isJson });
      process.exitCode = 2;
      return;
    }
    if (!existsSync(epicsPath)) {
      fail(`Epics file not found: ${epicsPath}`, { json: isJson });
      process.exitCode = 1;
      return;
    }
    const epics = parseEpicsFile(epicsPath);
    const allStories = epics.flatMap((e) => e.stories);
    if (allStories.length === 0) {
      warn(`No stories found in ${epicsPath}`, { json: isJson });
      if (isJson) {
        jsonOutput({
          status: "ok",
          epics_parsed: epics.length,
          stories_processed: 0,
          results: []
        });
      }
      process.exitCode = 0;
      return;
    }
    if (!isJson) {
      for (const story of allStories) {
        if (story.acceptanceCriteria.length === 0) {
          warn(`Story ${story.title}: no acceptance criteria found`);
        }
      }
    }
    const results = allStories.map((story) => ({
      storyKey: story.key,
      title: story.title,
      storyFilePath: getStoryFilePath(story.key)
    }));
    if (!isJson) {
      for (const epic of epics) {
        ok(`Epic ${epic.number}: ${epic.title} \u2014 ${epic.stories.length} stories`);
      }
      if (dryRun) {
        for (const r of results) {
          info(`Dry run: would import "${r.title}" \u2192 ${r.storyFilePath}`);
        }
      }
      if (dryRun) {
        info(`Bridge: ${allStories.length} stories parsed (dry run, nothing created)`);
      } else {
        ok(`Bridge: ${allStories.length} stories processed`);
      }
    }
    if (isJson) {
      const bridgeResult = {
        status: "ok",
        epics_parsed: epics.length,
        stories_processed: allStories.length,
        results
      };
      jsonOutput(bridgeResult);
    }
    process.exitCode = 0;
  });
}

// src/commands/run.ts
import { existsSync as existsSync8 } from "fs";
import { join as join7 } from "path";

// src/lib/run-helpers.ts
import { StringDecoder } from "string_decoder";

// src/lib/agents/stream-parser.ts
function parseStreamLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const wrapperType = parsed.type;
  if (wrapperType === "stream_event") {
    return parseStreamEvent(parsed);
  }
  if (wrapperType === "system") {
    return parseSystemEvent(parsed);
  }
  if (wrapperType === "result") {
    return parseResultEvent(parsed);
  }
  return null;
}
function parseStreamEvent(parsed) {
  const event = parsed.event;
  if (!event || typeof event !== "object") {
    return null;
  }
  const eventType = event.type;
  if (eventType === "content_block_start") {
    return parseContentBlockStart(event);
  }
  if (eventType === "content_block_delta") {
    return parseContentBlockDelta(event);
  }
  if (eventType === "content_block_stop") {
    return { type: "tool-complete" };
  }
  return null;
}
function parseContentBlockStart(event) {
  const contentBlock = event.content_block;
  if (!contentBlock || typeof contentBlock !== "object") {
    return null;
  }
  if (contentBlock.type === "tool_use") {
    const name = contentBlock.name;
    const id = contentBlock.id;
    if (typeof name === "string" && typeof id === "string") {
      return { type: "tool-start", name, id };
    }
  }
  return null;
}
function parseContentBlockDelta(event) {
  const delta = event.delta;
  if (!delta || typeof delta !== "object") {
    return null;
  }
  if (delta.type === "input_json_delta") {
    const partialJson = delta.partial_json;
    if (typeof partialJson === "string") {
      return { type: "tool-input", partial: partialJson };
    }
    return null;
  }
  if (delta.type === "text_delta") {
    const text = delta.text;
    if (typeof text === "string") {
      return { type: "text", text };
    }
    return null;
  }
  return null;
}
function parseSystemEvent(parsed) {
  const subtype = parsed.subtype;
  if (subtype === "api_retry") {
    const attempt = parsed.attempt;
    const delay = parsed.retry_delay_ms;
    if (typeof attempt === "number" && typeof delay === "number") {
      return { type: "retry", attempt, delay };
    }
    return null;
  }
  return null;
}
function parseResultEvent(parsed) {
  const costUsd = parsed.cost_usd;
  const sessionId = parsed.session_id;
  if (typeof costUsd === "number" && typeof sessionId === "string") {
    return { type: "result", cost: costUsd, sessionId };
  }
  return null;
}

// src/lib/run-helpers.ts
var STORY_KEY_PATTERN = /^\d+-\d+-/;
function countStories(statuses) {
  let total = 0;
  let ready = 0;
  let done = 0;
  let inProgress = 0;
  let checked = 0;
  let verified = 0;
  for (const [key, status] of Object.entries(statuses)) {
    if (!STORY_KEY_PATTERN.test(key)) continue;
    total++;
    if (status === "backlog" || status === "ready-for-dev") ready++;
    else if (status === "done") done++;
    else if (status === "in-progress" || status === "review") inProgress++;
    else if (status === "checked") checked++;
    else if (status === "verifying") verified++;
  }
  return { total, ready, done, inProgress, checked, verified };
}
function formatElapsed(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 6e4));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${totalMinutes}m`;
}

// src/lib/workflow-parser.ts
import { readFileSync as readFileSync3 } from "fs";
import { parse as parse3 } from "yaml";

// src/lib/schema-validate.ts
import Ajv from "ajv";

// src/schemas/workflow.schema.json
var workflow_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://codeharness.dev/schemas/workflow.schema.json",
  title: "Codeharness Workflow",
  description: "Schema for codeharness workflow YAML files",
  type: "object",
  required: ["tasks"],
  properties: {
    tasks: {
      type: "object",
      description: "Named task definitions",
      additionalProperties: {
        $ref: "#/definitions/task"
      }
    },
    flow: {
      $ref: "#/definitions/flowArray",
      description: "Ordered execution steps \u2014 task references or loop blocks (legacy; prefer story_flow)"
    },
    story_flow: {
      $ref: "#/definitions/flowArray",
      description: "Story-level execution flow \u2014 task references or loop blocks"
    },
    epic_flow: {
      $ref: "#/definitions/flowArray",
      description: "Epic-level execution flow \u2014 task references or loop blocks (supports built-in refs: merge, validate)"
    },
    workflow: {
      oneOf: [
        { $ref: "#/definitions/forEachBlock" },
        { $ref: "#/definitions/stepsBlock" }
      ],
      description: "New-format workflow definition using for_each blocks or a top-level steps block (mutually exclusive with story_flow/epic_flow)"
    },
    defaults: {
      type: "object",
      description: "Default driver and model for tasks without explicit configuration",
      properties: {
        driver: {
          type: "string",
          description: "Default agent driver framework"
        },
        model: {
          type: "string",
          description: "Default model for tasks"
        }
      },
      additionalProperties: false
    },
    execution: {
      $ref: "#/definitions/execution",
      description: "Execution configuration for parallel and isolation settings"
    }
  },
  additionalProperties: false,
  definitions: {
    gateBlock: {
      type: "object",
      required: ["gate", "check"],
      properties: {
        gate: {
          type: "string",
          minLength: 1,
          description: "Gate name (must be non-empty)"
        },
        check: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "Task names to run as check agents \u2014 at least one required"
        },
        fix: {
          type: "array",
          items: { type: "string" },
          default: [],
          description: "Task names to run on check failure (no nested gates)"
        },
        pass_when: {
          type: "string",
          enum: ["consensus", "majority", "any_pass"],
          default: "consensus",
          description: "Condition for gate to pass"
        },
        max_retries: {
          type: "integer",
          minimum: 1,
          default: 3,
          description: "Maximum number of fix-retry cycles before circuit_breaker fires (minimum 1)"
        },
        circuit_breaker: {
          type: "string",
          enum: ["stagnation"],
          default: "stagnation",
          description: "Circuit breaker strategy when max_retries is exhausted"
        }
      },
      additionalProperties: false
    },
    forEachBlock: {
      type: "object",
      required: ["for_each", "steps"],
      properties: {
        for_each: {
          type: "string",
          minLength: 1,
          description: "Iteration scope (e.g. epic, story, substory)"
        },
        steps: {
          type: "array",
          minItems: 1,
          items: {
            oneOf: [
              {
                type: "string",
                description: "Task reference by name"
              },
              {
                $ref: "#/definitions/forEachBlock"
              },
              {
                $ref: "#/definitions/gateBlock"
              }
            ]
          },
          description: "Steps to execute \u2014 task names, nested for_each blocks, or gate blocks"
        }
      },
      additionalProperties: false
    },
    stepsBlock: {
      type: "object",
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          items: {
            oneOf: [
              {
                type: "string",
                description: "Task reference by name"
              },
              {
                $ref: "#/definitions/forEachBlock"
              },
              {
                $ref: "#/definitions/gateBlock"
              }
            ]
          },
          description: "Steps to execute \u2014 task names, nested for_each blocks, or gate blocks"
        }
      },
      additionalProperties: false
    },
    flowArray: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "string",
            description: "Task reference by name"
          },
          {
            type: "object",
            required: ["loop"],
            properties: {
              loop: {
                type: "array",
                items: {
                  type: "string"
                },
                minItems: 1,
                description: "Task names to repeat in a loop"
              }
            },
            additionalProperties: false,
            description: "Loop block containing task references"
          }
        ]
      }
    },
    execution: {
      type: "object",
      properties: {
        max_parallel: {
          type: "integer",
          default: 1,
          minimum: 1,
          description: "Maximum number of parallel executions"
        },
        isolation: {
          type: "string",
          enum: ["worktree", "none"],
          default: "none",
          description: "Isolation strategy \u2014 worktree or none"
        },
        merge_strategy: {
          type: "string",
          enum: ["rebase", "merge-commit"],
          default: "merge-commit",
          description: "Merge strategy for parallel work"
        },
        epic_strategy: {
          type: "string",
          enum: ["parallel", "sequential"],
          default: "sequential",
          description: "Epic execution strategy \u2014 parallel or sequential"
        },
        story_strategy: {
          type: "string",
          enum: ["sequential", "parallel"],
          default: "sequential",
          description: "Story execution strategy \u2014 sequential or parallel"
        }
      },
      additionalProperties: false
    },
    task: {
      type: "object",
      required: ["agent"],
      properties: {
        agent: {
          oneOf: [
            { type: "string" },
            { type: "null" }
          ],
          description: "Agent identifier for this task (null for engine-handled tasks)"
        },
        session: {
          type: "string",
          enum: ["fresh", "continue"],
          default: "fresh",
          description: "Session strategy \u2014 fresh or continue"
        },
        source_access: {
          type: "boolean",
          default: true,
          description: "Whether the agent has source code access"
        },
        prompt_template: {
          type: "string",
          description: "Prompt template with {{variable}} placeholders"
        },
        input_contract: {
          type: "object",
          description: "Input contract schema for this task"
        },
        output_contract: {
          type: "object",
          description: "Output contract schema for this task"
        },
        max_budget_usd: {
          type: "number",
          description: "Maximum budget in USD for this task execution"
        },
        timeout_minutes: {
          type: "number",
          description: "Timeout in minutes for this task execution"
        },
        driver: {
          type: "string",
          description: "Agent driver framework (e.g., claude-code, codex, opencode)"
        },
        model: {
          type: "string",
          description: "Model override for this task (falls through to resolution chain if omitted)"
        },
        plugins: {
          type: "array",
          items: { type: "string" },
          description: "Plugin names to load in the driver session"
        }
      },
      additionalProperties: false
    }
  }
};

// src/schemas/agent.schema.json
var agent_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://codeharness.dev/schemas/agent.schema.json",
  title: "Codeharness Agent",
  description: "Schema for codeharness agent configuration YAML files",
  type: "object",
  required: ["name", "role", "persona"],
  properties: {
    name: {
      type: "string",
      minLength: 1,
      description: "Agent identifier"
    },
    role: {
      type: "object",
      required: ["title", "purpose"],
      properties: {
        title: {
          type: "string",
          minLength: 1,
          description: "Agent's role title"
        },
        purpose: {
          type: "string",
          minLength: 1,
          description: "What this agent does"
        }
      },
      additionalProperties: false
    },
    persona: {
      type: "object",
      required: ["identity", "communication_style", "principles"],
      properties: {
        identity: {
          type: "string",
          minLength: 1,
          description: "Who this agent is"
        },
        communication_style: {
          type: "string",
          minLength: 1,
          description: "How this agent communicates"
        },
        principles: {
          type: "array",
          items: {
            type: "string",
            minLength: 1
          },
          minItems: 1,
          description: "Behavioral principles"
        }
      },
      additionalProperties: false
    },
    personality: {
      type: "object",
      required: ["traits"],
      properties: {
        traits: {
          type: "object",
          additionalProperties: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          description: "PersonaNexus-compatible traits with values constrained to 0-1"
        }
      },
      additionalProperties: false
    },
    disallowedTools: {
      type: "array",
      items: {
        type: "string"
      },
      description: "Tools this agent is not allowed to use"
    },
    prompt_template: {
      type: "string",
      description: "Task-specific prompt template included in compiled instructions"
    },
    plugins: {
      type: "array",
      items: {
        type: "string",
        minLength: 1
      },
      minItems: 1,
      description: "Plugins to load in the driver session (e.g. gstack for claude-code, omo for opencode)"
    }
  },
  additionalProperties: false
};

// src/lib/schema-validate.ts
var ajv = new Ajv({ allErrors: true });
var validateWorkflow = ajv.compile(workflow_schema_default);
var validateAgent = ajv.compile(agent_schema_default);
function validateAgainstSchema(data, validate) {
  const valid = validate(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validate.errors ?? []).map((err) => ({
    path: err.instancePath || "/",
    message: err.message ?? "Unknown validation error",
    keyword: err.keyword
  }));
  return { valid: false, errors };
}
function validateWorkflowSchema(data) {
  return validateAgainstSchema(data, validateWorkflow);
}
function validateAgentSchema(data) {
  return validateAgainstSchema(data, validateAgent);
}

// src/lib/agent-resolver.ts
import { readFileSync, existsSync as existsSync2, readdirSync } from "fs";
import { resolve, join } from "path";
import os from "os";
import { parse } from "yaml";
var AgentResolveError = class extends Error {
  filePath;
  errors;
  constructor(message, filePath, errors) {
    super(message);
    this.name = "AgentResolveError";
    this.filePath = filePath;
    this.errors = errors ?? [];
  }
};
var TEMPLATES_DIR = resolve(getPackageRoot(), "templates/agents");
var SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
function validateName(name) {
  if (!name || !SAFE_NAME_RE.test(name)) {
    throw new AgentResolveError(
      `Invalid agent name: "${name}" \u2014 must match ${SAFE_NAME_RE}`,
      "",
      [{ path: "", message: `Invalid agent name: ${name}` }]
    );
  }
}
function deepMerge(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const baseVal = base[key];
    const patchVal = patch[key];
    if (patchVal !== null && typeof patchVal === "object" && !Array.isArray(patchVal) && baseVal !== null && typeof baseVal === "object" && !Array.isArray(baseVal)) {
      result[key] = deepMerge(
        baseVal,
        patchVal
      );
    } else {
      result[key] = patchVal;
    }
  }
  return result;
}
function loadEmbeddedAgent(name) {
  validateName(name);
  const filePath = join(TEMPLATES_DIR, `${name}.yaml`);
  let raw;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new AgentResolveError(
      `Embedded agent not found: ${name}`,
      filePath,
      [{ path: filePath, message: `File not found: ${filePath}` }]
    );
  }
  let parsed;
  try {
    parsed = parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentResolveError(
      `Invalid YAML in embedded agent ${name}: ${msg}`,
      filePath,
      [{ path: filePath, message: msg }]
    );
  }
  const result = validateAgentSchema(parsed);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new AgentResolveError(
      `Schema validation failed for embedded agent ${name}: ${details}`,
      filePath,
      result.errors.map((e) => ({ path: e.path, message: e.message }))
    );
  }
  return parsed;
}
function listEmbeddedAgents() {
  try {
    const files = readdirSync(TEMPLATES_DIR);
    return files.filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort();
  } catch {
    return [];
  }
}
function loadPatch(filePath) {
  if (!existsSync2(filePath)) {
    return null;
  }
  let raw;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentResolveError(
      `Invalid YAML in patch file: ${msg}`,
      filePath,
      [{ path: filePath, message: msg }]
    );
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new AgentResolveError(
      `Patch file is not a valid object`,
      filePath,
      [{ path: filePath, message: "Patch must be a YAML object" }]
    );
  }
  return parsed;
}
function mergePatch(base, patch) {
  let result = { ...base };
  if (patch.overrides) {
    result = deepMerge(result, patch.overrides);
  }
  if (patch.prompt_patches) {
    const existing = result.prompt_patches;
    const existingAppend = existing?.append ?? "";
    const newAppend = patch.prompt_patches.append ?? "";
    if (newAppend) {
      result.prompt_patches = {
        append: existingAppend ? `${existingAppend}
${newAppend}` : newAppend
      };
    }
  }
  return result;
}
function resolveAgent(name, options) {
  validateName(name);
  const cwd = options?.cwd ?? process.cwd();
  const userPatchPath = join(os.homedir(), ".codeharness", "agents", `${name}.patch.yaml`);
  const projectPatchPath = join(cwd, ".codeharness", "agents", `${name}.patch.yaml`);
  const projectCustomPath = join(cwd, ".codeharness", "agents", `${name}.yaml`);
  const userCustomPath = join(os.homedir(), ".codeharness", "agents", `${name}.yaml`);
  for (const customPath of [projectCustomPath, userCustomPath]) {
    if (existsSync2(customPath)) {
      const patch = loadPatch(customPath);
      if (patch && !patch.extends) {
        const parsed = patch;
        const { prompt_patches: customPP, ...customForValidation } = parsed;
        const result2 = validateAgentSchema(customForValidation);
        if (!result2.valid) {
          const details = result2.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
          throw new AgentResolveError(
            `Schema validation failed for custom agent ${name}: ${details}`,
            customPath,
            result2.errors.map((e) => ({ path: e.path, message: e.message }))
          );
        }
        return customPP ? { ...customForValidation, prompt_patches: customPP } : customForValidation;
      }
    }
  }
  const base = loadEmbeddedAgent(name);
  let merged = base;
  const userPatch = loadPatch(userPatchPath);
  if (userPatch) {
    merged = mergePatch(merged, userPatch);
  }
  const projectPatch = loadPatch(projectPatchPath);
  if (projectPatch) {
    merged = mergePatch(merged, projectPatch);
  }
  const { prompt_patches, ...forValidation } = merged;
  const result = validateAgentSchema(forValidation);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    const errorPath = projectPatch ? projectPatchPath : userPatch ? userPatchPath : "merged";
    throw new AgentResolveError(
      `Schema validation failed after merging patches for ${name}: ${details}`,
      errorPath,
      result.errors.map((e) => ({ path: e.path, message: e.message }))
    );
  }
  return prompt_patches ? { ...forValidation, prompt_patches } : forValidation;
}
function compileSubagentDefinition(agent) {
  const parts = [];
  parts.push(`You are ${agent.persona.identity}`);
  parts.push(`Communication style: ${agent.persona.communication_style}`);
  if (agent.persona.principles.length > 0) {
    const bullets = agent.persona.principles.map((p2) => `- ${p2}`).join("\n");
    parts.push(`Principles:
${bullets}`);
  }
  if (agent.prompt_patches?.append) {
    parts.push(agent.prompt_patches.append);
  }
  if (agent.prompt_template) {
    parts.push(agent.prompt_template);
  }
  return {
    name: agent.name,
    model: "",
    // Intentionally empty - resolved at dispatch time via resolveModel()
    instructions: parts.join("\n\n"),
    disallowedTools: agent.disallowedTools ?? [],
    ...agent.plugins?.length ? { plugins: agent.plugins } : {},
    bare: true
  };
}

// src/lib/workflow-execution.ts
var EXECUTION_DEFAULTS = {
  max_parallel: 1,
  isolation: "none",
  merge_strategy: "merge-commit",
  epic_strategy: "sequential",
  story_strategy: "sequential"
};
var VALID_ISOLATION = /* @__PURE__ */ new Set(["worktree", "none"]);
var VALID_MERGE_STRATEGY = /* @__PURE__ */ new Set(["rebase", "merge-commit"]);
var VALID_EPIC_STRATEGY = /* @__PURE__ */ new Set(["parallel", "sequential"]);
var VALID_STORY_STRATEGY = /* @__PURE__ */ new Set(["sequential", "parallel"]);
var HierarchicalFlowError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "HierarchicalFlowError";
  }
};
function resolveExecutionConfig(raw) {
  const maxParallel = raw.max_parallel;
  if (maxParallel !== void 0 && (typeof maxParallel !== "number" || !Number.isInteger(maxParallel) || maxParallel < 1)) {
    throw new HierarchicalFlowError(
      `Invalid execution.max_parallel: expected positive integer, got ${JSON.stringify(maxParallel)}`
    );
  }
  if (raw.isolation !== void 0 && !VALID_ISOLATION.has(String(raw.isolation))) {
    throw new HierarchicalFlowError(
      `Invalid execution.isolation: expected "worktree" or "none", got ${JSON.stringify(raw.isolation)}`
    );
  }
  if (raw.merge_strategy !== void 0 && !VALID_MERGE_STRATEGY.has(String(raw.merge_strategy))) {
    throw new HierarchicalFlowError(
      `Invalid execution.merge_strategy: expected "rebase" or "merge-commit", got ${JSON.stringify(raw.merge_strategy)}`
    );
  }
  if (raw.epic_strategy !== void 0 && !VALID_EPIC_STRATEGY.has(String(raw.epic_strategy))) {
    throw new HierarchicalFlowError(
      `Invalid execution.epic_strategy: expected "parallel" or "sequential", got ${JSON.stringify(raw.epic_strategy)}`
    );
  }
  if (raw.story_strategy !== void 0 && !VALID_STORY_STRATEGY.has(String(raw.story_strategy))) {
    throw new HierarchicalFlowError(
      `Invalid execution.story_strategy: expected "sequential" or "parallel", got ${JSON.stringify(raw.story_strategy)}`
    );
  }
  return {
    max_parallel: maxParallel ?? EXECUTION_DEFAULTS.max_parallel,
    isolation: raw.isolation ?? EXECUTION_DEFAULTS.isolation,
    merge_strategy: raw.merge_strategy ?? EXECUTION_DEFAULTS.merge_strategy,
    epic_strategy: raw.epic_strategy ?? EXECUTION_DEFAULTS.epic_strategy,
    story_strategy: raw.story_strategy ?? EXECUTION_DEFAULTS.story_strategy
  };
}
function validateReferentialIntegrity(data, errors) {
  const registeredDrivers = listDrivers();
  const driverRegistryPopulated = registeredDrivers.length > 0;
  const embeddedAgents = listEmbeddedAgents();
  for (const [taskName, task] of Object.entries(data.tasks)) {
    if (task.driver !== void 0 && typeof task.driver === "string" && driverRegistryPopulated) {
      if (!registeredDrivers.includes(task.driver)) {
        errors.push({
          path: `/tasks/${taskName}/driver`,
          message: `Driver "${task.driver}" not found in task "${taskName}". Registered drivers: ${registeredDrivers.join(", ")}`
        });
      }
    }
    if (task.agent !== void 0 && task.agent !== null && typeof task.agent === "string") {
      try {
        resolveAgent(task.agent);
      } catch (err) {
        if (err instanceof AgentResolveError && err.message.startsWith("Embedded agent not found:")) {
          const available = embeddedAgents.length > 0 ? embeddedAgents.join(", ") : "(none)";
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" not found in task "${taskName}". Available agents: ${available}`
          });
        } else if (err instanceof AgentResolveError) {
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${err.message}`
          });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${msg}`
          });
        }
      }
    }
  }
}

// src/lib/workflow-resolver.ts
import { readFileSync as readFileSync2, existsSync as existsSync3 } from "fs";
import { join as join2, resolve as resolve2 } from "path";
import os2 from "os";
import { parse as parse2 } from "yaml";
var TEMPLATES_DIR2 = resolve2(getPackageRoot(), "templates/workflows");
function deepMerge2(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const baseVal = base[key];
    const patchVal = patch[key];
    if (patchVal !== null && typeof patchVal === "object" && !Array.isArray(patchVal) && baseVal !== null && typeof baseVal === "object" && !Array.isArray(baseVal)) {
      result[key] = deepMerge2(
        baseVal,
        patchVal
      );
    } else {
      result[key] = patchVal;
    }
  }
  return result;
}
function loadWorkflowPatch(filePath) {
  if (!existsSync3(filePath)) {
    return null;
  }
  let raw;
  try {
    raw = readFileSync2(filePath, "utf-8");
  } catch (err) {
    const code = err instanceof Error && "code" in err ? err.code : void 0;
    if (code === "ENOENT") {
      return null;
    }
    const detail = code === "EACCES" ? "Permission denied" : "File unreadable";
    throw new WorkflowParseError(`${detail}: ${filePath}`, [
      { path: filePath, message: detail }
    ]);
  }
  let parsed;
  try {
    parsed = parse2(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML in patch file ${filePath}: ${msg}`, [
      { path: filePath, message: msg }
    ]);
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new WorkflowParseError(`Patch file is not a valid object: ${filePath}`, [
      { path: filePath, message: "Patch must be a YAML object" }
    ]);
  }
  return parsed;
}
function mergeWorkflowPatch(base, patch) {
  let result = { ...base };
  if (patch.overrides) {
    result = deepMerge2(result, patch.overrides);
  }
  if (patch.replace) {
    for (const key of Object.keys(patch.replace)) {
      result[key] = patch.replace[key];
    }
  }
  return result;
}
function resolveWorkflow(options) {
  const cwd = options?.cwd ?? process.cwd();
  const name = options?.name ?? "default";
  const userPatchPath = join2(os2.homedir(), ".codeharness", "workflows", `${name}.patch.yaml`);
  const projectPatchPath = join2(cwd, ".codeharness", "workflows", `${name}.patch.yaml`);
  const projectCustomPath = join2(cwd, ".codeharness", "workflows", `${name}.yaml`);
  if (existsSync3(projectCustomPath)) {
    const customPatch = loadWorkflowPatch(projectCustomPath);
    if (customPatch && !customPatch.extends) {
      return parseWorkflow(projectCustomPath);
    }
  }
  const embeddedPath = join2(TEMPLATES_DIR2, `${name}.yaml`);
  let raw;
  try {
    raw = readFileSync2(embeddedPath, "utf-8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : `File not found: ${embeddedPath}`;
    throw new WorkflowParseError(`Embedded workflow not found: ${name}`, [
      { path: embeddedPath, message: detail }
    ]);
  }
  let baseData;
  try {
    baseData = parse2(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML in embedded workflow ${name}: ${msg}`, [
      { path: embeddedPath, message: msg }
    ]);
  }
  let merged = baseData;
  const userPatch = loadWorkflowPatch(userPatchPath);
  if (userPatch) {
    merged = mergeWorkflowPatch(merged, userPatch);
  }
  const projectPatch = loadWorkflowPatch(projectPatchPath);
  if (projectPatch) {
    merged = mergeWorkflowPatch(merged, projectPatch);
  }
  return parseWorkflowData(merged);
}

// src/lib/workflow-parser.ts
var WorkflowParseError = class extends Error {
  errors;
  constructor(message, errors) {
    super(message);
    this.name = "WorkflowParseError";
    this.errors = errors ?? [];
  }
};
function parseForEachFlow(block, taskNames, path, errors) {
  const b = block;
  const scope = b.for_each;
  const rawSteps = b.steps;
  const parsedSteps = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const stepPath = `${path}.steps[${i}]`;
    if (typeof step === "string") {
      if (!taskNames.has(step)) {
        errors.push({
          path: stepPath,
          message: `Task "${step}" referenced in ${stepPath} but not defined in tasks`
        });
      }
      parsedSteps.push(step);
    } else if (typeof step === "object" && step !== null && "for_each" in step) {
      const nested = parseForEachFlow(step, taskNames, stepPath, errors);
      parsedSteps.push(nested);
    } else if (typeof step === "object" && step !== null && "gate" in step) {
      const g = step;
      const checkTasks = g.check ?? [];
      const fixTasks = g.fix ?? [];
      for (let j = 0; j < checkTasks.length; j++) {
        if (!taskNames.has(checkTasks[j])) {
          errors.push({
            path: `${stepPath}.check[${j}]`,
            message: `Gate check task "${checkTasks[j]}" at ${stepPath}.check[${j}] not defined in tasks`
          });
        }
      }
      for (let j = 0; j < fixTasks.length; j++) {
        if (!taskNames.has(fixTasks[j])) {
          errors.push({
            path: `${stepPath}.fix[${j}]`,
            message: `Gate fix task "${fixTasks[j]}" at ${stepPath}.fix[${j}] not defined in tasks`
          });
        }
      }
      const gateBlock = {
        gate: g.gate,
        check: checkTasks,
        fix: fixTasks,
        pass_when: g.pass_when ?? "consensus",
        max_retries: g.max_retries ?? 3,
        circuit_breaker: g.circuit_breaker ?? "stagnation"
      };
      parsedSteps.push(gateBlock);
    } else {
      errors.push({
        path: stepPath,
        message: `Invalid step at ${stepPath}: expected task name, for_each block, or gate block`
      });
    }
  }
  return { for_each: scope, steps: parsedSteps };
}
function deriveFlowsFromForEach(workflowBlock) {
  const storyFlow = [];
  const epicFlow = [];
  const sprintFlow = [];
  const isTopLevelEpic = workflowBlock.for_each === "epic";
  const topSteps = workflowBlock.steps;
  if (isTopLevelEpic) {
    extractEpicSteps(topSteps, storyFlow, epicFlow);
  } else {
    for (const step of topSteps) {
      if (typeof step === "object" && step !== null && "for_each" in step) {
        const nested = step;
        if (nested.for_each === "epic") {
          extractEpicSteps(nested.steps, storyFlow, epicFlow);
        }
      } else if (typeof step === "string") {
        sprintFlow.push(step);
      } else if (typeof step === "object" && step !== null && "gate" in step) {
        sprintFlow.push(step);
      }
    }
  }
  return { storyFlow, epicFlow, sprintFlow };
}
function extractEpicSteps(steps, storyFlow, epicFlow) {
  for (const step of steps) {
    if (typeof step === "string") {
      epicFlow.push(step);
    } else if (typeof step === "object" && step !== null && "for_each" in step) {
      const nested = step;
      if (nested.for_each === "story") {
        epicFlow.push("story_flow");
        for (const storyStep of nested.steps) {
          if (typeof storyStep === "string") {
            storyFlow.push(storyStep);
          } else if (typeof storyStep === "object" && storyStep !== null && "gate" in storyStep) {
            storyFlow.push(storyStep);
          }
        }
      }
    } else if (typeof step === "object" && step !== null && "gate" in step) {
      epicFlow.push(step);
    }
  }
}
function parseWorkflowData(parsed) {
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed;
    const hasWorkflowKey = "workflow" in obj && obj.workflow !== void 0;
    if (!hasWorkflowKey) {
      throw new WorkflowParseError(
        'Workflow must define "workflow" key with for_each format',
        [{ path: "/", message: 'Missing "workflow" key \u2014 use for_each format' }]
      );
    }
  }
  const result = validateWorkflowSchema(parsed);
  if (!result.valid) {
    const normalizedErrors = result.errors.map((e) => {
      if (e.path.endsWith("/gate")) {
        return {
          path: e.path,
          message: "gate name must be a non-empty string"
        };
      }
      return { path: e.path, message: e.message };
    });
    const details = normalizedErrors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new WorkflowParseError(
      `Schema validation failed: ${details}`,
      normalizedErrors
    );
  }
  const data = parsed;
  const hasWorkflow = "workflow" in data && data.workflow !== void 0;
  if (hasWorkflow) {
    const taskNames = new Set(Object.keys(data.tasks));
    const allErrors = [];
    const workflowBlock = parseForEachFlow(data.workflow, taskNames, "workflow", allErrors);
    validateReferentialIntegrity(data, allErrors);
    if (allErrors.length > 0) {
      const details = allErrors.map((e) => e.message).join("; ");
      throw new WorkflowParseError(`Referential integrity errors: ${details}`, allErrors);
    }
    const defaults = data.defaults ?? void 0;
    const resolvedTasks = resolveTasksMap(data.tasks, defaults);
    const rawExecution = data.execution != null && typeof data.execution === "object" ? data.execution : {};
    let execution;
    try {
      execution = resolveExecutionConfig(rawExecution);
    } catch (err) {
      if (err instanceof HierarchicalFlowError) {
        throw new WorkflowParseError(err.message, [{ path: "/", message: err.message }]);
      }
      throw err;
    }
    const { storyFlow, epicFlow, sprintFlow } = deriveFlowsFromForEach(workflowBlock);
    return {
      tasks: resolvedTasks,
      storyFlow,
      epicFlow,
      sprintFlow,
      execution,
      workflow: workflowBlock
    };
  }
  throw new WorkflowParseError("Workflow must use for_each format", [{ path: "/", message: "Use workflow: with for_each blocks" }]);
}
function resolveTasksMap(rawTasks, defaults) {
  const resolvedTasks = {};
  for (const [taskName, task] of Object.entries(rawTasks)) {
    const resolved = {
      agent: task.agent,
      session: task.session ?? "fresh",
      source_access: task.source_access ?? true
    };
    if (task.prompt_template !== void 0) resolved.prompt_template = task.prompt_template;
    if (task.input_contract !== void 0) resolved.input_contract = task.input_contract;
    if (task.output_contract !== void 0) resolved.output_contract = task.output_contract;
    if (task.max_budget_usd !== void 0) resolved.max_budget_usd = task.max_budget_usd;
    if (task.timeout_minutes !== void 0) resolved.timeout_minutes = task.timeout_minutes;
    const driver = task.driver ?? defaults?.driver;
    if (driver != null) resolved.driver = driver;
    const model = task.model ?? defaults?.model;
    if (model != null) resolved.model = model;
    if (task.plugins !== void 0) resolved.plugins = task.plugins;
    resolvedTasks[taskName] = resolved;
  }
  return resolvedTasks;
}
function parseWorkflow(filePath) {
  let raw;
  try {
    raw = readFileSync3(filePath, "utf-8");
  } catch (err) {
    const code = err instanceof Error && "code" in err ? err.code : void 0;
    const detail = code === "ENOENT" ? "File not found" : code === "EACCES" ? "Permission denied" : code === "EISDIR" ? "Path is a directory" : "File not found or unreadable";
    throw new WorkflowParseError(`${detail}: ${filePath}`, [
      { path: filePath, message: detail }
    ]);
  }
  let parsed;
  try {
    parsed = parse3(raw);
  } catch (err) {
    const yamlMsg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML syntax: ${yamlMsg}`, [
      { path: filePath, message: yamlMsg }
    ]);
  }
  return parseWorkflowData(parsed);
}

// src/lib/workflow-runner.ts
import { createActor as createActor4 } from "xstate";

// src/lib/workflow-persistence.ts
import { createHash } from "crypto";
import { existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync5, renameSync, unlinkSync as unlinkSync2, writeFileSync } from "fs";
import { join as join4 } from "path";

// src/lib/workflow-checkpoint-log.ts
import { appendFileSync, existsSync as existsSync4, mkdirSync, readFileSync as readFileSync4, unlinkSync } from "fs";
import { join as join3 } from "path";
var STATE_DIR = ".codeharness";
var CHECKPOINT_FILE = "workflow-checkpoints.jsonl";
function appendCheckpoint(entry, projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join3(baseDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(join3(stateDir, CHECKPOINT_FILE), JSON.stringify(entry) + "\n", "utf-8");
}
function loadCheckpointLog(projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const checkpointPath = join3(baseDir, STATE_DIR, CHECKPOINT_FILE);
  if (!existsSync4(checkpointPath)) return [];
  let raw;
  try {
    raw = readFileSync4(checkpointPath, "utf-8");
  } catch {
    warn("workflow-persistence: Could not read workflow-checkpoints.jsonl \u2014 starting with no checkpoints");
    return [];
  }
  const entries = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      warn(`workflow-persistence: corrupt checkpoint entry skipped (invalid JSON): ${line.slice(0, 80)}`);
    }
  }
  return entries;
}
function clearCheckpointLog(projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const checkpointPath = join3(baseDir, STATE_DIR, CHECKPOINT_FILE);
  try {
    if (existsSync4(checkpointPath)) unlinkSync(checkpointPath);
  } catch {
  }
}

// src/lib/workflow-persistence.ts
var STATE_DIR2 = ".codeharness";
var SNAPSHOT_FILE = "workflow-snapshot.json";
var OLD_YAML_FILE = "workflow-state.yaml";
function computeConfigHash(config) {
  const stableJson = JSON.stringify({ workflow: config.workflow, agents: config.agents }, stableReplacer);
  return createHash("sha256").update(stableJson).digest("hex");
}
function stableReplacer(_key, value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = value[k];
    }
    return sorted;
  }
  return value;
}
var SET_TYPE_MARKER = "__Set__";
function setReplacer(_key, value) {
  if (value instanceof Set) {
    return { [SET_TYPE_MARKER]: true, values: Array.from(value) };
  }
  return value;
}
function setReviver(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    if (record[SET_TYPE_MARKER] === true && Array.isArray(record.values)) {
      return new Set(record.values);
    }
  }
  return value;
}
function saveSnapshot(xstateSnapshot, configHash, projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join4(baseDir, STATE_DIR2);
  mkdirSync2(stateDir, { recursive: true });
  const snapshotPath = join4(stateDir, SNAPSHOT_FILE);
  const tmpPath = snapshotPath + ".tmp";
  const data = {
    snapshot: xstateSnapshot,
    configHash,
    savedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeFileSync(tmpPath, JSON.stringify(data, setReplacer, 2), "utf-8");
  renameSync(tmpPath, snapshotPath);
}
function snapshotFileExists(projectDir) {
  const baseDir = projectDir ?? process.cwd();
  return existsSync5(join4(baseDir, STATE_DIR2, SNAPSHOT_FILE));
}
function loadSnapshot(projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join4(baseDir, STATE_DIR2);
  const snapshotPath = join4(stateDir, SNAPSHOT_FILE);
  const oldYamlPath = join4(baseDir, STATE_DIR2, OLD_YAML_FILE);
  const tmpPath = snapshotPath + ".tmp";
  if (existsSync5(tmpPath)) {
    try {
      unlinkSync2(tmpPath);
    } catch {
    }
  }
  if (existsSync5(oldYamlPath) && !existsSync5(snapshotPath)) {
    warn("workflow-persistence: Found old workflow-state.yaml \u2014 this format is no longer supported. A fresh start is required. Delete .codeharness/workflow-state.yaml to proceed.");
  }
  if (!existsSync5(snapshotPath)) {
    return null;
  }
  let raw;
  try {
    raw = readFileSync5(snapshotPath, "utf-8");
  } catch {
    warn("workflow-persistence: Could not read workflow-snapshot.json \u2014 invalid or corrupt file, starting fresh");
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw, setReviver);
  } catch {
    warn("workflow-persistence: corrupt workflow-snapshot.json (invalid JSON) \u2014 starting fresh");
    return null;
  }
  if (!isValidSnapshot(parsed)) {
    warn("workflow-persistence: invalid workflow-snapshot.json shape (missing required fields) \u2014 starting fresh");
    return null;
  }
  return parsed;
}
function clearSnapshot(projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const snapshotPath = join4(baseDir, STATE_DIR2, SNAPSHOT_FILE);
  try {
    if (existsSync5(snapshotPath)) {
      unlinkSync2(snapshotPath);
    }
  } catch {
  }
}
function cleanStaleTmpFiles(projectDir) {
  const baseDir = projectDir ?? process.cwd();
  const tmpPath = join4(baseDir, STATE_DIR2, `${SNAPSHOT_FILE}.tmp`);
  try {
    if (existsSync5(tmpPath)) unlinkSync2(tmpPath);
  } catch {
  }
}
function clearAllPersistence(projectDir) {
  cleanStaleTmpFiles(projectDir);
  const baseDir = projectDir ?? process.cwd();
  const checkpointPath = join4(baseDir, STATE_DIR2, "workflow-checkpoints.jsonl");
  let snapshotCleared = false;
  let checkpointCleared = false;
  try {
    const snapshotPath = join4(baseDir, STATE_DIR2, SNAPSHOT_FILE);
    if (existsSync5(snapshotPath)) {
      unlinkSync2(snapshotPath);
      snapshotCleared = true;
    }
  } catch {
  }
  try {
    if (existsSync5(checkpointPath)) {
      unlinkSync2(checkpointPath);
      checkpointCleared = true;
    }
  } catch {
  }
  return { snapshotCleared, checkpointCleared };
}
function isValidSnapshot(value) {
  if (!value || typeof value !== "object") return false;
  const s = value;
  if (!s.snapshot || typeof s.snapshot !== "object") return false;
  if (typeof s.configHash !== "string" || s.configHash.length === 0) return false;
  if (typeof s.savedAt !== "string" || Number.isNaN(Date.parse(s.savedAt))) return false;
  return true;
}
var XSTATE_SNAPSHOT_STATUSES = /* @__PURE__ */ new Set(["active", "done", "error", "stopped"]);
function isRestorableXStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const candidate = snapshot;
  return Object.hasOwn(candidate, "status") && typeof candidate.status === "string" && XSTATE_SNAPSHOT_STATUSES.has(candidate.status) && Object.hasOwn(candidate, "value") && candidate.value !== null && candidate.value !== void 0 && Object.hasOwn(candidate, "context") && candidate.context !== null && typeof candidate.context === "object";
}

// src/lib/workflow-run-machine.ts
import { assign as assign4, createActor as createActor3, fromPromise as fromPromise4, setup as setup4, waitFor as waitFor3 } from "xstate";

// src/lib/workflow-epic-machine.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync3, readFileSync as readFileSync6, rmSync, writeFileSync as writeFileSync2 } from "fs";
import { join as join5 } from "path";
import { assign as assign3, createActor as createActor2, fromPromise as fromPromise3, setup as setup3, waitFor as waitFor2 } from "xstate";

// src/lib/workflow-gate-machine.ts
import { setup, assign, fromPromise } from "xstate";
function toGateError(err, taskName, storyKey) {
  if (isEngineError(err)) return err;
  return { taskName, storyKey, code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
}
function resolveStoryKey(ctx) {
  return ctx.parentItemKey ? `${ctx.parentItemKey}:${ctx.gate.gate}` : ctx.gate.gate;
}
function mergeSignals(existing, next) {
  if (!existing || typeof existing.addEventListener !== "function") return next;
  const ctrl = new AbortController();
  if (existing.aborted || next.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  const abort = () => ctrl.abort();
  existing.addEventListener("abort", abort, { once: true });
  if (typeof next.addEventListener === "function") next.addEventListener("abort", abort, { once: true });
  return ctrl.signal;
}
function computeVerdictScore(verdicts, iteration) {
  let passed = 0;
  let failed = 0;
  let unknown = 0;
  for (const v of Object.values(verdicts)) {
    const p2 = parseVerdict(v);
    passed += p2.score.passed;
    failed += p2.score.failed;
    unknown += p2.score.unknown;
  }
  return { iteration, passed, failed, unknown, total: passed + failed + unknown || 1, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
}
function mergeMetricsFromVerdicts(verdicts) {
  let hasAny = false;
  let testsPassed = 0;
  let testsFailed = 0;
  let lintWarnings = 0;
  let issues = 0;
  for (const output of Object.values(verdicts)) {
    const parsed = parseVerdict(output);
    if (parsed.metrics) {
      hasAny = true;
      testsPassed = Math.max(testsPassed, parsed.metrics.testsPassed);
      testsFailed = Math.max(testsFailed, parsed.metrics.testsFailed);
      lintWarnings += parsed.metrics.lintWarnings;
      issues += parsed.metrics.issues;
    }
  }
  return hasAny ? { testsPassed, testsFailed, lintWarnings, issues } : null;
}
var checkPhaseActor = fromPromise(async ({ input, signal }) => {
  let ctx = { ...input, config: { ...input.config, abortSignal: mergeSignals(input.config.abortSignal, signal) } };
  const storyKey = resolveStoryKey(ctx);
  for (const taskName of ctx.gate.check) {
    if (signal.aborted) throw Object.assign(new Error("Gate interrupted"), { name: "AbortError" });
    const task = ctx.config.workflow.tasks[taskName];
    if (!task) {
      warn(`gate-machine: check task "${taskName}" not found, skipping`);
      continue;
    }
    let out;
    try {
      if (task.agent === null) {
        out = await nullTaskCore({ task, taskName, storyKey, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      } else {
        const definition = ctx.config.agents[task.agent];
        if (!definition) {
          warn(`gate-machine: agent "${task.agent}" not found for "${taskName}", skipping`);
          continue;
        }
        out = await dispatchTaskCore({ task, taskName, storyKey, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      }
      ctx = { ...ctx, verdicts: { ...ctx.verdicts, [taskName]: out.contract?.output ?? "" }, workflowState: out.updatedState, lastContract: out.contract, tasksCompleted: ctx.tasksCompleted + 1, accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) throw err;
      const gateErr = toGateError(err, taskName, storyKey);
      if (ctx.config.onEvent) ctx.config.onEvent({ type: "dispatch-error", taskName, storyKey, error: { code: gateErr.code, message: gateErr.message } });
      ctx = { ...ctx, errors: [...ctx.errors, gateErr] };
    }
  }
  return ctx;
});
var fixPhaseActor = fromPromise(async ({ input, signal }) => {
  let ctx = { ...input, verdicts: {}, config: { ...input.config, abortSignal: mergeSignals(input.config.abortSignal, signal) } };
  const storyKey = resolveStoryKey(ctx);
  for (const taskName of ctx.gate.fix) {
    if (signal.aborted) throw Object.assign(new Error("Gate interrupted"), { name: "AbortError" });
    const task = ctx.config.workflow.tasks[taskName];
    if (!task) {
      warn(`gate-machine: fix task "${taskName}" not found, skipping`);
      continue;
    }
    let out;
    try {
      if (task.agent === null) {
        out = await nullTaskCore({ task, taskName, storyKey, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      } else {
        const definition = ctx.config.agents[task.agent];
        if (!definition) {
          warn(`gate-machine: agent "${task.agent}" not found for "${taskName}", skipping`);
          continue;
        }
        out = await dispatchTaskCore({ task, taskName, storyKey, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      }
      ctx = { ...ctx, workflowState: out.updatedState, lastContract: out.contract, tasksCompleted: ctx.tasksCompleted + 1, accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) throw err;
      const gateErr = toGateError(err, taskName, storyKey);
      if (ctx.config.onEvent) ctx.config.onEvent({ type: "dispatch-error", taskName, storyKey, error: { code: gateErr.code, message: gateErr.message } });
      ctx = { ...ctx, errors: [...ctx.errors, gateErr] };
    }
  }
  return ctx;
});
var gateMachine = setup({
  types: {},
  actors: { checkPhaseActor, fixPhaseActor },
  guards: {
    /**
     * True when ALL check tasks contributed a verdict AND every verdict parses as 'pass'.
     * Returns false if verdicts is empty or if fewer verdicts were collected than
     * check tasks configured (i.e. some tasks were skipped due to missing definition
     * or missing agent — skipped tasks must not silently count as passing).
     */
    allPassed: ({ context }) => {
      const entries = Object.values(context.verdicts);
      if (entries.length === 0) return false;
      if (entries.length < context.gate.check.length) return false;
      return entries.every((v) => parseVerdict(v).verdict === "pass");
    },
    /** True when iteration count has reached max_retries. */
    maxRetries: ({ context }) => context.workflowState.iteration >= context.gate.max_retries,
    /** True when metrics-based circuit breaker detects real stagnation (3+ identical iterations). */
    circuitBreaker: ({ context }) => context.workflowState.circuit_breaker.triggered,
    /** True when the actor threw an AbortError (user-initiated abort signal). */
    isAbortError: ({ event }) => {
      const err = event.error;
      return err instanceof Error && err.name === "AbortError";
    },
    /** True when the actor threw a halt-inducing DispatchError (RATE_LIMIT/NETWORK/SDK_INIT). */
    isHaltError: ({ event }) => {
      const err = event.error;
      return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code);
    }
  }
}).createMachine({
  id: "gate",
  context: ({ input }) => input,
  output: ({ context }) => ({
    workflowState: context.workflowState,
    errors: context.errors,
    tasksCompleted: context.tasksCompleted,
    halted: context.halted,
    lastContract: context.lastContract,
    accumulatedCostUsd: context.accumulatedCostUsd,
    verdicts: context.verdicts
  }),
  on: { INTERRUPT: ".interrupted" },
  initial: "checking",
  states: {
    /** Run all check tasks; accumulate verdicts. */
    checking: {
      invoke: {
        src: "checkPhaseActor",
        input: ({ context }) => context,
        onDone: { target: "evaluate", actions: assign(({ event }) => event.output) },
        onError: [
          { guard: "isAbortError", target: "interrupted" },
          { guard: "isHaltError", target: "halted", actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toGateError(event.error, "check-phase", resolveStoryKey(context))] })) },
          { target: "halted", actions: assign(({ context, event }) => ({ errors: [...context.errors, toGateError(event.error, "check-phase", resolveStoryKey(context))] })) }
        ]
      }
    },
    /**
     * Evaluate phase: entry action increments iteration and computes circuit-breaker
     * decision, then eventless transitions choose the next state.
     */
    evaluate: {
      entry: assign(({ context }) => {
        const newIteration = context.workflowState.iteration + 1;
        const score = computeVerdictScore(context.verdicts, newIteration);
        const newScores = [...context.workflowState.evaluator_scores, score];
        const iterationMetrics = mergeMetricsFromVerdicts(context.verdicts);
        const metricsHistory = [...context.metricsHistory ?? [], iterationMetrics];
        const cbDecision = evaluateMetricsProgress(metricsHistory);
        const newCb = cbDecision.halt ? { triggered: true, reason: cbDecision.reason, score_history: newScores.map((s) => s.passed) } : context.workflowState.circuit_breaker;
        return {
          workflowState: { ...context.workflowState, iteration: newIteration, evaluator_scores: newScores, circuit_breaker: newCb },
          metricsHistory
        };
      }),
      always: [
        { guard: "allPassed", target: "passed" },
        { guard: "maxRetries", target: "maxedOut" },
        { guard: "circuitBreaker", target: "maxedOut" },
        // stagnation → same as maxedOut (not halt)
        { target: "fixing" }
      ]
    },
    /** Run all fix tasks; verdicts are reset so next check phase starts fresh. */
    fixing: {
      invoke: {
        src: "fixPhaseActor",
        input: ({ context }) => context,
        onDone: { target: "checking", actions: assign(({ event }) => event.output) },
        onError: [
          { guard: "isAbortError", target: "interrupted" },
          { guard: "isHaltError", target: "halted", actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toGateError(event.error, "fix-phase", resolveStoryKey(context))] })) },
          { target: "halted", actions: assign(({ context, event }) => ({ errors: [...context.errors, toGateError(event.error, "fix-phase", resolveStoryKey(context))] })) }
        ]
      }
    },
    passed: { type: "final" },
    maxedOut: { type: "final" },
    // NOT halted — story failed, but epic continues to next story
    halted: { type: "final", entry: assign({ halted: true }) },
    // real halt (RATE_LIMIT, NETWORK)
    interrupted: { type: "final", entry: assign({ halted: true }) }
    // user interrupt
  }
});

// src/lib/workflow-story-machine.ts
import { setup as setup2, assign as assign2, fromPromise as fromPromise2, createActor, waitFor } from "xstate";
var storyStepActor = fromPromise2(async ({ input, signal }) => {
  let ctx = { ...input, config: { ...input.config, abortSignal: signal } };
  const storyKey = ctx.item.key;
  const hasSuccessfulGateCompletionRecord = (taskName) => ctx.workflowState.tasks_completed.some(
    (checkpoint) => checkpoint.task_name === taskName && checkpoint.story_key === storyKey && !checkpoint.error
  );
  for (const step of ctx.config.workflow.storyFlow) {
    if (signal.aborted) throw Object.assign(new Error("Story interrupted"), { name: "AbortError" });
    if (isGateConfig(step)) {
      const completedTasksForGate = ctx.completedTasks ?? /* @__PURE__ */ new Set();
      if (completedTasksForGate.has(`${storyKey}::${step.gate}`) && hasSuccessfulGateCompletionRecord(step.gate)) {
        info(`workflow-runner: Skipping ${step.gate} for ${storyKey} \u2014 checkpoint found`);
        continue;
      }
      const gateWorkflowState = {
        ...ctx.workflowState,
        iteration: 0,
        evaluator_scores: [],
        circuit_breaker: { triggered: false, reason: null, score_history: [] }
      };
      const gateCtx = {
        gate: step,
        config: ctx.config,
        workflowState: gateWorkflowState,
        errors: [],
        tasksCompleted: 0,
        halted: false,
        lastContract: ctx.lastContract,
        accumulatedCostUsd: ctx.accumulatedCostUsd,
        verdicts: {},
        parentItemKey: storyKey
      };
      const gateActor = createActor(gateMachine, { input: gateCtx });
      gateActor.start();
      const gateSnap = await waitFor(gateActor, (s) => s.status === "done", {});
      const gateOut = gateSnap.output;
      const gatePassed = gateSnap.value === "passed";
      ctx = {
        ...ctx,
        workflowState: gatePassed ? {
          ...gateOut.workflowState,
          tasks_completed: [
            ...gateOut.workflowState.tasks_completed,
            { task_name: step.gate, story_key: storyKey, completed_at: (/* @__PURE__ */ new Date()).toISOString() }
          ]
        } : gateOut.workflowState,
        errors: [...ctx.errors, ...gateOut.errors],
        tasksCompleted: ctx.tasksCompleted + gateOut.tasksCompleted,
        lastContract: gateOut.lastContract,
        accumulatedCostUsd: gateOut.accumulatedCostUsd,
        halted: gateOut.halted
      };
      if (gateOut.halted) break;
      if (gatePassed) {
        try {
          const projectDir = ctx.config.projectDir ?? process.cwd();
          appendCheckpoint({ storyKey, taskName: step.gate, completedAt: (/* @__PURE__ */ new Date()).toISOString() }, projectDir);
        } catch {
        }
      }
      continue;
    }
    if (typeof step === "string") {
      const taskName = step;
      const task = ctx.config.workflow.tasks[taskName];
      if (!task) {
        warn(`story-machine: task "${taskName}" not found in workflow tasks, skipping`);
        continue;
      }
      if (isTaskCompleted(ctx.workflowState, taskName, storyKey)) {
        warn(`story-machine: skipping completed task ${taskName} for ${storyKey}`);
        continue;
      }
      const completedTasks = ctx.completedTasks ?? /* @__PURE__ */ new Set();
      if (completedTasks.has(`${storyKey}::${taskName}`)) {
        info(`workflow-runner: Skipping ${taskName} for ${storyKey} \u2014 checkpoint found`);
        continue;
      }
      const projectDir = ctx.config.projectDir ?? process.cwd();
      let out;
      try {
        if (task.agent === null) {
          out = await nullTaskCore({ task, taskName, storyKey, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
        } else {
          const definition = ctx.config.agents[task.agent];
          if (!definition) {
            warn(`story-machine: agent "${task.agent}" not found for "${taskName}", skipping`);
            continue;
          }
          out = await dispatchTaskCore({ task, taskName, storyKey, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
        }
        try {
          appendCheckpoint({ storyKey, taskName, completedAt: (/* @__PURE__ */ new Date()).toISOString() }, projectDir);
        } catch {
        }
        ctx = {
          ...ctx,
          workflowState: out.updatedState,
          lastContract: out.contract,
          tasksCompleted: ctx.tasksCompleted + 1,
          accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        const engineError = handleDispatchError(err, taskName, storyKey);
        const updatedState = recordErrorInState(ctx.workflowState, taskName, storyKey, engineError);
        writeWorkflowState(updatedState, projectDir);
        if (ctx.config.onEvent) ctx.config.onEvent({ type: "dispatch-error", taskName, storyKey, error: { code: engineError.code, message: engineError.message } });
        ctx = { ...ctx, workflowState: updatedState, errors: [...ctx.errors, engineError], halted: true };
        break;
      }
    }
  }
  if (!ctx.halted && ctx.config.onEvent) {
    ctx.config.onEvent({ type: "story-done", taskName: "story_flow", storyKey });
  }
  return ctx;
});
var storyMachine = setup2({
  types: {},
  actors: { storyStepActor },
  guards: {
    /** True when the actor threw an AbortError (abort signal). */
    isAbortError: ({ event }) => {
      const err = event.error;
      return err instanceof Error && err.name === "AbortError";
    },
    /** True when the actor threw a halt-inducing DispatchError (RATE_LIMIT/NETWORK/SDK_INIT). */
    isHaltError: ({ event }) => {
      const err = event.error;
      return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code);
    }
  }
}).createMachine({
  id: "story",
  context: ({ input }) => ({
    ...input,
    errors: [],
    tasksCompleted: 0,
    halted: false
  }),
  output: ({ context }) => ({
    workflowState: context.workflowState,
    errors: context.errors,
    tasksCompleted: context.tasksCompleted,
    lastContract: context.lastContract,
    accumulatedCostUsd: context.accumulatedCostUsd,
    halted: context.halted
  }),
  on: { INTERRUPT: ".interrupted" },
  initial: "processing",
  states: {
    /** Invoke the story step actor to run all storyFlow steps sequentially. */
    processing: {
      invoke: {
        src: "storyStepActor",
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) => event.output.halted,
            target: "halted",
            actions: assign2(({ event }) => {
              const out = event.output;
              return {
                workflowState: out.workflowState,
                errors: out.errors,
                tasksCompleted: out.tasksCompleted,
                lastContract: out.lastContract,
                accumulatedCostUsd: out.accumulatedCostUsd,
                halted: out.halted
              };
            })
          },
          {
            target: "done",
            actions: assign2(({ event }) => {
              const out = event.output;
              return {
                workflowState: out.workflowState,
                errors: out.errors,
                tasksCompleted: out.tasksCompleted,
                lastContract: out.lastContract,
                accumulatedCostUsd: out.accumulatedCostUsd,
                halted: out.halted
              };
            })
          }
        ],
        onError: [
          { guard: "isAbortError", target: "interrupted" },
          {
            guard: "isHaltError",
            target: "halted",
            actions: assign2(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, handleDispatchError(event.error, "story-flow", context.item.key)]
            }))
          },
          {
            target: "halted",
            actions: assign2(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, handleDispatchError(event.error, "story-flow", context.item.key)]
            }))
          }
        ]
      }
    },
    done: { type: "final" },
    halted: { type: "final", entry: assign2({ halted: true }) },
    interrupted: { type: "final", entry: assign2({ halted: true }) }
  }
});

// src/lib/workflow-epic-machine.ts
function toEpicError(err, taskName, storyKey) {
  return isEngineError(err) ? err : handleDispatchError(err, taskName, storyKey);
}
function collectGuideFiles(items, epicSentinel, projectDir) {
  const guidesDir = join5(projectDir, ".codeharness", "verify-guides");
  const guideFiles = [];
  try {
    mkdirSync3(guidesDir, { recursive: true });
  } catch {
    return guideFiles;
  }
  for (const item of items) {
    try {
      const contractPath = join5(projectDir, ".codeharness", "contracts", `document-${item.key}.json`);
      if (!existsSync6(contractPath)) continue;
      const output = JSON.parse(readFileSync6(contractPath, "utf-8"));
      const docs = output.output ? extractTag(output.output, "user-docs") ?? output.output : null;
      if (!docs) continue;
      const guidePath = join5(guidesDir, `${item.key}-guide.md`);
      writeFileSync2(guidePath, docs, "utf-8");
      guideFiles.push(guidePath);
    } catch {
    }
  }
  return guideFiles;
}
function cleanupGuideFiles(projectDir) {
  try {
    rmSync(join5(projectDir, ".codeharness", "verify-guides"), { recursive: true, force: true });
  } catch {
  }
}
async function runEpicLoop(ctx, loop, epicSentinel, projectDir, signal) {
  if (loop.length === 0) return ctx;
  let workflowState = { ...ctx.workflowState, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } };
  let { tasksCompleted, lastContract, accumulatedCostUsd } = ctx;
  const errors = [...ctx.errors];
  const storiesProcessed = new Set(ctx.storiesProcessed);
  const maxIterations = ctx.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const lastAgentTask = [...loop].reverse().find((name) => ctx.config.workflow.tasks[name]?.agent !== null) ?? loop[loop.length - 1];
  let verdict = null;
  let halted = false;
  while (!halted && workflowState.iteration < maxIterations && !workflowState.circuit_breaker.triggered && verdict?.verdict !== "pass") {
    if (signal?.aborted) throw Object.assign(new Error("Epic loop interrupted"), { name: "AbortError" });
    workflowState = { ...workflowState, iteration: workflowState.iteration + 1 };
    writeWorkflowState(workflowState, projectDir);
    for (const taskName of loop) {
      if (signal?.aborted) throw Object.assign(new Error("Epic loop interrupted"), { name: "AbortError" });
      const task = ctx.config.workflow.tasks[taskName];
      if (!task) {
        warn(`epic-machine: task "${taskName}" not found in workflow tasks, skipping`);
        continue;
      }
      const items = ctx.storyFlowTasks.has(taskName) ? ctx.epicItems : [{ key: epicSentinel, source: "sprint" }];
      for (const item of items) {
        if (isLoopTaskCompleted(workflowState, taskName, item.key, workflowState.iteration)) {
          warn(`epic-machine: skipping completed task ${taskName} for ${item.key}`);
          continue;
        }
        const customPrompt = ctx.storyFlowTasks.has(taskName) && verdict !== null ? buildRetryPrompt(item.key, verdict.findings) : void 0;
        try {
          const out = task.agent === null ? await nullTaskCore({ task, taskName, storyKey: item.key, config: ctx.config, workflowState, previousContract: lastContract, accumulatedCostUsd }) : await dispatchTaskCore({ task, taskName, storyKey: item.key, definition: ctx.config.agents[task.agent], config: ctx.config, workflowState, previousContract: lastContract, accumulatedCostUsd, customPrompt });
          workflowState = { ...out.updatedState, iteration: workflowState.iteration, evaluator_scores: workflowState.evaluator_scores, circuit_breaker: workflowState.circuit_breaker };
          lastContract = out.contract;
          accumulatedCostUsd += out.cost;
          tasksCompleted += 1;
          if (ctx.storyFlowTasks.has(taskName)) storiesProcessed.add(item.key);
          if (taskName === lastAgentTask && task.agent !== null) {
            verdict = parseVerdict(out.output);
            workflowState = { ...workflowState, evaluator_scores: [...workflowState.evaluator_scores, { iteration: workflowState.iteration, passed: verdict.score.passed, failed: verdict.score.failed, unknown: verdict.score.unknown, total: verdict.score.total, timestamp: (/* @__PURE__ */ new Date()).toISOString() }] };
            const breaker = evaluateProgress(workflowState.evaluator_scores);
            if (breaker.halt) workflowState = { ...workflowState, circuit_breaker: { triggered: true, reason: breaker.reason, score_history: breaker.scoreHistory } };
            writeWorkflowState(workflowState, projectDir);
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          const engineError = toEpicError(err, taskName, item.key);
          errors.push(engineError);
          workflowState = recordErrorInState(workflowState, taskName, item.key, engineError);
          writeWorkflowState(workflowState, projectDir);
          if (task.agent !== null && err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) halted = true;
        }
        if (halted) break;
      }
      if (halted) break;
    }
  }
  if (!halted && verdict?.verdict !== "pass") {
    const phase = workflowState.circuit_breaker.triggered ? "circuit-breaker" : "max-iterations";
    workflowState = { ...workflowState, phase };
    writeWorkflowState(workflowState, projectDir);
    halted = true;
  }
  return { ...ctx, workflowState, errors, tasksCompleted, lastContract, accumulatedCostUsd, storiesProcessed, halted };
}
var epicStoryActor = fromPromise3(async ({ input, signal }) => {
  if (signal.aborted) throw Object.assign(new Error("Epic story interrupted"), { name: "AbortError" });
  const item = input.epicItems[input.currentStoryIndex];
  const storyInput = {
    item,
    config: input.config,
    workflowState: input.workflowState,
    lastContract: input.lastContract,
    accumulatedCostUsd: input.accumulatedCostUsd,
    storyFlowTasks: input.storyFlowTasks,
    completedTasks: input.completedTasks ?? /* @__PURE__ */ new Set()
  };
  const actor = createActor2(storyMachine, { input: storyInput });
  const onAbort = () => actor.send({ type: "INTERRUPT" });
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    actor.start();
    const snap = await waitFor2(actor, (s) => s.status === "done");
    const out = snap.output;
    const storiesProcessed = new Set(input.storiesProcessed);
    if (!out.halted) storiesProcessed.add(item.key);
    return { ...input, workflowState: out.workflowState, errors: [...input.errors, ...out.errors], tasksCompleted: input.tasksCompleted + out.tasksCompleted, lastContract: out.lastContract, accumulatedCostUsd: out.accumulatedCostUsd, halted: out.halted, storiesProcessed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`workflow-epic-machine: story ${item.key} failed (${msg}) \u2014 skipping to next story`);
    return { ...input, errors: [...input.errors, { taskName: "story-flow", storyKey: item.key, code: "TIMEOUT", message: msg }] };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
});
var epicStepActor = fromPromise3(async ({ input, signal }) => {
  if (signal.aborted) throw Object.assign(new Error("Epic step interrupted"), { name: "AbortError" });
  const ctx = { ...input };
  const epicSentinel = `__epic_${ctx.epicId}__`;
  const projectDir = ctx.config.projectDir ?? process.cwd();
  const step = ctx.config.workflow.epicFlow[ctx.currentStepIndex];
  if (!step) return ctx;
  if (isGateConfig(step)) {
    if (signal.aborted) throw Object.assign(new Error("Epic step interrupted"), { name: "AbortError" });
    const gateCtx = {
      gate: step,
      config: ctx.config,
      workflowState: { ...ctx.workflowState, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } },
      errors: [],
      tasksCompleted: 0,
      halted: false,
      lastContract: ctx.lastContract,
      accumulatedCostUsd: ctx.accumulatedCostUsd,
      verdicts: {},
      parentItemKey: epicSentinel
    };
    const gateActor = createActor2(gateMachine, { input: gateCtx });
    const onAbort = () => gateActor.send({ type: "INTERRUPT" });
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      gateActor.start();
      const gateSnap = await waitFor2(gateActor, (s) => s.status === "done", {});
      const gateOut = gateSnap.output;
      return { ...ctx, workflowState: gateOut.workflowState, errors: [...ctx.errors, ...gateOut.errors], tasksCompleted: ctx.tasksCompleted + gateOut.tasksCompleted, lastContract: gateOut.lastContract, accumulatedCostUsd: gateOut.accumulatedCostUsd, halted: gateOut.halted };
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
  if (isLoopBlock(step)) {
    return runEpicLoop(ctx, step.loop, epicSentinel, projectDir, signal);
  }
  if (typeof step !== "string") return ctx;
  const task = ctx.config.workflow.tasks[step];
  if (!task) {
    warn(`epic-machine: task "${step}" not found in workflow tasks, skipping`);
    return ctx;
  }
  if (isTaskCompleted(ctx.workflowState, step, epicSentinel)) return ctx;
  if (signal.aborted) throw Object.assign(new Error("Epic step interrupted"), { name: "AbortError" });
  try {
    let out;
    if (task.agent === null) {
      out = await nullTaskCore({ task, taskName: step, storyKey: epicSentinel, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
    } else {
      const definition = ctx.config.agents[task.agent];
      if (!definition) {
        warn(`epic-machine: agent "${task.agent}" not found for "${step}", skipping`);
        return ctx;
      }
      const guideFiles = task.source_access === false ? collectGuideFiles(ctx.epicItems, epicSentinel, projectDir) : [];
      try {
        out = await dispatchTaskCore({ task, taskName: step, storyKey: epicSentinel, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd, storyFiles: guideFiles });
      } finally {
        if (guideFiles.length > 0) cleanupGuideFiles(projectDir);
      }
    }
    return { ...ctx, workflowState: out.updatedState, lastContract: out.contract, tasksCompleted: ctx.tasksCompleted + 1, accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) throw err;
    const engineError = toEpicError(err, step, epicSentinel);
    const workflowState = recordErrorInState(ctx.workflowState, step, epicSentinel, engineError);
    writeWorkflowState(workflowState, projectDir);
    if (ctx.config.onEvent) ctx.config.onEvent({ type: "dispatch-error", taskName: step, storyKey: epicSentinel, error: { code: engineError.code, message: engineError.message } });
    return { ...ctx, workflowState, errors: [...ctx.errors, engineError] };
  }
});
var epicMachine = setup3({
  types: {},
  actors: { epicStoryActor, epicStepActor },
  guards: {
    hasMoreStories: ({ context }) => context.currentStoryIndex < context.epicItems.length,
    hasMoreEpicSteps: ({ context }) => context.currentStepIndex < context.config.workflow.epicFlow.length,
    isHalted: ({ context }) => context.halted,
    isAbortError: ({ event }) => {
      const err = event.error;
      return err instanceof Error && err.name === "AbortError";
    },
    isHaltError: ({ event }) => {
      const err = event.error;
      return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code);
    }
  }
}).createMachine({
  id: "epic",
  context: ({ input }) => ({ ...input }),
  output: ({ context }) => ({ workflowState: context.workflowState, errors: context.errors, tasksCompleted: context.tasksCompleted, storiesProcessed: context.storiesProcessed, lastContract: context.lastContract, accumulatedCostUsd: context.accumulatedCostUsd, halted: context.halted }),
  on: { INTERRUPT: ".interrupted" },
  initial: "iteratingStories",
  states: {
    iteratingStories: {
      initial: "processStory",
      states: {
        processStory: {
          always: [{ guard: "isHalted", target: "#epic.halted" }, { guard: ({ context }) => context.currentStoryIndex >= context.epicItems.length, target: "done" }],
          invoke: {
            src: "epicStoryActor",
            input: ({ context }) => context,
            onDone: { target: "checkNextStory", actions: assign3(({ event }) => ({ workflowState: event.output.workflowState, errors: event.output.errors, tasksCompleted: event.output.tasksCompleted, lastContract: event.output.lastContract, accumulatedCostUsd: event.output.accumulatedCostUsd, halted: event.output.halted, storiesProcessed: event.output.storiesProcessed })) },
            onError: [
              { guard: "isAbortError", target: "#epic.interrupted" },
              { guard: "isHaltError", target: "#epic.halted", actions: assign3(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError(event.error, "story-iteration", `__epic_${context.epicId}__`)] })) },
              { target: "#epic.halted", actions: assign3(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError(event.error, "story-iteration", `__epic_${context.epicId}__`)] })) }
            ]
          }
        },
        checkNextStory: {
          always: [
            { guard: "isHalted", target: "#epic.halted" },
            { guard: "hasMoreStories", target: "processStory", actions: assign3(({ context }) => ({ currentStoryIndex: context.currentStoryIndex + 1 })) },
            { target: "done" }
          ]
        },
        done: { type: "final" }
      },
      onDone: "processingEpicSteps"
    },
    processingEpicSteps: {
      initial: "processStep",
      states: {
        processStep: {
          always: [{ guard: "isHalted", target: "#epic.halted" }, { guard: ({ context }) => context.currentStepIndex >= context.config.workflow.epicFlow.length, target: "done" }],
          invoke: {
            src: "epicStepActor",
            input: ({ context }) => context,
            onDone: { target: "checkNextStep", actions: assign3(({ context, event }) => ({ workflowState: event.output.workflowState, errors: event.output.errors, tasksCompleted: event.output.tasksCompleted, lastContract: event.output.lastContract, accumulatedCostUsd: event.output.accumulatedCostUsd, halted: event.output.halted, storiesProcessed: event.output.storiesProcessed, currentStepIndex: context.currentStepIndex + 1 })) },
            onError: [
              { guard: "isAbortError", target: "#epic.interrupted" },
              { guard: "isHaltError", target: "#epic.halted", actions: assign3(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError(event.error, "epic-step", `__epic_${context.epicId}__`)] })) },
              { target: "#epic.halted", actions: assign3(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError(event.error, "epic-step", `__epic_${context.epicId}__`)] })) }
            ]
          }
        },
        checkNextStep: {
          always: [{ guard: "isHalted", target: "#epic.halted" }, { guard: "hasMoreEpicSteps", target: "processStep" }, { target: "done" }]
        },
        done: { type: "final" }
      },
      onDone: "done"
    },
    done: { type: "final" },
    halted: { type: "final", entry: assign3({ halted: true }) },
    interrupted: { type: "final", entry: assign3({ halted: true }) }
  }
});

// src/lib/workflow-run-machine.ts
function toRunError(err, taskName, storyKey) {
  return isEngineError(err) ? err : handleDispatchError(err, taskName, storyKey);
}
function mergeSignals2(existing, next) {
  if (!existing) return next;
  if (typeof existing.addEventListener !== "function") return next;
  const ctrl = new AbortController();
  if (existing.aborted || next.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  const abort = () => ctrl.abort();
  existing.addEventListener("abort", abort, { once: true });
  if (typeof next.addEventListener === "function") {
    next.addEventListener("abort", abort, { once: true });
  }
  return ctrl.signal;
}
var runEpicActor = fromPromise4(async ({ input, signal }) => {
  const { epicEntries, currentEpicIndex, config } = input;
  if (config.abortSignal?.aborted) {
    const abortErr = new Error("Run aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }
  const [epicId, epicItems] = epicEntries[currentEpicIndex];
  if (config.onEvent) {
    config.onEvent({ type: "dispatch-start", taskName: "story_flow", storyKey: `__epic_${epicId}__` });
  }
  const epicInput = {
    epicId,
    epicItems,
    config: {
      ...input.config,
      abortSignal: mergeSignals2(input.config.abortSignal, signal),
      workflow: {
        ...input.config.workflow,
        epicFlow: input.config.workflow.epicFlow.length > 0 ? input.config.workflow.epicFlow : ["story_flow", ...input.config.workflow.epicFlow]
      }
    },
    storyFlowTasks: input.storyFlowTasks,
    currentStoryIndex: 0,
    workflowState: input.workflowState,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: /* @__PURE__ */ new Set(),
    lastContract: input.lastContract,
    accumulatedCostUsd: input.accumulatedCostUsd,
    halted: false,
    currentStepIndex: 0,
    completedTasks: input.completedTasks ?? /* @__PURE__ */ new Set()
  };
  const actor = createActor3(epicMachine, { input: epicInput });
  const onAbort = () => actor.send({ type: "INTERRUPT" });
  signal.addEventListener("abort", onAbort, { once: true });
  let epicOut;
  try {
    actor.start();
    const snap = await waitFor3(actor, (s) => s.status === "done", {});
    epicOut = snap.output;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  if (epicOut.workflowState.phase === "interrupted") {
    const abortErr = new Error("Epic interrupted");
    abortErr.name = "AbortError";
    throw abortErr;
  }
  const completedStoryKeys = new Set(
    epicOut.workflowState.tasks_completed.filter((checkpoint) => !checkpoint.error).map((checkpoint) => checkpoint.story_key)
  );
  const storiesProcessed = new Set(input.storiesProcessed);
  for (const key of epicOut.storiesProcessed) {
    if (completedStoryKeys.has(key) || !epicOut.halted && completedStoryKeys.size === 0) {
      storiesProcessed.add(key);
    }
  }
  return {
    ...input,
    workflowState: epicOut.workflowState,
    errors: [...input.errors, ...epicOut.errors],
    tasksCompleted: input.tasksCompleted + epicOut.tasksCompleted,
    storiesProcessed,
    lastContract: epicOut.lastContract,
    accumulatedCostUsd: epicOut.accumulatedCostUsd,
    halted: epicOut.halted,
    currentEpicIndex: currentEpicIndex + 1
  };
});
var runMachine = setup4({
  types: {},
  actors: { runEpicActor },
  guards: {
    hasMoreEpics: ({ context }) => context.currentEpicIndex < context.epicEntries.length,
    isHalted: ({ context }) => context.halted,
    isAbortError: ({ event }) => {
      const err = event.error;
      return err instanceof Error && err.name === "AbortError";
    },
    isHaltError: ({ event }) => {
      const err = event.error;
      return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code);
    }
  }
}).createMachine({
  id: "run",
  context: ({ input }) => ({ ...input }),
  output: ({ context }) => ({
    workflowState: context.workflowState,
    errors: context.errors,
    tasksCompleted: context.tasksCompleted,
    storiesProcessed: context.storiesProcessed,
    lastContract: context.lastContract,
    accumulatedCostUsd: context.accumulatedCostUsd,
    halted: context.halted
  }),
  on: { INTERRUPT: ".interrupted" },
  initial: "processingEpic",
  states: {
    processingEpic: {
      always: [
        { guard: "isHalted", target: "#run.halted" },
        { guard: ({ context }) => context.currentEpicIndex >= context.epicEntries.length, target: "allDone" }
      ],
      invoke: {
        src: "runEpicActor",
        input: ({ context }) => context,
        onDone: {
          target: "checkNextEpic",
          actions: assign4(({ event }) => ({
            workflowState: event.output.workflowState,
            errors: event.output.errors,
            tasksCompleted: event.output.tasksCompleted,
            storiesProcessed: event.output.storiesProcessed,
            lastContract: event.output.lastContract,
            accumulatedCostUsd: event.output.accumulatedCostUsd,
            halted: event.output.halted,
            currentEpicIndex: event.output.currentEpicIndex
          }))
        },
        onError: [
          { guard: "isAbortError", target: "#run.interrupted" },
          {
            guard: "isHaltError",
            target: "#run.halted",
            actions: assign4(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, toRunError(event.error, "epic-iteration", `__run__`)]
            }))
          },
          {
            target: "#run.halted",
            actions: assign4(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, toRunError(event.error, "epic-iteration", `__run__`)]
            }))
          }
        ]
      }
    },
    checkNextEpic: {
      always: [
        { guard: "isHalted", target: "#run.halted" },
        { guard: "hasMoreEpics", target: "processingEpic" },
        { target: "allDone" }
      ]
    },
    allDone: { type: "final" },
    halted: { type: "final", entry: assign4({ halted: true }) },
    interrupted: {
      type: "final",
      entry: assign4(({ context }) => ({
        halted: true,
        workflowState: { ...context.workflowState, phase: "interrupted" }
      }))
    }
  }
});

// src/lib/workflow-visualizer.ts
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var DIM = "\x1B[2m";
var RED = "\x1B[31m";
var YELLOW = "\x1B[33m";
function dim(s) {
  return `${DIM}${s}${RESET}`;
}
function bold(s) {
  return `${BOLD}${s}${RESET}`;
}
function red(s) {
  return `${RED}${s}${RESET}`;
}
function yellow(s) {
  return `${YELLOW}${s}${RESET}`;
}
var ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s) {
  return s.replace(ANSI_RE, "");
}
function truncateName(name, maxLen) {
  if (name.length <= maxLen) return name;
  if (maxLen <= 1) return name.slice(0, maxLen);
  return name.slice(0, maxLen - 1) + "\u2026";
}
function renderStep(step, nameMaxLen) {
  const name = truncateName(step.name, nameMaxLen);
  switch (step.status) {
    case "done":
      return dim(`${name}\u2713`);
    case "active":
      return bold(`${name}\u2026`);
    case "failed":
      return red(`${name}\u2717`);
    case "skipped":
      return dim(`${name}\u2298`);
    default:
      return name;
  }
}
function renderGateStep(gate, stepStatus) {
  const name = gate.name;
  if (stepStatus === "done") return dim(`\u27F2${name}\u2713`);
  if (stepStatus === "failed") return red(`\u27F2${name}\u2717`);
  if (stepStatus === "active") {
    const detail = `${gate.iteration}/${gate.maxRetries} ${gate.passed}\u2713${gate.failed}\u2717`;
    return yellow(`\u27F2${name}(${detail})\u2026`);
  }
  return `\u27F2${name}`;
}
function computeWindow(totalSteps, activeIdx, maxSlots) {
  if (totalSteps <= maxSlots) {
    return { start: 0, end: totalSteps, collapsedBefore: 0, collapsedAfter: 0 };
  }
  const half = Math.floor(maxSlots / 2);
  const idealStart = activeIdx - half;
  const start = Math.max(0, Math.min(idealStart, totalSteps - maxSlots));
  const end = start + maxSlots;
  return {
    start,
    end,
    collapsedBefore: start,
    collapsedAfter: totalSteps - end
  };
}
function buildScopePrefix(pos) {
  if (!pos.epicId) return "";
  if (pos.storiesDone) return `Epic ${pos.epicId} `;
  if (pos.storyIndex !== void 0 && pos.totalStories !== void 0) {
    return `Epic ${pos.epicId} [${pos.storyIndex}/${pos.totalStories}] `;
  }
  return `Epic ${pos.epicId} `;
}
function renderSteps(pos, nameMaxLen, maxSlots) {
  const { steps, activeStepIndex, gate } = pos;
  if (steps.length === 0) return "";
  const win = computeWindow(steps.length, activeStepIndex, maxSlots);
  const parts = [];
  if (win.collapsedBefore > 0) {
    parts.push(`[${win.collapsedBefore}\u2713]`);
  }
  for (let i = win.start; i < win.end; i++) {
    const step = steps[i];
    if (!step) continue;
    if (gate && i === activeStepIndex) {
      const gateStatus = step.status === "done" ? "done" : step.status === "failed" ? "failed" : step.status === "active" ? "active" : "pending";
      parts.push(renderGateStep(gate, gateStatus));
    } else {
      parts.push(renderStep(step, nameMaxLen));
    }
  }
  if (win.collapsedAfter > 0) {
    parts.push(`\u2192 \u2026${win.collapsedAfter} more`);
  }
  return parts.join(" \u2192 ");
}
function enforceWidth(full, pos, scopePrefix, storiesDoneStr, maxWidth, nameMaxLen, maxSlots) {
  if (stripAnsi(full).length <= maxWidth) return full;
  for (let nl = nameMaxLen - 1; nl >= 3; nl--) {
    const steps = renderSteps(pos, nl, maxSlots);
    const candidate = scopePrefix + storiesDoneStr + steps;
    if (stripAnsi(candidate).length <= maxWidth) return candidate;
  }
  for (let sl = maxSlots - 1; sl >= 1; sl--) {
    const steps = renderSteps(pos, 3, sl);
    const candidate = scopePrefix + storiesDoneStr + steps;
    if (stripAnsi(candidate).length <= maxWidth) return candidate;
  }
  const stripped = stripAnsi(full);
  return stripped.slice(0, maxWidth);
}
function visualize(pos, vizConfig) {
  const maxWidth = Math.min(vizConfig?.maxWidth ?? 80, 120);
  const maxSlots = vizConfig?.maxStepSlots ?? 5;
  const nameMaxLen = vizConfig?.taskNameMaxLen ?? 8;
  const scopePrefix = buildScopePrefix(pos);
  const storiesDoneStr = pos.storiesDone ? "stories\u2713 \u2192 " : "";
  const steps = renderSteps(pos, nameMaxLen, maxSlots);
  const full = scopePrefix + storiesDoneStr + steps;
  return enforceWidth(full, pos, scopePrefix, storiesDoneStr, maxWidth, nameMaxLen, maxSlots);
}
var p = (o, k) => o !== null && typeof o === "object" ? o[k] : void 0;
function buildFlowSteps(flow, ai, t) {
  return flow.reduce((acc, step, i) => {
    const name = typeof step === "string" ? step : isGateConfig(step) ? step.gate : null;
    if (!name) return acc;
    const status = t === "done" ? "done" : i < ai ? "done" : i > ai ? "pending" : t === "halted" ? "failed" : "active";
    return [...acc, { name, status, ...isGateConfig(step) ? { isGate: true } : {} }];
  }, []);
}
function derivePosition(items, tasks, flow) {
  const ns = flow.map((s) => typeof s === "string" ? s : isGateConfig(s) ? s.gate : null);
  for (let si = 0; si < items.length; si++) {
    const key = items[si]?.key;
    if (typeof key !== "string") continue;
    const done = new Set(tasks.filter((t) => t.story_key === key && !t.error).map((t) => String(t.task_name)));
    const last = ns.reduce((acc, n, i) => n && done.has(n) ? i : acc, -1);
    if (last < flow.length - 1) return { si, ai: last + 1, done: false };
  }
  return { si: items.length, ai: 0, done: true };
}
function snapshotToPosition(snapshot, workflow) {
  const empty = { level: "run", steps: [], activeStepIndex: 0 };
  try {
    if (snapshot === null || snapshot === void 0 || typeof snapshot !== "object") return empty;
    const ctx = p(snapshot, "context");
    if (ctx === null || ctx === void 0 || typeof ctx !== "object") return empty;
    const val = p(snapshot, "value");
    const flatVal = typeof val === "string" ? val : typeof val === "object" && val !== null ? Object.keys(val)[0] ?? "" : "";
    const t = flatVal === "allDone" || flatVal === "done" ? "done" : flatVal === "halted" || flatVal === "interrupted" || p(ctx, "halted") === true ? "halted" : "active";
    const epicIdRaw = p(ctx, "epicId");
    if (typeof epicIdRaw === "string" && p(ctx, "epicEntries") === void 0) {
      const ei = Array.isArray(p(ctx, "epicItems")) ? p(ctx, "epicItems") : [];
      const rawSi = p(ctx, "currentStoryIndex");
      const si = typeof rawSi === "number" ? rawSi : -1;
      const ws2 = p(ctx, "workflowState");
      const tasks2 = Array.isArray(p(ws2, "tasks_completed")) ? p(ws2, "tasks_completed") : [];
      let ai2 = 0;
      if (ei.length > 0 && t === "active" && si >= 0 && si < ei.length) {
        const d2 = derivePosition([ei[si]], tasks2, workflow.storyFlow);
        if (!d2.done) ai2 = d2.ai;
      }
      const steps2 = buildFlowSteps(workflow.storyFlow, ai2, t);
      return { level: si >= 0 ? "story" : "epic", epicId: epicIdRaw, ...si >= 0 ? { storyIndex: si + 1 } : {}, ...ei.length > 0 ? { totalStories: ei.length } : {}, steps: steps2, activeStepIndex: ai2 };
    }
    const epicEntries = p(ctx, "epicEntries");
    const rawEi = p(ctx, "currentEpicIndex");
    const totalEpics = Array.isArray(epicEntries) ? epicEntries.length : void 0;
    const epicIndex = typeof rawEi === "number" ? rawEi + 1 : void 0;
    const ee = Array.isArray(epicEntries) && typeof rawEi === "number" ? epicEntries[rawEi] : void 0;
    const epicId = Array.isArray(ee) && typeof ee[0] === "string" ? ee[0] : void 0;
    const rawItems = Array.isArray(ee) && Array.isArray(ee[1]) ? ee[1] : [];
    const totalStories = rawItems.length > 0 ? rawItems.length : void 0;
    const ws = p(ctx, "workflowState");
    const tasks = Array.isArray(p(ws, "tasks_completed")) ? p(ws, "tasks_completed") : [];
    let storyIndex, ai = 0, storiesDone = false;
    if (rawItems.length > 0 && (t === "active" || t === "halted")) {
      const d = derivePosition(rawItems, tasks, workflow.storyFlow);
      storiesDone = d.done;
      if (!d.done) {
        storyIndex = d.si + 1;
        ai = d.ai;
      }
    }
    if (ai === 0 && !storiesDone && rawItems.length === 0) {
      const si = p(ctx, "currentStepIndex"), sti = p(ctx, "currentStoryIndex");
      if (typeof si === "number" && si > 0) ai = si;
      if (typeof sti === "number" && sti > 0 && storyIndex === void 0) storyIndex = sti;
    }
    const flow = storiesDone && workflow.epicFlow.length > 0 ? workflow.epicFlow : workflow.storyFlow.length > 0 ? workflow.storyFlow : workflow.epicFlow;
    if (storiesDone && epicId !== void 0 && workflow.epicFlow.length > 0 && (t === "active" || t === "halted")) {
      const epicSentinelKey = `__epic_${epicId}__`;
      const epicItems = [{ key: epicSentinelKey }];
      const ed = derivePosition(epicItems, tasks, workflow.epicFlow);
      ai = ed.done ? workflow.epicFlow.length : ed.ai;
    }
    const steps = buildFlowSteps(flow, ai, t);
    let gate;
    const activeFlowStep = flow[ai];
    if (t === "active" && activeFlowStep && isGateConfig(activeFlowStep)) {
      const sc = p(ws, "evaluator_scores");
      const ls = Array.isArray(sc) && sc.length > 0 ? sc[sc.length - 1] : null;
      const ir = p(ws, "iteration");
      gate = {
        name: activeFlowStep.gate,
        iteration: typeof ir === "number" ? ir : 0,
        maxRetries: activeFlowStep.max_retries,
        passed: typeof p(ls, "passed") === "number" ? p(ls, "passed") : 0,
        failed: typeof p(ls, "failed") === "number" ? p(ls, "failed") : 0
      };
    }
    const level = gate ? "gate" : storiesDone ? "epic" : storyIndex !== void 0 ? "story" : epicIndex !== void 0 ? "epic" : "run";
    return {
      level,
      ...epicId !== void 0 ? { epicId } : {},
      ...epicIndex !== void 0 ? { epicIndex } : {},
      ...totalEpics !== void 0 ? { totalEpics } : {},
      ...storyIndex !== void 0 ? { storyIndex } : {},
      ...totalStories !== void 0 ? { totalStories } : {},
      steps,
      activeStepIndex: ai,
      ...gate !== void 0 ? { gate } : {},
      ...storiesDone ? { storiesDone } : {}
    };
  } catch {
    return empty;
  }
}

// src/lib/workflow-runner.ts
function warnSnapshotSaveFailure(stage, error) {
  const message = error instanceof Error ? error.message : String(error);
  warn(`workflow-runner: Failed to save ${stage} snapshot: ${message}`);
}
function buildSyntheticPosition(sk, tn, ee, cfg) {
  try {
    const colonIdx = sk.indexOf(":");
    const isGate = colonIdx >= 0;
    const isEpicLevel = sk.startsWith("__epic_");
    const parentKey = isGate ? sk.slice(0, colonIdx) : sk;
    const gateName = isGate ? sk.slice(colonIdx + 1) : null;
    const flow = isEpicLevel ? cfg.workflow.epicFlow : cfg.workflow.storyFlow;
    const flowStepName = isGate ? gateName : tn;
    let epicId, si, ts;
    if (isEpicLevel) {
      const m = sk.match(/^__epic_(.+)__$/);
      epicId = m ? m[1] : void 0;
    } else {
      for (const [eid, items] of ee) {
        const idx = items.findIndex((i) => i.key === parentKey);
        if (idx >= 0) {
          epicId = eid;
          si = idx + 1;
          ts = items.length;
          break;
        }
      }
      if (epicId === void 0) return null;
    }
    const ai = flow.map((s) => typeof s === "string" ? s : isGateConfig(s) ? s.gate : null).indexOf(flowStepName);
    if (ai < 0) return null;
    const steps = flow.reduce((acc, step, i) => {
      const name = typeof step === "string" ? step : isGateConfig(step) ? step.gate : null;
      if (!name) return acc;
      return [...acc, { name, status: i < ai ? "done" : i === ai ? "active" : "pending", ...isGateConfig(step) ? { isGate: true } : {} }];
    }, []);
    return { level: isEpicLevel ? "epic" : "story", ...epicId ? { epicId } : {}, ...si !== void 0 ? { storyIndex: si } : {}, ...ts !== void 0 ? { totalStories: ts } : {}, steps, activeStepIndex: ai };
  } catch {
    return null;
  }
}
async function runWorkflowActor(config) {
  const startMs = Date.now();
  const projectDir = config.projectDir ?? process.cwd();
  cleanStaleTmpFiles(projectDir);
  let state = readWorkflowState(projectDir);
  if (state.phase === "completed") {
    clearAllPersistence(projectDir);
    return { success: true, tasksCompleted: 0, storiesProcessed: 0, errors: [], durationMs: 0 };
  }
  const priorPhase = state.phase;
  state = { ...state, phase: "executing", started: state.started || (/* @__PURE__ */ new Date()).toISOString(), workflow_name: config.workflow.storyFlow.filter((s) => typeof s === "string").join(" -> ") };
  writeWorkflowState(state, projectDir);
  try {
    await (await import("./workflow-driver-health-TRAZ7ANW.js")).checkDriverHealth(config.workflow);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state = { ...state, phase: "failed" };
    const errors2 = [{ taskName: "__health_check__", storyKey: "__health_check__", code: "HEALTH_CHECK", message }];
    writeWorkflowState(state, projectDir);
    return { success: false, tasksCompleted: 0, storiesProcessed: 0, errors: errors2, durationMs: Date.now() - startMs };
  }
  for (const cw of checkCapabilityConflicts(config.workflow)) warn(cw.message);
  const { loadWorkItems: loadWorkItems2 } = await import("./workflow-work-items-BID2TA3N.js");
  const workItems = loadWorkItems2(config.sprintStatusPath, config.issuesPath);
  const storyFlowTasks = /* @__PURE__ */ new Set();
  for (const step of config.workflow.storyFlow) {
    if (typeof step === "string") storyFlowTasks.add(step);
    if (typeof step === "object" && "loop" in step)
      for (const lt of step.loop) storyFlowTasks.add(lt);
  }
  const epicGroups = /* @__PURE__ */ new Map();
  for (const item of workItems) {
    const epicId = item.key.match(/^(\d+)-/)?.[1] ?? "unknown";
    if (!epicGroups.has(epicId)) epicGroups.set(epicId, []);
    epicGroups.get(epicId).push(item);
  }
  const configHash = computeConfigHash(config);
  const hadSnapshotFile = snapshotFileExists(projectDir);
  const savedSnapshot = loadSnapshot(projectDir);
  let resumeSnapshot = null;
  const completedTasks = /* @__PURE__ */ new Set();
  if (savedSnapshot !== null) {
    if (savedSnapshot.configHash === configHash) {
      if (isRestorableXStateSnapshot(savedSnapshot.snapshot)) {
        info("workflow-runner: Resuming from snapshot \u2014 config hash matches");
        resumeSnapshot = savedSnapshot.snapshot;
      } else {
        warn("workflow-runner: Snapshot payload is invalid for restore \u2014 falling back to checkpoint log");
        try {
          clearSnapshot(projectDir);
        } catch {
        }
        const checkpoints = loadCheckpointLog(projectDir);
        if (checkpoints.length > 0) {
          info(`workflow-runner: Loaded ${checkpoints.length} checkpoint(s) for semantic skip-based resume (invalid snapshot payload)`);
          for (const entry of checkpoints) {
            completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
          }
        }
        const synthesized1 = checkpoints.map((e) => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
        state = { ...state, tasks_completed: synthesized1, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
        writeWorkflowState(state, projectDir);
      }
    } else {
      const checkpoints = loadCheckpointLog(projectDir);
      warn(`workflow-runner: Snapshot config changed (saved: ${savedSnapshot.configHash.slice(0, 8)}, current: ${configHash.slice(0, 8)}) \u2014 using checkpoint log for resume`);
      try {
        clearSnapshot(projectDir);
      } catch {
      }
      if (checkpoints.length > 0) {
        info(`workflow-runner: Loaded ${checkpoints.length} checkpoint(s) for semantic skip-based resume`);
        for (const entry of checkpoints) {
          completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
        }
      }
      const synthesized2 = checkpoints.map((e) => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
      state = { ...state, tasks_completed: synthesized2, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
      writeWorkflowState(state, projectDir);
    }
  } else if (hadSnapshotFile) {
    const orphanedEntries = loadCheckpointLog(projectDir);
    if (orphanedEntries.length > 0) {
      info(`workflow-runner: Loaded ${orphanedEntries.length} checkpoint(s) for semantic skip-based resume (corrupt snapshot)`);
      for (const entry of orphanedEntries) {
        completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
      }
    }
    const synthesized3 = orphanedEntries.map((e) => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
    state = { ...state, tasks_completed: synthesized3, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
    writeWorkflowState(state, projectDir);
  } else {
    const checkpoints = loadCheckpointLog(projectDir);
    if (checkpoints.length > 0) {
      warn(`workflow-runner: Clearing orphaned checkpoint log with ${checkpoints.length} checkpoint(s) because no snapshot file exists`);
      clearCheckpointLog(projectDir);
    }
  }
  if (resumeSnapshot !== null && (priorPhase === "error" || priorPhase === "failed")) {
    const errorCount = state.tasks_completed.filter((t) => t.error).length;
    if (!config.onEvent) info(`Resuming from ${priorPhase} state \u2014 ${errorCount} previous error(s)`);
  }
  const epicEntries = [...epicGroups.entries()];
  const origOnEvent = config.onEvent;
  if (origOnEvent) {
    config = { ...config, onEvent: (ev) => {
      origOnEvent(ev);
      if (ev.type === "dispatch-start") {
        try {
          const pos = buildSyntheticPosition(ev.storyKey, ev.taskName, epicEntries, config);
          if (pos) origOnEvent({ type: "workflow-viz", taskName: ev.taskName, storyKey: ev.storyKey, vizString: visualize(pos), position: pos });
        } catch (vizErr) {
          warn(`workflow-runner: synthetic viz error: ${vizErr instanceof Error ? vizErr.message : String(vizErr)}`);
        }
      }
    } };
  }
  const runInput = {
    config,
    storyFlowTasks,
    epicEntries,
    currentEpicIndex: 0,
    workflowState: state,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: /* @__PURE__ */ new Set(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
    completedTasks
  };
  const finalOutput = await new Promise((resolve5) => {
    let lastStateValue = null;
    let rootActorRef = null;
    const inspect = (inspectionEvent) => {
      try {
        if (inspectionEvent.type !== "@xstate.snapshot") return;
        if (rootActorRef !== null && inspectionEvent.actorRef !== rootActorRef) return;
        const snap = inspectionEvent.snapshot;
        const snapCtx = snap?.context;
        const snapWs = snapCtx?.workflowState;
        const completedCount = Array.isArray(snapWs?.tasks_completed) ? snapWs.tasks_completed.length : 0;
        const stateKey = `${JSON.stringify(snap?.value ?? null)}:${completedCount}`;
        if (stateKey === lastStateValue) return;
        lastStateValue = stateKey;
        const position = snapshotToPosition(snap, config.workflow);
        const vizString = visualize(position);
        config.onEvent?.({ type: "workflow-viz", taskName: "", storyKey: "", vizString, position });
      } catch (vizErr) {
        warn(`workflow-runner: viz error: ${vizErr instanceof Error ? vizErr.message : String(vizErr)}`);
      }
    };
    const actor = resumeSnapshot !== null ? createActor4(runMachine, { input: runInput, snapshot: resumeSnapshot, inspect }) : createActor4(runMachine, { input: runInput, inspect });
    rootActorRef = actor;
    actor.subscribe({
      next: () => {
        try {
          saveSnapshot(actor.getPersistedSnapshot(), configHash, projectDir);
        } catch (error) {
          warnSnapshotSaveFailure("transition", error);
        }
      },
      complete: () => {
        try {
          saveSnapshot(actor.getPersistedSnapshot(), configHash, projectDir);
        } catch (error) {
          warnSnapshotSaveFailure("terminal", error);
        }
        resolve5(actor.getSnapshot().output);
      }
    });
    actor.start();
  });
  state = finalOutput.workflowState;
  if (resumeSnapshot !== null) {
    const diskState = readWorkflowState(projectDir);
    const existingKeys = new Set(
      state.tasks_completed.map((t) => `${t.story_key}::${t.task_name}`)
    );
    const sprintCompletions = diskState.tasks_completed.filter(
      (t) => !existingKeys.has(`${t.story_key}::${t.task_name}`)
    );
    if (sprintCompletions.length > 0) {
      info(`workflow-runner: Restored ${sprintCompletions.length} post-machine completion(s) from disk (resume after sprint-level interrupt)`);
      state = { ...state, tasks_completed: [...state.tasks_completed, ...sprintCompletions] };
    }
  }
  let { errors, tasksCompleted } = finalOutput;
  const rawSP = finalOutput.storiesProcessed;
  const storiesProcessed = rawSP instanceof Set ? rawSP : new Set(Array.isArray(rawSP) ? rawSP : Object.keys(rawSP ?? {}));
  if (config.workflow.sprintFlow.length > 0 && !finalOutput.halted && state.phase !== "interrupted") {
    for (const step of config.workflow.sprintFlow) {
      if (config.abortSignal?.aborted) break;
      if (typeof step === "string") {
        const task = config.workflow.tasks[step];
        if (!task) {
          warn(`workflow-runner: sprint task "${step}" not found, skipping`);
          continue;
        }
        if (isTaskCompleted(state, step, "__sprint__")) continue;
        const definition = task.agent ? config.agents[task.agent] : void 0;
        if (task.agent && !definition) {
          warn(`workflow-runner: agent "${task.agent}" not found for sprint task "${step}", skipping`);
          continue;
        }
        try {
          const dr = task.agent === null ? await nullTaskCore({ task, taskName: step, storyKey: "__sprint__", config, workflowState: state, previousContract: finalOutput.lastContract, accumulatedCostUsd: finalOutput.accumulatedCostUsd }) : await dispatchTaskCore({ task, taskName: step, storyKey: "__sprint__", definition, config, workflowState: state, previousContract: finalOutput.lastContract, accumulatedCostUsd: finalOutput.accumulatedCostUsd });
          state = dr.updatedState;
          tasksCompleted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors = [...errors, { taskName: step, storyKey: "__sprint__", code: "SPRINT_TASK_ERROR", message: msg }];
          warn(`workflow-runner: sprint task "${step}" failed: ${msg}`);
        }
      } else if (typeof step === "object" && step !== null && "gate" in step) {
        const gateConfig = step;
        info(`workflow-runner: running sprint gate "${gateConfig.gate}"`);
        state = { ...state, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } };
        const { executeLoopBlock } = await import("./workflow-machines-RATVCTEB.js");
        const loopBlock = { loop: [...gateConfig.check, ...gateConfig.fix] };
        const allItems = [...storiesProcessed].map((k) => ({ key: k, source: "sprint" }));
        const loopResult = await executeLoopBlock(loopBlock, state, { ...config, maxIterations: gateConfig.max_retries }, allItems, finalOutput.lastContract, storyFlowTasks);
        state = loopResult.state;
        errors = [...errors, ...loopResult.errors];
        tasksCompleted += loopResult.tasksCompleted;
      }
    }
  }
  if (!finalOutput.halted && state.phase !== "interrupted" && errors.length === 0) {
    const { updateStoryStatus: updateStatus } = await import("./sprint-HLWHVDU3.js");
    const { loadCheckedStories: loadChecked } = await import("./workflow-work-items-BID2TA3N.js");
    const checkedStories = loadChecked(config.sprintStatusPath);
    for (const item of checkedStories) {
      updateStatus(item.key, "done");
    }
  }
  if (state.phase !== "interrupted" && errors.length === 0 && state.phase !== "max-iterations" && state.phase !== "circuit-breaker") {
    state = { ...state, phase: "completed" };
  } else if (state.phase === "executing") {
    state = { ...state, phase: "failed" };
  }
  writeWorkflowState(state, projectDir);
  const loopTerminated = state.phase === "max-iterations" || state.phase === "circuit-breaker";
  const success = errors.length === 0 && !loopTerminated && state.phase !== "interrupted";
  if (success) {
    const cleared = clearAllPersistence(projectDir);
    info(`workflow-runner: Persistence cleared \u2014 snapshot: ${cleared.snapshotCleared ? "yes" : "no"}, checkpoints: ${cleared.checkpointCleared ? "yes" : "no"}`);
  } else {
    info("workflow-runner: Persistence preserved for resume \u2014 snapshot and checkpoint log kept on disk");
  }
  return {
    success,
    tasksCompleted,
    storiesProcessed: storiesProcessed.size,
    errors,
    durationMs: Date.now() - startMs
  };
}

// src/lib/worktree-manager.ts
import { execSync } from "child_process";
import { existsSync as existsSync7, readFileSync as readFileSync7, statSync } from "fs";
import { join as join6 } from "path";
var BRANCH_PREFIX = "codeharness/epic-";
var WORKTREE_BASE = "/tmp/codeharness-wt-epic-";
var WorktreeError = class extends Error {
  /** Raw stderr output from the failed git command. */
  stderr;
  constructor(message, stderr) {
    super(message);
    this.name = "WorktreeError";
    this.stderr = stderr;
  }
};
var AsyncMutex = class {
  locked = false;
  waitQueue = [];
  async acquire() {
    while (this.locked) {
      await new Promise((resolve5) => this.waitQueue.push(resolve5));
    }
    this.locked = true;
    return () => {
      this.locked = false;
      const next = this.waitQueue.shift();
      if (next) next();
    };
  }
};
var mergeMutex = new AsyncMutex();
var WorktreeManager = class {
  mainBranch;
  cwd;
  /**
   * @param mainBranch  The main branch to base new worktree branches on (default: `'main'`).
   * @param cwd  The git repository root directory (default: `process.cwd()`).
   */
  constructor(mainBranch = "main", cwd) {
    this.mainBranch = mainBranch;
    this.cwd = cwd ?? process.cwd();
  }
  /**
   * Create a worktree for a parallel epic.
   *
   * Creates a branch `codeharness/epic-{epicId}-{slug}` from the main branch HEAD,
   * then creates a git worktree at `/tmp/codeharness-wt-epic-{epicId}`.
   *
   * If a stale branch or worktree exists from a previous crashed run,
   * it is cleaned up before re-creating (idempotent recovery).
   *
   * @param epicId  The epic identifier (numeric or string).
   * @param slug  A human-readable slug for the branch name (sanitized to `[a-z0-9-]`).
   * @returns The absolute path to the created worktree directory.
   * @throws {WorktreeError} If the git command fails.
   */
  createWorktree(epicId, slug) {
    this.validateEpicId(epicId);
    const sanitizedSlug = this.sanitizeSlug(slug);
    const branchName = `${BRANCH_PREFIX}${epicId}-${sanitizedSlug}`;
    const worktreePath = `${WORKTREE_BASE}${epicId}`;
    this.cleanupStale(epicId, branchName, worktreePath);
    let branchCreated = false;
    try {
      this.execGit(`git branch ${branchName} ${this.mainBranch}`);
      branchCreated = true;
      this.execGit(`git worktree add ${worktreePath} ${branchName}`);
      return worktreePath;
    } catch (err) {
      this.cleanupPartial(branchCreated, branchName, worktreePath);
      if (err instanceof WorktreeError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new WorktreeError(
        `Failed to create worktree for epic ${epicId}: ${message}`,
        ""
      );
    }
  }
  /**
   * Remove a worktree and its branch for an epic.
   *
   * Idempotent: completes without error if the worktree or branch
   * does not exist (AC #5).
   *
   * @param epicId  The epic identifier.
   */
  cleanupWorktree(epicId) {
    this.validateEpicId(epicId);
    const worktreePath = `${WORKTREE_BASE}${epicId}`;
    try {
      this.execGit(`git worktree remove ${worktreePath} --force`);
    } catch {
    }
    const branch = this.findBranchForEpic(epicId);
    if (branch) {
      try {
        this.execGit(`git branch -D ${branch}`);
      } catch {
      }
    }
  }
  /**
   * List all codeharness worktrees.
   *
   * @returns An array of `WorktreeInfo` objects sorted by epicId.
   *          Returns an empty array when no codeharness worktrees exist.
   */
  listWorktrees() {
    let output;
    try {
      output = this.execGit("git worktree list --porcelain");
    } catch {
      return [];
    }
    const entries = this.parsePorcelainOutput(output);
    return entries.filter((e) => e.branch.startsWith(`refs/heads/${BRANCH_PREFIX}`)).map((e) => {
      const branchName = e.branch.replace("refs/heads/", "");
      const epicId = this.extractEpicId(branchName);
      return {
        epicId,
        path: e.path,
        branch: branchName,
        createdAt: this.getWorktreeCreatedAt(e.path)
      };
    }).sort((a, b) => a.epicId.localeCompare(b.epicId, void 0, { numeric: true }));
  }
  /**
   * Detect orphaned worktrees from previous crashed runs.
   *
   * A worktree is considered orphaned if its directory exists on disk
   * but has no `.codeharness/lane-state.json` file or the file has
   * no active PID.
   *
   * @returns An array of orphaned `WorktreeInfo` entries.
   */
  detectOrphans() {
    const worktrees = this.listWorktrees();
    return worktrees.filter((wt) => this.isOrphaned(wt));
  }
  /**
   * Merge an epic branch into the main branch with serialized access.
   *
   * Acquires a module-level mutex so only one merge runs at a time.
   * After a clean merge, runs the test suite. If tests fail, the merge
   * is reverted. On conflict or git error, the main branch is restored.
   *
   * @param epicId  The epic identifier whose branch should be merged.
   * @param strategy  Merge strategy: `'merge-commit'` (default) or `'rebase'`.
   * @param testCommand  Command to run for post-merge validation (default: `'npm test'`).
   * @returns A `MergeResult` describing the outcome.
   */
  async mergeWorktree(epicId, strategy = "merge-commit", testCommand = "npm test", onConflict) {
    const start = Date.now();
    if (!/^[a-zA-Z0-9_./ -]+$/.test(testCommand)) {
      return {
        success: false,
        reason: "git-error",
        durationMs: Date.now() - start
      };
    }
    const branch = this.findBranchForEpic(epicId);
    if (!branch) {
      return {
        success: false,
        reason: "git-error",
        durationMs: Date.now() - start
      };
    }
    if (!/^[a-zA-Z0-9_./-]+$/.test(branch)) {
      return {
        success: false,
        reason: "git-error",
        durationMs: Date.now() - start
      };
    }
    const release = await mergeMutex.acquire();
    try {
      const branchCheck = this.findBranchForEpic(epicId);
      if (!branchCheck || branchCheck !== branch) {
        return {
          success: false,
          reason: "git-error",
          durationMs: Date.now() - start
        };
      }
      const status = this.execGit("git status --porcelain");
      if (status.length > 0) {
        return {
          success: false,
          reason: "git-error",
          durationMs: Date.now() - start
        };
      }
      try {
        if (strategy === "rebase") {
          this.execGit(`git rebase ${branch}`);
        } else {
          this.execGit(`git merge --no-ff ${branch}`);
        }
      } catch {
        const conflicts = this.detectConflicts();
        if (conflicts.length > 0) {
          if (onConflict) {
            const result = await onConflict({
              epicId,
              branch,
              conflicts,
              cwd: this.cwd,
              testCommand
            });
            if (result.resolved) {
              this.cleanupWorktree(epicId);
              return {
                success: true,
                testResults: result.testResults,
                durationMs: Date.now() - start
              };
            }
            this.abortMerge(strategy);
            return {
              success: false,
              reason: "conflict",
              conflicts,
              durationMs: Date.now() - start
            };
          }
          this.abortMerge(strategy);
          return {
            success: false,
            reason: "conflict",
            conflicts,
            durationMs: Date.now() - start
          };
        }
        this.abortMerge(strategy);
        return {
          success: false,
          reason: "git-error",
          durationMs: Date.now() - start
        };
      }
      const validation = await validateMerge({
        testCommand,
        cwd: this.cwd,
        epicId,
        writeTelemetry: true
      });
      if (!validation.valid) {
        try {
          this.execGit("git reset --hard HEAD~1");
        } catch {
        }
        return {
          success: false,
          reason: "tests-failed",
          testResults: validation.testResults,
          durationMs: Date.now() - start
        };
      }
      this.cleanupWorktree(epicId);
      return {
        success: true,
        testResults: validation.testResults,
        durationMs: Date.now() - start
      };
    } finally {
      release();
    }
  }
  // --- Private Helpers ---
  /**
   * Get the creation time of a worktree directory.
   * Falls back to current time if the directory doesn't exist or stat fails.
   */
  getWorktreeCreatedAt(worktreePath) {
    try {
      const stats = statSync(worktreePath);
      return stats.birthtime;
    } catch {
      return /* @__PURE__ */ new Date();
    }
  }
  /**
   * Validate epicId contains only safe characters `[a-zA-Z0-9-]`.
   * Prevents command injection via crafted epicId values.
   */
  validateEpicId(epicId) {
    if (!epicId || !/^[a-zA-Z0-9-]+$/.test(epicId)) {
      throw new WorktreeError(
        `Invalid epicId: "${epicId}" \u2014 must be non-empty and contain only [a-zA-Z0-9-]`,
        ""
      );
    }
  }
  /**
   * Sanitize a slug to contain only `[a-z0-9-]`.
   */
  sanitizeSlug(slug) {
    return slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  /**
   * Execute a git command and return its stdout.
   * Wraps errors in WorktreeError with captured stderr.
   */
  execGit(cmd) {
    try {
      const result = execSync(cmd, {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 3e4
      });
      return result.toString().trim();
    } catch (err) {
      const stderr = err?.stderr?.toString() ?? "";
      throw new WorktreeError(`Git command failed: ${cmd} \u2014 ${stderr}`, stderr);
    }
  }
  /**
   * Clean up stale branch and worktree from a previous crash (AC #9).
   */
  cleanupStale(epicId, branchName, worktreePath) {
    if (existsSync7(worktreePath)) {
      try {
        this.execGit(`git worktree remove ${worktreePath} --force`);
      } catch {
        try {
          this.execGit("git worktree prune");
        } catch {
        }
      }
    }
    const existingBranch = this.findBranchForEpic(epicId);
    if (existingBranch) {
      try {
        this.execGit(`git branch -D ${existingBranch}`);
      } catch {
      }
    }
  }
  /**
   * Clean up partial state after a failed createWorktree (AC #10).
   */
  cleanupPartial(branchCreated, branchName, worktreePath) {
    try {
      this.execGit(`git worktree remove ${worktreePath} --force`);
    } catch {
    }
    if (branchCreated) {
      try {
        this.execGit(`git branch -D ${branchName}`);
      } catch {
      }
    }
  }
  /**
   * Find a branch matching `codeharness/epic-{epicId}-*`.
   */
  findBranchForEpic(epicId) {
    try {
      const output = this.execGit(`git branch --list ${BRANCH_PREFIX}${epicId}-*`);
      const branches = output.split("\n").map((b) => b.trim().replace(/^\*\s*/, "")).filter((b) => b.length > 0);
      return branches[0];
    } catch {
      return void 0;
    }
  }
  /**
   * Parse `git worktree list --porcelain` output into structured entries.
   */
  parsePorcelainOutput(output) {
    if (!output.trim()) return [];
    const blocks = output.split("\n\n").filter((b) => b.trim());
    const entries = [];
    for (const block of blocks) {
      const lines = block.split("\n");
      let path = "";
      let branch = "";
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          path = line.slice("worktree ".length);
        } else if (line.startsWith("branch ")) {
          branch = line.slice("branch ".length);
        }
      }
      if (path && branch) {
        entries.push({ path, branch });
      }
    }
    return entries;
  }
  /**
   * Extract epicId from a branch name like `codeharness/epic-17-slug`.
   */
  extractEpicId(branchName) {
    const withoutPrefix = branchName.slice(BRANCH_PREFIX.length);
    const dashIndex = withoutPrefix.indexOf("-");
    if (dashIndex === -1) return withoutPrefix;
    return withoutPrefix.slice(0, dashIndex);
  }
  /**
   * Detect conflicting files after a failed merge/rebase.
   * Uses `git diff --name-only --diff-filter=U` to find unmerged paths.
   */
  detectConflicts() {
    try {
      const output = this.execGit("git diff --name-only --diff-filter=U");
      return output.split("\n").map((f) => f.trim()).filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
  /**
   * Abort an in-progress merge or rebase to restore main branch state.
   */
  abortMerge(strategy) {
    try {
      if (strategy === "rebase") {
        this.execGit("git rebase --abort");
      } else {
        this.execGit("git merge --abort");
      }
    } catch {
    }
  }
  /**
   * Check if a worktree is orphaned (no active codeharness process).
   */
  isOrphaned(wt) {
    const laneStatePath = join6(wt.path, ".codeharness", "lane-state.json");
    if (!existsSync7(laneStatePath)) {
      return true;
    }
    try {
      const content = readFileSync7(laneStatePath, "utf-8");
      const state = JSON.parse(content);
      if (!state.pid) {
        return true;
      }
      try {
        process.kill(state.pid, 0);
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  }
};

// src/lib/lane-pool.ts
var LanePoolError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LanePoolError";
  }
};
var LanePool = class {
  worktreeManager;
  maxParallel;
  listeners = [];
  // Internal state (set during startPool)
  activeLanes = /* @__PURE__ */ new Map();
  completedEpicIds = /* @__PURE__ */ new Set();
  failedEpicIds = /* @__PURE__ */ new Set();
  epicIndexMap = /* @__PURE__ */ new Map();
  laneCounter = 0;
  /**
   * @param worktreeManager  The worktree manager for creating/cleaning up worktrees.
   * @param maxParallel  Maximum number of lanes to run simultaneously.
   */
  constructor(worktreeManager, maxParallel) {
    if (maxParallel < 1) {
      throw new LanePoolError("maxParallel must be at least 1");
    }
    this.worktreeManager = worktreeManager;
    this.maxParallel = maxParallel;
  }
  /**
   * Register a listener for lane events.
   *
   * @param callback  Function called for each `LaneEvent`.
   */
  onEvent(callback) {
    this.listeners.push(callback);
  }
  /**
   * Run all epics through the lane pool.
   *
   * Creates up to `maxParallel` lanes simultaneously. Each lane
   * executes one epic via the provided callback. When a lane completes,
   * the next independent epic is scheduled.
   *
   * @param epics  The epics to execute.
   * @param executeFn  Callback that runs the workflow engine for an epic.
   * @returns Aggregate pool result with per-epic outcomes.
   */
  async startPool(epics, executeFn) {
    const poolStart = Date.now();
    if (epics.length === 0) {
      return {
        success: true,
        epicsProcessed: 0,
        epicResults: /* @__PURE__ */ new Map(),
        durationMs: Date.now() - poolStart
      };
    }
    this.activeLanes = /* @__PURE__ */ new Map();
    this.completedEpicIds = /* @__PURE__ */ new Set();
    this.failedEpicIds = /* @__PURE__ */ new Set();
    this.epicIndexMap = /* @__PURE__ */ new Map();
    this.laneCounter = 0;
    const pendingEpics = [];
    for (let i = 0; i < epics.length; i++) {
      this.epicIndexMap.set(epics[i].id, i);
      pendingEpics.push(epics[i]);
    }
    for (const epic of epics) {
      this.emit({
        type: "epic-queued",
        epicId: epic.id,
        laneIndex: -1,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const epicResults = /* @__PURE__ */ new Map();
    const epicStartTimes = /* @__PURE__ */ new Map();
    while (pendingEpics.length > 0 || this.activeLanes.size > 0) {
      const slotsAvailable = this.maxParallel - this.activeLanes.size;
      const candidates = [];
      for (let s = 0; s < slotsAvailable && pendingEpics.length > 0; s++) {
        const readyIndex = this.findNextReadyEpic(pendingEpics);
        if (readyIndex === -1) break;
        candidates.push(pendingEpics.splice(readyIndex, 1)[0]);
      }
      for (const epic of candidates) {
        epicStartTimes.set(epic.id, Date.now());
        const lane2 = this.createLane(epic, executeFn);
        if (lane2) {
          this.activeLanes.set(epic.id, lane2);
        } else {
          const duration = Date.now() - epicStartTimes.get(epic.id);
          this.failedEpicIds.add(epic.id);
          epicResults.set(epic.id, {
            epicId: epic.id,
            status: "failed",
            error: "Worktree creation failed",
            durationMs: duration
          });
        }
      }
      if (this.activeLanes.size === 0) break;
      const completed = await Promise.race(
        [...this.activeLanes.values()].map(
          (l) => l.promise.then(
            (result) => ({ epicId: l.epicId, result, error: void 0 }),
            (err) => ({
              epicId: l.epicId,
              result: void 0,
              error: err instanceof Error ? err.message : String(err)
            })
          )
        )
      );
      const lane = this.activeLanes.get(completed.epicId);
      this.activeLanes.delete(completed.epicId);
      const epicDuration = Date.now() - epicStartTimes.get(completed.epicId);
      if (completed.error === void 0 && completed.result) {
        this.completedEpicIds.add(completed.epicId);
        epicResults.set(completed.epicId, {
          epicId: completed.epicId,
          status: "completed",
          engineResult: completed.result,
          durationMs: epicDuration
        });
        this.emit({
          type: "lane-completed",
          epicId: completed.epicId,
          laneIndex: lane.laneIndex,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          result: completed.result
        });
      } else {
        this.failedEpicIds.add(completed.epicId);
        epicResults.set(completed.epicId, {
          epicId: completed.epicId,
          status: "failed",
          error: completed.error ?? "Unknown error",
          durationMs: epicDuration
        });
        try {
          this.worktreeManager.cleanupWorktree(completed.epicId);
        } catch {
        }
        this.emit({
          type: "lane-failed",
          epicId: completed.epicId,
          laneIndex: lane.laneIndex,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          error: completed.error ?? "Unknown error"
        });
      }
    }
    const allSuccess = this.failedEpicIds.size === 0 && this.completedEpicIds.size === epics.length;
    return {
      success: allSuccess,
      epicsProcessed: epicResults.size,
      epicResults,
      durationMs: Date.now() - poolStart
    };
  }
  // --- Private Methods ---
  /**
   * Create a lane for an epic: create worktree, then start execution.
   *
   * @returns The lane, or `null` if worktree creation failed.
   */
  createLane(epic, executeFn) {
    const laneIndex = this.laneCounter++;
    let worktreePath;
    try {
      worktreePath = this.worktreeManager.createWorktree(epic.id, epic.slug);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "lane-failed",
        epicId: epic.id,
        laneIndex,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        error: errorMsg
      });
      return null;
    }
    this.emit({
      type: "lane-started",
      epicId: epic.id,
      laneIndex,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    const promise = executeFn(epic.id, worktreePath);
    return {
      epicId: epic.id,
      laneIndex,
      worktreePath,
      status: "executing",
      promise
    };
  }
  /**
   * Find the index of the next ready epic in the pending queue.
   *
   * Epic N is ready only if no epic with index < N is still active
   * (except those already done/failed). (AC #5)
   *
   * @returns Index into `pendingEpics`, or -1 if none are ready.
   */
  findNextReadyEpic(pendingEpics) {
    for (let i = 0; i < pendingEpics.length; i++) {
      const epicIndex = this.epicIndexMap.get(pendingEpics[i].id);
      if (this.isEpicReady(epicIndex)) {
        return i;
      }
    }
    return -1;
  }
  /**
   * Check if an epic is ready to be scheduled.
   *
   * Epic N is ready only if no epic with a lower index is still
   * active (i.e., all preceding epics are either completed or failed).
   */
  isEpicReady(epicIndex) {
    for (const [, lane] of this.activeLanes) {
      const activeIndex = this.epicIndexMap.get(lane.epicId);
      if (activeIndex !== void 0 && activeIndex < epicIndex) {
        return false;
      }
    }
    return true;
  }
  /**
   * Emit a lane event to all registered listeners.
   */
  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
};

// src/lib/ink-renderer.tsx
import { render as inkRender } from "ink";

// src/lib/ink-components.tsx
import { Text as Text8, Box as Box8 } from "ink";

// src/lib/ink-activity-components.tsx
import { Text, Box } from "ink";
import { Spinner } from "@inkjs/ui";
import { jsx, jsxs } from "react/jsx-runtime";
var MESSAGE_STYLE = {
  ok: { prefix: "[OK]", color: "green" },
  warn: { prefix: "[WARN]", color: "yellow" },
  fail: { prefix: "[FAIL]", color: "red" }
};
function StoryMessageLine({ msg }) {
  const style = MESSAGE_STYLE[msg.type];
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { color: style.color, bold: true, children: style.prefix }),
      /* @__PURE__ */ jsx(Text, { children: ` Story ${msg.key}: ${msg.message}` })
    ] }),
    msg.details?.map((d, j) => /* @__PURE__ */ jsx(Text, { dimColor: true, children: `  \u2514 ${d}` }, j))
  ] });
}
function CompletedTool({ entry }) {
  if (entry.isText) {
    const text = entry.args.length > 80 ? entry.args.slice(0, 80) + "\u2026" : entry.args;
    return /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx(Text, { children: "\u{1F4AD} " }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: text })
    ] });
  }
  const argsSummary = entry.args.length > 60 ? entry.args.slice(0, 60) + "\u2026" : entry.args;
  return /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
    /* @__PURE__ */ jsx(Text, { color: "green", children: "\u2713 " }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "[" }),
    /* @__PURE__ */ jsx(Text, { children: entry.name }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "] " }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: argsSummary }),
    entry.driver && /* @__PURE__ */ jsx(Text, { dimColor: true, children: ` (${entry.driver})` })
  ] });
}
var DEFAULT_VISIBLE_TOOLS = 5;
function CompletedTools({ tools, maxVisible }) {
  const limit = maxVisible ?? DEFAULT_VISIBLE_TOOLS;
  const visible = tools.slice(-limit);
  const hidden = tools.length - visible.length;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    hidden > 0 && /* @__PURE__ */ jsx(Text, { dimColor: true, children: `  \u2026 ${hidden} earlier tools` }),
    visible.map((entry, i) => /* @__PURE__ */ jsx(CompletedTool, { entry }, i))
  ] });
}
function ActivitySection({ completedTools, activeTool, activeDriverName, lastThought, retryInfo, availableHeight }) {
  let reserved = 0;
  if (activeTool) reserved++;
  if (lastThought) reserved++;
  if (retryInfo) reserved++;
  const toolsHeight = Math.max(1, availableHeight - reserved - 1);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingLeft: 1, children: [
    /* @__PURE__ */ jsx(CompletedTools, { tools: completedTools, maxVisible: toolsHeight }),
    activeTool && /* @__PURE__ */ jsx(ActiveTool, { name: activeTool.name, driverName: activeDriverName }),
    lastThought && /* @__PURE__ */ jsx(LastThought, { text: lastThought }),
    retryInfo && /* @__PURE__ */ jsx(RetryNotice, { info: retryInfo })
  ] });
}
function ActiveTool({ name, driverName }) {
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(Text, { color: "yellow", children: "\u26A1 " }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "[" }),
    /* @__PURE__ */ jsx(Text, { bold: true, children: name }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "] " }),
    driverName && /* @__PURE__ */ jsx(Text, { dimColor: true, children: `(${driverName}) ` }),
    /* @__PURE__ */ jsx(Spinner, { label: "" })
  ] });
}
function LastThought({ text }) {
  return /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
    /* @__PURE__ */ jsx(Text, { children: "\u{1F4AD} " }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: text })
  ] });
}
function RetryNotice({ info: info2 }) {
  return /* @__PURE__ */ jsxs(Text, { color: "yellow", children: [
    "\u23F3 API retry ",
    info2.attempt,
    " (waiting ",
    info2.delay,
    "ms)"
  ] });
}

// src/lib/ink-app.tsx
import { Box as Box7, Static, Text as Text7, useInput } from "ink";

// src/lib/ink-workflow.tsx
import { Text as Text2, Box as Box2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
function isLoopBlock2(step) {
  return typeof step === "object" && step !== null && "loop" in step;
}
function driverLabel(driver) {
  if (!driver) return "";
  if (driver.includes("opus")) return "opus";
  if (driver.includes("sonnet")) return "snnt";
  if (driver.includes("haiku")) return "haiku";
  if (driver === "codex" || driver === "codex-mini") return "cdx";
  if (driver === "claude-code") return "cc";
  if (driver === "opencode") return "oc";
  return driver.slice(0, 4);
}
function TaskNode({ name, status, spinnerFrame, driver }) {
  const s = status ?? "pending";
  const tag = driver ? ` [${driverLabel(driver)}]` : "";
  switch (s) {
    case "done":
      return /* @__PURE__ */ jsxs2(Text2, { color: "green", children: [
        name,
        /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: tag }),
        " \u2713"
      ] });
    case "active": {
      const frame = SPINNER_FRAMES[(spinnerFrame ?? 0) % SPINNER_FRAMES.length];
      return /* @__PURE__ */ jsxs2(Text2, { color: "cyan", children: [
        frame,
        " ",
        name,
        /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: tag })
      ] });
    }
    case "failed":
      return /* @__PURE__ */ jsxs2(Text2, { color: "red", children: [
        name,
        /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: tag }),
        " \u2717"
      ] });
    case "pending":
    default:
      return /* @__PURE__ */ jsxs2(Text2, { dimColor: true, children: [
        name,
        tag
      ] });
  }
}
function loopIteration(tasks, taskStates) {
  const anyStarted = tasks.some((t) => {
    const s = taskStates[t];
    return s !== void 0 && s !== "pending";
  });
  return anyStarted ? 1 : 0;
}
function WorkflowGraph({ flow, currentTask: _currentTask, taskStates, taskMeta }) {
  if (flow.length === 0 || Object.keys(taskStates).length === 0) {
    return null;
  }
  const meta = taskMeta ?? {};
  const spinnerFrame = Math.floor(Date.now() / 80);
  let inLoop = false;
  let loopBlock = null;
  let loopItCount = 0;
  for (const step of flow) {
    if (isLoopBlock2(step)) {
      loopBlock = step;
      loopItCount = loopIteration(step.loop, taskStates);
      inLoop = loopItCount > 0;
      break;
    }
  }
  if (inLoop && loopBlock) {
    const elements2 = [];
    for (const step of flow) {
      if (isLoopBlock2(step)) break;
      if (typeof step === "string") {
        if (elements2.length > 0) elements2.push(/* @__PURE__ */ jsx2(Text2, { children: " \u2192 " }, `a-${step}`));
        if (step === "story_flow") {
          elements2.push(/* @__PURE__ */ jsx2(Text2, { color: "cyan", children: "stories \u2713" }, "sf"));
        } else {
          elements2.push(
            /* @__PURE__ */ jsx2(TaskNode, { name: step, status: taskStates[step], spinnerFrame, driver: meta[step]?.driver }, `t-${step}`)
          );
        }
      }
    }
    if (elements2.length > 0) elements2.push(/* @__PURE__ */ jsx2(Text2, { children: " \u2192 " }, "loop-arrow"));
    elements2.push(/* @__PURE__ */ jsx2(Text2, { children: /* @__PURE__ */ jsx2(Text2, { bold: true, children: `Loop ${loopItCount}: ` }) }, "loop-label"));
    for (let j = 0; j < loopBlock.loop.length; j++) {
      if (j > 0) elements2.push(/* @__PURE__ */ jsx2(Text2, { children: " \u2192 " }, `la-${j}`));
      const tn = loopBlock.loop[j];
      const loopKey = `loop:${tn}`;
      const status = taskStates[loopKey] ?? taskStates[tn];
      const driver = meta[loopKey]?.driver ?? meta[tn]?.driver;
      elements2.push(
        /* @__PURE__ */ jsx2(TaskNode, { name: tn, status, spinnerFrame, driver }, `lt-${j}`)
      );
    }
    return /* @__PURE__ */ jsx2(Box2, { flexDirection: "column", children: /* @__PURE__ */ jsxs2(Text2, { children: [
      "  ",
      elements2
    ] }) });
  }
  const elements = [];
  for (const step of flow) {
    if (isLoopBlock2(step)) break;
    if (typeof step !== "string") continue;
    if (elements.length > 0) {
      elements.push(/* @__PURE__ */ jsx2(Text2, { children: " \u2192 " }, `a-${step}`));
    }
    if (step === "story_flow") {
      elements.push(/* @__PURE__ */ jsx2(Text2, { color: "cyan", children: "stories \u2713" }, "sf"));
    } else {
      elements.push(
        /* @__PURE__ */ jsx2(TaskNode, { name: step, status: taskStates[step], spinnerFrame, driver: meta[step]?.driver }, `t-${step}`)
      );
    }
  }
  return /* @__PURE__ */ jsx2(Box2, { flexDirection: "column", children: /* @__PURE__ */ jsxs2(Text2, { children: [
    "  ",
    elements
  ] }) });
}

// src/lib/ink-lane-container.tsx
import { Text as Text4, Box as Box4 } from "ink";

// src/lib/ink-lane.tsx
import { Text as Text3, Box as Box3 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function formatLaneCost(cost) {
  if (cost == null) return "--";
  return `$${cost.toFixed(2)}`;
}
function formatLaneElapsed(ms) {
  if (ms == null) return "--";
  const totalSeconds = Math.round(ms / 1e3);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes >= 1) {
    return `${minutes}m`;
  }
  return `${totalSeconds}s`;
}
function StoryProgressBar({ entries }) {
  if (entries.length === 0) return null;
  const items = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i > 0) items.push(/* @__PURE__ */ jsx3(Text3, { children: " " }, `sp-${i}`));
    switch (entry.status) {
      case "done":
        items.push(/* @__PURE__ */ jsx3(Text3, { color: "green", children: `\u2713 ${entry.key}` }, `s-${i}`));
        break;
      case "in-progress":
        items.push(/* @__PURE__ */ jsx3(Text3, { color: "yellow", children: `\u25C6 ${entry.key}` }, `s-${i}`));
        break;
      case "pending":
        items.push(/* @__PURE__ */ jsx3(Text3, { dimColor: true, children: `\u25CB ${entry.key}` }, `s-${i}`));
        break;
    }
  }
  return /* @__PURE__ */ jsxs3(Text3, { children: [
    " ",
    items
  ] });
}
function Lane(props) {
  const {
    epicId,
    epicTitle,
    currentStory,
    phase,
    acProgress,
    storyProgressEntries,
    driver,
    cost,
    elapsedTime,
    laneIndex
  } = props;
  const laneLabel = laneIndex != null ? `Lane ${laneIndex}: ` : "";
  const titleLine = `${laneLabel}Epic ${epicId} \u2014 ${epicTitle}`;
  const storyParts = [];
  if (currentStory) storyParts.push(currentStory);
  if (phase) storyParts.push(`\u25C6 ${phase}`);
  if (acProgress) storyParts.push(`(AC ${acProgress})`);
  const storyLine = storyParts.length > 0 ? ` ${storyParts.join(" ")}` : null;
  const driverLine = ` ${driver ?? "unknown"} | ${formatLaneCost(cost)} / ${formatLaneElapsed(elapsedTime)}`;
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx3(Text3, { bold: true, children: titleLine }),
    storyLine && /* @__PURE__ */ jsx3(Text3, { children: storyLine }),
    /* @__PURE__ */ jsx3(StoryProgressBar, { entries: storyProgressEntries }),
    /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: driverLine })
  ] });
}

// src/lib/ink-lane-container.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function getLayoutMode(terminalWidth) {
  if (terminalWidth >= 120) return "side-by-side";
  if (terminalWidth >= 80) return "stacked";
  return "single";
}
function truncate(str, maxLen) {
  if (maxLen < 4) return str.slice(0, maxLen);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
}
function CollapsedLanes({ lanes }) {
  if (lanes.length === 0) return null;
  return /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: lanes.map((lane) => {
    const storyPart = lane.currentStory ?? "--";
    const phasePart = lane.phase ?? "--";
    const costPart = formatLaneCost(lane.cost);
    const timePart = formatLaneElapsed(lane.elapsedTime);
    const line = `Lane ${lane.laneIndex}: ${lane.epicTitle} \u2502 ${storyPart} \u25C6 ${phasePart} \u2502 ${costPart} / ${timePart}`;
    return /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: line }, `collapsed-${lane.laneIndex}`);
  }) });
}
function LaneContainer({ lanes, terminalWidth }) {
  if (lanes.length === 0) return null;
  const mode = getLayoutMode(terminalWidth);
  let fullLanes;
  let collapsedLaneData;
  if (mode === "single") {
    let mostRecentIndex = 0;
    let mostRecentTime = -Infinity;
    for (let i = 0; i < lanes.length; i++) {
      const t = lanes[i].lastActivityTime ?? 0;
      if (t >= mostRecentTime) {
        mostRecentTime = t;
        mostRecentIndex = i;
      }
    }
    fullLanes = [lanes[mostRecentIndex]];
    collapsedLaneData = lanes.filter((_, i) => i !== mostRecentIndex).map((lane, i) => {
      const originalIndex = i >= mostRecentIndex ? i + 2 : i + 1;
      return {
        laneIndex: originalIndex,
        epicTitle: truncate(lane.epicTitle, 30),
        currentStory: lane.currentStory,
        phase: lane.phase,
        cost: lane.cost,
        elapsedTime: lane.elapsedTime
      };
    });
  } else {
    fullLanes = lanes.slice(0, 2);
    collapsedLaneData = lanes.slice(2).map((lane, i) => ({
      laneIndex: i + 3,
      epicTitle: truncate(lane.epicTitle, 30),
      currentStory: lane.currentStory,
      phase: lane.phase,
      cost: lane.cost,
      elapsedTime: lane.elapsedTime
    }));
  }
  const laneWidth = mode === "side-by-side" ? Math.floor(terminalWidth / 2) - 1 : terminalWidth;
  const fullLaneElements = [];
  for (let i = 0; i < fullLanes.length; i++) {
    const lane = fullLanes[i];
    const laneIndex = mode === "single" ? void 0 : i + 1;
    if (i > 0 && mode !== "side-by-side") {
      fullLaneElements.push(/* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "\u2500".repeat(Math.min(terminalWidth, 60)) }, `sep-${i}`));
    }
    fullLaneElements.push(
      /* @__PURE__ */ jsx4(Box4, { width: mode === "side-by-side" ? laneWidth : void 0, flexDirection: "column", children: /* @__PURE__ */ jsx4(
        Lane,
        {
          epicId: lane.epicId,
          epicTitle: lane.epicTitle,
          currentStory: lane.currentStory,
          phase: lane.phase,
          acProgress: lane.acProgress,
          storyProgressEntries: lane.storyProgressEntries,
          driver: lane.driver,
          cost: lane.cost,
          elapsedTime: lane.elapsedTime,
          laneIndex
        }
      ) }, `lane-${lane.epicId}`)
    );
  }
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
    mode === "side-by-side" ? /* @__PURE__ */ jsx4(Box4, { flexDirection: "row", children: fullLaneElements }) : /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", children: fullLaneElements }),
    /* @__PURE__ */ jsx4(CollapsedLanes, { lanes: collapsedLaneData })
  ] });
}

// src/lib/ink-summary-bar.tsx
import { Text as Text5, Box as Box5 } from "ink";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function formatConflictText(count) {
  return count === 1 ? "1 conflict" : `${count} conflicts`;
}
function formatCost(cost) {
  return `$${cost.toFixed(2)}`;
}
function SummaryBar({ doneStories, mergingEpic, pendingEpics, completedLanes }) {
  const doneSection = doneStories.length > 0 ? doneStories.map((s) => `${s} \u2713`).join("  ") : "\u2014";
  let mergingNode;
  if (!mergingEpic) {
    mergingNode = /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "\u2014" });
  } else if (mergingEpic.status === "resolving") {
    const conflictText = mergingEpic.conflictCount != null ? ` (resolving ${formatConflictText(mergingEpic.conflictCount)})` : "";
    mergingNode = /* @__PURE__ */ jsx5(Text5, { color: "yellow", children: `${mergingEpic.epicId} \u2192 main${conflictText} \u25CC` });
  } else if (mergingEpic.status === "in-progress") {
    mergingNode = /* @__PURE__ */ jsx5(Text5, { children: `${mergingEpic.epicId} \u2192 main \u25CC` });
  } else {
    mergingNode = /* @__PURE__ */ jsx5(Text5, { color: "green", children: `${mergingEpic.epicId} \u2192 main \u2713` });
  }
  const pendingSection = pendingEpics.length > 0 ? pendingEpics.join(", ") : "\u2014";
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs5(Text5, { children: [
      /* @__PURE__ */ jsx5(Text5, { color: "green", children: `Done: ${doneSection}` }),
      /* @__PURE__ */ jsx5(Text5, { children: " \u2502 " }),
      /* @__PURE__ */ jsx5(Text5, { children: "Merging: " }),
      mergingNode,
      /* @__PURE__ */ jsx5(Text5, { children: " \u2502 " }),
      /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: `Pending: ${pendingSection}` })
    ] }),
    completedLanes && completedLanes.length > 0 && completedLanes.map((lane) => /* @__PURE__ */ jsx5(Text5, { color: "green", children: `[OK] Lane ${lane.laneIndex}: Epic ${lane.epicId} complete (${lane.storyCount} stories, ${formatCost(lane.cost)}, ${lane.elapsed})` }, `lane-complete-${lane.laneIndex}`))
  ] });
}

// src/lib/ink-merge-status.tsx
import { Text as Text6, Box as Box6 } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function MergeStatus({ mergeState }) {
  if (!mergeState) return null;
  const lines = [];
  if (mergeState.outcome === "clean") {
    const count = mergeState.conflictCount ?? 0;
    lines.push(
      /* @__PURE__ */ jsx6(Text6, { color: "green", children: `[OK] Merge ${mergeState.epicId} \u2192 main: clean (${count} conflicts)` }, "merge-clean")
    );
  } else if (mergeState.outcome === "resolved") {
    const count = mergeState.conflictCount ?? mergeState.conflicts?.length ?? 0;
    const suffix = count === 1 ? "" : "s";
    lines.push(
      /* @__PURE__ */ jsx6(Text6, { color: "green", children: `[OK] Merge ${mergeState.epicId} \u2192 main: ${count} conflict${suffix} auto-resolved` }, "merge-resolved")
    );
    if (mergeState.conflicts && mergeState.conflicts.length > 0) {
      for (let i = 0; i < mergeState.conflicts.length; i++) {
        lines.push(
          /* @__PURE__ */ jsxs6(Text6, { children: [
            "     \u2514 ",
            mergeState.conflicts[i]
          ] }, `conflict-${i}`)
        );
      }
    }
  } else if (mergeState.outcome === "escalated") {
    lines.push(
      /* @__PURE__ */ jsx6(Text6, { color: "red", children: `[FAIL] Merge ${mergeState.epicId} \u2192 main: ${mergeState.reason ?? "unknown error"}` }, "merge-escalated")
    );
    if (mergeState.conflicts && mergeState.conflicts.length > 0) {
      for (let i = 0; i < mergeState.conflicts.length; i++) {
        lines.push(
          /* @__PURE__ */ jsxs6(Text6, { children: [
            "       \u2514 ",
            mergeState.conflicts[i]
          ] }, `esc-conflict-${i}`)
        );
      }
    }
    lines.push(
      /* @__PURE__ */ jsx6(Text6, { color: "red", children: "       \u2192 Manual resolution required" }, "manual")
    );
    if (mergeState.worktreePath) {
      lines.push(
        /* @__PURE__ */ jsx6(Text6, { color: "red", children: `       \u2192 Worktree preserved: ${mergeState.worktreePath}` }, "worktree")
      );
    }
  } else if (mergeState.outcome === "in-progress") {
    lines.push(
      /* @__PURE__ */ jsx6(Text6, { children: `Merging ${mergeState.epicId} \u2192 main \u25CC` }, "merge-inprog")
    );
  }
  if (mergeState.testResults) {
    const t = mergeState.testResults;
    const hasFailed = t.failed > 0;
    const prefix = hasFailed ? "[FAIL]" : "[OK]";
    const color = hasFailed ? "red" : "green";
    let testLine = `${prefix} Tests: ${t.passed}/${t.total} passed (${t.durationSecs}s)`;
    if (t.coverage != null) {
      testLine += ` ${t.coverage}% coverage`;
    }
    lines.push(
      /* @__PURE__ */ jsx6(Text6, { color, children: testLine }, "tests")
    );
  }
  return /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", children: lines });
}

// src/lib/ink-app.tsx
import { Fragment, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function LaneActivityHeader({ activeLaneId, laneCount }) {
  if (laneCount <= 1 || !activeLaneId) return null;
  return /* @__PURE__ */ jsx7(Text7, { children: /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: `[Lane ${activeLaneId} \u25B8]` }) });
}
function App({ state, onCycleLane, onQuit }) {
  const lanes = state.lanes;
  const laneCount = lanes?.length ?? 0;
  const terminalWidth = process.stdout.columns || 80;
  useInput((input, key) => {
    if (key.ctrl && input === "l" && onCycleLane && laneCount > 1) {
      onCycleLane();
    }
    if (input === "q" && onQuit) {
      onQuit();
    }
  }, { isActive: typeof process.stdin.setRawMode === "function" });
  const activeLaneCount = state.laneCount ?? 0;
  const termRows = process.stdout.rows || 24;
  const staticLines = state.messages.length;
  const fixedHeight = 10 + staticLines + 2;
  const availableHeight = Math.max(3, termRows - fixedHeight);
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx7(Static, { items: state.messages, children: (msg, i) => /* @__PURE__ */ jsx7(StoryMessageLine, { msg }, i) }),
    /* @__PURE__ */ jsx7(Header, { info: state.sprintInfo, laneCount: laneCount > 1 ? laneCount : void 0 }),
    laneCount > 1 ? /* @__PURE__ */ jsxs7(Fragment, { children: [
      /* @__PURE__ */ jsx7(LaneContainer, { lanes, terminalWidth }),
      state.summaryBar && /* @__PURE__ */ jsxs7(Fragment, { children: [
        /* @__PURE__ */ jsx7(Separator, {}),
        /* @__PURE__ */ jsx7(SummaryBar, { ...state.summaryBar })
      ] }),
      state.mergeState && /* @__PURE__ */ jsxs7(Fragment, { children: [
        /* @__PURE__ */ jsx7(Separator, {}),
        /* @__PURE__ */ jsx7(MergeStatus, { mergeState: state.mergeState })
      ] }),
      /* @__PURE__ */ jsx7(Separator, {}),
      /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", paddingLeft: 1, children: [
        /* @__PURE__ */ jsx7(LaneActivityHeader, { activeLaneId: state.activeLaneId ?? null, laneCount: activeLaneCount }),
        /* @__PURE__ */ jsx7(ActivitySection, { completedTools: state.completedTools, activeTool: state.activeTool, activeDriverName: state.activeDriverName, lastThought: state.lastThought, retryInfo: state.retryInfo, availableHeight })
      ] })
    ] }) : /* @__PURE__ */ jsxs7(Fragment, { children: [
      /* @__PURE__ */ jsx7(Separator, {}),
      /* @__PURE__ */ jsx7(ProgressBar, { done: state.sprintInfo?.done ?? 0, total: state.sprintInfo?.total ?? 0, inProgress: state.stories.filter((s) => s.status === "in-progress").length, checked: state.stories.filter((s) => s.status === "checked").length }),
      /* @__PURE__ */ jsx7(EpicInfo, { info: state.sprintInfo, stories: state.stories }),
      /* @__PURE__ */ jsx7(StoryContext, { entries: state.storyContext ?? [] }),
      /* @__PURE__ */ jsx7(Separator, {}),
      state.workflowVizLine ? /* @__PURE__ */ jsx7(Text7, { children: state.workflowVizLine }) : /* @__PURE__ */ jsx7(WorkflowGraph, { flow: state.workflowFlow, currentTask: state.currentTaskName, taskStates: state.taskStates }),
      /* @__PURE__ */ jsx7(Separator, {}),
      /* @__PURE__ */ jsx7(ActivitySection, { completedTools: state.completedTools, activeTool: state.activeTool, activeDriverName: state.activeDriverName, lastThought: state.lastThought, retryInfo: state.retryInfo, availableHeight })
    ] })
  ] });
}

// src/lib/ink-components.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function Separator() {
  const width = process.stdout.columns || 60;
  return /* @__PURE__ */ jsx8(Text8, { children: "\u2501".repeat(width) });
}
function formatCost2(cost) {
  return `$${cost.toFixed(2)}`;
}
function Header({ info: info2, laneCount }) {
  if (!info2) return null;
  const parts = ["codeharness run"];
  if (laneCount != null && laneCount > 1) parts.push(`${laneCount} lanes`);
  if (info2.elapsed) parts.push(`${info2.elapsed} elapsed`);
  const displayCost = laneCount != null && laneCount > 1 && info2.laneTotalCost != null ? info2.laneTotalCost : info2.totalCost;
  if (displayCost != null) parts.push(`${formatCost2(displayCost)} spent`);
  const left = parts.join(" | ");
  const right = "[q to quit]";
  const width = process.stdout.columns || 80;
  const pad = Math.max(0, width - left.length - right.length);
  return /* @__PURE__ */ jsxs8(Text8, { children: [
    left,
    " ".repeat(pad),
    /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: right })
  ] });
}
function ProgressBar({ done, total, inProgress, checked }) {
  const ip = inProgress ?? 0;
  const ck = checked ?? 0;
  const labelParts = [];
  if (done > 0) labelParts.push(`${done}\u2713`);
  if (ck > 0) labelParts.push(`${ck}\u2611`);
  if (ip > 0) labelParts.push(`${ip}\u26A1`);
  const label = `${labelParts.join(" ")} / ${total}`;
  const barWidth = Math.max(8, (process.stdout.columns || 80) - label.length - 4);
  const doneFilled = total > 0 ? Math.round(barWidth * done / total) : 0;
  const ckFilled = total > 0 ? Math.round(barWidth * ck / total) : 0;
  const ipFilled = total > 0 ? Math.round(barWidth * ip / total) : 0;
  const empty = Math.max(0, barWidth - doneFilled - ckFilled - ipFilled);
  return /* @__PURE__ */ jsxs8(Text8, { children: [
    /* @__PURE__ */ jsx8(Text8, { color: "green", children: "\u2588".repeat(doneFilled) }),
    /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: "\u2588".repeat(ckFilled) }),
    /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "\u2588".repeat(ipFilled) }),
    /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "\u2591".repeat(empty) }),
    ` ${label}`
  ] });
}
function EpicInfo({ info: info2, stories }) {
  if (!info2?.epicId) return null;
  const title = info2.epicTitle ?? `Epic ${info2.epicId}`;
  const epicPrefix = `${info2.epicId}-`;
  const epicStories = stories?.filter((s) => s.key.startsWith(epicPrefix)) ?? [];
  const ipCount = epicStories.filter((s) => s.status === "in-progress").length;
  const doneCount = info2.epicStoriesDone ?? 0;
  const totalCount = info2.epicStoriesTotal ?? epicStories.length;
  const progressParts = [];
  if (doneCount > 0) progressParts.push(`${doneCount} verified`);
  if (ipCount > 0) progressParts.push(`${ipCount} implemented`);
  const progress = totalCount > 0 ? ` \u2014 ${progressParts.join(", ")} / ${totalCount} stories` : "";
  return /* @__PURE__ */ jsxs8(Text8, { children: [
    /* @__PURE__ */ jsx8(Text8, { bold: true, children: `Epic ${info2.epicId}: ${title}` }),
    /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: progress })
  ] });
}
function StoryContext({ entries }) {
  if (entries.length === 0) return null;
  return /* @__PURE__ */ jsx8(Box8, { flexDirection: "column", children: entries.map((e, i) => {
    if (e.role === "prev") return /* @__PURE__ */ jsx8(Text8, { children: /* @__PURE__ */ jsx8(Text8, { color: "green", children: `  Prev: ${e.key} \u2713` }) }, i);
    if (e.role === "current") return /* @__PURE__ */ jsx8(Text8, { children: /* @__PURE__ */ jsx8(Text8, { color: "cyan", children: `  This: ${e.key}` }) }, i);
    return /* @__PURE__ */ jsx8(Text8, { children: /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: `  Next: ${e.key}` }) }, i);
  }) });
}

// src/lib/ink-renderer.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
var noopHandle = {
  update(_event, _driverName, _laneId) {
  },
  updateSprintState() {
  },
  updateStories() {
  },
  addMessage() {
  },
  updateWorkflowState() {
  },
  updateWorkflowRow() {
  },
  processLaneEvent() {
  },
  updateMergeState() {
  },
  cleanup() {
  }
};
var MAX_COMPLETED_TOOLS = 50;
function startRenderer(options) {
  if (options?.quiet || !process.stdout.isTTY && !options?._forceTTY) {
    return noopHandle;
  }
  let state = {
    sprintInfo: options?.sprintState ?? null,
    stories: [],
    messages: [],
    completedTools: [],
    activeTool: null,
    activeToolArgs: "",
    lastThought: null,
    retryInfo: null,
    workflowFlow: [],
    currentTaskName: null,
    taskStates: {},
    taskMeta: {},
    activeDriverName: null,
    driverCosts: {},
    storyContext: [],
    activeLaneId: null,
    laneCount: 0
  };
  const laneStates = /* @__PURE__ */ new Map();
  let pinnedLane = false;
  let currentStoryCosts = {};
  let lastStoryKey = state.sprintInfo?.storyKey ?? null;
  const pendingStoryCosts = /* @__PURE__ */ new Map();
  let cleaned = false;
  process.stdout.write("\x1B[2J\x1B[H");
  const onQuit = options?.onQuit;
  const inkInstance = inkRender(/* @__PURE__ */ jsx9(App, { state, onCycleLane: () => cycleLane(), onQuit: onQuit ? () => onQuit() : void 0 }), {
    exitOnCtrlC: false,
    patchConsole: !options?._forceTTY,
    maxFps: 10
  });
  function rerender() {
    if (!cleaned) {
      state = { ...state };
      inkInstance.rerender(/* @__PURE__ */ jsx9(App, { state, onCycleLane: () => cycleLane(), onQuit: onQuit ? () => onQuit() : void 0 }));
    }
  }
  const heartbeatSessionStartMs = options?.sessionStartMs;
  const heartbeat = setInterval(() => {
    if (!cleaned) {
      if (heartbeatSessionStartMs !== void 0 && state.sprintInfo) {
        state.sprintInfo = { ...state.sprintInfo, elapsed: formatElapsed(Date.now() - heartbeatSessionStartMs) };
      }
      rerender();
    }
  }, 500);
  function onSigint() {
    cleanupFull();
  }
  function onSigterm() {
    cleanupFull();
  }
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  function promoteActiveTool(clearActive, targetState) {
    const s = targetState ?? state;
    if (!s.activeTool) return;
    const entry = {
      name: s.activeTool.name,
      args: s.activeToolArgs,
      driver: s.activeDriverName ?? void 0
    };
    const updated = [...s.completedTools, entry];
    s.completedTools = updated.length > MAX_COMPLETED_TOOLS ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
    if (clearActive) {
      s.activeTool = null;
      s.activeToolArgs = "";
      s.activeDriverName = null;
    }
  }
  function copyLaneToDisplay(laneId) {
    const ls = laneStates.get(laneId);
    if (!ls) return;
    state.completedTools = [...ls.completedTools];
    state.activeTool = ls.activeTool ? { ...ls.activeTool } : null;
    state.activeToolArgs = ls.activeToolArgs;
    state.lastThought = ls.lastThought;
    state.retryInfo = ls.retryInfo ? { ...ls.retryInfo } : null;
    state.activeDriverName = ls.activeDriverName;
    state.activeLaneId = laneId;
  }
  function getOrCreateLaneState(laneId) {
    let ls = laneStates.get(laneId);
    if (!ls) {
      ls = {
        completedTools: [],
        activeTool: null,
        activeToolArgs: "",
        lastThought: null,
        retryInfo: null,
        activeDriverName: null,
        status: "active",
        lastActivityTime: Date.now()
      };
      laneStates.set(laneId, ls);
    }
    return ls;
  }
  function getActiveLaneIds() {
    const ids = [];
    for (const [id, ls] of laneStates) {
      if (ls.status === "active") ids.push(id);
    }
    return ids;
  }
  function update(event, driverName, laneId) {
    if (cleaned) return;
    if (laneId) {
      const ls = getOrCreateLaneState(laneId);
      ls.lastActivityTime = Date.now();
      switch (event.type) {
        case "tool-start":
          promoteActiveTool(false, ls);
          ls.activeTool = { name: event.name };
          ls.activeToolArgs = "";
          ls.activeDriverName = driverName ?? null;
          ls.lastThought = null;
          ls.retryInfo = null;
          break;
        case "tool-input":
          ls.activeToolArgs += event.partial;
          return;
        case "tool-complete":
          if (ls.activeTool) {
            if (["Agent", "Skill"].includes(ls.activeTool.name)) break;
            promoteActiveTool(true, ls);
          }
          break;
        case "text":
          ls.lastThought = event.text;
          ls.retryInfo = null;
          break;
        case "retry":
          ls.retryInfo = { attempt: event.attempt, delay: event.delay };
          break;
        case "result":
          if (event.cost > 0 && state.sprintInfo) {
            state.sprintInfo = {
              ...state.sprintInfo,
              totalCost: (state.sprintInfo.totalCost ?? 0) + event.cost
            };
          }
          if (event.cost > 0 && driverName) {
            state.driverCosts = {
              ...state.driverCosts,
              [driverName]: (state.driverCosts[driverName] ?? 0) + event.cost
            };
            currentStoryCosts = {
              ...currentStoryCosts,
              [driverName]: (currentStoryCosts[driverName] ?? 0) + event.cost
            };
          }
          break;
      }
      if (!pinnedLane && state.activeLaneId !== laneId) {
        state.activeLaneId = laneId;
      }
      if (pinnedLane && state.activeLaneId !== laneId) {
        pinnedLane = false;
      }
      if (state.activeLaneId === laneId) {
        copyLaneToDisplay(laneId);
      }
      state.laneCount = laneStates.size;
      rerender();
      return;
    }
    switch (event.type) {
      case "tool-start":
        if (state.lastThought) {
          const textEntry = { name: "", args: state.lastThought, isText: true };
          const updated = [...state.completedTools, textEntry];
          state.completedTools = updated.length > MAX_COMPLETED_TOOLS ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
        }
        promoteActiveTool(false);
        state.activeTool = { name: event.name };
        state.activeToolArgs = "";
        state.activeDriverName = driverName ?? null;
        state.lastThought = null;
        state.retryInfo = null;
        break;
      case "tool-input":
        state.activeToolArgs += event.partial;
        return;
      // Skip rerender
      case "tool-complete":
        if (state.activeTool) {
          if (["Agent", "Skill"].includes(state.activeTool.name)) break;
          promoteActiveTool(true);
        }
        break;
      case "text":
        if (state.lastThought) {
          const textEntry = { name: "", args: state.lastThought, isText: true };
          const updated = [...state.completedTools, textEntry];
          state.completedTools = updated.length > MAX_COMPLETED_TOOLS ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
        }
        state.lastThought = event.text;
        state.retryInfo = null;
        break;
      case "retry":
        state.retryInfo = { attempt: event.attempt, delay: event.delay };
        break;
      case "result":
        if (event.cost > 0 && state.sprintInfo) {
          state.sprintInfo = {
            ...state.sprintInfo,
            totalCost: (state.sprintInfo.totalCost ?? 0) + event.cost
          };
        }
        if (event.cost > 0 && driverName) {
          state.driverCosts = {
            ...state.driverCosts,
            [driverName]: (state.driverCosts[driverName] ?? 0) + event.cost
          };
          currentStoryCosts = {
            ...currentStoryCosts,
            [driverName]: (currentStoryCosts[driverName] ?? 0) + event.cost
          };
        }
        break;
    }
    rerender();
  }
  function processLaneEvent(event) {
    if (cleaned) return;
    switch (event.type) {
      case "lane-started": {
        const ls = getOrCreateLaneState(event.epicId);
        ls.status = "active";
        ls.lastActivityTime = Date.now();
        if (state.activeLaneId == null) {
          state.activeLaneId = event.epicId;
          copyLaneToDisplay(event.epicId);
        }
        state.laneCount = laneStates.size;
        break;
      }
      case "lane-completed": {
        const ls = laneStates.get(event.epicId);
        if (ls) {
          ls.status = "completed";
        }
        if (state.summaryBar) {
          const epicId = event.epicId;
          const newDone = [...state.summaryBar.doneStories];
          if (!newDone.includes(epicId)) newDone.push(epicId);
          const newPending = state.summaryBar.pendingEpics.filter((e) => e !== epicId);
          state.summaryBar = {
            ...state.summaryBar,
            doneStories: newDone,
            pendingEpics: newPending
          };
        }
        state.laneCount = laneStates.size;
        break;
      }
      case "lane-failed": {
        const ls = laneStates.get(event.epicId);
        if (ls) {
          ls.status = "failed";
        } else {
          const newLs = getOrCreateLaneState(event.epicId);
          newLs.status = "failed";
        }
        if (state.activeLaneId === event.epicId) {
          const activeIds = getActiveLaneIds();
          if (activeIds.length > 0) {
            state.activeLaneId = activeIds[0];
            copyLaneToDisplay(activeIds[0]);
          }
        }
        state.laneCount = laneStates.size;
        break;
      }
      case "epic-queued": {
        if (state.summaryBar) {
          if (!state.summaryBar.pendingEpics.includes(event.epicId)) {
            state.summaryBar = {
              ...state.summaryBar,
              pendingEpics: [...state.summaryBar.pendingEpics, event.epicId]
            };
          }
        }
        break;
      }
    }
    rerender();
  }
  function updateMergeState(mergeState) {
    if (cleaned) return;
    state.mergeState = mergeState;
    if (state.summaryBar && !mergeState) {
      state.summaryBar = { ...state.summaryBar, mergingEpic: null };
    }
    if (state.summaryBar && mergeState) {
      const mergingStatus = mergeState.outcome === "clean" || mergeState.outcome === "resolved" ? "complete" : mergeState.outcome === "escalated" ? "complete" : "in-progress";
      state.summaryBar = {
        ...state.summaryBar,
        mergingEpic: {
          epicId: mergeState.epicId,
          status: mergingStatus,
          conflictCount: mergeState.conflictCount
        }
      };
    }
    rerender();
  }
  function cycleLane() {
    if (cleaned) return;
    const activeIds = getActiveLaneIds();
    if (activeIds.length <= 1) return;
    const currentIndex = state.activeLaneId ? activeIds.indexOf(state.activeLaneId) : -1;
    const nextIndex = (currentIndex + 1) % activeIds.length;
    state.activeLaneId = activeIds[nextIndex];
    copyLaneToDisplay(activeIds[nextIndex]);
    pinnedLane = true;
    rerender();
  }
  function cleanupFull() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    try {
      inkInstance.unmount();
    } catch {
    }
    try {
      inkInstance.cleanup();
    } catch {
    }
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
  function updateSprintState(sprintState) {
    if (cleaned) return;
    if (sprintState !== void 0 && sprintState !== null) {
      const defined = Object.fromEntries(Object.entries(sprintState).filter(([, v]) => v !== void 0));
      state.sprintInfo = state.sprintInfo ? { ...state.sprintInfo, ...defined } : sprintState;
    } else {
      state.sprintInfo = null;
    }
    const newKey = state.sprintInfo?.storyKey ?? null;
    if (newKey && lastStoryKey && newKey !== lastStoryKey) {
      if (Object.keys(currentStoryCosts).length > 0) {
        pendingStoryCosts.set(lastStoryKey, { ...currentStoryCosts });
      }
      currentStoryCosts = {};
      lastStoryKey = newKey;
    } else if (newKey && !lastStoryKey) {
      lastStoryKey = newKey;
    }
    recomputeStoryContext();
    rerender();
  }
  function recomputeStoryContext() {
    const currentStory = state.sprintInfo?.storyKey ?? "";
    const ctx = [];
    const epicMatch = currentStory.match(/Epic (\d+)/);
    if (epicMatch) {
      const epicPrefix = `${epicMatch[1]}-`;
      const epicStories = state.stories.filter((s) => s.key.startsWith(epicPrefix));
      const lastDone = [...epicStories].reverse().find((s) => s.status === "done");
      const firstIp = epicStories.find((s) => s.status === "in-progress");
      const firstPending = epicStories.find((s) => s.status === "pending");
      if (lastDone) ctx.push({ key: lastDone.key, role: "prev" });
      if (firstIp) ctx.push({ key: firstIp.key, role: "current" });
      else if (firstPending) ctx.push({ key: firstPending.key, role: "next" });
    } else if (currentStory) {
      let foundCurrent = false;
      let prevKey = null;
      for (const s of state.stories) {
        if (s.key === currentStory) {
          if (prevKey) ctx.push({ key: prevKey, role: "prev" });
          ctx.push({ key: s.key, role: "current" });
          foundCurrent = true;
        } else if (foundCurrent && (s.status === "pending" || s.status === "in-progress")) {
          ctx.push({ key: s.key, role: "next" });
          break;
        } else if (s.status === "done" || s.status === "in-progress") {
          prevKey = s.key;
        }
      }
    }
    state.storyContext = ctx;
  }
  function updateStories(stories) {
    if (cleaned) return;
    const currentKey = state.sprintInfo?.storyKey ?? null;
    const hasCurrentCosts = Object.keys(currentStoryCosts).length > 0;
    const updatedStories = stories.map((s) => {
      if (s.status !== "done" || s.costByDriver) return s;
      const pending = pendingStoryCosts.get(s.key);
      if (pending) {
        pendingStoryCosts.delete(s.key);
        return { ...s, costByDriver: pending };
      }
      if (hasCurrentCosts && s.key === (lastStoryKey ?? currentKey)) {
        const snap = { ...currentStoryCosts };
        currentStoryCosts = {};
        return { ...s, costByDriver: snap };
      }
      return s;
    });
    if (currentKey && currentKey !== lastStoryKey) {
      if (lastStoryKey && Object.keys(currentStoryCosts).length > 0) {
        pendingStoryCosts.set(lastStoryKey, { ...currentStoryCosts });
      }
      currentStoryCosts = {};
      lastStoryKey = currentKey;
    } else if (currentKey && !lastStoryKey) {
      lastStoryKey = currentKey;
    }
    state.stories = updatedStories;
    recomputeStoryContext();
    rerender();
  }
  function addMessage(msg) {
    if (cleaned) return;
    state.messages = [...state.messages, msg];
    rerender();
  }
  function updateWorkflowState(flow, currentTask, taskStates, taskMeta) {
    if (cleaned) return;
    state.workflowFlow = flow;
    state.currentTaskName = currentTask;
    state.taskStates = { ...taskStates };
    state.taskMeta = taskMeta ? { ...taskMeta } : state.taskMeta;
    rerender();
  }
  function updateWorkflowRow(vizLine) {
    if (cleaned) return;
    state.workflowVizLine = vizLine;
    rerender();
  }
  return {
    update,
    updateSprintState,
    updateStories,
    addMessage,
    updateWorkflowState,
    updateWorkflowRow,
    processLaneEvent,
    updateMergeState,
    cleanup: cleanupFull,
    _getState: () => state,
    _getLaneStates: () => laneStates,
    _cycleLane: () => cycleLane()
  };
}

// src/commands/run.ts
function resolvePluginDir() {
  return join7(process.cwd(), ".claude");
}
function extractEpicId(storyKey) {
  const match = storyKey.match(/^(\d+)-/);
  return match ? match[1] : storyKey;
}
function buildEpicDescriptors(state) {
  const epicMap = /* @__PURE__ */ new Map();
  for (const storyKey of Object.keys(state.stories)) {
    const epicId = extractEpicId(storyKey);
    if (!epicMap.has(epicId)) epicMap.set(epicId, []);
    epicMap.get(epicId).push(storyKey);
  }
  return [...epicMap.entries()].filter(([epicId]) => {
    const s = state.epics[`epic-${epicId}`];
    return !s || s.status !== "done";
  }).map(([epicId, stories]) => ({ id: epicId, slug: `epic-${epicId}`, stories }));
}
function toDisplayKey(storyKey) {
  if (storyKey.startsWith("__epic_")) return `Epic ${storyKey.replace("__epic_", "").replace("__", "")}`;
  if (storyKey === "__run__") return "Run";
  return storyKey;
}
function toBaseStoryKey(storyKey) {
  const colonIdx = storyKey.indexOf(":");
  return colonIdx >= 0 ? storyKey.slice(0, colonIdx) : storyKey;
}
function registerRunCommand(program) {
  program.command("run").description("Execute the autonomous coding loop").option("--max-iterations <n>", "Maximum loop iterations", "50").option("--timeout <seconds>", "Total loop timeout in seconds", "43200").option("--iteration-timeout <minutes>", "Per-iteration timeout in minutes", "30").option("--quiet", "Suppress terminal output (background mode)", false).option("--calls <n>", "Max API calls per hour", "100").option("--max-story-retries <n>", "Max retries per story before flagging", "10").option("--reset", "Clear retry counters, flagged stories, and circuit breaker before starting", false).option("--resume", "Resume from last checkpoint (engine resumes by default)", false).option("--workflow <name>", 'Workflow name to load (default: "default")').action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = !!globalOpts.json;
    const outputOpts = { json: isJson };
    const pluginDir = resolvePluginDir();
    if (!existsSync8(pluginDir)) {
      fail("Plugin directory not found \u2014 run codeharness init first", outputOpts);
      process.exitCode = 1;
      return;
    }
    const reconciliation = reconcileState();
    if (reconciliation.success && reconciliation.data.corrections.length > 0) {
      for (const correction of reconciliation.data.corrections) {
        info(`[INFO] Reconciled: ${correction}`, outputOpts);
      }
    } else if (!reconciliation.success) {
      info(`[WARN] State reconciliation failed: ${reconciliation.error}`, outputOpts);
    }
    if (!isDockerAvailable()) {
      fail("[FAIL] Docker not available \u2014 install Docker or start the daemon", outputOpts);
      process.exitCode = 1;
      return;
    }
    const cleanup = cleanupContainers();
    if (cleanup.success && cleanup.data.containersRemoved > 0) {
      info(`[INFO] Cleaned up ${cleanup.data.containersRemoved} orphaned container(s): ${cleanup.data.names.join(", ")}`, outputOpts);
    } else if (!cleanup.success) {
      info(`[WARN] Container cleanup failed: ${cleanup.error}`, outputOpts);
    }
    const statuses = readSprintStatusFromState();
    const counts = countStories(statuses);
    if (counts.total === 0) {
      fail("No stories found in sprint-state.json \u2014 nothing to execute", outputOpts);
      process.exitCode = 1;
      return;
    }
    if (counts.ready === 0 && counts.inProgress === 0 && counts.checked === 0) {
      fail("No stories ready for execution", outputOpts);
      process.exitCode = 1;
      return;
    }
    info(`Starting autonomous execution \u2014 ${counts.ready} ready, ${counts.inProgress} in progress, ${counts.checked} checked, ${counts.done}/${counts.total} done`, outputOpts);
    const maxIterations = parseInt(options.maxIterations, 10);
    const timeout = parseInt(options.timeout, 10);
    const iterationTimeout = parseInt(options.iterationTimeout, 10);
    const calls = parseInt(options.calls, 10);
    const maxStoryRetries = parseInt(options.maxStoryRetries, 10);
    if (isNaN(maxIterations) || isNaN(timeout) || isNaN(iterationTimeout) || isNaN(calls) || isNaN(maxStoryRetries)) {
      fail("Invalid numeric option \u2014 --max-iterations, --timeout, --iteration-timeout, --calls, and --max-story-retries must be numbers", outputOpts);
      process.exitCode = 1;
      return;
    }
    const projectDir = process.cwd();
    const workflowName = options.workflow ?? "default";
    if (!/^[a-zA-Z0-9_-]+$/.test(workflowName)) {
      fail(`Invalid workflow name "${workflowName}" \u2014 only alphanumeric characters, hyphens, and underscores are allowed`, outputOpts);
      process.exitCode = 1;
      return;
    }
    let parsedWorkflow;
    try {
      parsedWorkflow = resolveWorkflow({ cwd: projectDir, name: workflowName });
    } catch (err) {
      if (workflowName !== "default") {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to resolve workflow: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }
      const projectWorkflowPath = join7(projectDir, ".codeharness", "workflows", "default.yaml");
      const templateWorkflowPath = join7(projectDir, "templates", "workflows", "default.yaml");
      const workflowPath = existsSync8(projectWorkflowPath) ? projectWorkflowPath : templateWorkflowPath;
      try {
        parsedWorkflow = parseWorkflow(workflowPath);
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        fail(`Failed to resolve workflow: ${msg}`, outputOpts);
        process.exitCode = 1;
        return;
      }
    }
    const agents = {};
    try {
      for (const [, task] of Object.entries(parsedWorkflow.tasks)) {
        if (task.agent != null && !agents[task.agent]) {
          const resolved = resolveAgent(task.agent, { cwd: projectDir });
          agents[task.agent] = compileSubagentDefinition(resolved);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Failed to resolve agents: ${msg}`, outputOpts);
      process.exitCode = 1;
      return;
    }
    if (options.resume) {
      const currentState = readWorkflowState(projectDir);
      if (currentState.phase === "completed") {
        writeWorkflowState({ ...currentState, phase: "idle" }, projectDir);
        info("Resuming from completed state \u2014 phase reset to idle", outputOpts);
      } else if (currentState.phase === "circuit-breaker") {
        writeWorkflowState({ ...currentState, phase: "idle", circuit_breaker: { ...currentState.circuit_breaker, triggered: false, reason: null } }, projectDir);
        info("Resuming after circuit breaker \u2014 previous findings preserved", outputOpts);
      }
    }
    const abortController = new AbortController();
    let interrupted = false;
    let renderer;
    const onInterrupt = () => {
      if (interrupted) process.exit(1);
      interrupted = true;
      renderer.cleanup();
      abortController.abort();
      info("Interrupted \u2014 waiting for current task to finish...", outputOpts);
    };
    const sessionStartMs = Date.now();
    renderer = startRenderer({
      quiet: !!options.quiet || isJson,
      sprintState: { storyKey: "", phase: "executing", done: counts.done, total: counts.total, totalCost: 0 },
      sessionStartMs,
      onQuit: () => onInterrupt()
    });
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onInterrupt);
    let totalCostUsd = 0;
    const storiesDone = counts.done;
    const cleanupResources = () => {
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onInterrupt);
      renderer.cleanup();
    };
    const storyEntries = [];
    for (const [key, status] of Object.entries(statuses)) {
      if (key.startsWith("epic-")) continue;
      if (status === "done") storyEntries.push({ key, status: "done" });
      else if (status === "checked") storyEntries.push({ key, status: "checked" });
      else if (status === "in-progress") storyEntries.push({ key, status: "in-progress" });
      else if (status === "backlog" || status === "ready-for-dev") storyEntries.push({ key, status: "pending" });
      else if (status === "failed") storyEntries.push({ key, status: "failed" });
    }
    renderer.updateStories(storyEntries);
    const onEvent = (event) => {
      if (event.type === "stream-event" && event.streamEvent) {
        renderer.update(event.streamEvent, event.driverName);
      }
      if (event.type === "workflow-viz" && event.vizString !== void 0) {
        renderer.updateWorkflowRow(event.vizString);
      }
      if (event.type === "dispatch-start") {
        renderer.updateSprintState({ storyKey: toDisplayKey(event.storyKey), phase: event.taskName, done: storiesDone, total: counts.total, totalCost: totalCostUsd });
        const baseKey = toBaseStoryKey(event.storyKey);
        const idx = storyEntries.findIndex((s) => s.key === baseKey);
        if (idx >= 0 && storyEntries[idx].status === "pending") {
          storyEntries[idx] = { ...storyEntries[idx], status: "in-progress" };
          updateStoryStatus(baseKey, "in-progress");
          renderer.updateStories([...storyEntries]);
        }
      }
      if (event.type === "dispatch-end") {
        totalCostUsd += event.costUsd ?? 0;
        renderer.updateSprintState({ totalCost: totalCostUsd });
        if (event.taskName === "verify" && event.storyKey.startsWith("__epic_")) {
          renderer.addMessage({ type: "ok", key: event.storyKey.replace("__epic_", "Epic ").replace("__", ""), message: `verification complete (cost: $${(event.costUsd ?? 0).toFixed(2)})` });
        }
      }
      if (event.type === "dispatch-error") {
        const baseErrorKey = toBaseStoryKey(event.storyKey);
        const isGateError = event.storyKey.includes(":");
        renderer.addMessage({ type: isGateError ? "warn" : "fail", key: baseErrorKey, message: `[${event.taskName}] ${event.error?.message ?? "unknown error"}` });
        if (!isGateError) {
          updateStoryStatus(baseErrorKey, "failed");
          const idx = storyEntries.findIndex((s) => s.key === baseErrorKey);
          if (idx >= 0) {
            storyEntries[idx] = { ...storyEntries[idx], status: "failed" };
            renderer.updateStories([...storyEntries]);
          }
        }
      }
      if (event.type === "story-done") {
        updateStoryStatus(event.storyKey, "checked");
        const idx = storyEntries.findIndex((s) => s.key === event.storyKey);
        if (idx >= 0) {
          storyEntries[idx] = { ...storyEntries[idx], status: "checked" };
          renderer.updateStories([...storyEntries]);
        }
      }
    };
    const config = {
      workflow: parsedWorkflow,
      agents,
      sprintStatusPath: join7(projectDir, "_bmad-output", "implementation-artifacts", "sprint-status.yaml"),
      issuesPath: join7(projectDir, ".codeharness", "issues.yaml"),
      runId: `run-${Date.now()}`,
      projectDir,
      abortSignal: abortController.signal,
      maxIterations,
      onEvent
    };
    const execution = parsedWorkflow.execution;
    const isParallel = execution?.epic_strategy === "parallel";
    if (isParallel) {
      try {
        const maxParallel = execution.max_parallel ?? 1;
        const stateResult = getSprintState();
        if (!stateResult.success) {
          cleanupResources();
          fail(`Failed to read sprint state for epic discovery: ${stateResult.error}`, outputOpts);
          process.exitCode = 1;
          return;
        }
        const epics = buildEpicDescriptors(stateResult.data);
        if (epics.length === 0) {
          cleanupResources();
          info("No pending epics found \u2014 nothing to execute in parallel mode", outputOpts);
          return;
        }
        const worktreeManager = new WorktreeManager();
        const pool = new LanePool(worktreeManager, maxParallel);
        pool.onEvent((event) => {
          if (event.type === "lane-started") info(`[LANE] Started epic ${event.epicId} in lane ${event.laneIndex}`, outputOpts);
          else if (event.type === "lane-completed") ok(`[LANE] Epic ${event.epicId} completed in lane ${event.laneIndex}`, outputOpts);
          else if (event.type === "lane-failed") fail(`[LANE] Epic ${event.epicId} failed in lane ${event.laneIndex}: ${event.error}`, outputOpts);
          else if (event.type === "epic-queued") info(`[LANE] Epic ${event.epicId} queued for execution`, outputOpts);
        });
        const executeFn = async (_epicId, worktreePath) => runWorkflowActor({ ...config, projectDir: worktreePath });
        const poolResult = await pool.startPool(epics, executeFn);
        const remainingWorktrees = worktreeManager.listWorktrees();
        if (remainingWorktrees.length > 0) {
          info(`[WARN] ${remainingWorktrees.length} worktree(s) still exist after pool completion`, outputOpts);
          for (const wt of remainingWorktrees) {
            info(`  - ${wt.path} (epic ${wt.epicId})`, outputOpts);
          }
        }
        let totalStories = 0;
        for (const [, epicResult] of poolResult.epicResults) {
          if (epicResult.engineResult) totalStories += epicResult.engineResult.storiesProcessed;
        }
        const succeeded = [...poolResult.epicResults.values()].filter((r) => r.status === "completed").length;
        const failed = [...poolResult.epicResults.values()].filter((r) => r.status === "failed").length;
        cleanupResources();
        if (poolResult.success) {
          ok(`Parallel execution completed \u2014 ${poolResult.epicsProcessed} epics (${succeeded} succeeded), ${totalStories} stories processed in ${formatElapsed(poolResult.durationMs)}`, outputOpts);
        } else {
          fail(`Parallel execution failed \u2014 ${poolResult.epicsProcessed} epics (${succeeded} succeeded, ${failed} failed), ${totalStories} stories processed in ${formatElapsed(poolResult.durationMs)}`, outputOpts);
          for (const [epicId, epicResult] of poolResult.epicResults) {
            if (epicResult.status === "failed") info(`  Epic ${epicId}: ${epicResult.error}`, outputOpts);
          }
          process.exitCode = 1;
        }
      } catch (err) {
        cleanupResources();
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Parallel execution error: ${msg}`, outputOpts);
        process.exitCode = 1;
      }
    } else {
      try {
        const result = await runWorkflowActor(config);
        cleanupResources();
        if (interrupted) {
          info(`Interrupted \u2014 ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent. State saved \u2014 run again to resume.`, outputOpts);
          process.exitCode = 130;
        } else if (result.success) {
          ok(`Workflow completed \u2014 ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent in ${formatElapsed(result.durationMs)}`, outputOpts);
        } else {
          fail(`Workflow failed \u2014 ${result.storiesProcessed} stories processed, ${result.tasksCompleted} tasks completed, $${totalCostUsd.toFixed(2)} spent, ${result.errors.length} error(s) in ${formatElapsed(result.durationMs)}`, outputOpts);
          for (const err of result.errors) {
            info(`  ${err.taskName}/${err.storyKey}: [${err.code}] ${err.message}`, outputOpts);
          }
          process.exitCode = 1;
        }
      } catch (err) {
        cleanupResources();
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Workflow engine error: ${msg}`, outputOpts);
        process.exitCode = 1;
      }
    }
  });
}

// src/commands/verify.ts
import { existsSync as existsSync9, readFileSync as readFileSync8 } from "fs";
import { join as join8 } from "path";
var STORY_DIR = "_bmad-output/implementation-artifacts";
function isValidStoryId(storyId) {
  if (!storyId || storyId.includes("..") || storyId.includes("/") || storyId.includes("\\")) return false;
  return /^[a-zA-Z0-9_-]+$/.test(storyId);
}
function registerVerifyCommand(program) {
  program.command("verify").description("Run verification pipeline on completed work").option("--story <id>", "Story ID to verify").option("--retro", "Verify retrospective completion for an epic").option("--epic <n>", "Epic number (required with --retro)").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    const root = process.cwd();
    if (opts.retro) {
      verifyRetro(opts, isJson, root);
      return;
    }
    if (!opts.story) {
      fail("--story is required when --retro is not set", { json: isJson });
      process.exitCode = 1;
      return;
    }
    verifyStory(opts.story, isJson, root);
  });
}
function verifyRetro(opts, isJson, root) {
  if (!opts.epic) {
    fail("--epic is required with --retro", { json: isJson });
    process.exitCode = 1;
    return;
  }
  const epicNum = parseInt(opts.epic, 10);
  if (isNaN(epicNum) || epicNum < 1) {
    fail(`Invalid epic number: ${opts.epic}`, { json: isJson });
    process.exitCode = 1;
    return;
  }
  const retroFile = `epic-${epicNum}-retrospective.md`;
  const retroPath = join8(root, STORY_DIR, retroFile);
  if (!existsSync9(retroPath)) {
    if (isJson) {
      jsonOutput({ status: "fail", epic: epicNum, retroFile, message: `${retroFile} not found` });
    } else {
      fail(`${retroFile} not found`);
    }
    process.exitCode = 1;
    return;
  }
  const retroKey = `epic-${epicNum}-retrospective`;
  try {
    updateSprintStatus(retroKey, "done", root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to update sprint status: ${message}`);
  }
  if (isJson) {
    jsonOutput({ status: "ok", epic: epicNum, retroFile: join8(STORY_DIR, retroFile) });
  } else {
    ok(`Epic ${epicNum} retrospective: marked done`);
  }
}
function verifyStory(storyId, isJson, root) {
  if (!isValidStoryId(storyId)) {
    fail(`Invalid story ID: ${storyId}. Story IDs must contain only alphanumeric characters, hyphens, and underscores.`, { json: isJson });
    process.exitCode = 1;
    return;
  }
  const readmePath = join8(root, "README.md");
  if (!existsSync9(readmePath)) {
    if (isJson) {
      jsonOutput({ status: "fail", message: "No README.md found \u2014 verification requires user documentation" });
    } else {
      fail("No README.md found \u2014 verification requires user documentation");
    }
    process.exitCode = 1;
    return;
  }
  const storyFilePath = join8(root, STORY_DIR, `${storyId}.md`);
  if (!existsSync9(storyFilePath)) {
    fail(`Story file not found: ${storyFilePath}`, { json: isJson });
    process.exitCode = 1;
    return;
  }
  let preconditions;
  try {
    preconditions = checkPreconditions(root, storyId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Precondition check failed: ${message}`, { json: isJson });
    process.exitCode = 1;
    return;
  }
  if (!preconditions.passed) {
    if (isJson) {
      jsonOutput({
        status: "fail",
        message: "Preconditions not met",
        failures: preconditions.failures
      });
    } else {
      fail("Preconditions not met:");
      for (const f of preconditions.failures) {
        info(`  - ${f}`);
      }
    }
    process.exitCode = 1;
    return;
  }
  let acs;
  try {
    acs = parseStoryACs(storyFilePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Failed to parse story file: ${message}`, { json: isJson });
    process.exitCode = 1;
    return;
  }
  const storyTitle = extractStoryTitle(storyFilePath);
  const expectedProofPath = join8(root, "verification", `${storyId}-proof.md`);
  const proofPath = existsSync9(expectedProofPath) ? expectedProofPath : createProofDocument(storyId, storyTitle, acs, root);
  const proofQuality = validateProofQuality(proofPath);
  if (!proofQuality.passed) {
    if (isJson) {
      jsonOutput({
        status: "fail",
        message: `Proof quality check failed: ${proofQuality.verified}/${proofQuality.total} ACs verified`,
        proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, escalated: proofQuality.escalated, total: proofQuality.total }
      });
    } else {
      fail(`Proof quality check failed: ${proofQuality.verified}/${proofQuality.total} ACs verified`);
    }
    process.exitCode = 1;
    return;
  }
  if (proofQuality.escalated > 0) {
    warn(`Story ${storyId} has ${proofQuality.escalated} ACs requiring integration verification`);
    info("Run these ACs manually or in a dedicated verification session");
  }
  let showboatStatus = "skipped";
  const showboatResult = runShowboatVerify(proofPath);
  if (showboatResult.output === "showboat not available") {
    showboatStatus = "skipped";
    warn("Showboat not installed \u2014 skipping re-verification");
  } else {
    showboatStatus = showboatResult.passed ? "pass" : "fail";
    if (!showboatResult.passed) {
      if (isJson) {
        jsonOutput({
          status: "fail",
          message: `Showboat verify failed: ${showboatResult.output}`,
          proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, escalated: proofQuality.escalated, total: proofQuality.total }
        });
      } else {
        fail(`Showboat verify failed: ${showboatResult.output}`);
      }
      process.exitCode = 1;
      return;
    }
  }
  let observabilityGapCount = 0;
  let runtimeCoveragePercent = 0;
  try {
    const proofContent = readFileSync8(proofPath, "utf-8");
    const gapResult = parseObservabilityGaps(proofContent);
    observabilityGapCount = gapResult.gapCount;
    runtimeCoveragePercent = gapResult.totalACs === 0 ? 0 : gapResult.coveredCount / gapResult.totalACs * 100;
  } catch {
  }
  const result = {
    storyId,
    success: true,
    totalACs: proofQuality.total,
    verifiedCount: proofQuality.verified,
    failedCount: proofQuality.pending,
    escalatedCount: proofQuality.escalated,
    proofPath: `verification/${storyId}-proof.md`,
    showboatVerifyStatus: showboatStatus,
    observabilityGapCount,
    runtimeCoveragePercent,
    perAC: acs.map((ac) => ({
      id: ac.id,
      description: ac.description,
      verified: true,
      evidencePaths: []
    }))
  };
  try {
    updateVerificationState(storyId, result, root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to update state: ${message}`);
  }
  try {
    closeBeadsIssue(storyId, root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to close beads issue: ${message}`);
  }
  try {
    const completedPath = completeExecPlan(storyId, root);
    if (completedPath) {
      if (!isJson) {
        ok(`Exec-plan moved to completed: ${completedPath}`);
      }
    } else {
      if (!isJson) {
        warn(`No exec-plan found for story: ${storyId}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to complete exec-plan: ${message}`);
  }
  if (isJson) {
    jsonOutput({
      ...result,
      proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, escalated: proofQuality.escalated, total: proofQuality.total }
    });
  } else {
    ok(`Story ${storyId}: verified \u2014 proof at verification/${storyId}-proof.md`);
  }
}
function extractStoryTitle(filePath) {
  try {
    const content = readFileSync8(filePath, "utf-8");
    const match = /^#\s+(.+)$/m.exec(content);
    return match ? match[1] : "Unknown Story";
  } catch {
    return "Unknown Story";
  }
}

// src/modules/status/endpoints.ts
var DEFAULT_ENDPOINTS = {
  logs: "http://localhost:9428",
  metrics: "http://localhost:8428",
  traces: "http://localhost:16686",
  otel_http: "http://localhost:4318"
};
var ELK_ENDPOINTS = {
  logs: "http://localhost:9200",
  metrics: "http://localhost:9200",
  traces: "http://localhost:9200",
  otel_http: "http://localhost:4318"
};
function getDefaultEndpointsForBackend(backend) {
  return backend === "elk" ? ELK_ENDPOINTS : DEFAULT_ENDPOINTS;
}
function buildScopedEndpoints(endpoints, serviceName, backend) {
  const encoded = encodeURIComponent(serviceName);
  if (backend === "elk") {
    return {
      logs: `${endpoints.logs}/_search?q=${encodeURIComponent(`service_name:${serviceName}`)}&size=100`,
      metrics: `${endpoints.metrics}/_search?q=${encodeURIComponent(`service_name:${serviceName}`)}&size=100`,
      traces: `${endpoints.traces}/_search?q=${encodeURIComponent(`trace_id:* AND service_name:${serviceName}`)}&size=20`
    };
  }
  return {
    logs: `${endpoints.logs}/select/logsql/query?query=${encodeURIComponent(`service_name:${serviceName}`)}`,
    metrics: `${endpoints.metrics}/api/v1/query?query=${encodeURIComponent(`{service_name="${serviceName}"}`)}`,
    traces: `${endpoints.traces}/api/traces?service=${encoded}&limit=20`
  };
}
function resolveEndpoints(state) {
  const mode = state.otlp?.mode ?? "local-shared";
  const backend = state.otlp?.backend ?? "victoria";
  if (mode === "remote-direct") {
    const endpoint = state.otlp?.endpoint ?? "http://localhost:4318";
    return {
      logs: endpoint,
      metrics: endpoint,
      traces: endpoint,
      otel_http: endpoint
    };
  }
  const defaults = getDefaultEndpointsForBackend(backend);
  if (mode === "remote-routed") {
    const re = state.docker?.remote_endpoints;
    return {
      logs: re?.logs_url ?? defaults.logs,
      metrics: re?.metrics_url ?? defaults.metrics,
      traces: re?.traces_url ?? defaults.traces,
      otel_http: defaults.otel_http
    };
  }
  return defaults;
}

// src/lib/onboard-checks.ts
import { existsSync as existsSync12 } from "fs";
import { join as join11 } from "path";

// src/lib/coverage/parser.ts
import { existsSync as existsSync10, readFileSync as readFileSync9 } from "fs";
import { join as join9 } from "path";
function parseTestCounts(output) {
  const vitestMatch = /Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i.exec(output);
  if (vitestMatch) {
    return {
      passCount: parseInt(vitestMatch[1], 10),
      failCount: vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0
    };
  }
  const jestMatch = /Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed/i.exec(output);
  if (jestMatch) {
    return {
      passCount: parseInt(jestMatch[2], 10),
      failCount: jestMatch[1] ? parseInt(jestMatch[1], 10) : 0
    };
  }
  const cargoRegex = /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed/gi;
  let cargoMatch = cargoRegex.exec(output);
  if (cargoMatch) {
    let totalPass = 0;
    let totalFail = 0;
    while (cargoMatch) {
      totalPass += parseInt(cargoMatch[1], 10);
      totalFail += parseInt(cargoMatch[2], 10);
      cargoMatch = cargoRegex.exec(output);
    }
    return { passCount: totalPass, failCount: totalFail };
  }
  const pytestMatch = /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i.exec(output);
  if (pytestMatch) {
    return {
      passCount: parseInt(pytestMatch[1], 10),
      failCount: pytestMatch[2] ? parseInt(pytestMatch[2], 10) : 0
    };
  }
  return { passCount: 0, failCount: 0 };
}
function parseCoverageReport(dir, format) {
  if (format === "vitest-json" || format === "jest-json") {
    return parseVitestCoverage(dir);
  }
  if (format === "coverage-py-json") {
    return parsePythonCoverage(dir);
  }
  if (format === "tarpaulin-json") {
    return parseTarpaulinCoverage(dir);
  }
  return 0;
}
function parseVitestCoverage(dir) {
  const reportPath = findCoverageSummary(dir);
  if (!reportPath) {
    warn("Coverage report not found at coverage/coverage-summary.json");
    return 0;
  }
  try {
    const report = JSON.parse(readFileSync9(reportPath, "utf-8"));
    return report.total?.statements?.pct ?? 0;
  } catch {
    warn("Failed to parse coverage report");
    return 0;
  }
}
function parsePythonCoverage(dir) {
  const reportPath = join9(dir, "coverage.json");
  if (!existsSync10(reportPath)) {
    warn("Coverage report not found at coverage.json");
    return 0;
  }
  try {
    const report = JSON.parse(readFileSync9(reportPath, "utf-8"));
    return report.totals?.percent_covered ?? 0;
  } catch {
    warn("Failed to parse coverage report");
    return 0;
  }
}
function parseTarpaulinCoverage(dir) {
  const reportPath = join9(dir, "coverage", "tarpaulin-report.json");
  if (!existsSync10(reportPath)) {
    warn("Tarpaulin report not found at coverage/tarpaulin-report.json");
    return 0;
  }
  try {
    const report = JSON.parse(readFileSync9(reportPath, "utf-8"));
    return report.coverage ?? 0;
  } catch {
    warn("Failed to parse tarpaulin coverage report");
    return 0;
  }
}
function findCoverageSummary(dir) {
  const candidates = [
    join9(dir, "coverage", "coverage-summary.json"),
    join9(dir, "src", "coverage", "coverage-summary.json")
  ];
  for (const p2 of candidates) {
    if (existsSync10(p2)) return p2;
  }
  return null;
}

// src/lib/coverage/runner.ts
import { execSync as execSync2 } from "child_process";
import { existsSync as existsSync11, readFileSync as readFileSync10 } from "fs";
import { join as join10 } from "path";
function detectCoverageTool(dir) {
  const baseDir = dir ?? process.cwd();
  const stateHint = getStateToolHint(baseDir);
  const stack = detectStack(baseDir);
  if (!stack) {
    warn("No recognized stack detected \u2014 cannot determine coverage tool");
    return { tool: "unknown", runCommand: "", reportFormat: "" };
  }
  const provider = getStackProvider(stack);
  if (!provider) {
    warn("No recognized stack detected \u2014 cannot determine coverage tool");
    return { tool: "unknown", runCommand: "", reportFormat: "" };
  }
  const detector = coverageDetectors[provider.name];
  if (detector) {
    return detector(baseDir, stateHint);
  }
  warn("No recognized stack detected \u2014 cannot determine coverage tool");
  return { tool: "unknown", runCommand: "", reportFormat: "" };
}
var coverageDetectors = {
  nodejs: (dir, stateHint) => detectNodeCoverageTool(dir, stateHint),
  python: (dir) => detectPythonCoverageTool(dir),
  rust: (dir) => detectRustCoverageTool(dir)
};
function detectRustCoverageTool(dir) {
  try {
    execSync2("cargo tarpaulin --version", { stdio: "pipe", timeout: 1e4 });
  } catch {
    warn("cargo-tarpaulin not installed \u2014 coverage detection unavailable");
    return { tool: "unknown", runCommand: "", reportFormat: "" };
  }
  const cargoPath = join10(dir, "Cargo.toml");
  let isWorkspace = false;
  try {
    const cargoContent = readFileSync10(cargoPath, "utf-8");
    isWorkspace = /^\[workspace\]/m.test(cargoContent);
  } catch {
  }
  const wsFlag = isWorkspace ? " --workspace" : "";
  return {
    tool: "cargo-tarpaulin",
    runCommand: `cargo tarpaulin --out json --output-dir coverage/${wsFlag}`,
    reportFormat: "tarpaulin-json"
  };
}
function getStateToolHint(dir) {
  try {
    const { state } = readStateWithBody(dir);
    return state.coverage.tool || null;
  } catch {
    return null;
  }
}
function detectNodeCoverageTool(dir, stateHint) {
  const hasVitestConfig = existsSync11(join10(dir, "vitest.config.ts")) || existsSync11(join10(dir, "vitest.config.js"));
  const pkgPath = join10(dir, "package.json");
  let hasVitestCoverageV8 = false;
  let hasVitestCoverageIstanbul = false;
  let hasC8 = false;
  let hasJest = false;
  let pkgScripts = {};
  if (existsSync11(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync10(pkgPath, "utf-8"));
      const allDeps = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
      hasVitestCoverageV8 = "@vitest/coverage-v8" in allDeps;
      hasVitestCoverageIstanbul = "@vitest/coverage-istanbul" in allDeps;
      hasC8 = "c8" in allDeps;
      hasJest = "jest" in allDeps;
      pkgScripts = pkg.scripts ?? {};
    } catch {
    }
  }
  if (hasVitestConfig || hasVitestCoverageV8 || hasVitestCoverageIstanbul) {
    const runCommand = getNodeTestCommand(pkgScripts, "vitest");
    return { tool: "c8", runCommand, reportFormat: "vitest-json" };
  }
  if (hasC8) {
    const runCommand = getNodeTestCommand(pkgScripts, "c8");
    return { tool: "c8", runCommand, reportFormat: "vitest-json" };
  }
  if (hasJest) {
    return {
      tool: "c8",
      runCommand: "npx jest --coverage --coverageReporters=json-summary",
      reportFormat: "jest-json"
    };
  }
  if (stateHint === "c8") {
    warn("State indicates c8 but no Vitest/c8 found in project \u2014 re-detecting");
  }
  warn("No Node.js coverage tool detected");
  return { tool: "unknown", runCommand: "", reportFormat: "" };
}
function getNodeTestCommand(scripts, runner) {
  if (scripts["test:coverage"]) {
    return "npm run test:coverage";
  }
  if (scripts["test:unit"]) {
    if (runner === "vitest") {
      return "npx vitest run --coverage";
    }
    return `npm run test:unit`;
  }
  if (scripts["test"]) {
    if (runner === "vitest") {
      return "npx vitest run --coverage";
    }
    return "npm test";
  }
  if (runner === "vitest") {
    return "npx vitest run --coverage";
  }
  return "npm test";
}
function detectPythonCoverageTool(dir) {
  const reqPath = join10(dir, "requirements.txt");
  if (existsSync11(reqPath)) {
    try {
      const content = readFileSync10(reqPath, "utf-8");
      if (content.includes("pytest-cov") || content.includes("coverage")) {
        return {
          tool: "coverage.py",
          runCommand: "coverage run -m pytest && coverage json",
          reportFormat: "coverage-py-json"
        };
      }
    } catch {
    }
  }
  const pyprojectPath = join10(dir, "pyproject.toml");
  if (existsSync11(pyprojectPath)) {
    try {
      const content = readFileSync10(pyprojectPath, "utf-8");
      if (content.includes("pytest-cov") || content.includes("coverage")) {
        return {
          tool: "coverage.py",
          runCommand: "coverage run -m pytest && coverage json",
          reportFormat: "coverage-py-json"
        };
      }
    } catch {
    }
  }
  warn("No Python coverage tool detected");
  return { tool: "unknown", runCommand: "", reportFormat: "" };
}
function checkSkipIfMet(baseDir, skipIfMet) {
  if (!skipIfMet) return null;
  try {
    const { state } = readStateWithBody(baseDir);
    if (!state.session_flags.coverage_met) return null;
    const current = state.coverage.current ?? 0;
    return {
      success: true,
      testsPassed: state.session_flags.tests_passed,
      passCount: 0,
      failCount: 0,
      coveragePercent: current,
      rawOutput: `Coverage skip: already met (${current}%, target: ${state.coverage.target}%)`
    };
  } catch {
    return null;
  }
}
function runCoverage(dir, skipIfMet) {
  const baseDir = dir ?? process.cwd();
  const skipResult = checkSkipIfMet(baseDir, skipIfMet);
  if (skipResult) return skipResult;
  const toolInfo = detectCoverageTool(baseDir);
  if (toolInfo.tool === "unknown" || !toolInfo.runCommand) {
    return {
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: "No coverage tool detected. Ensure your project has a test runner configured."
    };
  }
  let rawOutput = "";
  let testsPassed = true;
  try {
    rawOutput = execSync2(toolInfo.runCommand, {
      cwd: baseDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3e5
      // 5 minute timeout
    });
  } catch (err) {
    const execError = err;
    testsPassed = false;
    rawOutput = (execError.stdout ?? "") + (execError.stderr ?? "");
    if (!rawOutput) {
      return {
        success: false,
        testsPassed: false,
        passCount: 0,
        failCount: 0,
        coveragePercent: 0,
        rawOutput: "Test command failed with no output"
      };
    }
  }
  const { passCount, failCount } = parseTestCounts(rawOutput);
  if (failCount > 0) {
    testsPassed = false;
  }
  const coveragePercent = parseCoverageReport(baseDir, toolInfo.reportFormat);
  return {
    success: true,
    testsPassed,
    passCount,
    failCount,
    coveragePercent,
    rawOutput
  };
}
function checkOnlyCoverage(dir, skipIfMet) {
  const baseDir = dir ?? process.cwd();
  const skipResult = checkSkipIfMet(baseDir, skipIfMet);
  if (skipResult) return skipResult;
  const toolInfo = detectCoverageTool(baseDir);
  if (toolInfo.tool === "unknown") {
    return {
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: "No coverage tool detected"
    };
  }
  const coveragePercent = parseCoverageReport(baseDir, toolInfo.reportFormat);
  let testsPassed = true;
  try {
    const { state } = readStateWithBody(baseDir);
    testsPassed = state.session_flags.tests_passed;
  } catch {
  }
  return {
    success: true,
    testsPassed,
    passCount: 0,
    failCount: 0,
    coveragePercent,
    rawOutput: "Check-only mode \u2014 read existing coverage report"
  };
}

// src/lib/coverage/evaluator.ts
import { readFileSync as readFileSync11 } from "fs";
function evaluateCoverage(result, dir) {
  const baseDir = dir ?? process.cwd();
  let target = 90;
  let baseline = null;
  try {
    const { state } = readStateWithBody(baseDir);
    target = state.coverage.target ?? 90;
    baseline = state.coverage.baseline;
  } catch {
  }
  const actual = result.coveragePercent;
  const met = actual >= target;
  const effectiveBaseline = baseline ?? actual;
  const delta = baseline !== null ? actual - baseline : null;
  return {
    met,
    target,
    actual,
    delta,
    baseline: effectiveBaseline
  };
}
function updateCoverageState(result, evaluation, dir) {
  const baseDir = dir ?? process.cwd();
  const { state, body } = readStateWithBody(baseDir);
  state.session_flags.tests_passed = result.testsPassed;
  state.session_flags.coverage_met = evaluation.met;
  state.coverage.current = evaluation.actual;
  if (state.coverage.baseline === null) {
    state.coverage.baseline = evaluation.actual;
  }
  writeState(state, baseDir, body);
}
function checkPerFileCoverage(floor, dir) {
  const baseDir = dir ?? process.cwd();
  const reportPath = findCoverageSummary(baseDir);
  if (!reportPath) {
    return { floor, violations: [], totalFiles: 0 };
  }
  let report;
  try {
    report = JSON.parse(readFileSync11(reportPath, "utf-8"));
  } catch {
    warn("Failed to parse coverage-summary.json");
    return { floor, violations: [], totalFiles: 0 };
  }
  const violations = [];
  let totalFiles = 0;
  for (const [key, data] of Object.entries(report)) {
    if (key === "total") continue;
    totalFiles++;
    const stmts = data.statements?.pct ?? 0;
    const branches = data.branches?.pct ?? 0;
    const funcs = data.functions?.pct ?? 0;
    const lines = data.lines?.pct ?? 0;
    if (stmts < floor) {
      const relative = key.startsWith(baseDir) ? key.slice(baseDir.length + 1) : key;
      violations.push({
        file: relative,
        statements: stmts,
        branches,
        functions: funcs,
        lines
      });
    }
  }
  violations.sort((a, b) => a.statements - b.statements);
  return { floor, violations, totalFiles };
}
function printCoverageOutput(result, evaluation) {
  if (result.testsPassed) {
    ok(`Tests passed: ${result.passCount} passed`);
  } else {
    fail(`Tests failed: ${result.passCount} passed, ${result.failCount} failed`);
  }
  if (evaluation.met) {
    ok(`Coverage: ${evaluation.actual}%`);
  } else {
    fail(`Coverage: ${evaluation.actual}% (target: ${evaluation.target}%)`);
  }
  if (evaluation.delta !== null && evaluation.baseline !== null) {
    const sign = evaluation.delta >= 0 ? "+" : "";
    const before = evaluation.actual - evaluation.delta;
    info(`Coverage delta: ${sign}${evaluation.delta}% (${before}% -> ${evaluation.actual}%)`);
  }
}

// src/lib/onboard-checks.ts
function checkHarnessInitialized(dir) {
  const statePath = getStatePath(dir ?? process.cwd());
  return { ok: existsSync12(statePath) };
}
function checkBmadInstalled(dir) {
  return { ok: isBmadInstalled(dir) };
}
function checkHooksRegistered(_dir) {
  return { ok: true };
}
function runPreconditions(dir) {
  const harnessCheck = checkHarnessInitialized(dir);
  if (!harnessCheck.ok) {
    return {
      canProceed: false,
      warnings: [],
      initialized: false,
      bmad: false,
      hooks: false
    };
  }
  const warnings = [];
  const bmadCheck = checkBmadInstalled(dir);
  const hooksCheck = checkHooksRegistered(dir);
  if (!bmadCheck.ok) {
    warnings.push(
      "BMAD not installed \u2014 generated stories won't be executable until init completes"
    );
  }
  if (!hooksCheck.ok) {
    warnings.push("Hooks not registered \u2014 enforcement won't be active");
  }
  return {
    canProceed: true,
    warnings,
    initialized: true,
    bmad: bmadCheck.ok,
    hooks: hooksCheck.ok
  };
}
function getOnboardingProgress(_beadsFns) {
  return null;
}

// src/modules/status/formatters.ts
function resolveSharedCompose(backend) {
  return backend === "elk" ? getElkComposeFilePath() : getComposeFilePath();
}
function handleFullStatus(isJson) {
  let state;
  try {
    state = readState();
  } catch (err) {
    if (err instanceof StateFileNotFoundError) {
      if (isJson) {
        jsonOutput({ status: "fail", message: "Harness not initialized. Run 'codeharness init' first." });
      } else {
        fail("Harness not initialized. Run 'codeharness init' first.");
      }
      process.exitCode = 1;
      return;
    }
    throw err;
  }
  if (isJson) {
    handleFullStatusJson(state);
    return;
  }
  printWorkflowState();
  printSprintState();
  printValidationProgress();
  console.log(`Harness: codeharness v${state.harness_version}`);
  console.log(`Stack: ${state.stack ?? "unknown"}`);
  if (state.app_type) {
    console.log(`App type: ${state.app_type}`);
    if (state.app_type === "agent" && state.otlp?.agent_sdk) {
      console.log(`Agent SDK: ${state.otlp.agent_sdk}`);
    }
  }
  const e = state.enforcement;
  console.log(
    `Enforcement: front:${e.frontend ? "ON" : "OFF"} db:${e.database ? "ON" : "OFF"} api:${e.api ? "ON" : "OFF"} obs:ON`
  );
  {
    const backend = state.otlp?.backend ?? "victoria";
    const mode = state.otlp?.mode ?? "local-shared";
    if (backend === "none") {
      console.log("Docker: disabled (observability off)");
    } else if (mode === "remote-direct") {
      const endpoint = state.otlp?.endpoint ?? "unknown";
      console.log(`Docker: none (remote OTLP at ${endpoint})`);
    } else if (mode === "remote-routed") {
      const re = state.docker?.remote_endpoints;
      console.log(`Docker: OTel Collector only (backends at ${re?.logs_url ?? "unknown"}, ${re?.metrics_url ?? "unknown"}, ${re?.traces_url ?? "unknown"})`);
      const sharedComposeFile = getComposeFilePath();
      const health = getCollectorHealth(sharedComposeFile);
      for (const svc of health.services) {
        console.log(`  ${svc.name}: ${svc.running ? "running" : "stopped"}`);
      }
    } else {
      const composeFile = state.docker?.compose_file ?? "docker-compose.harness.yml";
      const stackDir = getStackDir();
      const isShared = composeFile.startsWith(stackDir);
      const resolvedComposeFile = isShared ? resolveSharedCompose(backend) : composeFile;
      const projectName = isShared ? "codeharness-shared" : void 0;
      const header = isShared ? "Docker: shared stack at ~/.codeharness/stack/" : "Docker:";
      console.log(header);
      const health = getStackHealth(resolvedComposeFile, projectName);
      for (const svc of health.services) {
        console.log(`  ${svc.name}: ${svc.running ? "running" : "stopped"}`);
      }
      if (health.healthy) {
        const ep = getDefaultEndpointsForBackend(backend);
        console.log(
          `  Endpoints: logs=${ep.logs} metrics=${ep.metrics} traces=${ep.traces}`
        );
      }
    }
  }
  const serviceName = state.otlp?.service_name;
  if (serviceName) {
    const endpoints = resolveEndpoints(state);
    const scoped = buildScopedEndpoints(endpoints, serviceName, state.otlp?.backend);
    console.log(`  Scoped: logs=${scoped.logs} metrics=${scoped.metrics} traces=${scoped.traces}`);
  }
  printOnboardingProgress();
  const sf = state.session_flags;
  console.log(
    `Session: tests_passed=${sf.tests_passed} coverage_met=${sf.coverage_met} verification_run=${sf.verification_run} logs_queried=${sf.logs_queried}`
  );
  const currentCov = state.coverage.current !== null ? `${state.coverage.current}%` : "\u2014";
  console.log(`Coverage: ${currentCov} / ${state.coverage.target}% target`);
  if (state.verification_log.length === 0) {
    console.log("Verification: no entries");
  } else {
    console.log("Verification log:");
    for (const entry of state.verification_log) {
      console.log(`  ${entry}`);
    }
  }
}
function handleFullStatusJson(state) {
  let docker;
  {
    const backend = state.otlp?.backend ?? "victoria";
    const mode = state.otlp?.mode ?? "local-shared";
    if (backend === "none") {
      docker = { mode: "none", message: "Observability disabled" };
    } else if (mode === "remote-direct") {
      docker = {
        mode: "remote-direct",
        endpoint: state.otlp?.endpoint
      };
    } else if (mode === "remote-routed") {
      const sharedComposeFile = getComposeFilePath();
      const health = getCollectorHealth(sharedComposeFile);
      docker = {
        mode: "remote-routed",
        healthy: health.healthy,
        services: health.services,
        remote_endpoints: state.docker?.remote_endpoints
      };
    } else {
      const composeFile = state.docker?.compose_file ?? "docker-compose.harness.yml";
      const stackDir = getStackDir();
      const isShared = composeFile.startsWith(stackDir);
      const ep = getDefaultEndpointsForBackend(backend);
      if (isShared) {
        const sharedComposeFile = resolveSharedCompose(backend);
        const health = getStackHealth(sharedComposeFile, "codeharness-shared");
        docker = {
          shared: true,
          stack_dir: "~/.codeharness/stack/",
          healthy: health.healthy,
          services: health.services,
          ...health.healthy ? { endpoints: ep } : {}
        };
      } else {
        const health = getStackHealth(composeFile);
        docker = {
          healthy: health.healthy,
          services: health.services,
          ...health.healthy ? { endpoints: ep } : {}
        };
      }
    }
  }
  const endpoints = resolveEndpoints(state);
  const serviceName = state.otlp?.service_name;
  const scoped_endpoints = serviceName ? buildScopedEndpoints(endpoints, serviceName, state.otlp?.backend) : void 0;
  const onboarding = getOnboardingProgressData();
  const sprint = getSprintReportData();
  const validationResult = getValidationProgress();
  const validation = validationResult.success && validationResult.data.total > 0 ? validationResult.data : void 0;
  const workflowState = getWorkflowStateData();
  jsonOutput({
    version: state.harness_version,
    stack: state.stack,
    ...state.app_type ? { app_type: state.app_type } : {},
    ...sprint ? { sprint } : {},
    ...validation ? { validation } : {},
    ...workflowState ? { workflow: workflowState } : {},
    enforcement: state.enforcement,
    docker,
    endpoints,
    ...scoped_endpoints ? { scoped_endpoints } : {},
    ...onboarding ? { onboarding } : {},
    session_flags: state.session_flags,
    coverage: state.coverage,
    verification_log: state.verification_log
  });
}
async function handleHealthCheck(isJson) {
  const checks = [];
  let state = null;
  try {
    state = readState();
    checks.push({ name: "state_file", status: "ok", detail: "valid" });
  } catch {
    checks.push({ name: "state_file", status: "fail", detail: "not found" });
  }
  if (state) {
    const backend = state.otlp?.backend ?? "victoria";
    const mode = state.otlp?.mode ?? "local-shared";
    if (backend === "none") {
      checks.push({ name: "docker", status: "ok", detail: "observability disabled \u2014 skipped" });
    } else if (mode === "remote-direct") {
      const endpoint = state.otlp?.endpoint ?? "";
      const result = await checkRemoteEndpoint(endpoint);
      checks.push({
        name: "docker",
        status: result.reachable ? "ok" : "fail",
        detail: result.reachable ? `remote OTLP reachable (${endpoint})` : `remote OTLP unreachable (${result.error ?? "unknown"})`
      });
    } else if (mode === "remote-routed") {
      const sharedComposeFile = getComposeFilePath();
      const health = getCollectorHealth(sharedComposeFile);
      checks.push({
        name: "docker",
        status: health.healthy ? "ok" : "fail",
        detail: health.healthy ? "OTel Collector running" : health.remedy ?? "collector down"
      });
      const re = state.docker?.remote_endpoints;
      if (re) {
        for (const [label, url] of [["logs", re.logs_url], ["metrics", re.metrics_url], ["traces", re.traces_url]]) {
          if (url) {
            const result = await checkRemoteEndpoint(url);
            checks.push({
              name: `remote_${label}`,
              status: result.reachable ? "ok" : "fail",
              detail: result.reachable ? `reachable (${url})` : `unreachable (${result.error ?? "unknown"})`
            });
          }
        }
      }
    } else {
      const composeFile = state.docker?.compose_file ?? "docker-compose.harness.yml";
      const sDir = getStackDir();
      const isShared = composeFile.startsWith(sDir);
      const healthComposeFile = isShared ? resolveSharedCompose(backend) : composeFile;
      const healthProjectName = isShared ? "codeharness-shared" : void 0;
      const health = getStackHealth(healthComposeFile, healthProjectName);
      checks.push({
        name: "docker",
        status: health.healthy ? "ok" : "fail",
        detail: health.healthy ? "all services running" : health.remedy ?? "services down"
      });
    }
  } else {
    checks.push({ name: "docker", status: "fail", detail: "cannot check (no state)" });
  }
  const allPassed = checks.every((c) => c.status === "ok");
  if (isJson) {
    const checksObj = {};
    for (const c of checks) {
      checksObj[c.name] = { status: c.status, detail: c.detail };
    }
    jsonOutput({ status: allPassed ? "ok" : "fail", checks: checksObj });
  } else {
    for (const c of checks) {
      const prefix = c.status === "ok" ? "[OK]" : "[FAIL]";
      const label = c.name.replace(/_/g, " ");
      console.log(`${prefix} ${label[0].toUpperCase() + label.slice(1)}: ${c.detail}`);
    }
  }
  process.exitCode = allPassed ? 0 : 1;
}
async function handleDockerCheck(isJson) {
  let state = null;
  try {
    state = readState();
  } catch {
  }
  const backend = state?.otlp?.backend ?? "victoria";
  if (backend === "none") {
    if (isJson) {
      jsonOutput({ status: "ok", mode: "none", message: "Observability disabled \u2014 no Docker check needed" });
    } else {
      info("[INFO] Observability disabled \u2014 no Docker check needed");
    }
    return;
  }
  const mode = state?.otlp?.mode ?? "local-shared";
  if (mode === "remote-direct") {
    const endpoint = state?.otlp?.endpoint ?? "";
    const result = await checkRemoteEndpoint(endpoint);
    if (isJson) {
      jsonOutput({
        status: result.reachable ? "ok" : "fail",
        mode: "remote-direct",
        endpoint,
        reachable: result.reachable,
        ...result.error ? { error: result.error } : {}
      });
    } else {
      if (result.reachable) {
        ok(`Remote OTLP endpoint: reachable (${endpoint})`);
      } else {
        fail(`Remote OTLP endpoint: unreachable (${endpoint})`);
        if (result.error) {
          info(`Error: ${result.error}`);
        }
      }
    }
    return;
  }
  if (mode === "remote-routed") {
    const sharedComposeFile = getComposeFilePath();
    const health2 = getCollectorHealth(sharedComposeFile);
    if (isJson) {
      jsonOutput({
        status: health2.healthy ? "ok" : "fail",
        mode: "remote-routed",
        docker: {
          healthy: health2.healthy,
          services: health2.services,
          remedy: health2.remedy
        },
        remote_endpoints: state?.docker?.remote_endpoints
      });
    } else {
      if (health2.healthy) {
        ok("OTel Collector: running");
      } else {
        fail("OTel Collector: not running");
        if (health2.remedy) {
          info(`-> ${health2.remedy}`);
        }
      }
      const re = state?.docker?.remote_endpoints;
      if (re) {
        info(`Remote backends: logs=${re.logs_url} metrics=${re.metrics_url} traces=${re.traces_url}`);
      }
    }
    return;
  }
  let composeFile = "docker-compose.harness.yml";
  let projectName;
  if (state?.docker?.compose_file) {
    composeFile = state.docker.compose_file;
  }
  const stackDir = getStackDir();
  if (composeFile.startsWith(stackDir)) {
    composeFile = resolveSharedCompose(backend);
    projectName = "codeharness-shared";
  }
  const health = getStackHealth(composeFile, projectName);
  if (isJson) {
    jsonOutput({
      status: health.healthy ? "ok" : "fail",
      backend,
      ...projectName ? { project_name: projectName } : {},
      docker: {
        healthy: health.healthy,
        services: health.services,
        remedy: health.remedy
      },
      ...health.healthy ? { endpoints: getDefaultEndpointsForBackend(backend) } : {}
    });
    return;
  }
  const stackLabel = backend === "elk" ? "OpenSearch/ELK stack" : "VictoriaMetrics stack";
  const ep = getDefaultEndpointsForBackend(backend);
  if (health.healthy) {
    ok(`${stackLabel}: running${projectName ? ` (project: ${projectName})` : ""}`);
    for (const svc of health.services) {
      info(`  ${svc.name}: ${svc.running ? "running" : "stopped"}`);
    }
    info(`Endpoints: logs=${ep.logs} metrics=${ep.metrics} traces=${ep.traces}`);
  } else {
    fail(`${stackLabel}: not running${projectName ? ` (project: ${projectName})` : ""}`);
    for (const svc of health.services) {
      if (!svc.running) {
        info(`  ${svc.name}: down`);
      }
    }
    if (health.remedy) {
      info(`-> ${health.remedy}`);
    }
  }
}
function formatElapsed2(ms) {
  const s = Math.floor(ms / 1e3);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}
function printWorkflowState() {
  const state = readWorkflowState();
  if (state.phase === "idle" && state.started === "") {
    console.log("Workflow Engine: No active workflow run");
    return;
  }
  console.log("\u2500\u2500 Workflow Engine \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log(`  Phase: ${state.phase}`);
  console.log(`  Iteration: ${state.iteration}`);
  console.log(`  Tasks completed: ${state.tasks_completed.length}`);
  const workflowErrors = getWorkflowErrors(state);
  console.log(`  Workflow errors: ${workflowErrors.length}`);
  if (state.phase === "executing" && state.started) {
    const elapsed = Date.now() - Date.parse(state.started);
    console.log(`  Elapsed: ${formatElapsed2(elapsed)}`);
  }
  if (state.evaluator_scores.length > 0) {
    const latest = state.evaluator_scores[state.evaluator_scores.length - 1];
    console.log(`  Evaluator: ${latest.passed}/${latest.total} passed, ${latest.failed} failed, ${latest.unknown} unknown`);
  }
  console.log(`  Circuit breaker: ${state.circuit_breaker.triggered ? "TRIGGERED" : "no"}${state.circuit_breaker.triggered && state.circuit_breaker.reason ? ` \u2014 ${state.circuit_breaker.reason}` : ""}`);
  if (workflowErrors.length > 0) {
    console.log("  Errors:");
    for (const err of workflowErrors) {
      console.log(`    ${err.taskName}/${err.storyKey} [${err.code}]${err.message ? ` ${err.message}` : ""}`);
    }
  }
  console.log("");
}
function getWorkflowStateData() {
  const state = readWorkflowState();
  if (state.phase === "idle" && state.started === "") {
    return null;
  }
  const data = {
    workflow_name: state.workflow_name,
    phase: state.phase,
    iteration: state.iteration,
    started: state.started,
    tasks_completed: state.tasks_completed.length,
    errors: getWorkflowErrors(state),
    evaluator_scores: state.evaluator_scores,
    circuit_breaker: state.circuit_breaker
  };
  if (state.phase === "executing" && state.started) {
    data.elapsed_ms = Date.now() - Date.parse(state.started);
    data.elapsed = formatElapsed2(data.elapsed_ms);
  }
  return data;
}
function getWorkflowErrors(state) {
  return state.tasks_completed.filter((checkpoint) => checkpoint.error).map((checkpoint) => ({
    taskName: checkpoint.task_name,
    storyKey: checkpoint.story_key,
    code: checkpoint.error_code ?? "UNKNOWN",
    message: checkpoint.error_message ?? null
  }));
}
function printSprintState() {
  const reportResult = generateReport();
  if (!reportResult.success) {
    console.log("Sprint state: unavailable");
    return;
  }
  const r = reportResult.data;
  console.log(`\u2500\u2500 Project State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`Sprint: ${r.done}/${r.total} done (${r.sprintPercent}%) | ${r.epicsDone}/${r.epicsTotal} epics complete`);
  if (r.activeRun) {
    console.log("");
    console.log(`\u2500\u2500 Active Run \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    const currentStory = r.inProgress ?? "none";
    console.log(`Status: running (iteration ${r.activeRun.iterations}, ${r.activeRun.duration} elapsed)`);
    console.log(`Current: ${currentStory}`);
    console.log(`Budget: $${r.activeRun.cost.toFixed(2)} spent`);
  } else if (r.lastRun) {
    console.log("");
    console.log(`\u2500\u2500 Last Run Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    console.log(`Duration: ${r.lastRun.duration} | Cost: $${r.lastRun.cost.toFixed(2)} | Iterations: ${r.lastRun.iterations}`);
    console.log(`Completed:  ${r.lastRun.completed.length} stories${r.lastRun.completed.length > 0 ? ` (${r.lastRun.completed.join(", ")})` : ""}`);
    if (r.failedDetails.length > 0) {
      console.log(`Failed:     ${r.failedDetails.length} stor${r.failedDetails.length === 1 ? "y" : "ies"}`);
      for (const fd of r.failedDetails) {
        const acPart = fd.acNumber !== null ? `AC ${fd.acNumber}` : "unknown AC";
        console.log(`  \u2514 ${fd.key}: ${acPart} \u2014 ${fd.errorLine} (attempt ${fd.attempts}/${fd.maxAttempts})`);
      }
    }
    if (r.lastRun.blocked.length > 0) {
      console.log(`Blocked:    ${r.lastRun.blocked.length} stories (retry-exhausted)`);
    }
  }
  if (r.actionItemsLabeled.length > 0) {
    console.log("");
    console.log(`\u2500\u2500 Action Items \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    for (const la of r.actionItemsLabeled) {
      console.log(`  [${la.label}] ${la.item.story}: ${la.item.description}`);
    }
  }
  console.log("");
}
function printValidationProgress() {
  const result = getValidationProgress();
  if (!result.success) return;
  const p2 = result.data;
  if (p2.total === 0) return;
  console.log(`Validation: ${p2.passed}/${p2.total} passed, ${p2.failed} failed, ${p2.blocked} blocked, ${p2.remaining} remaining`);
}
function getSprintReportData() {
  const reportResult = generateReport();
  if (!reportResult.success) return null;
  return reportResult.data;
}
function printOnboardingProgress() {
  const progress = getOnboardingProgress();
  if (progress) {
    console.log(`Onboarding: ${progress.resolved}/${progress.total} gaps resolved (${progress.remaining} remaining)`);
  }
}
function getOnboardingProgressData() {
  const progress = getOnboardingProgress();
  if (!progress) {
    return null;
  }
  return {
    total: progress.total,
    resolved: progress.resolved,
    remaining: progress.remaining
  };
}

// src/modules/status/drill-down.ts
function handleStoryDrillDown(storyId, isJson) {
  const result = getStoryDrillDown(storyId);
  if (!result.success) {
    if (isJson) {
      jsonOutput({ status: "fail", message: result.error });
    } else {
      fail(result.error);
    }
    process.exitCode = 1;
    return;
  }
  const d = result.data;
  if (isJson) {
    formatDrillDownJson(d);
    return;
  }
  formatDrillDownHuman(d);
}
function formatDrillDownJson(d) {
  jsonOutput({
    key: d.key,
    status: d.status,
    epic: d.epic,
    attempts: d.attempts,
    maxAttempts: d.maxAttempts,
    lastAttempt: d.lastAttempt,
    acResults: d.acDetails,
    attemptHistory: d.attemptHistory,
    proof: d.proofSummary,
    ...d.timeoutSummary ? { timeout: d.timeoutSummary } : {}
  });
}
function formatDrillDownHuman(d) {
  console.log(`Story: ${d.key}`);
  console.log(`Status: ${d.status} (attempt ${d.attempts}/${d.maxAttempts})`);
  console.log(`Epic: ${d.epic}`);
  console.log(`Last attempt: ${d.lastAttempt ?? "none"}`);
  if (d.timeoutSummary) {
    const ts = d.timeoutSummary;
    console.log(`Last timeout: iteration ${ts.iteration}, ${ts.durationMinutes}m, ${ts.filesChanged} files changed`);
    console.log(`Report: ${ts.reportPath}`);
  }
  console.log("");
  console.log("-- AC Results -------------------------------------------------------");
  if (d.acDetails.length === 0) {
    console.log("No AC results recorded");
  } else {
    for (const ac of d.acDetails) {
      const tag = ac.verdict.toUpperCase();
      console.log(`${ac.id}: [${tag}]`);
      if (ac.verdict === "fail") {
        if (ac.command) console.log(`  Command:  ${ac.command}`);
        if (ac.expected) console.log(`  Expected: ${ac.expected}`);
        if (ac.actual) console.log(`  Actual:   ${ac.actual}`);
        if (ac.reason) console.log(`  Reason:   ${ac.reason}`);
        if (ac.suggestedFix) console.log(`  Suggest:  ${ac.suggestedFix}`);
      }
    }
  }
  if (d.attemptHistory.length > 0) {
    console.log("");
    console.log("-- History ----------------------------------------------------------");
    for (const attempt of d.attemptHistory) {
      const acPart = attempt.failingAc ? ` (${attempt.failingAc})` : "";
      console.log(`Attempt ${attempt.number}: ${attempt.outcome}${acPart}`);
    }
  }
  if (d.proofSummary) {
    console.log("");
    const p2 = d.proofSummary;
    const total = p2.passCount + p2.failCount + p2.escalateCount + p2.pendingCount;
    console.log(
      `Proof: ${p2.path} (${p2.passCount}/${total} pass, ${p2.failCount} fail, ${p2.escalateCount} escalate)`
    );
  }
}

// src/commands/status.ts
function registerStatusCommand(program) {
  program.command("status").description("Show current harness status and health").option("--check-docker", "Check Docker stack health").option("--check", "Run health checks with pass/fail exit code").option("--story <id>", "Show detailed status for a specific story").action(async (options, cmd) => {
    const opts = cmd.optsWithGlobals();
    const isJson = opts.json === true;
    if (options.story) {
      handleStoryDrillDown(options.story, isJson);
      return;
    }
    if (options.checkDocker) {
      await handleDockerCheck(isJson);
      return;
    }
    if (options.check) {
      await handleHealthCheck(isJson);
      return;
    }
    handleFullStatus(isJson);
  });
}

// src/modules/audit/dimensions.ts
import { existsSync as existsSync13, readdirSync as readdirSync2 } from "fs";
import { join as join12 } from "path";
function gap(dimension, description, suggestedFix) {
  return { dimension, description, suggestedFix };
}
function dimOk(name, status, metric, gaps = []) {
  return ok2({ name, status, metric, gaps });
}
function dimCatch(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  return dimOk(name, "warn", "error", [gap(name, `${name} check failed: ${msg}`, `Check ${name} configuration`)]);
}
function worstStatus(...statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}
async function checkObservability(projectDir) {
  try {
    const gaps = [];
    let sStatus = "pass", sMetric = "";
    const sr = analyze(projectDir);
    if (isOk(sr)) {
      const d = sr.data;
      if (d.skipped) {
        sStatus = "warn";
        sMetric = `static: skipped (${d.skipReason ?? "unknown"})`;
        gaps.push(gap("observability", `Static analysis skipped: ${d.skipReason ?? "Semgrep not installed"}`, "Install Semgrep: pip install semgrep"));
      } else {
        const n = d.gaps.length;
        sMetric = `static: ${n} gap${n !== 1 ? "s" : ""}`;
        if (n > 0) {
          sStatus = "warn";
          for (const g of d.gaps) gaps.push(gap("observability", `${g.file}:${g.line} \u2014 ${g.description}`, "Add observability instrumentation"));
        }
      }
    } else {
      sStatus = "warn";
      sMetric = "static: skipped (analysis failed)";
      gaps.push(gap("observability", `Static analysis failed: ${sr.error}`, "Check Semgrep installation and rules configuration"));
    }
    let rStatus = "pass", rMetric = "";
    try {
      const rr = await validateRuntime(projectDir);
      if (isOk(rr)) {
        const d = rr.data;
        if (d.skipped) {
          rStatus = "warn";
          rMetric = `runtime: skipped (${d.skipReason ?? "unknown"})`;
          gaps.push(gap("observability", `Runtime validation skipped: ${d.skipReason ?? "backend unreachable"}`, "Start the observability stack: codeharness stack up"));
        } else {
          rMetric = `runtime: ${d.coveragePercent}%`;
          if (d.coveragePercent < 50) {
            rStatus = "warn";
            gaps.push(gap("observability", `Runtime coverage low: ${d.coveragePercent}%`, "Add telemetry instrumentation to more modules"));
          }
        }
      } else {
        rStatus = "warn";
        rMetric = "runtime: skipped (validation failed)";
        gaps.push(gap("observability", `Runtime validation failed: ${rr.error}`, "Ensure observability backend is running"));
      }
    } catch {
      rStatus = "warn";
      rMetric = "runtime: skipped (error)";
      gaps.push(gap("observability", "Runtime validation threw an unexpected error", "Check observability stack health"));
    }
    return dimOk("observability", worstStatus(sStatus, rStatus), `${sMetric}, ${rMetric}`, gaps);
  } catch (err) {
    return dimCatch("observability", err);
  }
}
function checkTesting(projectDir) {
  try {
    const r = checkOnlyCoverage(projectDir);
    if (!r.success) return dimOk("testing", "warn", "no coverage data", [gap("testing", "No coverage tool detected or coverage data unavailable", "Run tests with coverage: npm run test:coverage")]);
    const pct = r.coveragePercent;
    const gaps = [];
    let status = "pass";
    if (pct < 50) {
      status = "fail";
      gaps.push(gap("testing", `Test coverage critically low: ${pct}%`, "Add unit tests to increase coverage above 50%"));
    } else if (pct < 80) {
      status = "warn";
      gaps.push(gap("testing", `Test coverage below target: ${pct}%`, "Add tests to reach 80% coverage target"));
    }
    return dimOk("testing", status, `${pct}%`, gaps);
  } catch (err) {
    return dimCatch("testing", err);
  }
}
function checkDocumentation(projectDir) {
  try {
    const report = scanDocHealth(projectDir);
    const gaps = [];
    const { fresh, stale, missing } = report.summary;
    let status = "pass";
    if (missing > 0) {
      status = "fail";
      for (const doc of report.documents) if (doc.grade === "missing") gaps.push(gap("documentation", `Missing: ${doc.path} \u2014 ${doc.reason}`, `Create ${doc.path}`));
    }
    if (stale > 0) {
      if (status !== "fail") status = "warn";
      for (const doc of report.documents) if (doc.grade === "stale") gaps.push(gap("documentation", `Stale: ${doc.path} \u2014 ${doc.reason}`, `Update ${doc.path} to reflect current code`));
    }
    return dimOk("documentation", status, `${fresh} fresh, ${stale} stale, ${missing} missing`, gaps);
  } catch (err) {
    return dimCatch("documentation", err);
  }
}
function checkVerification(projectDir) {
  try {
    const gaps = [];
    const sprintPath = join12(projectDir, "_bmad-output", "implementation-artifacts", "sprint-status.yaml");
    if (!existsSync13(sprintPath)) return dimOk("verification", "warn", "no sprint data", [gap("verification", "No sprint-status.yaml found", "Run sprint planning to create sprint status")]);
    const vDir = join12(projectDir, "verification");
    let proofCount = 0, totalChecked = 0;
    if (existsSync13(vDir)) {
      for (const file of readdirSafe(vDir)) {
        if (!file.endsWith("-proof.md")) continue;
        totalChecked++;
        const r = parseProof(join12(vDir, file));
        if (isOk(r) && r.data.passed) {
          proofCount++;
        } else {
          gaps.push(gap("verification", `Story ${file.replace("-proof.md", "")} proof incomplete or failing`, `Run codeharness verify ${file.replace("-proof.md", "")}`));
        }
      }
    }
    let status = "pass";
    if (totalChecked === 0) {
      status = "warn";
      gaps.push(gap("verification", "No verification proofs found", "Run codeharness verify for completed stories"));
    } else if (proofCount < totalChecked) {
      status = "warn";
    }
    return dimOk("verification", status, totalChecked > 0 ? `${proofCount}/${totalChecked} verified` : "no proofs", gaps);
  } catch (err) {
    return dimCatch("verification", err);
  }
}
function checkInfrastructure(projectDir) {
  try {
    const result = validateDockerfile(projectDir);
    if (!result.success) {
      const err = result.error;
      if (err.includes("No Dockerfile")) return dimOk("infrastructure", "fail", "no Dockerfile", [gap("infrastructure", "No Dockerfile found", "Create a Dockerfile for containerized deployment")]);
      if (err.includes("could not be read")) return dimOk("infrastructure", "warn", "Dockerfile unreadable", [gap("infrastructure", "Dockerfile exists but could not be read", "Check Dockerfile permissions")]);
      if (err.includes("no FROM")) return dimOk("infrastructure", "fail", "invalid Dockerfile", [gap("infrastructure", "Dockerfile has no FROM instruction", "Add a FROM instruction with a pinned base image")]);
      return dimOk("infrastructure", "fail", "validation failed", [gap("infrastructure", err, "Fix Dockerfile validation errors")]);
    }
    const gaps = result.data.gaps.map((g) => gap("infrastructure", g.description, g.suggestedFix));
    for (const w of result.data.warnings) {
      gaps.push(gap("infrastructure", w, "Provide the missing configuration file"));
    }
    const issueCount = gaps.length;
    const status = issueCount > 0 ? "warn" : "pass";
    const metric = issueCount > 0 ? `Dockerfile exists (${issueCount} issue${issueCount !== 1 ? "s" : ""})` : "Dockerfile valid";
    return dimOk("infrastructure", status, metric, gaps);
  } catch (err) {
    return dimCatch("infrastructure", err);
  }
}
function readdirSafe(dir) {
  try {
    return readdirSync2(dir);
  } catch {
    return [];
  }
}

// src/modules/audit/report.ts
var STATUS_PREFIX = {
  pass: "[OK]",
  fail: "[FAIL]",
  warn: "[WARN]"
};
function formatAuditHuman(result) {
  const lines = [];
  for (const dimension of Object.values(result.dimensions)) {
    const prefix = STATUS_PREFIX[dimension.status] ?? "[WARN]";
    lines.push(`${prefix} ${dimension.name}: ${dimension.metric}`);
    for (const gap2 of dimension.gaps) {
      lines.push(`  [WARN] ${gap2.description} -- fix: ${gap2.suggestedFix}`);
    }
  }
  const overallPrefix = STATUS_PREFIX[result.overallStatus] ?? "[WARN]";
  lines.push("");
  lines.push(
    `${overallPrefix} Audit complete: ${result.gapCount} gap${result.gapCount !== 1 ? "s" : ""} found (${result.durationMs}ms)`
  );
  return lines;
}
function formatAuditJson(result) {
  return result;
}

// src/modules/audit/fix-generator.ts
import { existsSync as existsSync14, writeFileSync as writeFileSync3, mkdirSync as mkdirSync4 } from "fs";
import { join as join13, dirname } from "path";
function buildStoryKey(gap2, index) {
  const safeDimension = gap2.dimension.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `audit-fix-${safeDimension}-${index}`;
}
function buildStoryMarkdown(gap2, _key) {
  return [
    `# Fix: ${gap2.dimension} \u2014 ${gap2.description}`,
    "",
    "Status: backlog",
    "",
    "## Story",
    "",
    `As an operator, I need ${gap2.description} fixed so that audit compliance improves.`,
    "",
    "## Acceptance Criteria",
    "",
    `1. **Given** ${gap2.description}, **When** the fix is applied, **Then** ${gap2.suggestedFix}.`,
    "",
    "## Dev Notes",
    "",
    "This is an auto-generated fix story created by `codeharness audit --fix`.",
    `**Audit Gap:** ${gap2.dimension}: ${gap2.description}`,
    `**Suggested Fix:** ${gap2.suggestedFix}`,
    ""
  ].join("\n");
}
function generateFixStories(auditResult) {
  try {
    const stories = [];
    let created = 0;
    let skipped = 0;
    const artifactsDir = join13(
      process.cwd(),
      "_bmad-output",
      "implementation-artifacts"
    );
    for (const dimension of Object.values(auditResult.dimensions)) {
      for (let i = 0; i < dimension.gaps.length; i++) {
        const gap2 = dimension.gaps[i];
        const key = buildStoryKey(gap2, i + 1);
        const filePath = join13(artifactsDir, `${key}.md`);
        if (existsSync14(filePath)) {
          stories.push({
            key,
            filePath,
            gap: gap2,
            skipped: true,
            skipReason: "Story file already exists"
          });
          skipped++;
          continue;
        }
        const markdown = buildStoryMarkdown(gap2, key);
        mkdirSync4(dirname(filePath), { recursive: true });
        writeFileSync3(filePath, markdown, "utf-8");
        stories.push({ key, filePath, gap: gap2, skipped: false });
        created++;
      }
    }
    return ok2({ stories, created, skipped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail2(`Failed to generate fix stories: ${msg}`);
  }
}
function addFixStoriesToState(stories) {
  const newStories = stories.filter((s) => !s.skipped);
  if (newStories.length === 0) {
    return ok2(void 0);
  }
  const stateResult = getSprintState();
  if (!stateResult.success) {
    return fail2(stateResult.error);
  }
  const current = stateResult.data;
  const updatedStories = { ...current.stories };
  for (const story of newStories) {
    updatedStories[story.key] = {
      status: "backlog",
      attempts: 0,
      lastAttempt: null,
      lastError: null,
      proofPath: null,
      acResults: null
    };
  }
  const updatedSprint = computeSprintCounts(updatedStories);
  return writeStateAtomic({
    ...current,
    sprint: updatedSprint,
    stories: updatedStories
  });
}

// src/modules/audit/index.ts
async function runAudit(projectDir) {
  const start = performance.now();
  const [
    obsResult,
    testResult,
    docResult,
    verifyResult,
    infraResult
  ] = await Promise.all([
    checkObservability(projectDir),
    Promise.resolve(checkTesting(projectDir)),
    Promise.resolve(checkDocumentation(projectDir)),
    Promise.resolve(checkVerification(projectDir)),
    Promise.resolve(checkInfrastructure(projectDir))
  ]);
  const dimensions = {};
  const allResults = [obsResult, testResult, docResult, verifyResult, infraResult];
  for (const result of allResults) {
    if (result.success) {
      dimensions[result.data.name] = result.data;
    }
  }
  const statuses = Object.values(dimensions).map((d) => d.status);
  const overallStatus = computeOverallStatus(statuses);
  const gapCount = Object.values(dimensions).reduce((sum, d) => sum + d.gaps.length, 0);
  const durationMs = Math.round(performance.now() - start);
  return ok2({ dimensions, overallStatus, gapCount, durationMs });
}
function computeOverallStatus(statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

// src/commands/audit-action.ts
async function executeAudit(opts) {
  const { isJson, isFix } = opts;
  const preconditions = runPreconditions();
  if (!preconditions.canProceed) {
    if (isJson) {
      jsonOutput({
        status: "fail",
        message: "Harness not initialized -- run codeharness init first"
      });
    } else {
      fail("Harness not initialized -- run codeharness init first");
    }
    process.exitCode = 1;
    return;
  }
  const result = await runAudit(process.cwd());
  if (!result.success) {
    if (isJson) {
      jsonOutput({ status: "fail", message: result.error });
    } else {
      fail(result.error);
    }
    process.exitCode = 1;
    return;
  }
  let fixStories;
  let fixStateError;
  if (isFix) {
    if (result.data.gapCount === 0) {
      if (!isJson) {
        ok("No gaps found -- nothing to fix");
      }
    } else {
      const fixResult = generateFixStories(result.data);
      fixStories = fixResult;
      if (fixResult.success) {
        const stateResult = addFixStoriesToState(fixResult.data.stories);
        if (!stateResult.success) {
          fixStateError = stateResult.error;
          if (!isJson) {
            fail(`Failed to update sprint state: ${stateResult.error}`);
          }
        }
        if (!isJson) {
          info(`Generated ${fixResult.data.created} fix stories (${fixResult.data.skipped} skipped)`);
        }
      } else if (!isJson) {
        fail(fixResult.error);
      }
    }
  }
  if (isJson) {
    const jsonData = { ...formatAuditJson(result.data) };
    if (isFix) {
      if (result.data.gapCount === 0) {
        jsonData.fixStories = [];
      } else if (fixStories.success) {
        jsonData.fixStories = fixStories.data.stories.map((s) => ({
          key: s.key,
          filePath: s.filePath,
          gap: s.gap,
          ...s.skipped ? { skipped: true } : {}
        }));
        if (fixStateError) {
          jsonData.fixStateError = fixStateError;
        }
      } else {
        jsonData.fixStories = [];
        jsonData.fixError = fixStories.error;
      }
    }
    jsonOutput(jsonData);
  } else if (!isFix || result.data.gapCount > 0) {
    const lines = formatAuditHuman(result.data);
    for (const line of lines) {
      console.log(line);
    }
  }
  if (result.data.overallStatus === "fail") {
    process.exitCode = 1;
  }
}

// src/commands/onboard.ts
function registerOnboardCommand(program) {
  const onboard = program.command("onboard").description("Alias for audit \u2014 check all compliance dimensions").option("--json", "Output in machine-readable JSON format").option("--fix", "Generate fix stories for every gap found").action(async (opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = opts.json === true || globalOpts.json === true;
    const isFix = opts.fix === true;
    await executeAudit({ isJson, isFix });
  });
  onboard.command("scan").description('(deprecated) Use "codeharness audit" instead').action(async (_, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    warn("'onboard scan' is deprecated \u2014 use 'codeharness audit' instead");
    await executeAudit({ isJson, isFix: false });
  });
}

// src/commands/teardown.ts
import { existsSync as existsSync15, unlinkSync as unlinkSync3, readFileSync as readFileSync12, writeFileSync as writeFileSync4, rmSync as rmSync2 } from "fs";
import { join as join14 } from "path";
function buildDefaultResult() {
  return {
    status: "ok",
    removed: [],
    preserved: [],
    docker: { stopped: false, kept: false },
    patches_removed: 0,
    otlp_cleaned: false
  };
}
function registerTeardownCommand(program) {
  program.command("teardown").description("Remove harness from a project").option("--keep-docker", "Leave Docker stack running and preserve compose files").action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    const projectDir = process.cwd();
    const result = buildDefaultResult();
    let state;
    try {
      state = readState(projectDir);
    } catch (err) {
      if (err instanceof StateFileNotFoundError) {
        result.status = "fail";
        result.error = "Harness not initialized. Nothing to tear down.";
        if (isJson) {
          jsonOutput(result);
        } else {
          fail("Harness not initialized. Nothing to tear down.");
        }
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    const otlpMode = state.otlp?.mode ?? "local-shared";
    const composeFile = state.docker?.compose_file ?? "";
    const stackDir = getStackDir();
    const isSharedStack = composeFile !== "" && composeFile.startsWith(stackDir);
    const isLegacyStack = composeFile !== "" && !isSharedStack;
    if (otlpMode === "remote-direct") {
      if (!isJson) {
        info("Docker: none (remote OTLP mode)");
      }
    } else if (otlpMode === "remote-routed") {
      if (!options.keepDocker) {
        try {
          const { stopCollectorOnly: stopCollectorOnly2 } = await import("./docker-XOIGFDMB.js");
          stopCollectorOnly2();
          result.docker.stopped = true;
          if (!isJson) {
            ok("OTel Collector: stopped");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!isJson) {
            warn(`OTel Collector: failed to stop (${message})`);
          }
        }
      } else {
        result.docker.kept = true;
        if (!isJson) {
          info("OTel Collector: kept (--keep-docker)");
        }
      }
    } else if (options.keepDocker) {
      result.docker.kept = true;
      if (!isJson) {
        if (isSharedStack) {
          info("Docker stack: shared (not managed per-project)");
        } else {
          info("Docker stack: kept (--keep-docker)");
        }
      }
    } else if (isSharedStack) {
      if (!isJson) {
        info("Shared stack: kept running (other projects may use it)");
      }
    } else if (isLegacyStack) {
      const { isStackRunning: isStackRunning2, stopStack } = await import("./docker-XOIGFDMB.js");
      let stackRunning = false;
      try {
        stackRunning = isStackRunning2(composeFile);
      } catch {
        stackRunning = false;
      }
      if (stackRunning) {
        try {
          stopStack(composeFile);
          result.docker.stopped = true;
          if (!isJson) {
            ok("Docker stack: stopped");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!isJson) {
            warn(`Docker stack: failed to stop (${message})`);
          }
        }
      } else {
        if (!isJson) {
          info("Docker stack: not running, skipping");
        }
      }
      const composeFilePath = join14(projectDir, composeFile);
      if (existsSync15(composeFilePath)) {
        unlinkSync3(composeFilePath);
        result.removed.push(composeFile);
        if (!isJson) {
          ok(`Removed: ${composeFile}`);
        }
      }
      const otelConfigPath = join14(projectDir, "otel-collector-config.yaml");
      if (existsSync15(otelConfigPath)) {
        unlinkSync3(otelConfigPath);
        result.removed.push("otel-collector-config.yaml");
        if (!isJson) {
          ok(`Removed: otel-collector-config.yaml`);
        }
      }
    }
    const patchesRemoved = 0;
    result.patches_removed = patchesRemoved;
    if (!isJson) {
      if (patchesRemoved > 0) {
        ok(`BMAD patches: removed ${patchesRemoved} patches`);
      } else {
        info("BMAD patches: none found");
      }
    }
    const stacks = state.stacks ?? (state.stack ? [state.stack] : []);
    if (state.otlp?.enabled && stacks.includes("nodejs")) {
      const pkgPath = join14(projectDir, "package.json");
      if (existsSync15(pkgPath)) {
        try {
          const raw = readFileSync12(pkgPath, "utf-8");
          const pkg = JSON.parse(raw);
          const scripts = pkg["scripts"];
          if (scripts) {
            const keysToRemove = [];
            for (const [key, value] of Object.entries(scripts)) {
              if (key.endsWith(":instrumented") && value.includes(NODE_REQUIRE_FLAG)) {
                keysToRemove.push(key);
              }
            }
            if (keysToRemove.length > 0) {
              for (const key of keysToRemove) {
                delete scripts[key];
              }
              writeFileSync4(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
              result.otlp_cleaned = true;
              if (!isJson) {
                ok("OTLP: removed instrumented scripts from package.json");
              }
            } else {
              if (!isJson) {
                info("OTLP: no instrumented scripts found");
              }
            }
          } else {
            if (!isJson) {
              info("OTLP: no instrumented scripts found");
            }
          }
        } catch {
          if (!isJson) {
            info("OTLP: no instrumented scripts found");
          }
        }
      } else {
        if (!isJson) {
          info("OTLP: no instrumented scripts found");
        }
      }
    }
    const harnessDir = join14(projectDir, ".harness");
    if (existsSync15(harnessDir)) {
      rmSync2(harnessDir, { recursive: true, force: true });
      result.removed.push(".harness/");
      if (!isJson) {
        ok("Removed: .harness/");
      }
    }
    const statePath = getStatePath(projectDir);
    if (existsSync15(statePath)) {
      unlinkSync3(statePath);
      result.removed.push(".claude/codeharness.local.md");
      if (!isJson) {
        ok("Removed: .claude/codeharness.local.md");
      }
    }
    result.preserved.push("_bmad/ (BMAD artifacts, patches removed)");
    result.preserved.push("docs/ (documentation)");
    if (isJson) {
      jsonOutput(result);
    } else {
      ok("Harness teardown complete");
      info("Preserved: _bmad/ (BMAD artifacts, patches removed)");
      info("Preserved: docs/ (documentation)");
    }
  });
}

// src/commands/state.ts
import { stringify } from "yaml";
function registerStateCommand(program) {
  const stateCmd = program.command("state").description("Manage harness state");
  stateCmd._hidden = true;
  stateCmd.command("show").description("Display full harness state").action((_, cmd) => {
    const opts = cmd.optsWithGlobals();
    try {
      const state = readState();
      if (opts.json) {
        jsonOutput(state);
      } else {
        info("Current state:");
        process.stdout.write(stringify(state, { nullStr: "null" }));
      }
    } catch (err) {
      if (err instanceof StateFileNotFoundError) {
        fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
        process.exitCode = 1;
      } else {
        throw err;
      }
    }
  });
  stateCmd.command("get <key>").description("Get a state value by dot-notation key").action((key, _, cmd) => {
    const opts = cmd.optsWithGlobals();
    try {
      const state = readState();
      const value = getNestedValue(state, key);
      if (value === void 0) {
        fail(`Key '${key}' not found in state.`, { json: opts.json });
        process.exitCode = 1;
      } else if (opts.json) {
        jsonOutput({ key, value });
      } else {
        process.stdout.write(`${String(value)}
`);
      }
    } catch (err) {
      if (err instanceof StateFileNotFoundError) {
        fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
        process.exitCode = 1;
      } else {
        throw err;
      }
    }
  });
  stateCmd.command("reset-session").description("Reset all session flags to false").action((_, cmd) => {
    const opts = cmd.optsWithGlobals();
    try {
      const { state, body } = readStateWithBody();
      state.session_flags.tests_passed = false;
      state.session_flags.coverage_met = false;
      state.session_flags.verification_run = false;
      state.session_flags.logs_queried = false;
      writeState(state, void 0, body);
      if (opts.json) {
        jsonOutput({
          status: "ok",
          reset: {
            tests_passed: false,
            coverage_met: false,
            verification_run: false,
            logs_queried: false
          }
        });
      } else {
        info("Session flags reset to false: tests_passed, coverage_met, verification_run, logs_queried");
      }
    } catch (err) {
      if (err instanceof StateFileNotFoundError) {
        fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
        process.exitCode = 1;
      } else {
        throw err;
      }
    }
  });
  stateCmd.command("set <key> <value>").description("Set a state value by dot-notation key").action((key, rawValue, _, cmd) => {
    const opts = cmd.optsWithGlobals();
    try {
      const { state, body } = readStateWithBody();
      const parsed = parseValue(rawValue);
      setNestedValue(state, key, parsed);
      writeState(state, void 0, body);
      if (opts.json) {
        jsonOutput({ status: "ok", key, value: parsed });
      } else {
        info(`Set ${key} = ${String(parsed)}`);
      }
    } catch (err) {
      if (err instanceof StateFileNotFoundError) {
        fail("No state file found. Run 'codeharness init' first.", { json: opts.json });
        process.exitCode = 1;
      } else {
        throw err;
      }
    }
  });
}

// src/commands/sync.ts
function registerSyncCommand(program) {
  program.command("sync").description("Synchronize issue statuses with story files and sprint-status.yaml").option("--direction <dir>", "Sync direction (reserved for Epic 8 issue tracker)", "bidirectional").option("--story <key>", "Sync only a single story by key").action((_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json ?? false;
    const message = "Sync: beads integration removed \u2014 will be replaced by issue tracker in Epic 8";
    if (isJson) {
      jsonOutput({ status: "ok", message });
    } else {
      info(message);
    }
    process.exitCode = 0;
  });
}

// src/commands/coverage.ts
function registerCoverageCommand(program) {
  program.command("coverage").description("Run tests with coverage and evaluate against targets").option("--json", "Machine-readable JSON output").option("--check-only", "Evaluate without running tests \u2014 reads last coverage report").option("--story <id>", "Associate coverage delta with a specific story").option("--min-file <percent>", "Minimum per-file statement coverage", "80").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = opts.json === true || globalOpts.json === true;
    const checkOnly = opts.checkOnly === true;
    const storyId = opts.story;
    const minFile = parseInt(opts.minFile, 10) || 0;
    const root = process.cwd();
    const toolInfo = detectCoverageTool(root);
    if (toolInfo.tool === "unknown") {
      if (isJson) {
        jsonOutput({
          status: "fail",
          message: "No coverage tool detected",
          tool: "unknown"
        });
      } else {
        fail("No coverage tool detected. Ensure your project has a test runner configured.");
      }
      process.exitCode = 1;
      return;
    }
    if (!isJson) {
      info(`Detected coverage tool: ${toolInfo.tool} (${toolInfo.runCommand})`);
    }
    const result = checkOnly ? checkOnlyCoverage(root) : runCoverage(root);
    if (!result.success) {
      if (isJson) {
        jsonOutput({
          status: "fail",
          message: result.rawOutput,
          testsPassed: false,
          passCount: 0,
          failCount: 0,
          coveragePercent: 0,
          target: 100,
          met: false,
          delta: null,
          baseline: null,
          tool: toolInfo.tool
        });
      } else {
        fail(result.rawOutput);
      }
      process.exitCode = 1;
      return;
    }
    const evaluation = evaluateCoverage(result, root);
    try {
      updateCoverageState(result, evaluation, root);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isJson) {
        info(`Note: Could not update state file: ${message}`);
      }
    }
    let perFileResult = null;
    if (minFile > 0) {
      perFileResult = checkPerFileCoverage(minFile, root);
    }
    const perFileOk = !perFileResult || perFileResult.violations.length === 0;
    if (isJson) {
      const status = result.testsPassed && evaluation.met && perFileOk ? "ok" : "fail";
      jsonOutput({
        status,
        testsPassed: result.testsPassed,
        passCount: result.passCount,
        failCount: result.failCount,
        coveragePercent: evaluation.actual,
        target: evaluation.target,
        met: evaluation.met,
        delta: evaluation.delta,
        baseline: evaluation.baseline,
        tool: toolInfo.tool,
        ...storyId ? { story: storyId } : {},
        ...perFileResult ? {
          perFile: {
            floor: perFileResult.floor,
            totalFiles: perFileResult.totalFiles,
            violationCount: perFileResult.violations.length,
            violations: perFileResult.violations
          }
        } : {}
      });
    } else {
      printCoverageOutput(result, evaluation);
      if (storyId) {
        info(`Story: ${storyId}`);
      }
      if (perFileResult && perFileResult.violations.length > 0) {
        fail(`${perFileResult.violations.length} file(s) below ${minFile}% statement coverage:`);
        for (const v of perFileResult.violations) {
          fail(`  ${v.file}: ${v.statements}% statements, ${v.branches}% branches`);
        }
      } else if (perFileResult) {
        ok(`All ${perFileResult.totalFiles} files above ${minFile}% statement coverage`);
      }
    }
    if (!result.testsPassed || !evaluation.met || !perFileOk) {
      process.exitCode = 1;
    }
  });
}

// src/commands/doc-health.ts
function registerDocHealthCommand(program) {
  program.command("doc-health").description("Scan documentation for freshness and quality issues").option("--json", "Machine-readable JSON output").option("--story <id>", "Check only modules changed by a specific story").option("--fix", "Auto-generate missing AGENTS.md stubs (placeholder)").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = opts.json === true || globalOpts.json === true;
    const storyId = opts.story;
    const root = process.cwd();
    if (opts.fix) {
      if (isJson) {
        jsonOutput({ status: "fail", message: "--fix is not yet implemented" });
      } else {
        warn("--fix is not yet implemented");
      }
    }
    let report;
    try {
      if (storyId) {
        report = checkStoryDocFreshness(storyId, root);
      } else {
        report = scanDocHealth(root);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        jsonOutput({ status: "fail", message: `Scan failed: ${message}` });
      } else {
        fail(`Scan failed: ${message}`);
      }
      process.exitCode = 1;
      return;
    }
    if (isJson) {
      const status = report.passed ? "ok" : "fail";
      jsonOutput({
        status,
        documents: report.documents.map((d) => ({
          ...d,
          lastModified: d.lastModified?.toISOString() ?? null,
          codeLastModified: d.codeLastModified?.toISOString() ?? null
        })),
        summary: report.summary,
        scanDurationMs: report.scanDurationMs
      });
    } else {
      printDocHealthOutput(report);
      if (storyId) {
        info(`Story: ${storyId}`);
      }
      info(`Scan completed in ${report.scanDurationMs}ms`);
    }
    if (!report.passed) {
      process.exitCode = 1;
    }
  });
}

// src/commands/stack.ts
var STACK_ENDPOINTS = {
  logs: "http://localhost:9428",
  metrics: "http://localhost:8428",
  traces: "http://localhost:16686",
  otel_grpc: "http://localhost:4317",
  otel_http: "http://localhost:4318"
};
function registerStackCommand(program) {
  const stack = program.command("stack").description("Manage the shared observability stack");
  stack.command("start").description("Start the shared observability stack").action((_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    let mode;
    let remoteEndpoints;
    try {
      const state = readState();
      mode = state.otlp?.mode;
      remoteEndpoints = state.docker?.remote_endpoints;
    } catch {
    }
    if (mode === "remote-direct") {
      if (isJson) {
        jsonOutput({ status: "ok", message: "No local stack needed \u2014 remote OTLP configured" });
      } else {
        info("No local stack needed \u2014 remote OTLP configured");
      }
      return;
    }
    if (mode === "remote-routed") {
      if (isCollectorRunning()) {
        if (isJson) {
          jsonOutput({ status: "ok", message: "OTel Collector: already running" });
        } else {
          info("OTel Collector: already running");
        }
        return;
      }
      if (remoteEndpoints?.logs_url && remoteEndpoints?.metrics_url && remoteEndpoints?.traces_url) {
        const result2 = startCollectorOnly(remoteEndpoints.logs_url, remoteEndpoints.metrics_url, remoteEndpoints.traces_url);
        if (result2.started) {
          if (isJson) {
            jsonOutput({ status: "ok", message: "OTel Collector: started", services: result2.services });
          } else {
            ok("OTel Collector: started");
          }
        } else {
          if (isJson) {
            jsonOutput({ status: "fail", message: "OTel Collector: failed to start", error: result2.error });
          } else {
            fail("OTel Collector: failed to start");
            if (result2.error) {
              info(`Error: ${result2.error}`);
            }
          }
          process.exitCode = 1;
        }
      } else {
        if (isJson) {
          jsonOutput({ status: "fail", message: "Remote endpoints not configured in state" });
        } else {
          fail("Remote endpoints not configured in state");
        }
        process.exitCode = 1;
      }
      return;
    }
    if (isSharedStackRunning()) {
      if (isJson) {
        jsonOutput({ status: "ok", message: "Shared stack: already running", endpoints: STACK_ENDPOINTS });
      } else {
        info("Shared stack: already running");
      }
      return;
    }
    const result = startSharedStack();
    if (result.started) {
      if (isJson) {
        jsonOutput({
          status: "ok",
          message: "Shared stack: started",
          services: result.services,
          endpoints: STACK_ENDPOINTS
        });
      } else {
        ok("Shared stack: started");
        info(`Endpoints: logs=${STACK_ENDPOINTS.logs} metrics=${STACK_ENDPOINTS.metrics} traces=${STACK_ENDPOINTS.traces}`);
      }
    } else {
      if (isJson) {
        jsonOutput({ status: "fail", message: "Shared stack: failed to start", error: result.error });
      } else {
        fail(`Shared stack: failed to start`);
        if (result.error) {
          info(`Error: ${result.error}`);
        }
      }
      process.exitCode = 1;
    }
  });
  stack.command("stop").description("Stop the shared observability stack").action((_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    let mode;
    try {
      const state = readState();
      mode = state.otlp?.mode;
    } catch {
    }
    if (mode === "remote-direct") {
      if (isJson) {
        jsonOutput({ status: "ok", message: "No local stack to stop \u2014 remote OTLP configured" });
      } else {
        info("No local stack to stop \u2014 remote OTLP configured");
      }
      return;
    }
    if (mode === "remote-routed") {
      try {
        stopCollectorOnly();
        if (isJson) {
          jsonOutput({ status: "ok", message: "OTel Collector: stopped" });
        } else {
          ok("OTel Collector: stopped");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isJson) {
          jsonOutput({ status: "fail", message: "OTel Collector: failed to stop", error: message });
        } else {
          info(`OTel Collector: failed to stop (${message})`);
        }
        process.exitCode = 1;
      }
      return;
    }
    if (!isJson) {
      warn("Stopping shared stack \u2014 all harness projects will lose observability");
    }
    try {
      stopSharedStack();
      if (isJson) {
        jsonOutput({ status: "ok", message: "Shared stack: stopped" });
      } else {
        ok("Shared stack: stopped");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        jsonOutput({ status: "fail", message: "Shared stack: failed to stop", error: message });
      } else {
        info(`Shared stack: failed to stop (${message})`);
      }
      process.exitCode = 1;
    }
  });
  stack.command("status").description("Show shared observability stack status").action(async (_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    let mode;
    let remoteEndpoints;
    let otlpEndpoint;
    try {
      const state = readState();
      mode = state.otlp?.mode;
      remoteEndpoints = state.docker?.remote_endpoints;
      otlpEndpoint = state.otlp?.endpoint;
    } catch {
    }
    if (mode === "remote-direct") {
      const endpoint = otlpEndpoint ?? "unknown";
      const result = await checkRemoteEndpoint(endpoint);
      if (isJson) {
        jsonOutput({
          status: result.reachable ? "ok" : "fail",
          mode: "remote-direct",
          endpoint,
          reachable: result.reachable,
          ...result.error ? { error: result.error } : {}
        });
      } else {
        info("No local stack \u2014 using remote OTLP endpoint");
        if (result.reachable) {
          ok(`Remote OTLP: reachable (${endpoint})`);
        } else {
          fail(`Remote OTLP: unreachable (${endpoint})`);
        }
      }
      return;
    }
    if (mode === "remote-routed") {
      const composeFile2 = getComposeFilePath();
      const health2 = getCollectorHealth(composeFile2);
      if (isJson) {
        jsonOutput({
          status: health2.healthy ? "ok" : "fail",
          mode: "remote-routed",
          healthy: health2.healthy,
          services: health2.services,
          remote_endpoints: remoteEndpoints,
          ...health2.remedy ? { remedy: health2.remedy } : {}
        });
      } else {
        if (health2.healthy) {
          ok("OTel Collector: running");
        } else {
          info("OTel Collector: not running");
        }
        for (const svc of health2.services) {
          console.log(`  ${svc.name}: ${svc.running ? "running" : "stopped"}`);
        }
        if (remoteEndpoints) {
          info(`Remote backends: logs=${remoteEndpoints.logs_url} metrics=${remoteEndpoints.metrics_url} traces=${remoteEndpoints.traces_url}`);
        }
      }
      return;
    }
    const composeFile = getComposeFilePath();
    const health = getStackHealth(composeFile, "codeharness-shared");
    if (isJson) {
      jsonOutput({
        status: health.healthy ? "ok" : "fail",
        healthy: health.healthy,
        services: health.services,
        ...health.healthy ? { endpoints: STACK_ENDPOINTS } : {},
        ...health.remedy ? { remedy: health.remedy } : {}
      });
    } else {
      if (health.healthy) {
        ok("Shared stack: running");
      } else {
        info("Shared stack: not running");
      }
      for (const svc of health.services) {
        console.log(`  ${svc.name}: ${svc.running ? "running" : "stopped"}`);
      }
      if (health.healthy) {
        info(`Endpoints: logs=${STACK_ENDPOINTS.logs} metrics=${STACK_ENDPOINTS.metrics} traces=${STACK_ENDPOINTS.traces} otel_grpc=${STACK_ENDPOINTS.otel_grpc} otel_http=${STACK_ENDPOINTS.otel_http}`);
      }
    }
  });
}

// src/commands/query.ts
function getServiceName() {
  try {
    const state = readState();
    const serviceName = state.otlp?.service_name;
    if (!serviceName) {
      fail('No service_name configured. Run "codeharness init" first.');
      process.exitCode = 1;
      return null;
    }
    const mode = state.otlp?.mode ?? "local-shared";
    let logs = "http://localhost:9428";
    let metrics = "http://localhost:8428";
    let traces = "http://localhost:16686";
    if (mode === "remote-routed") {
      const re = state.docker?.remote_endpoints;
      if (re?.logs_url) logs = re.logs_url;
      if (re?.metrics_url) metrics = re.metrics_url;
      if (re?.traces_url) traces = re.traces_url;
    } else if (mode === "remote-direct") {
      const endpoint = state.otlp?.endpoint ?? "http://localhost:4318";
      logs = endpoint;
      metrics = endpoint;
      traces = endpoint;
    }
    return { serviceName, endpoints: { logs, metrics, traces } };
  } catch (err) {
    if (err instanceof StateFileNotFoundError) {
      fail("Harness not initialized. Run 'codeharness init' first.");
      process.exitCode = 1;
      return null;
    }
    throw err;
  }
}
function buildLogsQuery(filter, serviceName, raw) {
  if (raw) return filter;
  return `${filter} AND service_name:${serviceName}`;
}
function injectServiceNameIntoPromQL(promql, serviceName) {
  if (promql.includes("service_name")) return promql;
  const label = `service_name="${serviceName}"`;
  const withExisting = promql.replace(/\{([^}]*)\}/g, `{$1,${label}}`);
  if (withExisting !== promql) return withExisting;
  return promql.replace(/([a-zA-Z_:][a-zA-Z0-9_:]*)(\[|$|\))/g, (match, metric, after) => {
    const functions = ["rate", "sum", "avg", "min", "max", "count", "histogram_quantile", "increase", "irate", "delta", "deriv", "predict_linear", "absent", "ceil", "floor", "round", "sort", "sort_desc", "label_replace", "label_join", "topk", "bottomk", "quantile"];
    if (functions.includes(metric)) return match;
    return `${metric}{${label}}${after}`;
  });
}
async function fetchUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1e4);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, status: 0, text: message };
  } finally {
    clearTimeout(timeout);
  }
}
async function handleQueryLogs(filter, options) {
  const isJson = options.json === true;
  const ctx = getServiceName();
  if (!ctx) return;
  const start = options.start ?? "5m";
  const query2 = buildLogsQuery(filter, ctx.serviceName, options.raw === true);
  const url = `${ctx.endpoints.logs}/select/logsql/query?query=${encodeURIComponent(query2)}&start=${encodeURIComponent(start)}`;
  const result = await fetchUrl(url);
  if (isJson) {
    jsonOutput({ query: query2, url, status: result.status, response: result.text });
  } else {
    if (!result.ok) {
      fail(`Query failed (HTTP ${result.status}): ${result.text}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.text);
  }
}
async function handleQueryMetrics(promql, options) {
  const isJson = options.json === true;
  const ctx = getServiceName();
  if (!ctx) return;
  const query2 = options.raw === true ? promql : injectServiceNameIntoPromQL(promql, ctx.serviceName);
  const url = `${ctx.endpoints.metrics}/api/v1/query?query=${encodeURIComponent(query2)}`;
  const result = await fetchUrl(url);
  if (isJson) {
    jsonOutput({ query: query2, url, status: result.status, response: result.text });
  } else {
    if (!result.ok) {
      fail(`Query failed (HTTP ${result.status}): ${result.text}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.text);
  }
}
async function handleQueryTraces(options) {
  const isJson = options.json === true;
  const ctx = getServiceName();
  if (!ctx) return;
  const limit = options.limit ?? "20";
  let url = `${ctx.endpoints.traces}/api/traces?service=${encodeURIComponent(ctx.serviceName)}&limit=${limit}`;
  if (options.operation) {
    url += `&operation=${encodeURIComponent(options.operation)}`;
  }
  if (options.minDuration) {
    url += `&minDuration=${encodeURIComponent(options.minDuration)}`;
  }
  const result = await fetchUrl(url);
  if (isJson) {
    jsonOutput({ service: ctx.serviceName, url, status: result.status, response: result.text });
  } else {
    if (!result.ok) {
      fail(`Query failed (HTTP ${result.status}): ${result.text}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.text);
  }
}
function registerQueryCommand(program) {
  const query2 = program.command("query").description("Query observability data (logs, metrics, traces) scoped to current project");
  query2.command("logs <filter>").description("Query logs with automatic service_name scoping").option("--start <duration>", "Time range (default: 5m)", "5m").option("--raw", "Skip automatic service_name filter").action(async (filter, opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await handleQueryLogs(filter, { ...opts, json: globalOpts.json });
  });
  query2.command("metrics <promql>").description("Query metrics with automatic service_name label injection").option("--raw", "Skip automatic service_name injection").action(async (promql, opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await handleQueryMetrics(promql, { ...opts, json: globalOpts.json });
  });
  query2.command("traces").description("Query traces for current project service").option("--limit <n>", "Number of traces to return (default: 20)", "20").option("--operation <name>", "Filter by operation name").option("--min-duration <duration>", "Minimum trace duration (e.g., 1s)").action(async (opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await handleQueryTraces({ ...opts, json: globalOpts.json });
  });
}

// src/commands/retro-import.ts
import { existsSync as existsSync17, readFileSync as readFileSync14 } from "fs";
import { join as join16 } from "path";

// src/lib/retro-parser.ts
var KNOWN_TOOLS = ["showboat", "ralph", "beads", "bmad"];
function parseRetroActionItems(content) {
  const lines = content.split("\n");
  const items = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inTable && /^\|\s*#\s*\|\s*Action\s*\|\s*Status\s*\|\s*Notes\s*\|/i.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\|[\s\-|]+\|$/.test(trimmed)) {
      continue;
    }
    if (inTable && trimmed.startsWith("|")) {
      const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length >= 4) {
        const number = cells[0];
        const description = cells[1];
        const status = cells[2];
        const notes = cells[3];
        if (/^[A-Za-z]\d+$/.test(number)) {
          items.push({ number, description, status, notes });
        }
      }
    }
    if (inTable && !trimmed.startsWith("|") && trimmed !== "") {
      inTable = false;
    }
  }
  return items;
}
function classifyFinding(item) {
  const text = item.description.toLowerCase();
  if (text.includes("harness") || text.includes("codeharness")) {
    return { type: "harness" };
  }
  for (const tool of KNOWN_TOOLS) {
    if (text.includes(tool)) {
      return { type: "tool", name: tool };
    }
  }
  return { type: "project" };
}
function derivePriority(item) {
  const statusLower = item.status.toLowerCase();
  const notesLower = item.notes.toLowerCase();
  if (statusLower.includes("regressed") || notesLower.includes("urgent") || notesLower.includes("critical")) {
    return 1;
  }
  return 2;
}
function classifyHeader(header) {
  const text = header.replace(/^#+\s*/, "").trim();
  const base = text.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
  if (base === "fix now") return "fix-now";
  if (base === "fix soon") return "fix-soon";
  if (base === "backlog") return "backlog";
  return null;
}
function parseRetroSections(content) {
  const lines = content.split("\n");
  const items = [];
  let currentSection = null;
  let inActionItems = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{2}\s+\d+\.\s*Action\s*Items/i.test(trimmed)) {
      inActionItems = true;
      continue;
    }
    if (inActionItems && /^#{2}\s+[^#]/.test(trimmed) && !/Action\s*Items/i.test(trimmed)) {
      break;
    }
    if (!inActionItems) continue;
    if (/^#{3,4}\s+/.test(trimmed)) {
      const section = classifyHeader(trimmed);
      currentSection = section;
      continue;
    }
    if (currentSection !== null) {
      const bulletMatch = trimmed.match(/^(?:-|\d+\.)\s+(.+)$/);
      if (bulletMatch) {
        items.push({ section: currentSection, text: bulletMatch[1].trim() });
      }
    }
  }
  return items;
}
function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 0);
}
function wordOverlap(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}
function isDuplicate(newItem, existingTitles, threshold = 0.8) {
  const newWords = normalizeText(newItem);
  for (const title of existingTitles) {
    const titleWords = normalizeText(title);
    if (wordOverlap(newWords, titleWords) >= threshold) {
      return { duplicate: true, matchedTitle: title };
    }
  }
  return { duplicate: false };
}

// src/lib/issue-tracker.ts
import { existsSync as existsSync16, readFileSync as readFileSync13, writeFileSync as writeFileSync5, mkdirSync as mkdirSync5 } from "fs";
import { join as join15 } from "path";
import { parse as parse4, stringify as stringify2 } from "yaml";
var VALID_PRIORITIES = /* @__PURE__ */ new Set([
  "low",
  "medium",
  "high",
  "critical"
]);
var ISSUES_REL_PATH = join15(".codeharness", "issues.yaml");
function issuesPath(dir) {
  return join15(dir, ISSUES_REL_PATH);
}
function readIssues(dir = process.cwd()) {
  const filePath = issuesPath(dir);
  if (!existsSync16(filePath)) {
    return { issues: [] };
  }
  const raw = readFileSync13(filePath, "utf-8");
  const parsed = parse4(raw);
  if (!parsed || !Array.isArray(parsed.issues)) {
    return { issues: [] };
  }
  return { issues: parsed.issues };
}
function writeIssues(data, dir = process.cwd()) {
  const filePath = issuesPath(dir);
  const dirPath = join15(dir, ".codeharness");
  if (!existsSync16(dirPath)) {
    mkdirSync5(dirPath, { recursive: true });
  }
  writeFileSync5(filePath, stringify2(data, { nullStr: "" }), "utf-8");
}
function nextIssueId(existing) {
  let max = 0;
  for (const issue of existing) {
    const match = issue.id.match(/^issue-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `issue-${String(max + 1).padStart(3, "0")}`;
}
function createIssue(title, options, dir) {
  const baseDir = dir ?? process.cwd();
  const priority = options?.priority ?? "medium";
  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error(`Invalid priority '${priority}'. Valid values: ${[...VALID_PRIORITIES].join(", ")}`);
  }
  const data = readIssues(baseDir);
  const issue = {
    id: nextIssueId(data.issues),
    title,
    source: options?.source ?? "manual",
    priority,
    status: "backlog",
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  data.issues.push(issue);
  writeIssues(data, baseDir);
  return issue;
}
function closeIssue(id, dir) {
  const baseDir = dir ?? process.cwd();
  const data = readIssues(baseDir);
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) {
    throw new Error(`Issue '${id}' not found`);
  }
  issue.status = "done";
  writeIssues(data, baseDir);
  return issue;
}

// src/lib/github.ts
import { execFileSync } from "child_process";
var GitHubError = class extends Error {
  constructor(command, originalMessage) {
    super(`GitHub CLI failed: ${originalMessage}. Command: ${command}`);
    this.command = command;
    this.originalMessage = originalMessage;
    this.name = "GitHubError";
  }
};
function isGhAvailable() {
  try {
    execFileSync("which", ["gh"], { stdio: "pipe", timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
function ghIssueCreate(repo, title, body, labels) {
  const args = ["issue", "create", "--repo", repo, "--title", title, "--body", body];
  for (const label of labels) {
    args.push("--label", label);
  }
  args.push("--json", "number,url");
  const cmdStr = `gh ${args.join(" ")}`;
  try {
    const output = execFileSync("gh", args, {
      stdio: "pipe",
      timeout: 3e4
    });
    const result = JSON.parse(output.toString().trim());
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GitHubError(cmdStr, message);
  }
}
function ghIssueSearch(repo, query2) {
  const args = ["issue", "list", "--repo", repo, "--search", query2, "--state", "all", "--json", "number,title,body,url,labels"];
  const cmdStr = `gh ${args.join(" ")}`;
  try {
    const output = execFileSync("gh", args, {
      stdio: "pipe",
      timeout: 3e4
    });
    const text = output.toString().trim();
    if (!text) return [];
    return JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GitHubError(cmdStr, message);
  }
}
function findExistingGhIssue(repo, gapId) {
  try {
    const issues = ghIssueSearch(repo, gapId);
    return issues.find((issue) => issue.body?.includes(gapId));
  } catch {
    return void 0;
  }
}
function getRepoFromRemote() {
  try {
    const output = execFileSync("git", ["remote", "get-url", "origin"], {
      stdio: "pipe",
      timeout: 5e3
    });
    const url = output.toString().trim();
    return parseRepoFromUrl(url);
  } catch {
    return void 0;
  }
}
function parseRepoFromUrl(url) {
  const sshMatch = url.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  return void 0;
}
function ensureLabels(repo, labels) {
  for (const label of labels) {
    try {
      execFileSync("gh", ["label", "create", label, "--repo", repo], {
        stdio: "pipe",
        timeout: 1e4
      });
    } catch {
    }
  }
}

// src/commands/retro-import.ts
var STORY_DIR2 = "_bmad-output/implementation-artifacts";
var MAX_TITLE_LENGTH = 120;
function classificationToString(c) {
  if (c.type === "tool") {
    return `tool:${c.name}`;
  }
  return c.type;
}
function registerRetroImportCommand(program) {
  program.command("retro-import").description("Import retrospective action items as GitHub issues").requiredOption("--epic <n>", "Epic number to import action items from").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    const root = process.cwd();
    const epicNum = parseInt(opts.epic, 10);
    if (isNaN(epicNum) || epicNum < 1) {
      fail(`Invalid epic number: ${opts.epic}`, { json: isJson });
      process.exitCode = 1;
      return;
    }
    const retroFile = `epic-${epicNum}-retrospective.md`;
    const retroPath = join16(root, STORY_DIR2, retroFile);
    if (!existsSync17(retroPath)) {
      fail(`Retro file not found: ${retroFile}`, { json: isJson });
      process.exitCode = 1;
      return;
    }
    let content;
    try {
      content = readFileSync14(retroPath, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`Failed to read retro file: ${message}`, { json: isJson });
      process.exitCode = 1;
      return;
    }
    let localResult;
    try {
      localResult = importToIssuesYaml(content, epicNum, root, isJson);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isJson) {
        warn(`Local issues.yaml import failed: ${message}`);
      }
      localResult = { imported: 0, skipped: 0, duplicates: 0, issues: [] };
    }
    const items = parseRetroActionItems(content);
    if (items.length === 0 && localResult.imported === 0 && localResult.skipped === 0 && localResult.duplicates === 0) {
      if (isJson) {
        jsonOutput({ imported: 0, skipped: 0, duplicates: 0, issues: [] });
      } else {
        info("No action items found in retro file");
      }
      return;
    }
    const issues = [];
    for (const item of items) {
      const classification = classifyFinding(item);
      const gapId = `[gap:retro:epic-${epicNum}-item-${item.number}]`;
      const title = item.description.length > MAX_TITLE_LENGTH ? item.description.slice(0, MAX_TITLE_LENGTH - 3) + "..." : item.description;
      const issueRecord = {
        number: item.number,
        title,
        gapId,
        classification: classificationToString(classification),
        created: false,
        status: item.status,
        notes: item.notes
      };
      issues.push(issueRecord);
      if (!isJson) {
        info(`Parsed: ${title}`);
      }
    }
    const githubResult = createGitHubIssues(issues, epicNum, isJson);
    if (isJson) {
      jsonOutput({
        imported: localResult.imported,
        skipped: localResult.skipped,
        duplicates: localResult.duplicates,
        issues: localResult.issues,
        github: githubResult
      });
    } else if (localResult.imported > 0 || localResult.duplicates > 0 || localResult.skipped > 0) {
      info(`Summary: ${localResult.imported} imported, ${localResult.skipped} skipped, ${localResult.duplicates} duplicates`);
    }
  });
}
function importToIssuesYaml(content, epicNum, dir, isJson) {
  const source = `retro-epic-${epicNum}`;
  const result = { imported: 0, skipped: 0, duplicates: 0, issues: [] };
  const existingIssues = readIssues(dir);
  const existingTitles = existingIssues.issues.map((i) => i.title);
  const sectionItems = parseRetroSections(content);
  const actionableSections = sectionItems.filter((i) => i.section !== "backlog");
  const backlogSections = sectionItems.filter((i) => i.section === "backlog");
  if (actionableSections.length > 0 || backlogSections.length > 0) {
    for (const item of backlogSections) {
      result.skipped++;
      if (!isJson) {
        info(`Skipped (backlog \u2014 non-actionable): ${item.text}`);
      }
    }
    for (const item of actionableSections) {
      const priority = item.section === "fix-now" ? "high" : "medium";
      const dupCheck = isDuplicate(item.text, existingTitles);
      if (dupCheck.duplicate) {
        result.duplicates++;
        if (!isJson) {
          info(`Skipped (duplicate of "${dupCheck.matchedTitle}"): ${item.text}`);
        }
        continue;
      }
      const issue = createIssue(item.text, { priority, source }, dir);
      existingTitles.push(issue.title);
      result.imported++;
      result.issues.push({ id: issue.id, title: issue.title, source: issue.source, priority: issue.priority });
      if (!isJson) {
        ok(`Imported [${issue.id}] (${priority}): ${item.text}`);
      }
    }
    return result;
  }
  const tableItems = parseRetroActionItems(content);
  if (tableItems.length === 0) {
    return result;
  }
  for (const item of tableItems) {
    const priorityNum = derivePriority(item);
    const priority = priorityNum === 1 ? "high" : "medium";
    const dupCheck = isDuplicate(item.description, existingTitles);
    if (dupCheck.duplicate) {
      result.duplicates++;
      if (!isJson) {
        info(`Skipped (duplicate of "${dupCheck.matchedTitle}"): ${item.description}`);
      }
      continue;
    }
    const issue = createIssue(item.description, { priority, source }, dir);
    existingTitles.push(issue.title);
    result.imported++;
    result.issues.push({ id: issue.id, title: issue.title, source: issue.source, priority: issue.priority });
    if (!isJson) {
      ok(`Imported [${issue.id}] (${priority}): ${item.description}`);
    }
  }
  return result;
}
function resolveTargetRepo(classification, targets) {
  if (targets.length === 0) return void 0;
  if (classification === "harness") {
    const explicit = targets.find((t) => t.repo === "iVintik/codeharness");
    if (explicit) return explicit;
    const nonAuto = targets.find((t) => t.repo !== "auto");
    if (nonAuto) return nonAuto;
    return targets[0];
  }
  const auto = targets.find((t) => t.repo === "auto");
  if (auto) return auto;
  return targets[0];
}
function buildGitHubIssueBody(item, epicNum, projectName) {
  return `## Retro Action Item ${item.number} \u2014 Epic ${epicNum}

**Source project:** ${projectName}
**Classification:** ${item.classification}
**Original status:** ${item.status}
**Notes:** ${item.notes}

${item.title}

<!-- gap-id: ${item.gapId} -->`;
}
function createGitHubIssues(issues, epicNum, isJson) {
  let targets;
  try {
    const state = readState();
    targets = state.retro_issue_targets;
  } catch (err) {
    if (err instanceof StateFileNotFoundError) {
      if (!isJson) {
        info("No state file found \u2014 skipping GitHub issues");
      }
      return void 0;
    }
    if (!isJson) {
      info("Could not read state file \u2014 skipping GitHub issues");
    }
    return void 0;
  }
  if (!targets || targets.length === 0) {
    if (!isJson) {
      info("No retro_issue_targets configured \u2014 skipping GitHub issues");
    }
    return void 0;
  }
  if (!isGhAvailable()) {
    if (!isJson) {
      warn("gh CLI not available \u2014 skipping GitHub issue creation");
    }
    return void 0;
  }
  const resolvedAutoRepo = getRepoFromRemote();
  const result = { created: 0, skipped: 0, errors: 0 };
  const projectName = resolvedAutoRepo ?? "unknown";
  for (const item of issues) {
    const target = resolveTargetRepo(item.classification, targets);
    if (!target) continue;
    const repo = target.repo === "auto" ? resolvedAutoRepo : target.repo;
    if (!repo) {
      if (!isJson) {
        warn(`Cannot resolve repo for ${item.number} \u2014 git remote not detected`);
      }
      result.errors++;
      continue;
    }
    try {
      const existing = findExistingGhIssue(repo, item.gapId);
      if (existing) {
        if (!isJson) {
          info(`GitHub issue exists: ${repo}#${existing.number}`);
        }
        result.skipped++;
        continue;
      }
      ensureLabels(repo, target.labels);
      const body = buildGitHubIssueBody(item, epicNum, projectName);
      const created = ghIssueCreate(repo, item.title, body, target.labels);
      if (!isJson) {
        ok(`GitHub issue created: ${repo}#${created.number}`);
      }
      result.created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isJson) {
        fail(`GitHub issue failed for ${item.number}: ${message}`);
      }
      result.errors++;
    }
  }
  return result;
}

// src/commands/github-import.ts
var MAX_TITLE_LENGTH2 = 120;
function mapLabelsToType(labels) {
  if (!labels) return "task";
  const names = labels.map((l) => l.name);
  if (names.includes("bug")) return "bug";
  if (names.includes("enhancement")) return "story";
  return "task";
}
function registerGithubImportCommand(program) {
  program.command("github-import").description("Import GitHub issues labeled for sprint planning").option("--repo <owner/repo>", "GitHub repository (auto-detected from git remote if omitted)").option("--label <label>", "GitHub label to filter issues by", "sprint-candidate").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    if (!isGhAvailable()) {
      fail("gh CLI not found. Install: https://cli.github.com/", { json: isJson });
      process.exitCode = 1;
      return;
    }
    let repo = opts.repo;
    if (!repo) {
      repo = getRepoFromRemote();
    }
    if (!repo) {
      fail("Cannot detect repo. Use --repo owner/repo", { json: isJson });
      process.exitCode = 1;
      return;
    }
    const label = opts.label;
    let ghIssues;
    try {
      ghIssues = ghIssueSearch(repo, `label:${label}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(`Failed to search GitHub issues: ${message}`, { json: isJson });
      process.exitCode = 1;
      return;
    }
    const imported = 0;
    const skipped = 0;
    const errors = 0;
    const issues = [];
    for (const ghIssue of ghIssues) {
      const gapId = `[gap:source:github:${repo}#${ghIssue.number}]`;
      const type = mapLabelsToType(ghIssue.labels);
      const title = ghIssue.title.length > MAX_TITLE_LENGTH2 ? ghIssue.title.slice(0, MAX_TITLE_LENGTH2 - 3) + "..." : ghIssue.title;
      const issueRecord = {
        number: ghIssue.number,
        title,
        gapId,
        type,
        created: false
      };
      issues.push(issueRecord);
      if (!isJson) {
        info(`Parsed: ${repo}#${ghIssue.number} \u2014 ${title}`);
      }
    }
    if (isJson) {
      jsonOutput({
        imported,
        skipped,
        errors,
        issues
      });
    } else if (ghIssues.length > 0) {
      info(`Summary: ${ghIssues.length} issues found, ${imported} imported (beads removed \u2014 Epic 8)`);
    }
  });
}

// src/commands/verify-env.ts
function registerVerifyEnvCommand(program) {
  const verifyEnv = program.command("verify-env").description("Manage verification environment (Docker image + clean workspace)");
  verifyEnv.command("build").description("Build the verification Docker image from project artifacts").action((_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    try {
      const result = buildVerifyImage();
      if (isJson) {
        jsonOutput({
          status: "ok",
          imageTag: result.imageTag,
          imageSize: result.imageSize,
          buildTimeMs: result.buildTimeMs,
          cached: result.cached
        });
      } else {
        if (result.cached) {
          ok(`Image ${result.imageTag}: up to date (cached)`);
        } else {
          ok(`Image ${result.imageTag}: built in ${result.buildTimeMs}ms (${result.imageSize})`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        jsonOutput({ status: "fail", message });
      } else {
        fail(message);
      }
      process.exitCode = 1;
    }
  });
  verifyEnv.command("prepare").description("Create a clean temp workspace for verification").requiredOption("--story <key>", "Story key (e.g., 13-1-verification-dockerfile-generator)").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    try {
      const workspace = prepareVerifyWorkspace(opts.story);
      if (isJson) {
        jsonOutput({ status: "ok", workspace, storyKey: opts.story });
      } else {
        ok(`Workspace prepared: ${workspace}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        jsonOutput({ status: "fail", message });
      } else {
        fail(message);
      }
      process.exitCode = 1;
    }
  });
  verifyEnv.command("check").description("Validate verification environment (image, CLI, observability)").action((_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    const result = checkVerifyEnv();
    const allPassed = result.imageExists && result.cliWorks && result.otelReachable;
    if (isJson) {
      const jsonResult = {
        status: allPassed ? "ok" : "fail",
        imageExists: result.imageExists,
        cliWorks: result.cliWorks,
        otelReachable: result.otelReachable
      };
      if (result.imageExists && !result.cliWorks) {
        jsonResult.message = "CLI does not work inside verification container \u2014 build or packaging is broken";
      }
      jsonOutput(jsonResult);
    } else {
      info(`Image exists: ${result.imageExists ? "yes" : "no"}`);
      info(`CLI works in container: ${result.cliWorks ? "yes" : "no"}`);
      info(`OTEL endpoints reachable: ${result.otelReachable ? "yes" : "no"}`);
      if (allPassed) {
        ok("Verification environment: ready");
      } else {
        fail("Verification environment: not ready");
        if (!result.imageExists) {
          info("Run: codeharness verify-env build");
        }
        if (result.imageExists && !result.cliWorks) {
          fail("CLI does not work inside verification container \u2014 build or packaging is broken");
        }
        if (!result.otelReachable) {
          info("Run: codeharness stack start");
        }
      }
    }
    if (!allPassed) {
      process.exitCode = 1;
    }
  });
  verifyEnv.command("cleanup").description("Remove temp workspace and stop/remove container for a story").requiredOption("--story <key>", "Story key (e.g., 13-1-verification-dockerfile-generator)").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json === true;
    try {
      cleanupVerifyEnv(opts.story);
      if (isJson) {
        jsonOutput({ status: "ok", storyKey: opts.story, message: "Cleanup complete" });
      } else {
        ok(`Cleanup complete for story: ${opts.story}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        jsonOutput({ status: "fail", message });
      } else {
        fail(message);
      }
      process.exitCode = 1;
    }
  });
}

// src/commands/timeout-report.ts
function registerTimeoutReportCommand(program) {
  program.command("timeout-report").description("Capture diagnostic data from a timed-out iteration").requiredOption("--story <key>", "Story key").requiredOption("--iteration <n>", "Iteration number").requiredOption("--duration <minutes>", "Timeout duration in minutes").requiredOption("--output-file <path>", "Path to iteration output log").requiredOption("--state-snapshot <path>", "Path to pre-iteration state snapshot").action((options, cmd) => {
    const opts = cmd.optsWithGlobals();
    const isJson = opts.json === true;
    const iteration = parseInt(options.iteration, 10);
    const duration = parseInt(options.duration, 10);
    if (isNaN(iteration) || isNaN(duration)) {
      if (isJson) {
        jsonOutput({ status: "fail", message: "iteration and duration must be numbers" });
      } else {
        fail("iteration and duration must be numbers");
      }
      process.exitCode = 1;
      return;
    }
    const result = captureTimeoutReport({
      storyKey: options.story,
      iteration,
      durationMinutes: duration,
      outputFile: options.outputFile,
      stateSnapshotPath: options.stateSnapshot
    });
    if (!result.success) {
      if (isJson) {
        jsonOutput({ status: "fail", message: result.error });
      } else {
        fail(result.error);
      }
      process.exitCode = 1;
      return;
    }
    if (isJson) {
      jsonOutput({
        status: "ok",
        reportPath: result.data.filePath,
        storyKey: result.data.capture.storyKey,
        iteration: result.data.capture.iteration
      });
    } else {
      ok(`Timeout report written: ${result.data.filePath}`);
    }
  });
}

// src/commands/validate-state.ts
import { resolve as resolve3 } from "path";
function registerValidateStateCommand(program) {
  program.command("validate-state").description("Validate sprint-state.json consistency against sprint-status.yaml").option("--state <path>", "Path to sprint-state.json", "sprint-state.json").option("--sprint-status <path>", "Path to sprint-status.yaml", "sprint-status.yaml").action((options, cmd) => {
    const opts = cmd.optsWithGlobals();
    const isJson = opts.json === true;
    const statePath = resolve3(process.cwd(), options.state);
    const sprintStatusPath = resolve3(process.cwd(), options.sprintStatus);
    const result = validateStateConsistency(statePath, sprintStatusPath);
    if (!result.success) {
      if (isJson) {
        jsonOutput({ status: "fail", message: result.error });
      } else {
        fail(result.error);
      }
      process.exitCode = 1;
      return;
    }
    const report = result.data;
    if (isJson) {
      jsonOutput({
        status: report.invalidCount === 0 ? "ok" : "fail",
        totalStories: report.totalStories,
        validCount: report.validCount,
        invalidCount: report.invalidCount,
        missingKeys: report.missingKeys,
        issues: report.issues
      });
    } else {
      console.log(`Total stories: ${report.totalStories}`);
      console.log(`Valid: ${report.validCount}`);
      console.log(`Invalid: ${report.invalidCount}`);
      if (report.missingKeys.length > 0) {
        console.log(`Missing keys: ${report.missingKeys.join(", ")}`);
      }
      for (const issue of report.issues) {
        console.log(`  [${issue.storyKey}] ${issue.field}: ${issue.message}`);
      }
      if (report.invalidCount === 0) {
        ok("All stories valid");
      } else {
        fail(`${report.invalidCount} story/stories have issues`);
      }
    }
    process.exitCode = report.invalidCount === 0 ? 0 : 1;
  });
}

// src/commands/validate-schema.ts
import { readdirSync as readdirSync3, existsSync as existsSync18 } from "fs";
import { join as join17, resolve as resolve4, isAbsolute } from "path";
function renderSchemaResult(result, isJson) {
  if (isJson) {
    jsonOutput(result);
    process.exitCode = result.status === "pass" ? 0 : 1;
    return;
  }
  for (const file of result.files) {
    if (file.valid) {
      ok(`Schema: ${file.path}`);
    } else {
      fail(`Schema: ${file.path}`);
      for (const error of file.errors) {
        process.stderr.write(`  ${error.path}: ${error.message}
`);
      }
    }
  }
  process.exitCode = result.status === "pass" ? 0 : 1;
}
function runSchemaValidationOnFile(filePath) {
  const absPath = isAbsolute(filePath) ? filePath : resolve4(process.cwd(), filePath);
  try {
    parseWorkflow(absPath);
    return { status: "pass", files: [{ path: absPath, valid: true, errors: [] }] };
  } catch (err) {
    if (err instanceof WorkflowParseError) {
      return { status: "fail", files: [{ path: absPath, valid: false, errors: err.errors }] };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "fail", files: [{ path: absPath, valid: false, errors: [{ path: absPath, message: msg }] }] };
  }
}
function runSchemaValidation(projectDir) {
  const workflowsDir = join17(projectDir, ".codeharness", "workflows");
  if (!existsSync18(workflowsDir)) {
    return {
      status: "fail",
      files: [{
        path: workflowsDir,
        valid: false,
        errors: [{ path: workflowsDir, message: "No workflow files found" }]
      }]
    };
  }
  let entries;
  try {
    entries = readdirSync3(workflowsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    return {
      status: "fail",
      files: [{
        path: workflowsDir,
        valid: false,
        errors: [{ path: workflowsDir, message: "No workflow files found" }]
      }]
    };
  }
  const fileResults = [];
  let allValid = true;
  for (const entry of entries) {
    const filePath = resolve4(workflowsDir, entry);
    try {
      parseWorkflow(filePath);
      fileResults.push({ path: filePath, valid: true, errors: [] });
    } catch (err) {
      allValid = false;
      if (err instanceof WorkflowParseError) {
        fileResults.push({ path: filePath, valid: false, errors: err.errors });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        fileResults.push({ path: filePath, valid: false, errors: [{ path: filePath, message: msg }] });
      }
    }
  }
  return { status: allValid ? "pass" : "fail", files: fileResults };
}
function registerValidateSchemaCommand(parent) {
  parent.command("schema [file]").description("Validate workflow YAML files against JSON schemas. Pass a file path to validate a single file.").action((file, _opts, cmd) => {
    const isJson = cmd.optsWithGlobals().json === true;
    const result = file ? runSchemaValidationOnFile(file) : runSchemaValidation(process.cwd());
    renderSchemaResult(result, isJson);
  });
}

// src/commands/validate-self.ts
function registerValidateSelfCommand(parent) {
  parent.command("self").description("Run self-validation cycle and produce release gate report").option("--ci", "CI mode: minimal output, exit code 0 on pass / 1 on fail").action((options, cmd) => {
    const isJson = cmd.optsWithGlobals().json === true;
    const isCi = options.ci === true;
    const initResult = createValidationSprint();
    if (!initResult.success) {
      reportError(initResult.error, isJson);
      return;
    }
    let cycles = 0;
    let cycle;
    do {
      cycle = runValidationCycle();
      if (!cycle.success) {
        reportError(cycle.error, isJson);
        return;
      }
      if (cycle.data.action !== "no-actionable-ac") cycles++;
    } while (cycle.data.action !== "no-actionable-ac");
    const progressResult = getValidationProgress();
    if (!progressResult.success) {
      reportError(progressResult.error, isJson);
      return;
    }
    const p2 = progressResult.data;
    const allPassed = p2.failed === 0 && p2.remaining === 0;
    if (isJson) outputJson(p2, cycles, allPassed);
    else if (isCi) outputCi(p2, allPassed);
    else outputHuman(p2, cycles, allPassed);
    process.exitCode = allPassed ? 0 : 1;
  });
}
function reportError(msg, isJson) {
  if (isJson) jsonOutput({ status: "fail", message: msg });
  else fail(msg);
  process.exitCode = 1;
}
function getFailures(p2) {
  return p2.perAC.filter((a) => a.status === "failed" || a.status === "blocked").map((a) => {
    const ac = getACById(a.acId);
    return {
      acId: a.acId,
      description: ac?.description ?? "unknown",
      command: ac?.command,
      output: a.lastError ?? "",
      attempts: a.attempts,
      blocker: a.status === "blocked" ? "blocked" : "failed"
    };
  });
}
function outputJson(p2, cycles, allPassed) {
  jsonOutput({
    status: allPassed ? "pass" : "fail",
    total: p2.total,
    passed: p2.passed,
    failed: p2.failed,
    blocked: p2.blocked,
    remaining: p2.remaining,
    cycles,
    gate: allPassed ? "RELEASE GATE: PASS -- v1.0 ready" : "RELEASE GATE: FAIL",
    failures: getFailures(p2)
  });
}
function outputCi(p2, allPassed) {
  if (allPassed) console.log("RELEASE GATE: PASS -- v1.0 ready");
  else console.log(`RELEASE GATE: FAIL (${p2.passed}/${p2.total} passed, ${p2.failed} failed, ${p2.blocked} blocked)`);
}
function outputHuman(p2, cycles, allPassed) {
  console.log(`Total: ${p2.total} | Passed: ${p2.passed} | Failed: ${p2.failed} | Blocked: ${p2.blocked} | Cycles: ${cycles}`);
  if (allPassed) {
    ok("RELEASE GATE: PASS -- v1.0 ready");
    return;
  }
  for (const f of getFailures(p2)) {
    console.log(`  AC ${f.acId}: ${f.description}`);
    if (f.command) console.log(`    Command: ${f.command}`);
    if (f.output) console.log(`    Output: ${f.output}`);
    console.log(`    Attempts: ${f.attempts}`);
    console.log(`    Blocker: ${f.blocker}`);
  }
  fail("RELEASE GATE: FAIL");
}

// src/commands/validate.ts
function registerValidateCommand(program) {
  const validateCmd = program.command("validate [file]").description("Validate workflow YAML files (default) or run self-validation. Pass a file path to validate a single file.").action((file, _opts, cmd) => {
    const isJson = cmd.optsWithGlobals().json === true;
    const result = file ? runSchemaValidationOnFile(file) : runSchemaValidation(process.cwd());
    renderSchemaResult(result, isJson);
  });
  registerValidateSchemaCommand(validateCmd);
  registerValidateSelfCommand(validateCmd);
}

// src/commands/progress.ts
function registerProgressCommand(program) {
  program.command("progress").description("Update live run progress in sprint-state.json").option("--story <key>", "Set run.currentStory").option("--phase <phase>", "Set run.currentPhase (create|dev|review|verify)").option("--action <text>", "Set run.lastAction").option("--ac-progress <progress>", 'Set run.acProgress (e.g., "4/12")').option("--clear", "Clear all run progress fields to null").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = globalOpts.json;
    const validPhases = ["create", "dev", "review", "verify"];
    if (opts.phase !== void 0 && !validPhases.includes(opts.phase)) {
      fail(`Invalid phase "${opts.phase}". Must be one of: ${validPhases.join(", ")}`, { json: isJson });
      process.exitCode = 1;
      return;
    }
    if (opts.clear) {
      const result2 = clearRunProgress();
      if (result2.success) {
        if (isJson) {
          jsonOutput({ status: "ok", cleared: true });
        } else {
          ok("Run progress cleared");
        }
      } else {
        fail(result2.error, { json: isJson });
        process.exitCode = 1;
      }
      return;
    }
    const update = {
      ...opts.story !== void 0 && { currentStory: opts.story },
      ...opts.phase !== void 0 && { currentPhase: opts.phase },
      ...opts.action !== void 0 && { lastAction: opts.action },
      ...opts.acProgress !== void 0 && { acProgress: opts.acProgress }
    };
    if (Object.keys(update).length === 0) {
      fail("No progress fields specified. Use --story, --phase, --action, --ac-progress, or --clear.", { json: isJson });
      process.exitCode = 1;
      return;
    }
    const result = updateRunProgress(update);
    if (result.success) {
      if (isJson) {
        jsonOutput({ status: "ok", updated: update });
      } else {
        ok("Run progress updated");
      }
    } else {
      fail(result.error, { json: isJson });
      process.exitCode = 1;
    }
  });
}

// src/commands/observability-gate.ts
function registerObservabilityGateCommand(program) {
  program.command("observability-gate").description("Check observability coverage against targets (commit gate)").option("--json", "Machine-readable JSON output").option("--min-static <percent>", "Override static coverage target").option("--min-runtime <percent>", "Override runtime coverage target").action((opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = opts.json === true || globalOpts.json === true;
    const root = process.cwd();
    const overrides = {};
    if (opts.minStatic !== void 0) {
      const parsed = parseInt(opts.minStatic, 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        if (isJson) {
          jsonOutput({ status: "error", message: "--min-static must be a number between 0 and 100" });
        } else {
          fail("--min-static must be a number between 0 and 100");
        }
        process.exitCode = 1;
        return;
      }
      overrides.staticTarget = parsed;
    }
    if (opts.minRuntime !== void 0) {
      const parsed = parseInt(opts.minRuntime, 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        if (isJson) {
          jsonOutput({ status: "error", message: "--min-runtime must be a number between 0 and 100" });
        } else {
          fail("--min-runtime must be a number between 0 and 100");
        }
        process.exitCode = 1;
        return;
      }
      overrides.runtimeTarget = parsed;
    }
    const result = checkObservabilityCoverageGate(root, overrides);
    if (!result.success) {
      if (isJson) {
        jsonOutput({ status: "error", message: result.error });
      } else {
        fail(`Observability gate error: ${result.error}`);
      }
      process.exitCode = 1;
      return;
    }
    const gate = result.data;
    if (isJson) {
      jsonOutput({
        status: gate.passed ? "pass" : "fail",
        passed: gate.passed,
        static: {
          current: gate.staticResult.current,
          target: gate.staticResult.target,
          met: gate.staticResult.met,
          gap: gate.staticResult.gap
        },
        runtime: gate.runtimeResult ? {
          current: gate.runtimeResult.current,
          target: gate.runtimeResult.target,
          met: gate.runtimeResult.met,
          gap: gate.runtimeResult.gap
        } : null,
        gaps: gate.gapSummary.map((g) => ({
          file: g.file,
          line: g.line,
          type: g.type,
          description: g.description
        }))
      });
    } else {
      const staticLine = `Static: ${gate.staticResult.current}% / ${gate.staticResult.target}% target`;
      if (gate.passed) {
        ok(`Observability gate passed. ${staticLine}`);
        if (gate.runtimeResult) {
          ok(`Runtime: ${gate.runtimeResult.current}% / ${gate.runtimeResult.target}% target`);
        }
      } else {
        fail(`Observability gate failed. ${staticLine}`);
        if (gate.runtimeResult && !gate.runtimeResult.met) {
          fail(`Runtime: ${gate.runtimeResult.current}% / ${gate.runtimeResult.target}% target`);
        }
        if (gate.gapSummary.length > 0) {
          fail("Gaps:");
          const shown = gate.gapSummary.slice(0, 5);
          for (const g of shown) {
            fail(`  ${g.file}:${g.line} \u2014 ${g.description}`);
          }
          if (gate.gapSummary.length > 5) {
            fail(`  ... and ${gate.gapSummary.length - 5} more.`);
          }
        }
        fail("Add logging to flagged functions. Run: codeharness observability-gate for details.");
      }
    }
    if (!gate.passed) {
      process.exitCode = 1;
    }
  });
}

// src/commands/audit.ts
function registerAuditCommand(program) {
  program.command("audit").description("Check all compliance dimensions and report project health").option("--json", "Output in machine-readable JSON format").option("--fix", "Generate fix stories for every gap found").action(async (opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = opts.json === true || globalOpts.json === true;
    const isFix = opts.fix === true;
    await executeAudit({ isJson, isFix });
  });
}

// src/commands/stats.ts
import { existsSync as existsSync19, readdirSync as readdirSync4, readFileSync as readFileSync15, writeFileSync as writeFileSync6 } from "fs";
import { join as join18 } from "path";
var RATES = {
  input: 15,
  output: 75,
  cacheRead: 1.5,
  cacheWrite: 18.75
};
function emptyBucket() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
}
function bucketCost(b) {
  return (b.input * RATES.input + b.output * RATES.output + b.cacheRead * RATES.cacheRead + b.cacheWrite * RATES.cacheWrite) / 1e6;
}
function addToBucket(target, input, output, cacheRead, cacheWrite) {
  target.input += input;
  target.output += output;
  target.cacheRead += cacheRead;
  target.cacheWrite += cacheWrite;
  target.calls += 1;
}
function parseLogFile(filePath, report) {
  const basename = filePath.split("/").pop() ?? "";
  const dateMatch = basename.match(/(\d{4}-\d{2}-\d{2})/);
  const _date = dateMatch ? dateMatch[1] : "unknown";
  let currentPhase = "orchestrator";
  let currentStory = "unknown";
  let currentTool = "";
  let msgInput = 0;
  let msgOutput = 0;
  let msgCacheRead = 0;
  let msgCacheWrite = 0;
  const content = readFileSync15(filePath, "utf-8");
  for (const line of content.split("\n")) {
    if (!line.startsWith("{")) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const typ = d.type;
    if (typ === "stream_event") {
      const evt = d.event;
      if (!evt) continue;
      const evtType = evt.type;
      if (evtType === "message_start") {
        if (msgInput + msgOutput + msgCacheRead + msgCacheWrite > 0) {
          report.messages.push({ input: msgInput, output: msgOutput, cacheRead: msgCacheRead, cacheWrite: msgCacheWrite, phase: currentPhase, story: currentStory, tool: currentTool });
        }
        const usage = evt.message?.usage ?? {};
        msgInput = usage.input_tokens ?? 0;
        msgCacheRead = usage.cache_read_input_tokens ?? 0;
        msgCacheWrite = usage.cache_creation_input_tokens ?? 0;
        msgOutput = 0;
      } else if (evtType === "message_delta") {
        const usage = evt.usage ?? {};
        msgOutput += usage.output_tokens ?? 0;
      } else if (evtType === "content_block_start") {
        const cb = evt.content_block;
        if (cb?.type === "tool_use") currentTool = cb.name ?? "";
      } else if (evtType === "content_block_delta") {
        const text = evt.delta?.text ?? "";
        if (text.includes("Step 3a") || text.toLowerCase().includes("create-story")) currentPhase = "create-story";
        else if (text.includes("Step 3b") || text.toLowerCase().includes("dev-story")) currentPhase = "dev-story";
        else if (text.includes("Step 3c") || text.toLowerCase().includes("code-review") || text.toLowerCase().includes("code review")) currentPhase = "code-review";
        else if (text.includes("Step 3d") || text.toLowerCase().includes("verif")) currentPhase = "verify";
        else if (text.includes("Step 8") || text.toLowerCase().includes("retro")) currentPhase = "retro";
        const sm = text.match(/(\d+-\d+-[a-z][\w-]*)/);
        if (sm) currentStory = sm[1];
      }
    }
    if (typ === "system" && d.subtype === "task_started") {
      const desc = (d.description ?? "").toLowerCase();
      if (desc.includes("code review") || desc.includes("code-review")) currentPhase = "code-review";
      else if (desc.includes("dev-story") || desc.includes("dev story") || desc.includes("implement")) currentPhase = "dev-story";
      else if (desc.includes("create-story") || desc.includes("create story")) currentPhase = "create-story";
      else if (desc.includes("verif")) currentPhase = "verify";
      else if (desc.includes("retro")) currentPhase = "retro";
    }
  }
  if (msgInput + msgOutput + msgCacheRead + msgCacheWrite > 0) {
    report.messages.push({ input: msgInput, output: msgOutput, cacheRead: msgCacheRead, cacheWrite: msgCacheWrite, phase: currentPhase, story: currentStory, tool: currentTool });
  }
}
function generateReport2(projectDir, logsDir) {
  const ralphLogs = join18(projectDir, "ralph", "logs");
  const sessionLogs = join18(projectDir, "session-logs");
  const resolvedLogsDir = logsDir ?? (existsSync19(ralphLogs) ? ralphLogs : sessionLogs);
  const logFiles = readdirSync4(resolvedLogsDir).filter((f) => f.endsWith(".log")).sort().map((f) => join18(resolvedLogsDir, f));
  const report = {
    byPhase: /* @__PURE__ */ new Map(),
    byStory: /* @__PURE__ */ new Map(),
    byTool: /* @__PURE__ */ new Map(),
    byDate: /* @__PURE__ */ new Map(),
    messages: []
  };
  for (const logFile of logFiles) {
    parseLogFile(logFile, report);
  }
  const byPhase = {};
  const byStory = {};
  const byTool = {};
  const total = emptyBucket();
  for (const msg of report.messages) {
    if (!byPhase[msg.phase]) byPhase[msg.phase] = emptyBucket();
    addToBucket(byPhase[msg.phase], msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
    if (!byStory[msg.story]) byStory[msg.story] = emptyBucket();
    addToBucket(byStory[msg.story], msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
    if (msg.tool) {
      if (!byTool[msg.tool]) byTool[msg.tool] = emptyBucket();
      addToBucket(byTool[msg.tool], msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
    }
    addToBucket(total, msg.input, msg.output, msg.cacheRead, msg.cacheWrite);
  }
  const storyKeys = Object.keys(byStory).filter((k) => /^\d+-\d+-/.test(k));
  const totalCost = bucketCost(total);
  const avgCostPerStory = storyKeys.length > 0 ? storyKeys.reduce((sum, k) => sum + bucketCost(byStory[k]), 0) / storyKeys.length : 0;
  return {
    totalCost,
    totalCalls: report.messages.length,
    byPhase,
    byStory,
    byTool,
    byDate: {},
    tokenBreakdown: total,
    avgCostPerStory,
    storiesTracked: storyKeys.length
  };
}
function formatReport(report) {
  const lines = [];
  lines.push("# Harness Cost Report");
  lines.push("");
  lines.push(`Total API-equivalent cost: $${report.totalCost.toFixed(2)}`);
  lines.push(`Total API calls: ${report.totalCalls}`);
  lines.push(`Average cost per story: $${report.avgCostPerStory.toFixed(2)} (${report.storiesTracked} stories)`);
  lines.push("");
  const tb = report.tokenBreakdown;
  lines.push("## Cost by Token Type");
  lines.push("");
  lines.push(`| Type | Tokens | Rate | Cost | % |`);
  lines.push(`|------|--------|------|------|---|`);
  const crCost = tb.cacheRead * RATES.cacheRead / 1e6;
  const cwCost = tb.cacheWrite * RATES.cacheWrite / 1e6;
  const outCost = tb.output * RATES.output / 1e6;
  const inpCost = tb.input * RATES.input / 1e6;
  lines.push(`| Cache reads | ${tb.cacheRead.toLocaleString()} | $1.50/MTok | $${crCost.toFixed(2)} | ${(crCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push(`| Cache writes | ${tb.cacheWrite.toLocaleString()} | $18.75/MTok | $${cwCost.toFixed(2)} | ${(cwCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push(`| Output | ${tb.output.toLocaleString()} | $75/MTok | $${outCost.toFixed(2)} | ${(outCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push(`| Input | ${tb.input.toLocaleString()} | $15/MTok | $${inpCost.toFixed(2)} | ${(inpCost / report.totalCost * 100).toFixed(0)}% |`);
  lines.push("");
  lines.push("## Cost by Phase");
  lines.push("");
  lines.push(`| Phase | Calls | Cost | % |`);
  lines.push(`|-------|-------|------|---|`);
  const sortedPhases = Object.entries(report.byPhase).sort((a, b) => bucketCost(b[1]) - bucketCost(a[1]));
  for (const [phase, bucket] of sortedPhases) {
    const c = bucketCost(bucket);
    lines.push(`| ${phase} | ${bucket.calls} | $${c.toFixed(2)} | ${(c / report.totalCost * 100).toFixed(1)}% |`);
  }
  lines.push("");
  lines.push("## Cost by Tool");
  lines.push("");
  lines.push(`| Tool | Calls | Cost | % |`);
  lines.push(`|------|-------|------|---|`);
  const sortedTools = Object.entries(report.byTool).sort((a, b) => bucketCost(b[1]) - bucketCost(a[1]));
  for (const [tool, bucket] of sortedTools.slice(0, 10)) {
    const c = bucketCost(bucket);
    lines.push(`| ${tool} | ${bucket.calls} | $${c.toFixed(2)} | ${(c / report.totalCost * 100).toFixed(1)}% |`);
  }
  lines.push("");
  lines.push("## Top 10 Most Expensive Stories");
  lines.push("");
  lines.push(`| Story | Calls | Cost | % |`);
  lines.push(`|-------|-------|------|---|`);
  const sortedStories = Object.entries(report.byStory).sort((a, b) => bucketCost(b[1]) - bucketCost(a[1]));
  for (const [story, bucket] of sortedStories.slice(0, 10)) {
    const c = bucketCost(bucket);
    lines.push(`| ${story} | ${bucket.calls} | $${c.toFixed(2)} | ${(c / report.totalCost * 100).toFixed(1)}% |`);
  }
  return lines.join("\n");
}
function registerStatsCommand(program) {
  program.command("stats").description("Analyze token consumption and cost from session logs").option("--save", "Save report to _bmad-output/implementation-artifacts/cost-report.md").option("--logs-dir <path>", "Path to session logs directory (auto-detects ralph/logs or session-logs)").action((options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = !!globalOpts.json;
    const projectDir = process.cwd();
    let logsDir;
    if (options.logsDir) {
      logsDir = join18(projectDir, options.logsDir);
    } else {
      const ralphLogs = join18(projectDir, "ralph", "logs");
      const sessionLogs = join18(projectDir, "session-logs");
      logsDir = existsSync19(ralphLogs) ? ralphLogs : sessionLogs;
    }
    if (!existsSync19(logsDir)) {
      fail("No logs directory found \u2014 checked ralph/logs/ and session-logs/. Run codeharness run first or use --logs-dir <path>");
      process.exitCode = 1;
      return;
    }
    const report = generateReport2(projectDir, logsDir);
    if (isJson) {
      jsonOutput(report);
      return;
    }
    const formatted = formatReport(report);
    console.log(formatted);
    if (options.save) {
      const outPath = join18(projectDir, "_bmad-output", "implementation-artifacts", "cost-report.md");
      writeFileSync6(outPath, formatted, "utf-8");
      ok(`Report saved to ${outPath}`);
    }
  });
}

// src/commands/issue.ts
function registerIssueCommand(program) {
  const issueCmd = program.command("issue").description("Create, list, and manage issues");
  issueCmd.command("create <title>").description("Create a new issue").option("--priority <priority>", "Issue priority (low, medium, high, critical)", "medium").option("--source <source>", "Issue source", "manual").action((title, options, cmd) => {
    const opts = cmd.optsWithGlobals();
    const isJson = opts.json === true;
    try {
      const issue = createIssue(title, {
        priority: options.priority,
        source: options.source
      });
      if (isJson) {
        jsonOutput(issue);
      } else {
        ok(`Created ${issue.id}: ${issue.title} [${issue.priority}]`);
      }
    } catch (err) {
      fail(err.message, { json: isJson });
      process.exitCode = 1;
    }
  });
  issueCmd.command("list").description("List all issues").action((_, cmd) => {
    const opts = cmd.optsWithGlobals();
    const isJson = opts.json === true;
    try {
      const data = readIssues();
      if (data.issues.length === 0) {
        if (isJson) {
          jsonOutput({ issues: [] });
        } else {
          info("No issues found");
        }
        return;
      }
      if (isJson) {
        jsonOutput({ issues: data.issues });
        return;
      }
      for (const issue of data.issues) {
        console.log(`${issue.id}  ${issue.title}  [${issue.priority}]  ${issue.status}  (${issue.source})`);
      }
    } catch (err) {
      fail(err.message, { json: isJson });
      process.exitCode = 1;
    }
  });
  issueCmd.command("close <id>").description("Close an issue (set status to done)").action((id, _, cmd) => {
    const opts = cmd.optsWithGlobals();
    const isJson = opts.json === true;
    try {
      const issue = closeIssue(id);
      if (isJson) {
        jsonOutput(issue);
      } else {
        ok(`Closed ${issue.id}: ${issue.title}`);
      }
    } catch (err) {
      fail(err.message, { json: isJson });
      process.exitCode = 1;
    }
  });
}

// src/lib/agents/drivers/claude-code.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
var NETWORK_CODES = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENETUNREACH",
  "ECONNRESET",
  "EPIPE"
]);
function classifyError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err?.code;
  const status = err?.status;
  if (status === 429 || /rate.?limit/i.test(message)) {
    return "RATE_LIMIT";
  }
  if (code && NETWORK_CODES.has(code)) {
    return "NETWORK";
  }
  if (/fetch|network|dns/i.test(message) && /fail|error|timeout/i.test(message)) {
    return "NETWORK";
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden/i.test(message)) {
    return "AUTH";
  }
  if (err instanceof Error && err.name === "AbortError" || /timeout|timed.?out|aborted/i.test(message)) {
    return "TIMEOUT";
  }
  return "UNKNOWN";
}
function mapSdkMessages(message) {
  const type = message.type;
  const events = [];
  if (type === "assistant") {
    const msg = message.message;
    if (!msg) return events;
    const content = msg.content;
    if (!Array.isArray(content)) return events;
    for (const block of content) {
      if (block.type === "tool_use") {
        const name = block.name;
        const id = block.id;
        const input = block.input;
        if (typeof name === "string") {
          events.push({ type: "tool-start", name, id: typeof id === "string" ? id : "" });
          if (input != null) {
            events.push({ type: "tool-input", partial: typeof input === "string" ? input : JSON.stringify(input) });
          }
          events.push({ type: "tool-complete" });
        }
      } else if (block.type === "text") {
        const text = block.text;
        if (typeof text === "string" && text.length > 0) {
          events.push({ type: "text", text });
        }
      }
    }
    return events;
  }
  if (type === "stream_event") {
    const event = message.event;
    if (!event || typeof event !== "object") return events;
    const eventType = event.type;
    if (eventType === "content_block_start") {
      const contentBlock = event.content_block;
      if (contentBlock?.type === "tool_use") {
        const name = contentBlock.name;
        const id = contentBlock.id;
        if (typeof name === "string" && typeof id === "string") {
          events.push({ type: "tool-start", name, id });
        }
      }
      return events;
    }
    if (eventType === "content_block_delta") {
      const delta = event.delta;
      if (!delta) return events;
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        events.push({ type: "tool-input", partial: delta.partial_json });
      } else if (delta.type === "text_delta" && typeof delta.text === "string") {
        events.push({ type: "text", text: delta.text });
      }
      return events;
    }
    if (eventType === "content_block_stop") {
      events.push({ type: "tool-complete" });
      return events;
    }
    return events;
  }
  if (type === "system") {
    const subtype = message.subtype;
    if (subtype === "api_retry") {
      const attempt = message.attempt;
      const delay = message.retry_delay_ms;
      if (typeof attempt === "number" && typeof delay === "number") {
        events.push({ type: "retry", attempt, delay });
      }
    }
    return events;
  }
  return events;
}
var ClaudeCodeDriver = class {
  name = "claude-code";
  defaultModel = "claude-sonnet-4-20250514";
  capabilities = {
    supportsPlugins: true,
    supportsStreaming: true,
    costReporting: true,
    costTier: 3
  };
  lastCost = null;
  async healthCheck() {
    return { available: true, authenticated: true, version: null };
  }
  async *dispatch(opts) {
    this.lastCost = null;
    const queryOptions = {
      model: opts.model,
      cwd: opts.cwd,
      permissionMode: opts.sourceAccess ? "bypassPermissions" : "default",
      ...opts.sourceAccess ? { allowDangerouslySkipPermissions: true } : {},
      ...opts.sessionId ? { resume: opts.sessionId } : {},
      ...opts.appendSystemPrompt ? { appendSystemPrompt: opts.appendSystemPrompt } : {}
    };
    if (opts.plugins && opts.plugins.length > 0) {
      queryOptions.plugins = [...opts.plugins];
    }
    let abortController;
    let timeoutId;
    let timedOut = false;
    let abortListener;
    if (opts.timeout || opts.abortSignal) {
      abortController = new AbortController();
    }
    if (opts.abortSignal && abortController) {
      abortListener = () => abortController.abort();
      if (opts.abortSignal.aborted) {
        abortController.abort();
      } else {
        opts.abortSignal.addEventListener("abort", abortListener, { once: true });
      }
    }
    if (opts.timeout && abortController) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, opts.timeout);
    }
    let yieldedResult = false;
    try {
      const queryGenerator = query({
        prompt: opts.prompt,
        options: queryOptions,
        ...abortController ? { abortController } : {}
      });
      for await (const message of queryGenerator) {
        const msg = message;
        if (msg.type === "result") {
          const costUsd = msg.total_cost_usd;
          const sessionId = msg.session_id;
          if (typeof costUsd === "number") {
            this.lastCost = costUsd;
          }
          const resultEvent = {
            type: "result",
            cost: typeof costUsd === "number" ? costUsd : 0,
            sessionId: typeof sessionId === "string" ? sessionId : "",
            cost_usd: typeof costUsd === "number" ? costUsd : null
          };
          yield resultEvent;
          yieldedResult = true;
          continue;
        }
        for (const streamEvent of mapSdkMessages(msg)) {
          yield streamEvent;
        }
      }
    } catch (err) {
      if (opts.abortSignal?.aborted && !timedOut) {
        const abortError = new Error("Dispatch aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      const category = classifyError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const finalCategory = timedOut && category !== "RATE_LIMIT" ? "TIMEOUT" : category;
      const resultEvent = {
        type: "result",
        cost: this.lastCost ?? 0,
        sessionId: "",
        cost_usd: this.lastCost
      };
      yield {
        ...resultEvent,
        error: errorMessage,
        errorCategory: finalCategory
      };
      yieldedResult = true;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortListener && opts.abortSignal) {
        opts.abortSignal.removeEventListener("abort", abortListener);
      }
    }
    if (!yieldedResult) {
      yield {
        type: "result",
        cost: this.lastCost ?? 0,
        sessionId: "",
        cost_usd: this.lastCost
      };
    }
  }
  getLastCost() {
    return this.lastCost;
  }
};

// src/lib/agents/drivers/codex.ts
import { spawn } from "child_process";
import { execFile } from "child_process";
import { createInterface } from "readline";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var NETWORK_CODES2 = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENETUNREACH",
  "ECONNRESET",
  "EPIPE"
]);
function classifyError2(err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err?.code;
  const status = err?.status;
  if (status === 429 || /rate.?limit/i.test(message)) {
    return "RATE_LIMIT";
  }
  if (code && NETWORK_CODES2.has(code)) {
    return "NETWORK";
  }
  if (/fetch|network|dns/i.test(message) && /fail|error|timeout/i.test(message)) {
    return "NETWORK";
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ENETUNREACH|ECONNRESET|EPIPE/i.test(message)) {
    return "NETWORK";
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden/i.test(message)) {
    return "AUTH";
  }
  if (/timeout|timed.?out|aborted/i.test(message)) {
    return "TIMEOUT";
  }
  return "UNKNOWN";
}
function parseLineMulti(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
  const type = parsed.type;
  const item = parsed.item;
  if (type === "item.started" && item) {
    const itemType = item.type;
    if (itemType === "command_execution") {
      const cmd = item.command ?? "";
      return [
        { type: "tool-start", name: "Bash", id: item.id ?? "" },
        { type: "tool-input", partial: cmd }
      ];
    }
    if (itemType === "file_edit") {
      const path = item.file_path ?? item.path ?? "";
      return [
        { type: "tool-start", name: "Edit", id: item.id ?? "" },
        { type: "tool-input", partial: path }
      ];
    }
    if (itemType === "file_read") {
      const path = item.file_path ?? item.path ?? "";
      return [
        { type: "tool-start", name: "Read", id: item.id ?? "" },
        { type: "tool-input", partial: path }
      ];
    }
    return [];
  }
  if (type === "item.completed" && item) {
    const itemType = item.type;
    if (itemType === "command_execution") return [{ type: "tool-complete" }];
    if (itemType === "agent_message") {
      const text = item.text;
      return text ? [{ type: "text", text }] : [];
    }
    if (itemType === "file_edit" || itemType === "file_read") return [{ type: "tool-complete" }];
    return [];
  }
  if (type === "turn.completed") {
    const usage = parsed.usage;
    if (usage) {
      return [{
        type: "result",
        cost: 0,
        sessionId: "",
        cost_usd: null
      }];
    }
    return [];
  }
  const legacy = parseLine(line);
  return legacy ? [legacy] : [];
}
function parseLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const type = parsed.type;
  const item = parsed.item;
  if (type === "item.started" && item) {
    const itemType = item.type;
    if (itemType === "command_execution") {
      return { type: "tool-start", name: "Bash", id: item.id ?? "" };
    }
    if (itemType === "file_edit") {
      return { type: "tool-start", name: "Edit", id: item.id ?? "" };
    }
    if (itemType === "file_read") {
      return { type: "tool-start", name: "Read", id: item.id ?? "" };
    }
    return null;
  }
  if (type === "item.completed" && item) {
    const itemType = item.type;
    if (itemType === "command_execution") {
      return { type: "tool-complete" };
    }
    if (itemType === "agent_message") {
      const text = item.text;
      if (text) return { type: "text", text };
    }
    if (itemType === "file_edit" || itemType === "file_read") {
      return { type: "tool-complete" };
    }
    return null;
  }
  if (type === "tool_call") {
    const name = parsed.name;
    const callId = parsed.call_id;
    if (typeof name === "string" && typeof callId === "string") {
      return { type: "tool-start", name, id: callId };
    }
    return null;
  }
  if (type === "tool_input") {
    const input = parsed.input;
    if (typeof input === "string") {
      return { type: "tool-input", partial: input };
    }
    return null;
  }
  if (type === "tool_result") {
    return { type: "tool-complete" };
  }
  if (type === "message") {
    const content = parsed.content;
    if (typeof content === "string") {
      return { type: "text", text: content };
    }
    return null;
  }
  if (type === "retry") {
    const attempt = parsed.attempt;
    const delay = parsed.delay_ms;
    if (typeof attempt === "number" && typeof delay === "number") {
      return { type: "retry", attempt, delay };
    }
    return null;
  }
  if (type === "result") {
    const costUsd = parsed.cost_usd;
    const sessionId = parsed.session_id;
    return {
      type: "result",
      cost: typeof costUsd === "number" ? costUsd : 0,
      sessionId: typeof sessionId === "string" ? sessionId : "",
      cost_usd: typeof costUsd === "number" ? costUsd : null
    };
  }
  return null;
}
var CodexDriver = class {
  name = "codex";
  defaultModel = "codex-mini";
  capabilities = {
    supportsPlugins: false,
    supportsStreaming: true,
    costReporting: true,
    costTier: 1
  };
  lastCost = null;
  async healthCheck() {
    try {
      await execFileAsync("which", ["codex"]);
    } catch {
      return {
        available: false,
        authenticated: false,
        version: null,
        error: "codex CLI not found. Install: npm install -g @openai/codex"
      };
    }
    let version = null;
    try {
      const { stdout } = await execFileAsync("codex", ["--version"]);
      version = stdout.trim() || null;
    } catch {
    }
    let authenticated = false;
    try {
      await execFileAsync("codex", ["auth", "status"]);
      authenticated = true;
    } catch {
    }
    return { available: true, authenticated, version };
  }
  async *dispatch(opts) {
    this.lastCost = null;
    if (opts.plugins && opts.plugins.length > 0) {
      console.warn(
        "[CodexDriver] Codex does not support plugins. Ignoring plugins:",
        opts.plugins
      );
    }
    const args = opts.sourceAccess ? ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check"] : ["exec", "--json", "--full-auto", "--skip-git-repo-check"];
    const model = opts.model && !opts.model.startsWith("claude-") ? opts.model : void 0;
    if (model) {
      args.push("--model", model);
    }
    if (opts.cwd) {
      args.push("--cd", opts.cwd);
    }
    args.push(opts.prompt);
    let yieldedResult = false;
    let timedOut = false;
    let timeoutId;
    let aborted = false;
    let abortListener;
    const proc = spawn("codex", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (opts.abortSignal) {
      abortListener = () => {
        aborted = true;
        proc.kill("SIGINT");
      };
      if (opts.abortSignal.aborted) {
        abortListener();
      } else {
        opts.abortSignal.addEventListener("abort", abortListener, { once: true });
      }
    }
    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, opts.timeout);
    }
    let stderrData = "";
    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });
    const rl = createInterface({ input: proc.stdout });
    const closePromise = new Promise((resolve5) => {
      proc.on("close", (code) => resolve5(code));
    });
    try {
      for await (const line of rl) {
        const events = parseLineMulti(line);
        for (const event of events) {
          if (event.type === "result") {
            const resultEvent = event;
            if (typeof resultEvent.cost_usd === "number") {
              this.lastCost = resultEvent.cost_usd;
            }
            yield event;
            yieldedResult = true;
          } else {
            yield event;
          }
        }
      }
      const exitCode = await closePromise;
      if (aborted && !timedOut) {
        const abortError = new Error("Dispatch aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      if (exitCode !== null && exitCode !== 0 && !yieldedResult) {
        const errorText = stderrData || `codex exited with code ${exitCode}`;
        const category = timedOut ? "TIMEOUT" : classifyError2(errorText);
        yield {
          type: "result",
          cost: this.lastCost ?? 0,
          sessionId: "",
          cost_usd: this.lastCost,
          error: errorText,
          errorCategory: category
        };
        yieldedResult = true;
      }
    } catch (err) {
      if (aborted && !timedOut || err instanceof Error && err.name === "AbortError") {
        const abortError = err instanceof Error ? err : new Error("Dispatch aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      const category = timedOut ? "TIMEOUT" : classifyError2(err);
      yield {
        type: "result",
        cost: this.lastCost ?? 0,
        sessionId: "",
        cost_usd: this.lastCost,
        error: errorMessage,
        errorCategory: category
      };
      yieldedResult = true;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortListener && opts.abortSignal) {
        opts.abortSignal.removeEventListener("abort", abortListener);
      }
    }
    if (!yieldedResult) {
      yield {
        type: "result",
        cost: this.lastCost ?? 0,
        sessionId: "",
        cost_usd: this.lastCost
      };
    }
  }
  getLastCost() {
    return this.lastCost;
  }
};

// src/lib/agents/drivers/opencode.ts
import { spawn as spawn2 } from "child_process";
import { execFile as execFile2 } from "child_process";
import { createInterface as createInterface2 } from "readline";
import { promisify as promisify2 } from "util";
var execFileAsync2 = promisify2(execFile2);
var NETWORK_CODES3 = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENETUNREACH",
  "ECONNRESET",
  "EPIPE"
]);
function classifyError3(err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err?.code;
  const status = err?.status;
  if (status === 429 || /rate.?limit/i.test(message)) {
    return "RATE_LIMIT";
  }
  if (code && NETWORK_CODES3.has(code)) {
    return "NETWORK";
  }
  if (/fetch|network|dns/i.test(message) && /fail|error|timeout/i.test(message)) {
    return "NETWORK";
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ENETUNREACH|ECONNRESET|EPIPE/i.test(message)) {
    return "NETWORK";
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden/i.test(message)) {
    return "AUTH";
  }
  if (/timeout|timed.?out|aborted/i.test(message)) {
    return "TIMEOUT";
  }
  return "UNKNOWN";
}
function parseLine2(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const type = parsed.type;
  if (type === "tool_call") {
    const name = parsed.name;
    const callId = parsed.call_id;
    if (typeof name === "string" && typeof callId === "string") {
      return { type: "tool-start", name, id: callId };
    }
    return null;
  }
  if (type === "tool_input") {
    const input = parsed.input;
    if (typeof input === "string") {
      return { type: "tool-input", partial: input };
    }
    return null;
  }
  if (type === "tool_result") {
    return { type: "tool-complete" };
  }
  if (type === "message") {
    const content = parsed.content;
    if (typeof content === "string") {
      return { type: "text", text: content };
    }
    return null;
  }
  if (type === "retry") {
    const attempt = parsed.attempt;
    const delay = parsed.delay_ms;
    if (typeof attempt === "number" && typeof delay === "number") {
      return { type: "retry", attempt, delay };
    }
    return null;
  }
  if (type === "result") {
    const costUsd = parsed.cost_usd;
    const sessionId = parsed.session_id;
    return {
      type: "result",
      cost: typeof costUsd === "number" ? costUsd : 0,
      sessionId: typeof sessionId === "string" ? sessionId : "",
      cost_usd: typeof costUsd === "number" ? costUsd : null
    };
  }
  return null;
}
var OpenCodeDriver = class {
  name = "opencode";
  defaultModel = "default";
  capabilities = {
    supportsPlugins: true,
    supportsStreaming: true,
    costReporting: true,
    costTier: 2
  };
  lastCost = null;
  async healthCheck() {
    try {
      await execFileAsync2("which", ["opencode"]);
    } catch {
      return {
        available: false,
        authenticated: false,
        version: null,
        error: "opencode not found. Install: https://opencode.ai"
      };
    }
    let version = null;
    try {
      const { stdout } = await execFileAsync2("opencode", ["--version"]);
      version = stdout.trim() || null;
    } catch {
    }
    return { available: true, authenticated: true, version };
  }
  async *dispatch(opts) {
    this.lastCost = null;
    const args = ["run", "--format", "json"];
    if (opts.model && opts.model !== this.defaultModel) {
      args.push("--model", opts.model);
    }
    if (opts.sessionId) {
      args.push("--continue", opts.sessionId);
    }
    if (opts.plugins && opts.plugins.length > 0) {
      for (const plugin of opts.plugins) {
        args.push("--plugin", plugin);
      }
    }
    let prompt = opts.prompt;
    if (opts.appendSystemPrompt) {
      prompt = `${opts.appendSystemPrompt}

${prompt}`;
    }
    args.push(prompt);
    let yieldedResult = false;
    let timedOut = false;
    let timeoutId;
    let aborted = false;
    let abortListener;
    const proc = spawn2("opencode", args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: opts.cwd
    });
    if (opts.abortSignal) {
      abortListener = () => {
        aborted = true;
        proc.kill("SIGINT");
      };
      if (opts.abortSignal.aborted) {
        abortListener();
      } else {
        opts.abortSignal.addEventListener("abort", abortListener, { once: true });
      }
    }
    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, opts.timeout);
    }
    let stderrData = "";
    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });
    const rl = createInterface2({ input: proc.stdout });
    const closePromise = new Promise((resolve5) => {
      proc.on("close", (code) => resolve5(code));
    });
    try {
      for await (const line of rl) {
        const event = parseLine2(line);
        if (event) {
          if (event.type === "result") {
            const resultEvent = event;
            if (typeof resultEvent.cost_usd === "number") {
              this.lastCost = resultEvent.cost_usd;
            }
            yield event;
            yieldedResult = true;
          } else {
            yield event;
          }
        } else {
          console.debug("[OpenCodeDriver] Skipping unparseable line:", line);
        }
      }
      const exitCode = await closePromise;
      if (aborted && !timedOut) {
        const abortError = new Error("Dispatch aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      if (exitCode !== null && exitCode !== 0 && !yieldedResult) {
        const errorText = stderrData || `opencode exited with code ${exitCode}`;
        const category = timedOut ? "TIMEOUT" : classifyError3(errorText);
        yield {
          type: "result",
          cost: this.lastCost ?? 0,
          sessionId: "",
          cost_usd: this.lastCost,
          error: errorText,
          errorCategory: category
        };
        yieldedResult = true;
      }
    } catch (err) {
      if (aborted && !timedOut || err instanceof Error && err.name === "AbortError") {
        const abortError = err instanceof Error ? err : new Error("Dispatch aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      const category = timedOut ? "TIMEOUT" : classifyError3(err);
      yield {
        type: "result",
        cost: this.lastCost ?? 0,
        sessionId: "",
        cost_usd: this.lastCost,
        error: errorMessage,
        errorCategory: category
      };
      yieldedResult = true;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortListener && opts.abortSignal) {
        opts.abortSignal.removeEventListener("abort", abortListener);
      }
    }
    if (!yieldedResult) {
      yield {
        type: "result",
        cost: this.lastCost ?? 0,
        sessionId: "",
        cost_usd: this.lastCost
      };
    }
  }
  getLastCost() {
    return this.lastCost;
  }
};

// src/commands/drivers.ts
var DRIVER_DESCRIPTIONS = {
  "claude-code": "Anthropic Claude via Agent SDK (in-process)",
  codex: "OpenAI Codex via CLI",
  opencode: "OpenCode via CLI"
};
function ensureDriversRegistered() {
  const registered = new Set(listDrivers());
  if (!registered.has("claude-code")) registerDriver(new ClaudeCodeDriver());
  if (!registered.has("codex")) registerDriver(new CodexDriver());
  if (!registered.has("opencode")) registerDriver(new OpenCodeDriver());
}
function registerDriversCommand(program) {
  program.command("drivers").description("List registered drivers and their capabilities").action((_options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const isJson = !!globalOpts.json;
    ensureDriversRegistered();
    const result = {};
    for (const name of listDrivers()) {
      const driver = getDriver(name);
      result[name] = {
        defaultModel: driver.defaultModel,
        capabilities: { ...driver.capabilities },
        description: DRIVER_DESCRIPTIONS[name] ?? name
      };
    }
    if (isJson) {
      jsonOutput(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  });
}

// src/index.ts
var VERSION = true ? "0.41.8" : "0.0.0-dev";
function createProgram() {
  const program = new Command();
  program.name("codeharness").description("Makes autonomous coding agents produce software that actually works").version(VERSION).option("--json", "Output in machine-readable JSON format");
  registerInitCommand(program);
  registerBridgeCommand(program);
  registerRunCommand(program);
  registerVerifyCommand(program);
  registerStatusCommand(program);
  registerOnboardCommand(program);
  registerTeardownCommand(program);
  registerStateCommand(program);
  registerSyncCommand(program);
  registerCoverageCommand(program);
  registerDocHealthCommand(program);
  registerStackCommand(program);
  registerQueryCommand(program);
  registerRetroImportCommand(program);
  registerGithubImportCommand(program);
  registerVerifyEnvCommand(program);
  registerTimeoutReportCommand(program);
  registerValidateStateCommand(program);
  registerValidateCommand(program);
  registerProgressCommand(program);
  registerObservabilityGateCommand(program);
  registerAuditCommand(program);
  registerStatsCommand(program);
  registerIssueCommand(program);
  registerDriversCommand(program);
  ensureDriversRegistered();
  return program;
}
if (!process.env["VITEST"]) {
  const program = createProgram();
  program.parse(process.argv);
}
export {
  createProgram,
  parseStreamLine
};
