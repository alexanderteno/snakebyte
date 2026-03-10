import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { normalizeWeights } from "../dist/bot/weights.js";
import { readArchiveCandidates, resolveCandidateReference } from "../dist/ga/io.js";

async function main() {
  const resolvedCandidate = resolveSubmissionCandidate(process.argv.slice(2));
  const outputFile = resolveOutputFile(process.argv.slice(2), resolvedCandidate.id);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });

  await build({
    entryPoints: [path.resolve(process.cwd(), "dist", "contest", "submission.js")],
    outfile: outputFile,
    bundle: true,
    format: "iife",
    platform: "neutral",
    target: "es2020",
    legalComments: "none",
    define: {
      __SNAKEBYTE_SUBMISSION_WEIGHTS__: JSON.stringify(resolvedCandidate.weights),
    },
    banner: {
      js: `// @ts-nocheck\n// candidate-id: ${resolvedCandidate.id}\n// weights-file: ${normalizeCommentPath(resolvedCandidate.filePath)}\n// generated-at: ${new Date().toISOString()}\n`,
    },
  });

  const latestFile = path.join(path.dirname(outputFile), "latest.js");
  if (path.resolve(outputFile) !== path.resolve(latestFile)) {
    fs.copyFileSync(outputFile, latestFile);
  }

  process.stdout.write(`${path.relative(process.cwd(), outputFile).replaceAll("\\", "/")}\n`);
}

function resolveSubmissionCandidate(argv) {
  const candidateId = getFlagValue(argv, "--candidate-id");
  const weightsFile = getFlagValue(argv, "--weights-file");

  if (candidateId) {
    return resolveCandidateReference(candidateId, weightsFile);
  }

  if (weightsFile) {
    const filePath = path.resolve(process.cwd(), weightsFile);
    const weights = normalizeWeights(JSON.parse(fs.readFileSync(filePath, "utf8")));
    return {
      id: path.basename(filePath, path.extname(filePath)),
      filePath,
      weights,
    };
  }

  const bestCandidateId = resolveLatestBestCandidateId();
  if (bestCandidateId) {
    return resolveCandidateReference(bestCandidateId);
  }

  const latestArchive = readArchiveCandidates(1)[0];
  if (!latestArchive) {
    throw new Error("Unable to resolve a submission candidate. Provide --candidate-id or --weights-file.");
  }

  return resolveCandidateReference(latestArchive.id);
}

function resolveOutputFile(argv, candidateId) {
  const explicitOutput = getFlagValue(argv, "--output");
  if (explicitOutput) {
    return path.resolve(process.cwd(), explicitOutput);
  }

  return path.resolve(process.cwd(), ".snakebyte", "submission", `${candidateId}.js`);
}

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function normalizeCommentPath(value) {
  return path.relative(process.cwd(), value).replaceAll("\\", "/");
}

function resolveLatestBestCandidateId() {
  const runsDir = path.resolve(process.cwd(), ".snakebyte", "runs");
  if (!fs.existsSync(runsDir)) {
    return null;
  }

  const manifests = fs.readdirSync(runsDir)
    .map((name) => path.join(runsDir, name, "manifest.json"))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .map((manifestPath) => JSON.parse(fs.readFileSync(manifestPath, "utf8")))
    .filter((manifest) => typeof manifest.completedAt === "string")
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
  const latestManifest = manifests[0];
  if (!latestManifest || !Array.isArray(latestManifest.bestCandidateIds)) {
    return null;
  }

  const bestCandidateId = latestManifest.bestCandidateIds.at(-1);
  return typeof bestCandidateId === "string" ? bestCandidateId : null;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
