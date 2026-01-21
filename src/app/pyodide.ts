import { formatDuration } from "../utils/time.js";
import { AppState, RunMode } from "./types.js";
import { rewriteInputCalls } from "./input.js";

export type PyodideController = {
  runCode: (mode?: RunMode) => Promise<void>;
  resetEnvironment: () => void;
};

export function createPyodideController(
  state: AppState,
  addConsoleLine: (text: string, opts?: { dim?: boolean; system?: boolean; error?: boolean }) => void,
  updateStatusBar: () => void,
  refocusEditor: () => void,
  getCodeForMode: (mode: RunMode) => string | null,
  getRunModeLabel: (mode: RunMode) => string,
  runBtn: HTMLButtonElement,
  runModeBtn: HTMLButtonElement,
  prefs: { showExecTime: boolean },
  resetStdoutBuffer: () => void,
  flushStdoutBuffer: () => void
): PyodideController {
  async function initializePyodide() {
    if (state.pyodideInstance) return;

    addConsoleLine("Loading Pyodide… This may take a moment on first run.", {
      dim: true,
      system: true
    });
    state.pyodideReady = false;
    updateStatusBar();

    state.pyodideInstance = await loadPyodide();

    state.pyodideInstance.runPython(`
import sys
import js

class JSConsole:
    def write(self, s):
        js.inscribeStdout(s)
    def flush(self):
        js.inscribeStdoutFlush()

sys.stdout = JSConsole()
sys.stderr = JSConsole()
    `);

    await state.pyodideInstance.runPythonAsync(`
import builtins
def custom_input(prompt=""):
    raise RuntimeError("input() is handled by the console UI. If you see this, the editor could not rewrite input() calls.")
builtins.input = custom_input
    `);

    state.pyodideReady = true;
    updateStatusBar();

    addConsoleLine("Inscribe Editor & Execution with Pyodide", { dim: true, system: true });
    addConsoleLine("Inscribe v3.1 / (c) Mark Yu, py.mkyu.one", { dim: true, system: true });
    addConsoleLine("------------------------------------------", { dim: true, system: true });
  }

  function resetEnvironment() {
    state.pyodideInstance = null;
    state.pyodideReady = false;
    resetStdoutBuffer();
    addConsoleLine("Environment reset. Next run will reload Pyodide.", {
      dim: true,
      system: true
    });
    updateStatusBar();
    refocusEditor();
  }

  async function runCode(mode: RunMode = "all") {
    if (state.isRunning) return;
    state.isRunning = true;
    updateStatusBar();

    runBtn.disabled = true;
    runModeBtn.disabled = true;
    resetStdoutBuffer();

    try {
      if (!state.pyodideInstance) await initializePyodide();

      const code = getCodeForMode(mode);
      if (!code || !code.trim()) {
        addConsoleLine(mode === "selection" ? "No selection to run." : "Nothing to run.", {
          dim: true,
          system: true
        });
        return;
      }

      addConsoleLine(`Executing (${getRunModeLabel(mode)})…`, { dim: true, system: true });

      const t0 = performance.now();
      const rewritten = rewriteInputCalls(code);
      const codeToRun = rewritten.changed ? rewritten.code : code;
      await state.pyodideInstance.runPythonAsync(codeToRun);

      flushStdoutBuffer();

      const dt = performance.now() - t0;
      if (prefs.showExecTime) {
        addConsoleLine(`Finished in ${formatDuration(dt)}.`, { dim: true, system: true });
      }
    } catch (err) {
      const msg = err?.toString?.() ?? String(err);
      msg.split("\n").forEach((l: string) => {
        if (l.trim()) addConsoleLine(l, { error: true });
      });
      addConsoleLine("Finished with errors.", { dim: true, system: true });
    } finally {
      state.isRunning = false;
      updateStatusBar();
      runBtn.disabled = false;
      runModeBtn.disabled = false;
      refocusEditor();
    }
  }

  return { runCode, resetEnvironment };
}
