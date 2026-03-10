# snakebyte

Local workspace for experimenting with CodinGame Winter Challenge 2026 bots.

## Layout

- `engine/`: place the CodinGame Java engine here. Keep it as an upstream checkout or submodule.
- `src/engine/`: TypeScript wrapper for running local matches against the engine.
- `src/bot/`: your policy code and feature extraction.
- `src/ga/`: evolutionary tuning logic.
- `src/index.ts`: local entrypoint for experiments.

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

- Install the engine artifact into your local Maven cache:

```powershell
mvn.cmd -f engine/pom.xml install -DskipTests
```

- Launch a local match through the custom runner module:

```powershell
mvn.cmd -f local-runner/pom.xml exec:java -Dexec.args="--player1 node dist/bot/cli.js --player2 python engine/config/Boss.py --seed 1 --port 8888"
```

The custom runner exists so your repo can control agents and seeds without editing the upstream submodule.

## Container workflow

The repository includes a single dev container intended for fast iteration without installing Java or Maven on the host.

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
