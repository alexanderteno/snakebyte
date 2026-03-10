This directory is for your game-specific policy code.

Suggested split:

- `features.ts`: extract numeric features from state/action pairs
- `heuristic.ts`: weighted evaluation function
- `policy.ts`: action selection over legal moves
- `opponents/`: fixed sparring bots for local evaluation

