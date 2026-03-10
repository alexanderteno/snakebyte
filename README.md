# snakebyte

Local workspace for experimenting with CodinGame Winter Challenge 2026 bots.

## Layout

- `engine/`: place the CodinGame Java engine here. Keep it as an upstream checkout or submodule.
- `src/engine/`: TypeScript wrapper for running local matches against the engine.
- `src/bot/`: your policy code and feature extraction.
- `src/ga/`: evolutionary tuning logic.
- `src/index.ts`: local entrypoint for experiments.

## Game Rules

This project targets the CodinGame Winter Challenge 2026 snakebot game.

### Objective

- Collect power sources to grow your snakebots.
- Win by finishing the game with more total body parts than the opponent.

### Map

- The game is played on a side-view grid.
- `#` is a platform and blocks movement.
- `.` is an empty cell.
- Power sources, platforms, and snakebot bodies can support falling snakebots.

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
- A snakebot cannot reverse into its own neck because the engine rejects backwards turns.

### Collisions and Growth

- If a head enters a platform or body part, the head is removed.
- If at least three body parts remain, the next body part becomes the new head.
- Otherwise the entire snakebot dies.
- If a head enters a power source, the snakebot eats it and grows by one segment.
- That power-source cell stops being solid after being eaten.
- If multiple heads enter the same power-source cell simultaneously, each snakebot gets the growth.
- After movement resolves, snakebots fall until supported.
- Falling out of the map removes the snakebot.

### Turn Actions

- Output exactly one line per turn.
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

### Game End

The game ends when one of these happens:

- one player has no snakebots left
- there are no power sources left
- 200 turns have elapsed

### Input Model

Initialization provides:

- your player id
- grid width and height
- the static map
- your snakebot ids
- opponent snakebot ids

Each turn provides:

- remaining power source coordinates
- all live snakebots
- each snakebot body as `x,y:x,y:...` with the head first

### Practical Implications For Bots

- Survival matters more than short-term growth if a path creates head-loss or falling risk.
- Support and gravity are core mechanics, not edge cases.
- Simultaneous resolution means head-to-head races for power sources can be valuable.
- The evaluation function should consider both immediate movement and post-move falling.

## Recommended workflow

1. Keep this repository as your working repo.
2. Bring the CodinGame engine into `engine/`.
3. Treat the engine as read-only upstream code unless you intentionally need patches.
4. Put all bot, orchestration, logging, and optimization code in this repository.

## Commit style

This repo uses Conventional Commits by convention.
Local hook enforcement is intentionally disabled for now because Git-for-Windows is failing when hooks spawn shell scripts in this environment.
Use the commit template and keep commit subjects in Conventional Commits form.

Examples:

- `feat(engine): add match runner`
- `fix(bot): avoid suicidal head collisions`
- `chore(repo): add engine submodule`

## Engine coordination options

### Option A: plain clone into `engine/`

Simple and fast. Good if you do not care about preserving the engine history inside this repo.

```powershell
git clone https://github.com/CodinGame/WinterChallenge2026-Exotec.git engine
```

### Option B: git submodule

Better if you want the engine pinned to a specific upstream commit.

```powershell
git submodule add https://github.com/CodinGame/WinterChallenge2026-Exotec.git engine
```

For contest work, submodule is usually the cleanest choice.

## Local entrypoints

- Build the TypeScript bot:

```powershell
npm.cmd run build
```

- Run the TypeScript entrypoint that launches one local match:

```powershell
npm.cmd run match
```

- Run the match entrypoint directly from source without a TS build:

```powershell
npm.cmd run match:ts
```

- Run the official starter bot against the Python boss bot:

```powershell
npm.cmd run match:starter
```

- Run the heuristic bot against the official starter bot:

```powershell
npm.cmd run match:vs-starter
```

- Run a heuristic mirror match:

```powershell
npm.cmd run match:self
```

- Run a heuristic match with verbose top-candidate diagnostics:

```powershell
npm.cmd run match:debug
```

- Run structured self-play diagnostics and persist artifacts under `.snakebyte/diagnostics/`:

```powershell
npm.cmd run match:diagnostics -- --candidate-id cbce4c1e-5d26-4f78-b794-3bed60333b6a --opponent-mode mirror --seeds 1 --top-n 3 --turn-limit 40
```

- Run a heuristic match with one-step lookahead enabled:

```powershell
npm.cmd run match:lookahead
```

- Run local simulator parity checks:

```powershell
npm.cmd run parity
```

- Run a bounded GA training loop that persists run artifacts:

```powershell
npm.cmd run ga:train
```

- Install the engine artifact into your local Maven cache:

