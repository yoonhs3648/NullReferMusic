/**
 * A/B · Experiment — experimentId 부여 인터페이스.
 */

export type ExperimentAssignment = {
  experimentId: string;
  variant: string;
  /** promptVersion 또는 provider 강제 등 */
  overrides?: {
    promptVersion?: string;
    providerName?: string;
  };
};

export interface ExperimentAssigner {
  assign(serialNo: string): Promise<ExperimentAssignment | null> | ExperimentAssignment | null;
}

let assigner: ExperimentAssigner = {
  assign: () => null,
};

export function registerExperimentAssigner(a: ExperimentAssigner): void {
  assigner = a;
}

export async function assignExperiment(serialNo: string): Promise<ExperimentAssignment | null> {
  return await assigner.assign(serialNo);
}
