# snakebyte

Local workspace for experimenting with CodinGame Winter Challenge 2026 bots.

## Layout

- `engine/`: CodinGame Java engine checkout or submodule.
- `local-runner/`: Maven wrapper that launches the engine with explicit player commands, seeds, and simulation mode.
- `src/engine/`: TypeScript helpers for invoking the local runner and parsing match summaries.
- `src/bot/`: bot policy, simulator, evaluator, diagnostics, and CLI entrypoint.
- `src/ga/`: evolutionary search, evaluation, mutation, and artifact I/O.
- `src/contest/`: bundled contest submission entrypoint.
- `scripts/`: ad hoc utilities such as submission building and match reproduction.
- `.snakebyte/`: generated weights, training runs, diagnostics, and submissions.

## Recommended workflow

1. Keep this repository as your working repo.
2. Bring the CodinGame engine into `engine/`.
3. Treat the engine as read-only upstream code unless you intentionally need patches.
4. Put all bot, orchestration, logging, and optimization code in this repository.

## Container workflow

The repository includes one `dev` container for fast iteration with Docker-managed Node modules and Maven cache.

If you already have Node on the host, the quickest wrapper commands are:

```powershell
npm.cmd run docker:build
npm.cmd run docker:bootstrap
npm.cmd run docker:match
```

If you prefer Docker directly and do not want to rely on host-side npm, the equivalent flow is:

```powershell
docker compose build
docker compose run --rm dev bash -lc "npm install && mvn -f engine/pom.xml install -DskipTests"
docker compose run --rm dev npm run match:ts
```

Notes:

- The repo is bind-mounted into `/workspace`, so host edits are visible immediately in the container.
- `node_modules` lives in a named Docker volume to avoid host/container package conflicts.
- Maven dependencies live in a named Docker volume, so the engine is not rebuilt from scratch each run.
- Rebuild the image only when the toolchain changes. Normal TypeScript edits do not require a new image.

## Engine coordination options

### Option A: plain clone into `engine/`

Simple and fast. Good if you do not care about preserving engine history inside this repo.

```powershell
git clone https://github.com/CodinGame/WinterChallenge2026-Exotec.git engine
```

### Option B: git submodule

Better if you want the engine pinned to a specific upstream commit.

```powershell
git submodule add https://github.com/CodinGame/WinterChallenge2026-Exotec.git engine
```

For contest work, a submodule is usually the cleanest choice.

## Package scripts

### Local scripts

| Script | Purpose | Notes |
| --- | --- | --- |
| `build` | Compile TypeScript into `dist/`. | Required before `start`, `bot`, `match`, `parity`, and `contest:build`. |
| `typecheck` | Run `tsc --noEmit`. | Fastest repo-wide TS sanity check. |
| `start` | Run `dist/index.js`. | Built GA/evolution entrypoint. |
| `dev` | Run `src/index.ts` through `tsx`. | Source-mode GA/evolution entrypoint. |
| `bot` | Run `dist/bot/cli.js`. | Built stdin/stdout contest bot. |
| `bot:ts` | Run `src/bot/cli.ts` through `tsx`. | Source-mode bot CLI. |
| `starter:ts` | Run `starter-runner.ts`. | Adapter for the official starter bot. |
| `match` | Run `dist/play.js`. | Built local match driver; prints parsed JSON summary. |
| `match:ts` | Run `src/play.ts` through `tsx`. | Source-mode local match driver. |
| `match:starter` | Run the official starter bot as player 1 versus the default sparring bot. | The default sparring bot is `python engine/config/Boss.py` on Windows and `python3 ...` elsewhere. |
| `match:vs-starter` | Run the heuristic bot versus the official starter bot. | Useful as a cheap regression check. |
| `match:self` | Run heuristic mirror self-play. | Both seats use the heuristic bot. |
| `match:debug` | Run heuristic vs starter with verbose candidate dumps. | Sets `SNAKEBYTE_DEBUG_CANDIDATES=verbose`. |
| `match:diagnostics` | Run structured diagnostics and persist artifacts under `.snakebyte/diagnostics/`. | Accepts flags such as `--candidate-id`, `--weights-file`, `--opponent-mode`, `--seeds`, `--top-n`, `--turn-limit`, and `--seat`. |
| `match:lookahead` | Run heuristic vs starter with forced lookahead enabled. | Sets `SNAKEBYTE_LOOKAHEAD=1`. |
| `contest:build` | Build the project, then bundle a single-file contest submission. | Writes `.snakebyte/submission/<candidate>.js` and refreshes `.snakebyte/submission/latest.js`. |
| `parity` | Build the project, then run local simulator parity checks. | Verifies the local simulator against engine behavior. |
| `ga:run` | Run the full evolution harness with default config. | Defaults come from [`src/config.ts`](/c:/Users/alexa/Projects/snakebyte/src/config.ts). |
| `ga:smoke` | Run a tiny smoke-sized evolution pass. | Uses `--population 4 --generations 1 --smoke-seeds`. |
| `ga:train` | Run a bounded training loop. | Uses `--population 8 --generations 3`. |

