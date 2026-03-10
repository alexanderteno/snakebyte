import type { FrameState, GlobalState } from "./protocol.js";

export function chooseCommand(_globalState: GlobalState, _frameState: FrameState): string {
  return "WAIT";
}
