/**
 * Provider Registry + Factory.
 * Executor는 ProviderFactory.get(id) 만 호출한다.
 */

import type { LlmProviderCapabilities } from '../types.ts';
import { getProviderCapabilities } from '../types.ts';
import {
  normalizeProviderResult,
  type NormalizedResponse,
} from './normalize.ts';

export type ProviderChatTurn = { role: 'user' | 'assistant'; content: string };

export type ProviderStreamOptions = {
  adminSystemInstruction?: string;
  enableDownloadTools?: boolean;
  enableWebSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  toolContinue?: {
    modelFunctionCalls: Array<{
      callId: string;
      name: string;
      args: Record<string, unknown>;
    }>;
    functionResponses: Array<{ name: string; response: Record<string, unknown> }>;
  };
};

/** @deprecated NormalizedResponse 사용 권장 */
export type ProviderStreamResult = NormalizedResponse;

export interface LlmProvider {
  id: string;
  displayName: string;
  capabilities: LlmProviderCapabilities;
  /** 선택: 요청 바디 조립(Provider별 차이 은닉) */
  buildRequest?(
    modelName: string,
    history: ProviderChatTurn[],
    userMessage: string,
    options?: ProviderStreamOptions,
  ): unknown;
  stream(
    apiKey: string,
    modelName: string,
    history: ProviderChatTurn[],
    userMessage: string,
    onDelta: (deltaText: string) => void,
    options?: ProviderStreamOptions,
  ): Promise<NormalizedResponse>;
  parse?(raw: unknown): NormalizedResponse;
  normalizeError?(error: unknown): NormalizedResponse;
  generateTitle?(
    apiKey: string,
    modelName: string,
    userMessage: string,
  ): Promise<{ title: string; inputTokens: number; outputTokens: number; totalTokens: number } | null>;
}

export type ProviderFactoryFn = () => LlmProvider;

const factories = new Map<string, ProviderFactoryFn>();
const singletons = new Map<string, LlmProvider>();

export function registerProviderFactory(id: string, factory: ProviderFactoryFn): void {
  factories.set(id, factory);
  singletons.delete(id);
}

export function registerProvider(provider: LlmProvider): void {
  registerProviderFactory(provider.id, () => provider);
  singletons.set(provider.id, provider);
}

export const ProviderFactory = {
  get(id: string): LlmProvider {
    const cached = singletons.get(id);
    if (cached) return cached;
    const factory = factories.get(id);
    if (!factory) throw new Error(`provider_factory_missing:${id}`);
    const created = factory();
    singletons.set(id, created);
    return created;
  },
  has(id: string): boolean {
    return factories.has(id) || singletons.has(id);
  },
  listIds(): string[] {
    return [...new Set([...factories.keys(), ...singletons.keys()])];
  },
};

export function getProvider(id: string): LlmProvider | undefined {
  try {
    return ProviderFactory.get(id);
  } catch {
    return undefined;
  }
}

export function requireProvider(id: string): LlmProvider {
  return ProviderFactory.get(id);
}

export function listProviders(): LlmProvider[] {
  return ProviderFactory.listIds().map((id) => ProviderFactory.get(id));
}

export function hasProvider(id: string): boolean {
  return ProviderFactory.has(id);
}

/**
 * 레거시 어댑터(stream이 AdapterResult 반환)를 Normalized Provider로 감싸 등록.
 */
export function registerAdapterAsProvider(params: {
  id: string;
  displayName?: string;
  capabilities?: LlmProviderCapabilities;
  // deno-lint-ignore no-explicit-any
  stream: (...args: any[]) => Promise<any>;
  // deno-lint-ignore no-explicit-any
  generateTitle?: (...args: any[]) => Promise<any>;
}): void {
  const provider: LlmProvider = {
    id: params.id,
    displayName: params.displayName ?? params.id,
    capabilities: params.capabilities ?? getProviderCapabilities(params.id),
    async stream(apiKey, modelName, history, userMessage, onDelta, options) {
      if (options?.signal?.aborted) {
        return {
          ok: false,
          kind: 'cancelled',
          message: 'aborted',
          needsWebSearch: options.enableWebSearch === true,
        };
      }
      try {
        const raw = await params.stream(
          apiKey,
          modelName,
          history,
          userMessage,
          onDelta,
          options,
        );
        return normalizeProviderResult(raw);
      } catch (e) {
        if (options?.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) {
          return {
            ok: false,
            kind: 'cancelled',
            message: 'aborted',
            needsWebSearch: options?.enableWebSearch === true,
          };
        }
        return {
          ok: false,
          kind: 'network',
          message: e instanceof Error ? e.message : String(e),
          needsWebSearch: options?.enableWebSearch === true,
        };
      }
    },
    generateTitle: params.generateTitle
      ? (apiKey, modelName, userMessage) => params.generateTitle!(apiKey, modelName, userMessage)
      : undefined,
  };
  registerProvider(provider);
}
