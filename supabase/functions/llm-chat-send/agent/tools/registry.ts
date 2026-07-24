/**
 * Tool Registry — schema/description/examples/execute.
 */

import type { IntentResult, ToolDefinition, ToolSchemaParam } from '../types.ts';

export type ToolSupportContext = {
  intent: IntentResult;
  isToolContinue: boolean;
  providerName: string;
  supportsFunctionCalling: boolean;
  supportsGrounding: boolean;
};

export interface AgentTool {
  id: string;
  definition: ToolDefinition;
  supports(ctx: ToolSupportContext): boolean;
  schema(): { name: string; description: string; parameters: ToolSchemaParam };
  description(): string;
  examples(): Array<{ user: string; args: Record<string, unknown> }>;
  // deno-lint-ignore no-explicit-any
  execute?: (args: Record<string, unknown>, ctx: ToolSupportContext) => Promise<any>;
}

const tools = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool): void {
  tools.set(tool.id, tool);
}

export function listTools(): AgentTool[] {
  return [...tools.values()].sort(
    (a, b) => a.definition.priority - b.definition.priority,
  );
}

export function selectToolsForIntent(ctx: ToolSupportContext): ToolDefinition[] {
  return listTools()
    .filter((t) => t.supports(ctx))
    .map((t) => t.definition);
}

/** LLM Function Calling용 OpenAPI-ish 스키마 자동 생성 */
export function buildFunctionSchemasForLlm(defs: ToolDefinition[]): Array<{
  name: string;
  description: string;
  parameters: ToolSchemaParam;
}> {
  return defs
    .filter((d) => d.kind === 'download_fc')
    .map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    }));
}

export function createTool(params: {
  definition: ToolDefinition;
  supports: (ctx: ToolSupportContext) => boolean;
  // deno-lint-ignore no-explicit-any
  execute?: AgentTool['execute'];
}): AgentTool {
  const def = {
    ...params.definition,
    version: params.definition.version ?? '1',
  };
  return {
    id: def.id,
    definition: def,
    supports: params.supports,
    schema: () => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    }),
    description: () => def.description,
    examples: () => def.examples ?? [],
    execute: params.execute,
  };
}