### Container scripts

| Script | Purpose | Notes |
| --- | --- | --- |
| `docker:build` | Build the `dev` image. | Run after Dockerfile or toolchain changes. |
| `docker:shell` | Open an interactive shell in the `dev` container. | Uses the repo bind mount and named volumes. |
| `docker:npm-install` | Install Node dependencies in the container volume. | Keeps host `node_modules` out of the loop. |
| `docker:engine-install` | Install the engine artifact into the container Maven cache. | Runs `mvn -f engine/pom.xml install -DskipTests`. |
| `docker:bootstrap` | Run both container dependency install steps. | Equivalent to `npm install` plus engine install inside the container. |
| `docker:match` | Run `match:ts` inside the container. | Source-mode local match. |
| `docker:match:starter` | Run `match:starter` inside the container. | Starter vs default sparring bot. |
| `docker:match:vs-starter` | Run `match:vs-starter` inside the container. | Heuristic vs starter. |
| `docker:match:self` | Run `match:self` inside the container. | Mirror self-play. |
| `docker:match:debug` | Run `match:debug` inside the container. | Verbose candidate dumps enabled. |
| `docker:match:diagnostics` | Run `match:diagnostics` inside the container. | Pass additional flags after `--`. |
| `docker:match:lookahead` | Run `match:lookahead` inside the container. | Forced lookahead enabled. |
| `docker:parity` | Run parity checks inside the container. | Uses the same script as the host flow. |
| `docker:ga:run` | Run the default evolution harness inside the container. | Good for longer unattended runs. |
| `docker:ga:smoke` | Run smoke-sized evolution inside the container. | Fast CI-style sanity check. |
| `docker:ga:train` | Run bounded GA training inside the container. | Persists standard run artifacts under `.snakebyte/`. |

### Raw Maven entrypoints

Install the engine artifact into your local Maven cache:

```powershell
mvn.cmd -f engine/pom.xml install -DskipTests
```

Launch a local match through the custom runner:

```powershell
mvn.cmd -q -f local-runner/pom.xml compile exec:java "-Dexec.args=--engineDir engine --player1 \"node dist/bot/cli.js\" --player2 \"python engine/config/Boss.py\" --seed 1 --port 8888 --simulate"
```

The custom runner exists so this repo can control players, seeds, and simulation mode without editing the upstream engine checkout.

## Training artifacts

GA, diagnostics, and submission tooling write generated files under `.snakebyte/`.

### Directory overview

