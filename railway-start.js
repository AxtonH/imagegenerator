const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = __dirname;
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const backendUrl = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";
const backendPort = "8000";
const isWindows = process.platform === "win32";
const venvDir = path.join(rootDir, ".venv");
const venvPython = path.join(venvDir, isWindows ? "Scripts\\python.exe" : "bin/python");
const venvPip = path.join(venvDir, isWindows ? "Scripts\\pip.exe" : "bin/pip");

function log(message) {
  console.log(`[railway-start] ${message}`);
}

function findPython() {
  for (const candidate of [process.env.PYTHON_BIN, venvPython, "python", "python3"].filter(Boolean)) {
    const check = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (check.status === 0) return candidate;
  }
  throw new Error("Python was not found. Railway must install python312.");
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  return result.status === 0;
}

function hasUvicorn(pythonBin) {
  const result = spawnSync(pythonBin, ["-c", "import uvicorn"], { stdio: "ignore" });
  return result.status === 0;
}

function installBackendDependencies(pythonBin) {
  const requirements = path.join("backend", "requirements.txt");
  if (pythonBin !== venvPython) {
    log("Creating local Python virtual environment");
    tryRun(pythonBin, ["-m", "venv", venvDir], { cwd: rootDir });
  }

  const attempts = [
    [venvPython, ["-m", "pip", "install", "-r", requirements]],
    [venvPip, ["install", "-r", requirements]],
    [pythonBin, ["-m", "pip", "install", "-r", requirements]],
    ["pip", ["install", "-r", requirements]],
    ["pip3", ["install", "-r", requirements]],
  ];

  for (const [command, args] of attempts) {
    log(`Trying backend dependency install with: ${command} ${args.join(" ")}`);
    if (tryRun(command, args, { cwd: rootDir })) return;
  }

  throw new Error("Could not install backend dependencies because pip is unavailable.");
}

async function waitForBackend(processHandle) {
  log(`Waiting for FastAPI backend on ${backendUrl}/health`);
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`FastAPI backend exited before readiness with code ${processHandle.exitCode}`);
    }

    try {
      const response = await fetch(`${backendUrl}/health`);
      if (response.ok) {
        log("FastAPI backend is ready");
        return;
      }
    } catch {
      // Retry until the backend is accepting connections.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("FastAPI backend did not become ready after 30 seconds");
}

async function main() {
  process.env.INTERNAL_API_URL = backendUrl;
  const pythonBin = findPython();

  if (!hasUvicorn(pythonBin)) {
    log("Installing backend dependencies");
    installBackendDependencies(pythonBin);
  }

  log("Starting FastAPI backend");
  const backend = spawn(
    pythonBin,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", backendPort],
    {
      cwd: backendDir,
      stdio: "inherit",
      env: process.env,
    },
  );

  await waitForBackend(backend);

  log("Starting Next.js frontend");
  const frontend = spawn("npm", ["run", "start:next"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  const stop = (code = 0) => {
    if (frontend.exitCode === null) frontend.kill();
    if (backend.exitCode === null) backend.kill();
    process.exit(code);
  };

  backend.on("exit", (code) => {
    console.error(`[railway-start] FastAPI backend stopped with code ${code}`);
    stop(code || 1);
  });

  frontend.on("exit", (code) => {
    log(`Next.js frontend stopped with code ${code}`);
    stop(code || 0);
  });

  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
}

main().catch((error) => {
  console.error(`[railway-start] ${error.stack || error.message}`);
  process.exit(1);
});
