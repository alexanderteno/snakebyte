package snakebyte.runner;

import com.codingame.gameengine.runner.MultiplayerGameRunner;

public final class LocalRunner {

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
        gameRunner.start(options.port);
    }

    private static final class RunnerOptions {
        private final String player1Command;
        private final String player2Command;
        private final String engineDir;
        private final Long seed;
        private final int port;

        private RunnerOptions(String player1Command, String player2Command, String engineDir, Long seed, int port) {
            this.player1Command = player1Command;
            this.player2Command = player2Command;
            this.engineDir = engineDir;
            this.seed = seed;
            this.port = port;
        }

        private static RunnerOptions parse(String[] args) {
            String player1 = null;
            String player2 = null;
            String engineDir = null;
            Long seed = null;
            int port = 8888;

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
                    default:
                        throw new IllegalArgumentException("Unknown argument: " + arg);
                }
            }

            if (player1 == null || player2 == null || engineDir == null) {
                throw new IllegalArgumentException("Arguments --player1, --player2, and --engineDir are required");
            }

            return new RunnerOptions(player1, player2, engineDir, seed, port);
        }

        private static String requireValue(String[] args, int index, String optionName) {
            if (index >= args.length) {
                throw new IllegalArgumentException("Missing value for " + optionName);
            }
            return args[index];
        }
    }
}
