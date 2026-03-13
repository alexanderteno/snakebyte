import { runMatch } from "../dist/engine/runMatch.js";

const seeds = [1, 7, 19, 31, 5556729728041560000];
const candidates = process.argv.length > 2
  ? process.argv.slice(2).map((entry) => {
    const [id, file] = entry.split("=", 2);
    if (!id || !file) {
      throw new Error(`Invalid candidate argument: ${entry}`);
    }
    return { id, file };
  })
  : [
    { id: "e9bd", file: ".snakebyte/weights/e9bd4463-0112-4fce-a49c-e2021527b268.json" },
    { id: "8d16", file: ".snakebyte/archive/8d160634-a198-4df2-b75a-0eaa09d9fcfc.json" },
    { id: "e1b0", file: ".snakebyte/archive/e1b0a800-1fcb-4d69-bc91-2099c957131d.json" },
  ];
const pairs = [];
for (let index = 0; index < candidates.length; index += 1) {
  for (let inner = index + 1; inner < candidates.length; inner += 1) {
    pairs.push([candidates[index], candidates[inner]]);
  }
}

for (const [left, right] of pairs) {
  let leftScore = 0;
  let rightScore = 0;
  let leftWins = 0;
  let rightWins = 0;
  let draws = 0;
  let timeouts = 0;
  const matches = [];

  for (const seed of seeds) {
    for (const seat of [0, 1]) {
      const player1 = seat === 0 ? left : right;
      const player2 = seat === 0 ? right : left;
      const result = await runMatch({
        engineDir: "./engine",
        player1Command: `node dist/bot/cli.js --weights-file ${player1.file}`,
        player2Command: `node dist/bot/cli.js --weights-file ${player2.file}`,
        seed,
        simulate: true,
      });
      const summary = result.summary;
      const player1Score = summary?.player1Score ?? 0;
      const player2Score = summary?.player2Score ?? 0;
      const leftMatchScore = seat === 0 ? player1Score : player2Score;
      const rightMatchScore = seat === 0 ? player2Score : player1Score;
      const matchSummaries = summary?.summaries ?? [];
      const timeout = matchSummaries.some((entry) => String(entry).includes("has not provided 1 lines in time"));

      leftScore += leftMatchScore;
      rightScore += rightMatchScore;
      if (leftMatchScore > rightMatchScore) {
        leftWins += 1;
      } else if (leftMatchScore < rightMatchScore) {
        rightWins += 1;
      } else {
        draws += 1;
      }
      if (timeout) {
        timeouts += 1;
      }

      matches.push({
        seed,
        seat,
        leftScore: leftMatchScore,
        rightScore: rightMatchScore,
        timeout,
        summaries: matchSummaries,
      });
    }
  }

  process.stdout.write(`${JSON.stringify({
    pair: [left.id, right.id],
    leftScore,
    rightScore,
    leftWins,
    rightWins,
    draws,
    timeouts,
    matches,
  })}\n`);
}