| Path | Produced by | Meaning |
| --- | --- | --- |
| `.snakebyte/weights/` | GA evaluation and helper scripts | Canonical candidate weight files, one JSON file per candidate id. |
| `.snakebyte/archive/` | GA archival step | Rolling archive of elite candidates reused as future opponents and fallback submission inputs. |
| `.snakebyte/runs/<runId>/manifest.json` | `ga:run`, `ga:smoke`, `ga:train` | Top-level metadata for one training run. |
| `.snakebyte/runs/<runId>/generations/<nnn>.json` | GA generation summaries | Best-of-generation metrics plus archive snapshot and leaderboard slice. |
| `.snakebyte/runs/<runId>/candidates/<nnn>/<candidateId>.json` | GA generation snapshots | Full metrics and match breakdown for the top candidates kept from that generation. |
| `.snakebyte/generations/` | GA generation summaries | Flat mirror of generation summaries keyed by `<runId>-<generation>.json` for quick browsing. |
| `.snakebyte/diagnostics/<runId>/manifest.json` | `match:diagnostics` | Run-level metadata for a diagnostics batch. |
| `.snakebyte/diagnostics/<runId>/seed-<seed>-seat-<seat>.json` | `match:diagnostics` | Structured per-match diagnostics summary for one seed and seat. |
| `.snakebyte/diagnostics/<runId>/raw/.../player*.jsonl` | `match:diagnostics` | Turn-by-turn JSONL dump emitted directly by the bot CLI. |
| `.snakebyte/submission/<candidateId>.js` | `contest:build` | Bundled single-file contest submission with embedded weights. |
| `.snakebyte/submission/latest.js` | `contest:build` | Convenience copy of the most recently built submission. |

### Weight file schema

Each file in `.snakebyte/weights/` and `.snakebyte/archive/` is a JSON object whose keys are the evaluator feature names and whose values are the numeric weights used by the bot. The source of truth for feature semantics is [`src/bot/evaluator.ts`](/c:/Users/alexa/Projects/snakebyte/src/bot/evaluator.ts).

Current weight keys are:

- `survivalImmediate`
- `survivalAfterFall`
- `applesEaten`
- `adjacentAppleStall`
- `nearestAppleDistance`
- `pathAppleDistance`
- `gravityAppleDistance`
- `appleRaceMargin`
- `appleControl`
- `supportStability`
- `supportDelta`
- `selfCollisionRisk`
- `enemyCollisionRisk`
- `outOfBoundsRisk`
- `fallDistance`
- `reachableSpace`
- `minReachableSpace`
- `escapePressure`
- `headToHeadPressure`
- `opponentFirstReach`
- `friendlyHeadPressure`
- `bodyCountDelta`
- `headExposure`

### Run manifest schema

Each `.snakebyte/runs/<runId>/manifest.json` contains:

| Field | Meaning |
| --- | --- |
| `runId` | ISO-like identifier used as the directory name. |
| `startedAt`, `completedAt` | Training start and finish timestamps. |
| `seedSet` | Main evaluation seeds used for mirror, elite, and archive matches. |
| `timeoutSeedSet` | Reserved timeout-repro seeds recorded with the run config. |
| `passiveSeedSet` | Seeds used for the passive wait-bot checks that contribute to fitness. |
| `populationSize` | Candidate count per generation for that run. |
| `eliteCount` | Number of top candidates preserved before repopulation. |
| `maxGenerations` | Intended generation count for the run. |
| `generationTopCount` | Number of top candidates persisted per generation. |
| `bestCandidateIds` | Best candidate id from each completed generation, in order. |

### Generation summary schema

Each `.snakebyte/runs/<runId>/generations/<nnn>.json` and `.snakebyte/generations/<runId>-<nnn>.json` contains:

| Field | Meaning |
| --- | --- |
| `generation` | Zero-based generation index. |
| `bestCandidateId` | Best candidate in that generation, or `null` if unavailable. |
| `fitness` | Composite fitness used for ranking. |
| `averageScoreDelta` | Mean score difference across all recorded matches. |
| `winRate`, `drawRate`, `lossRate` | Outcome distribution for the best candidate. |
| `averageNonDrawMargin` | Mean score delta over non-draw matches only. |
| `scoreDeltaStdDev` | Standard deviation of score deltas. |
| `archiveSnapshot` | Candidate ids currently occupying the rolling archive after that generation. |
| `topCandidates` | Short leaderboard slice containing the same headline metrics for the persisted top candidates. |

