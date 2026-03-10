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

This repo is configured for Conventional Commits.

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