```powershell
mvn.cmd -f engine/pom.xml install -DskipTests
```

- Launch a local match through the custom runner module:

```powershell
mvn.cmd -f local-runner/pom.xml exec:java -Dexec.args="--player1 node dist/bot/cli.js --player2 python engine/config/Boss.py --seed 1 --port 8888"
```

The custom runner exists so your repo can control agents and seeds without editing the upstream submodule.
The Python boss is only a legacy fallback sparring target for ad hoc local matches. Diagnostics and GA training should prefer mirror or archived heuristic opponents.

## Container workflow

The repository includes a single dev container intended for fast iteration without installing Java or Maven on the host.

Common shortcuts from the host:

```powershell
npm.cmd run docker:build
npm.cmd run docker:bootstrap
npm.cmd run docker:match
```

Available helper scripts:

- `npm.cmd run docker:build`: build the dev image
- `npm.cmd run docker:shell`: open an interactive shell in the dev container
- `npm.cmd run docker:npm-install`: install Node dependencies into the container volume
- `npm.cmd run docker:engine-install`: install the Java engine artifact into the container Maven cache
- `npm.cmd run docker:bootstrap`: run both npm install and engine install in one step
- `npm.cmd run docker:match`: launch the TypeScript match entrypoint inside the container
- `npm.cmd run docker:match:starter`: launch the official starter bot inside the container for a smoke test
- `npm.cmd run docker:match:debug`: launch a verbose candidate-dump match inside the container
- `npm.cmd run docker:match:diagnostics -- --candidate-id <id> --opponent-mode mirror`: persist structured self-play diagnostics inside the container
- `npm.cmd run docker:match:lookahead`: launch a one-step-lookahead match inside the container
- `npm.cmd run docker:parity`: run local simulator parity checks inside the container
- `npm.cmd run docker:ga:train`: run a bounded GA training loop and persist run artifacts

The automated match entrypoints now run the engine in non-interactive simulation mode and print a machine-readable JSON summary with scores, winner, fail cause, and referee summaries.

Equivalent raw commands if you prefer Docker directly:

Build the image once:

```powershell
docker compose build
```

Open a shell in the container:

```powershell
docker compose run --rm dev
```

Inside the container, install JS dependencies once into the container volume:

```bash
npm install
```

Build the upstream engine artifact into the container's Maven cache:

```bash
mvn -f engine/pom.xml install -DskipTests
```

Then iterate quickly from source:

```bash
npm run match:ts
```

Notes:

- The repository is bind-mounted into `/workspace`, so TypeScript edits on the host are visible immediately.
- `node_modules` is stored in a named Docker volume to avoid Windows host/container package issues.
- Maven dependencies are cached in a named Docker volume, so the engine does not redownload everything each run.
- Rebuild the image only when the toolchain changes. Normal TypeScript edits do not require image rebuilds.

## Training Artifacts

GA and parity tooling writes artifacts under `.snakebyte/`.

- `.snakebyte/weights/`: candidate weight files
- `.snakebyte/archive/`: archived elite candidates
- `.snakebyte/generations/`: latest generation summaries
- `.snakebyte/runs/`: per-run manifests, generation summaries, and top-candidate snapshots

Use `SNAKEBYTE_DEBUG_CANDIDATES=1` for compact candidate dumps and `SNAKEBYTE_DEBUG_CANDIDATES=verbose` for full per-feature contributions and simulator events.
Use `npm.cmd run match:diagnostics -- --candidate-id <id> --opponent-mode mirror|archive|elite` to capture per-turn chosen actions, top alternatives, and match summaries as JSON artifacts.
Use `npm.cmd run contest:build -- --candidate-id <id>` to bundle a single-file contest submission with embedded weights. If no candidate is provided, the builder uses the latest archived candidate and writes `.snakebyte/submission/latest.js`.
Use `SNAKEBYTE_LOOKAHEAD=1` to enable the optional one-step lookahead layer.
Without `SNAKEBYTE_LOOKAHEAD=1`, the bot still applies one-step lookahead as a tiebreaker when the top candidate scores are within `SNAKEBYTE_LOOKAHEAD_GAP_THRESHOLD` (default `0.5`).

## Evaluator Features

`FeatureVector` in [src/bot/evaluator.ts](/c:/Users/alexa/Projects/snakebyte/src/bot/evaluator.ts) is the source of truth for feature semantics.
When evaluator work changes the meaning of a feature, update those field comments in the same change.

## ML path

Use the Java engine as the source of truth for state transitions and game results.
Run self-play from TypeScript by spawning Java matches, collecting logs, and scoring candidate parameter sets.

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
