import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited via signal ${signal}`);
      return;
    }
    if (code !== 0) {
      console.log(`[${name}] exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

const api = run("api", "npm", ["run", "api:dev"], root);
const web = run("frontend", "npm", ["run", "dev"], root);

let stopping = false;

function shutdown(exitCode = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of [api, web]) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
