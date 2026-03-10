package snakebyte.runner;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.codingame.gameengine.runner.simulate.AgentData;
import com.codingame.gameengine.runner.simulate.GameResult;
import com.codingame.gameengine.runner.MultiplayerGameRunner;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

public final class LocalRunner {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    private static final String RESULT_PREFIX = "MATCH_RESULT_JSON=";

    private LocalRunner() {
    }

    public static void main(String[] args) {
        RunnerOptions options = RunnerOptions.parse(args);
        System.setProperty("user.dir", options.engineDir);

        MultiplayerGameRunner gameRunner = new MultiplayerGameRunner();

        if (options.seed != null) {
            gameRunner.setSeed(options.seed);
        }

        gameRunner.addAgent(options.player1Command, "Player 1");
        gameRunner.addAgent(options.player2Command, "Player 2");

        if (options.simulate) {
            GameResult result = gameRunner.simulate();
            System.out.println(RESULT_PREFIX + GSON.toJson(buildSummary(result, options)));
            return;
        }

        gameRunner.start(options.port);
    }

    private static MatchSummary buildSummary(GameResult result, RunnerOptions options) {
        Integer player1Score = result.scores.getOrDefault(0, 0);
        Integer player2Score = result.scores.getOrDefault(1, 0);
        Integer winnerIndex = null;

        if (!player1Score.equals(player2Score)) {
            winnerIndex = player1Score > player2Score ? 0 : 1;
        }

        List<AgentSummary> agents = new ArrayList<>();
        for (AgentData agent : result.agents) {
            agents.add(new AgentSummary(agent.index, agent.name));
        }

        return new MatchSummary(
            options.seed,
            options.player1Command,
            options.player2Command,
            player1Score,
            player2Score,
            winnerIndex,
            result.failCause,
            sanitizeLines(result.summaries),
            sanitizeErrors(result.errors),
            agents
        );
    }

    private static List<String> sanitizeLines(List<String> lines) {
        return lines.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .toList();
    }

    private static Map<String, List<String>> sanitizeErrors(Map<String, List<String>> errors) {
        Map<String, List<String>> sanitized = new LinkedHashMap<>();

        for (Map.Entry<String, List<String>> entry : errors.entrySet()) {
            List<String> lines = sanitizeLines(entry.getValue());
            if (!lines.isEmpty()) {
                sanitized.put(entry.getKey(), lines);
            }
        }

        return sanitized;
    }

    private static final class RunnerOptions {
        private final String player1Command;
        private final String player2Command;
        private final String engineDir;
        private final Long seed;
        private final int port;
        private final boolean simulate;

        private RunnerOptions(
            String player1Command,
            String player2Command,
            String engineDir,
            Long seed,
            int port,
            boolean simulate
        ) {
            this.player1Command = player1Command;
            this.player2Command = player2Command;
            this.engineDir = engineDir;
            this.seed = seed;
            this.port = port;
            this.simulate = simulate;
        }

        private static RunnerOptions parse(String[] args) {
            String player1 = null;
            String player2 = null;
            String engineDir = null;
            Long seed = null;
            int port = 8888;
            boolean simulate = false;

            for (int i = 0; i < args.length; i++) {
                String arg = args[i];

                switch (arg) {
                    case "--player1":
                        player1 = requireValue(args, ++i, arg);
                        break;
                    case "--player2":
                        player2 = requireValue(args, ++i, arg);
                        break;
                    case "--seed":
                        seed = Long.valueOf(requireValue(args, ++i, arg));
                        break;
                    case "--port":
                        port = Integer.parseInt(requireValue(args, ++i, arg));
                        break;
                    case "--engineDir":
                        engineDir = requireValue(args, ++i, arg);
                        break;
                    case "--simulate":
                        simulate = true;
                        break;
                    default:
                        throw new IllegalArgumentException("Unknown argument: " + arg);
                }
            }

            if (player1 == null || player2 == null || engineDir == null) {
                throw new IllegalArgumentException("Arguments --player1, --player2, and --engineDir are required");
            }

            return new RunnerOptions(player1, player2, engineDir, seed, port, simulate);
        }

        private static String requireValue(String[] args, int index, String optionName) {
            if (index >= args.length) {
                throw new IllegalArgumentException("Missing value for " + optionName);
            }
            return args[index];
        }
    }

    private record AgentSummary(int index, String name) {
    }

    private record MatchSummary(
        Long seed,
        String player1Command,
        String player2Command,
        Integer player1Score,
        Integer player2Score,
        Integer winnerIndex,
        String failCause,
        List<String> summaries,
        Map<String, List<String>> errors,
        List<AgentSummary> agents
    ) {
    }
}
