import { formatDuration } from "../utils/time.js";
import { rewriteInputCalls } from "./input.js";
export function createPyodideController(state, addConsoleLine, updateStatusBar, refocusEditor, getCodeForMode, getRunModeLabel, runBtn, runModeBtn, prefs, resetStdoutBuffer, flushStdoutBuffer) {
    async function initializePyodide() {
        if (state.pyodideInstance)
            return;
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
    async function runCode(mode = "all") {
        var _a, _b;
        if (state.isRunning)
            return;
        state.isRunning = true;
        updateStatusBar();
        runBtn.disabled = true;
        runModeBtn.disabled = true;
        resetStdoutBuffer();
        try {
            if (!state.pyodideInstance)
                await initializePyodide();
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
        }
        catch (err) {
            const msg = (_b = (_a = err === null || err === void 0 ? void 0 : err.toString) === null || _a === void 0 ? void 0 : _a.call(err)) !== null && _b !== void 0 ? _b : String(err);
            msg.split("\n").forEach((l) => {
                if (l.trim())
                    addConsoleLine(l, { error: true });
            });
            addConsoleLine("Finished with errors.", { dim: true, system: true });
        }
        finally {
            state.isRunning = false;
            updateStatusBar();
            runBtn.disabled = false;
            runModeBtn.disabled = false;
            refocusEditor();
        }
    }
    return { runCode, resetEnvironment };
}
