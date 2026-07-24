/**
 * Safety — Input / Output Guard 인터페이스.
 */

export type GuardResult = {
  allowed: boolean;
  /** 차단·마스킹 후 텍스트 */
  text: string;
  reasons: string[];
};

export interface InputGuard {
  check(userMessage: string): Promise<GuardResult> | GuardResult;
}

export interface OutputGuard {
  check(answer: string): Promise<GuardResult> | GuardResult;
}

const passthroughInput: InputGuard = {
  check: (userMessage) => ({ allowed: true, text: userMessage, reasons: [] }),
};

const passthroughOutput: OutputGuard = {
  check: (answer) => ({ allowed: true, text: answer, reasons: [] }),
};

let inputGuard: InputGuard = passthroughInput;
let outputGuard: OutputGuard = passthroughOutput;

export function registerInputGuard(g: InputGuard): void {
  inputGuard = g;
}

export function registerOutputGuard(g: OutputGuard): void {
  outputGuard = g;
}

export function getInputGuard(): InputGuard {
  return inputGuard;
}

export function getOutputGuard(): OutputGuard {
  return outputGuard;
}
