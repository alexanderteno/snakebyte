export interface Coord {
  x: number;
  y: number;
}

export interface BirdState {
  id: number;
  body: Coord[];
}

export interface GlobalState {
  playerIndex: number;
  width: number;
  height: number;
  rows: string[];
  birdsPerPlayer: number;
  myBirdIds: number[];
  opponentBirdIds: number[];
}

export interface FrameState {
  apples: Coord[];
  birds: BirdState[];
}

function parseCoord(token: string): Coord {
  const [xToken, yToken] = token.split(",");
  const x = Number(xToken);
  const y = Number(yToken);

  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error(`Invalid coordinate token: ${token}`);
  }

  return { x, y };
}

function parseBird(token: string): BirdState {
  const [idToken, bodyToken = ""] = token.split(" ");
  const body = bodyToken.split(":").filter(Boolean).map(parseCoord);

  return {
    id: Number(idToken),
    body,
  };
}

export function parseGlobalState(lines: string[]): GlobalState {
  let index = 0;
  const playerIndex = Number(lines[index++]);
  const width = Number(lines[index++]);
  const height = Number(lines[index++]);
  const rows = lines.slice(index, index + height);
  index += height;
  const birdsPerPlayer = Number(lines[index++]);
  const myBirdIds = lines.slice(index, index + birdsPerPlayer).map(Number);
  index += birdsPerPlayer;
  const opponentBirdIds = lines.slice(index, index + birdsPerPlayer).map(Number);

  return {
    playerIndex,
    width,
    height,
    rows,
    birdsPerPlayer,
    myBirdIds,
    opponentBirdIds,
  };
}

export function parseFrameState(lines: string[]): FrameState {
  let index = 0;
  const appleCount = Number(lines[index++]);
  const apples = lines.slice(index, index + appleCount).map(parseCoord);
  index += appleCount;
  const birdCount = Number(lines[index++]);
  const birds = lines.slice(index, index + birdCount).map(parseBird);

  return {
    apples,
    birds,
  };
}
