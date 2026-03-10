import fs from "node:fs";
import path from "node:path";
import { formatJointAction } from "./actions.js";
import type { EvaluationResult } from "./evaluator.js";
import type { RuntimeState } from "./state.js";

export interface TurnDiagnosticsRecord {
  type: "turn";
  turn: number;
  playerIndex: number;
  command: string;
  appleCount: number;
  mySnakebotCount: number;
  opponentSnakebotCount: number;
  topCandidates: Array<EvaluationResult["debug"]>;
  chosen: EvaluationResult["debug"];
  scoreGapToSecond: number | null;
}

let turnCounter = 0;
let initializedFile: string | null = null;

export function maybeWriteTurnDiagnostics(
  runtimeState: RuntimeState,
  evaluations: EvaluationResult[],
  chosen: EvaluationResult,
): void {
  const filePath = process.env.SNAKEBYTE_DIAGNOSTICS_FILE;
  if (!filePath) {
    return;
  }

  const turnLimit = readPositiveInt(process.env.SNAKEBYTE_DIAGNOSTICS_TURN_LIMIT);
  if (turnLimit !== null && turnCounter >= turnLimit) {
    turnCounter += 1;
    return;
  }

  const topCount = readPositiveInt(process.env.SNAKEBYTE_DIAGNOSTICS_TOP_N) ?? 3;
  ensureFile(filePath);

  const topCandidates = evaluations.slice(0, topCount).map((entry) => entry.debug);
  const second = topCandidates[1];
  const record: TurnDiagnosticsRecord = {
    type: "turn",
    turn: turnCounter,
    playerIndex: runtimeState.global.playerIndex,
    command: formatJointAction(chosen.jointAction),
    appleCount: runtimeState.apples.length,
    mySnakebotCount: runtimeState.mySnakebots.length,
    opponentSnakebotCount: runtimeState.opponentSnakebots.length,
    topCandidates,
    chosen: chosen.debug,
    scoreGapToSecond: second ? chosen.score - second.score : null,
  };

  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
  turnCounter += 1;
}

function ensureFile(filePath: string): void {
  if (initializedFile === filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
  initializedFile = filePath;
}

function readPositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
