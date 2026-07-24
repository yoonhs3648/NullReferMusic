/**
 * Execution Graph — 진짜 DAG + 병렬 wave.
 */

export type GraphNodeType =
  | 'context'
  | 'tools'
  | 'native_search'
  | 'llm'
  | 'recommend'
  | 'merge_context'
  | 'end';

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  ref?: string;
  toolIds?: string[];
  timeoutMs?: number;
  retry?: number;
  /** 같은 wave에서 병렬 가능 (기본 true for context) */
  parallel?: boolean;
};

export type GraphEdge = { from: string; to: string };

export type ExecutionGraph = {
  entry: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphNodeHandlerContext = {
  traceId: string;
  signal?: AbortSignal;
  // deno-lint-ignore no-explicit-any
  bag: Record<string, any>;
};

export interface GraphNodeHandler {
  type: GraphNodeType;
  execute(node: GraphNode, ctx: GraphNodeHandlerContext): Promise<void>;
  rollback?(node: GraphNode, ctx: GraphNodeHandlerContext): Promise<void>;
  retry?(node: GraphNode, ctx: GraphNodeHandlerContext, attempt: number): Promise<boolean>;
  timeoutMs?(node: GraphNode): number;
}

export function linearGraph(nodeDefs: Omit<GraphNode, 'id'>[]): ExecutionGraph {
  const nodes: GraphNode[] = nodeDefs.map((n, i) => ({ ...n, id: `n${i}` }));
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.push({ from: nodes[i]!.id, to: nodes[i + 1]!.id });
  }
  return { entry: nodes[0]?.id ?? 'n0', nodes, edges };
}

/**
 * DAG 빌더 — 여러 부모가 한 자식으로 합류 가능.
 * nodes: id를 직접 지정.
 */
export function dagGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  entry?: string,
): ExecutionGraph {
  return {
    entry: entry ?? nodes[0]?.id ?? 'start',
    nodes,
    edges,
  };
}

/** Kahn 위상 + 동일 indegree=0 집합을 wave로 묶음 (병렬 실행 단위) */
export function topologicalWaves(graph: ExecutionGraph): GraphNode[][] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>();
  const outs = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    outs.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    outs.get(e.from)!.push(e.to);
  }

  const waves: GraphNode[][] = [];
  let ready = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  // entry 우선
  ready.sort((a, b) => (a.id === graph.entry ? -1 : b.id === graph.entry ? 1 : a.id.localeCompare(b.id)));

  const done = new Set<string>();
  while (ready.length > 0) {
    waves.push(ready);
    const nextReady: GraphNode[] = [];
    for (const n of ready) {
      done.add(n.id);
      for (const to of outs.get(n.id) ?? []) {
        const d = (indeg.get(to) ?? 0) - 1;
        indeg.set(to, d);
        if (d === 0 && !done.has(to)) {
          const node = byId.get(to);
          if (node) nextReady.push(node);
        }
      }
    }
    ready = nextReady.sort((a, b) => a.id.localeCompare(b.id));
  }

  // 고아 노드 방어
  for (const n of graph.nodes) {
    if (!done.has(n.id)) {
      waves.push([n]);
    }
  }
  return waves;
}

/** @deprecated waves 사용 — 호환용 평탄화 */
export function flattenExecutionOrder(graph: ExecutionGraph): GraphNode[] {
  return topologicalWaves(graph).flat();
}
