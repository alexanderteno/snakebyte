This directory is for your game-specific policy code.

Suggested split:

- `features.ts`: extract numeric features from state/action pairs
- `heuristic.ts`: weighted evaluation function
- `policy.ts`: action selection over legal moves
- `opponents/`: fixed sparring bots for local evaluation

Current source of truth for evaluator feature meanings is [evaluator.ts](/c:/Users/alexa/Projects/snakebyte/src/bot/evaluator.ts).
Keep the `FeatureVector` field comments in sync whenever features are added, removed, or repurposed.
