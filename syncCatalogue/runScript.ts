import { spawn } from "node:child_process";
import path from "node:path";

export async function runScript(params: {
  workspaceRoot: string;
  scriptPath: string;
  scriptArgs?: string[];
  tsxArgs?: string[];
}) {
  const tsxCliPath = path.join(
    params.workspaceRoot,
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );
  const scriptArgs = params.scriptArgs ?? [];
  const tsxArgs = params.tsxArgs ?? [];
  const commandArgs = [tsxCliPath, ...tsxArgs, params.scriptPath, ...scriptArgs];

  console.info("[syncCatalogue] running script", {
    scriptPath: params.scriptPath,
    args: scriptArgs,
    envFile: tsxArgs.includes("--env-file")
      ? tsxArgs[tsxArgs.indexOf("--env-file") + 1] ?? null
      : null,
  });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd: params.workspaceRoot,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed: ${process.execPath} ${commandArgs.join(" ")}${
            signal ? ` (signal: ${signal})` : ""
          }`,
        ),
      );
    });
  });
}