### Candidate snapshot schema

Each `.snakebyte/runs/<runId>/candidates/<nnn>/<candidateId>.json` contains:

| Field | Meaning |
| --- | --- |
| `candidateId` | Stable candidate id. |
| `weights` | Full weight vector used by the bot. |
| `metrics` | Headline fitness, score delta, win/draw/loss rates, non-draw margin, and score-delta standard deviation. |
| `byOpponentClass` | Aggregated metrics grouped by `mirror`, `elite`, `archive`, or `passive` opponents. |
| `bySeed` | Aggregated metrics grouped by seed value. |
| `matches` | Per-match records including `opponentId`, `opponentClass`, `seed`, `seat`, parsed engine `summary`, `scoreDelta`, `win`, and `draw`. |

### Diagnostics schema

Each diagnostics run writes a manifest plus one JSON artifact per seed/seat pair.

Run manifest fields:

| Field | Meaning |
| --- | --- |
| `runId`, `startedAt`, `completedAt` | Diagnostics batch identity and timestamps. |
| `focus` | Candidate id and resolved weights file being inspected. |
| `opponentMode` | `mirror`, `archive`, or `elite`. |
| `opponentId` | Resolved opponent candidate id, if any. |
| `seeds` | Seeds included in the run. |
| `topN` | Number of top candidate evaluations to keep per turn. |
| `turnLimit` | Optional cap on how many turns each bot writes to JSONL. |
| `seats` | Which seats were exercised: `0`, `1`, or both. |
| `matches` | List of generated seed/seat artifact files. |

Per-match diagnostics artifact fields:

| Field | Meaning |
| --- | --- |
| `runId`, `seed`, `seat` | Match identity inside the diagnostics batch. |
| `candidate`, `opponent` | Candidate ids, weights files, occupied player slots, and opponent class. |
| `matchSummary` | Parsed match summary from the local runner, including scores, commands, winner, fail cause, referee summaries, and stderr-derived errors. |
| `focusSummary` | Candidate-centric result summary: score delta, win, and draw. |
| `players` | Per-player summaries including event counts, flagged decision-review turns, and raw `turns` records. |

Each raw `player*.jsonl` line is a turn record with:

| Field | Meaning |
| --- | --- |
| `type` | Always `turn`. |
| `turn` | Zero-based turn index written by the bot. |
| `playerIndex` | Engine player index for that bot process. |
| `command` | Chosen output command line for the turn. |
| `appleCount` | Apples remaining at decision time. |
| `mySnakebotCount`, `opponentSnakebotCount` | Live snakebot counts seen by that bot. |
| `topCandidates` | Top scored candidate evaluations retained for review. |
| `chosen` | The selected evaluation, including features, contributions, and simulated events when detailed debug is enabled. |
| `scoreGapToSecond` | Margin between the chosen action and the runner-up, or `null` if no runner-up exists. |

### Useful environment switches

| Variable | Effect |
| --- | --- |
| `SNAKEBYTE_DEBUG_CANDIDATES=1` | Emit compact candidate dumps to stderr during play. |
| `SNAKEBYTE_DEBUG_CANDIDATES=verbose` | Emit full debug records with per-feature contributions and simulated events. |
| `SNAKEBYTE_LOOKAHEAD=1` | Force the optional short lookahead layer on every turn. |
| `SNAKEBYTE_LOOKAHEAD_GAP_THRESHOLD` | Gap threshold for opportunistic lookahead when forced lookahead is off. |
| `SNAKEBYTE_LOOKAHEAD_TOP_ACTIONS` | Number of top root actions considered during lookahead. |
| `SNAKEBYTE_LOOKAHEAD_DISCOUNT` | Discount applied to continuation scores during lookahead. |
| `SNAKEBYTE_GENERATION_TOP_COUNT` | Number of top candidates persisted per generation. |
| `SNAKEBYTE_ARCHIVE_SIZE` | Max number of archived candidates kept for reuse. |

