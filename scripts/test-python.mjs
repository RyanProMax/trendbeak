import { spawnSync } from "node:child_process";

// Windows may expose a nonfunctional python3 Store alias. Probe installed runtimes.
const candidates = process.env.PYTHON
  ? [[process.env.PYTHON]]
  : process.platform === "win32"
    ? [["python"], ["py", "-3"], ["python3"]]
    : [["python3"], ["python"]];
for (const [command, ...prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], { timeout: 5000, windowsHide: true, stdio: "ignore" });
  if (probe.error || probe.status !== 0) continue;
  const result = spawnSync(command, [...prefix, "-m", "unittest", "tests/test_x_intelligence.py"], { windowsHide: true, stdio: "inherit" });
  process.exit(result.status ?? 1);
}
console.error("Python 3.10+ is required for the test suite. Set PYTHON to its executable if needed.");
process.exit(1);
