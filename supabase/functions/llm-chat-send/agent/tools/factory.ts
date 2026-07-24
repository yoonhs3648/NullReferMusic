/**
 * Tool Factory — Registry와 동일 키로 생성/조회.
 */

import type { AgentTool } from './registry.ts';
import { listTools, registerTool } from './registry.ts';

const factories = new Map<string, () => AgentTool>();

export function registerToolFactory(id: string, factory: () => AgentTool): void {
  factories.set(id, factory);
  // 즉시 인스턴스 등록해 selectToolsForIntent가 동작
  registerTool(factory());
}

export const ToolFactory = {
  get(id: string): AgentTool {
    const factory = factories.get(id);
    if (factory) return factory();
    const found = listTools().find((t) => t.id === id);
    if (!found) throw new Error(`tool_factory_missing:${id}`);
    return found;
  },
  has(id: string): boolean {
    return factories.has(id) || listTools().some((t) => t.id === id);
  },
  listIds(): string[] {
    const ids = new Set<string>([...factories.keys(), ...listTools().map((t) => t.id)]);
    return [...ids];
  },
};