## Game rules

This project targets the CodinGame Winter Challenge 2026 snakebot game.

### Objective

- Collect power sources to grow your snakebots.
- Win by finishing the game with more total body parts than the opponent.

### Map

- The game is played on a side-view grid.
- `#` is a platform and blocks movement.
- `.` is an empty cell.
- Platforms, power sources, and snakebot bodies are solid for gravity support.

### Snakebots

- A snakebot is an ordered list of adjacent cells.
- The first cell is the head.
- Snakebots are affected by gravity.
- If no body part is supported by something solid, the snakebot falls.

### Movement

- Every snakebot keeps moving in its current facing direction unless told to turn.
- Initial facing direction is `UP`.
- On each turn, all snakebots move simultaneously.
- Legal movement commands are `UP`, `DOWN`, `LEFT`, and `RIGHT`.
- A snakebot cannot reverse into its own neck; the engine rejects backward turns.

### Collisions and growth

- If a head enters a platform or body part, that head is removed.
- If at least three body parts remain after the removal, the next body part becomes the new head.
- Otherwise the entire snakebot dies.
- If a head enters a power source, the snakebot eats it and grows by one segment.
- A consumed power-source cell stops being solid immediately.
- If multiple heads enter the same power-source cell simultaneously, each snakebot gets the growth.
- After movement resolves, snakebots fall until supported.
- Falling out of the map removes the snakebot.

### Turn actions

- Output one line per turn containing at least one action.
- Actions are separated by `;`.
- Available actions:
  - `<id> UP`
  - `<id> DOWN`
  - `<id> LEFT`
  - `<id> RIGHT`
  - `MARK x y`
  - `WAIT`
- Up to 4 `MARK` actions may be used per turn.
- Movement commands may include trailing debug text.

### Game end

The game ends when one of these happens:

- one player has no snakebots left
- there are no power sources left
- 200 turns have elapsed

### Input model

Initialization provides:

- your player id
- grid width and height
- the static map
- snakebots per player
- your snakebot ids
- opponent snakebot ids

Each turn provides:

- remaining power source coordinates
- all live snakebots
- each snakebot body as `x,y:x,y:...` with the head first

### Practical implications for bots

- Survival matters more than short-term growth if a path creates head-loss or falling risk.
- Support and gravity are core mechanics, not edge cases.
- Simultaneous resolution means head-to-head races for power sources can be valuable.
- The evaluation function should consider both immediate movement and post-move falling.

## Evaluator features

[`FeatureVector` in `src/bot/evaluator.ts`](/c:/Users/alexa/Projects/snakebyte/src/bot/evaluator.ts) is the source of truth for feature semantics. When evaluator work changes the meaning of a feature, update those field comments in the same change.

## ML path

Use the Java engine as the source of truth for state transitions and game results. Run self-play from TypeScript by spawning Java matches, collecting logs, and scoring candidate parameter sets.

The practical progression is:

1. Parameterized heuristic bot
2. Batch self-play harness
3. Evolutionary tuning of weights
4. Optional learned value model over logged states

## TypeScript

TypeScript is a reasonable choice for:

- experiment orchestration
- batch evaluation
- feature extraction
- GA or CMA-style tuning
- result logging and analysis

It is less ideal for the core simulator if you need maximum speed. Since the official engine is Java, using TypeScript as the controller and Java as the simulator is a sensible split.

## Commit style

This repo uses Conventional Commits by convention. Local hook enforcement is intentionally disabled for now because Git-for-Windows is failing when hooks spawn shell scripts in this environment.

Examples:

- `feat(engine): add match runner`
- `fix(bot): avoid suicidal head collisions`
- `chore(repo): add engine submodule`
