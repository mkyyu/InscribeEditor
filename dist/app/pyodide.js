import { formatDuration } from "../utils/time.js";
import { BUILD_TIME } from "../version.js";
export function createPyodideController(state, addConsoleLine, updateStatusBar, refocusEditor, getCodeForMode, getRunModeLabel, runBtn, runModeBtn, prefs, resetStdoutBuffer, flushStdoutBuffer, handleStdout, requestInput, showIsolationWarning, confirmAsyncioRun) {
    const inputMaxBytes = 64 * 1024;
    const supportsBlockingInput = typeof SharedArrayBuffer !== "undefined" && window.crossOriginIsolated === true;
    let worker = null;
    let stdinSab = null;
    let stdinI32 = null;
    let stdinU8 = null;
    let runResolve = null;
    let runStart = 0;
    let warnedIsolation = false;
    let warnedAsyncioRun = false;
    function setReady(ready) {
        state.pyodideReady = ready;
        updateStatusBar();
    }
    function postToWorker(message) {
        if (!worker)
            return;
        worker.postMessage(message);
    }
    function ensureWorker() {
        if (worker)
            return true;
        if (!supportsBlockingInput) {
            if (!warnedIsolation) {
                addConsoleLine("Blocking input requires cross-origin isolation (COOP/COEP headers).", { error: true });
                addConsoleLine("Enable COOP/COEP on your host to use input() and time.sleep().", { dim: true, system: true });
                addConsoleLine("Tip: check `self.crossOriginIsolated` in DevTools.", {
                    dim: true,
                    system: true
                });
                warnedIsolation = true;
            }
            showIsolationWarning();
            return false;
        }
        addConsoleLine("Loading Pyodide… This may take a moment on first run.", {
            dim: true,
            system: true
        });
        setReady(false);
        stdinSab = new SharedArrayBuffer(8 + inputMaxBytes);
        stdinI32 = new Int32Array(stdinSab, 0, 2);
        stdinU8 = new Uint8Array(stdinSab, 8);
        const workerUrl = `dist/worker/pyodide-worker.js?v=${encodeURIComponent(BUILD_TIME)}`;
        worker = new Worker(workerUrl);
        worker.onmessage = (event) => {
            handleWorkerMessage(event.data);
        };
        worker.onerror = (event) => {
            addConsoleLine(`Worker error: ${event.message || "unknown"}`, { error: true });
            setReady(false);
        };
        const initMessage = {
            type: "init",
            stdinSab,
            stdinMaxBytes: inputMaxBytes
        };
        postToWorker(initMessage);
        return true;
    }
    async function handleInputRequest(prompt) {
        if (!stdinI32 || !stdinU8) {
            addConsoleLine("Input bridge unavailable. Check cross-origin isolation.", {
                error: true
            });
            return;
        }
        const value = await requestInput(prompt);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        const length = Math.min(bytes.length, stdinU8.length);
        stdinU8.set(bytes.subarray(0, length));
        stdinI32[1] = length;
        Atomics.store(stdinI32, 0, 2);
        Atomics.notify(stdinI32, 0, 1);
    }
    function handleWorkerMessage(message) {
        switch (message.type) {
            case "ready":
                setReady(true);
                addConsoleLine("Inscribe Editor & Execution with Pyodide", {
                    dim: true,
                    system: true
                });
                addConsoleLine("Inscribe v3.1 / (c) Mark Yu, py.mkyu.one", {
                    dim: true,
                    system: true
                });
                addConsoleLine("------------------------------------------", { dim: true, system: true });
                break;
            case "status":
                setReady(!!message.ready);
                break;
            case "stdout":
                handleStdout(message.text);
                break;
            case "stdout-flush":
                flushStdoutBuffer();
                break;
            case "error-line":
                if (message.text.trim())
                    addConsoleLine(message.text, { error: true });
                break;
            case "input":
                void handleInputRequest(message.prompt);
                break;
            case "run-complete":
                if (runResolve) {
                    runResolve(message.ok);
                    runResolve = null;
                }
                break;
            default:
                break;
        }
    }
    function resetEnvironment() {
        if (worker) {
            postToWorker({ type: "reset" });
            worker.terminate();
            worker = null;
        }
        stdinSab = null;
        stdinI32 = null;
        stdinU8 = null;
        resetStdoutBuffer();
        setReady(false);
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
            const code = getCodeForMode(mode);
            if (!code || !code.trim()) {
                addConsoleLine(mode === "selection" ? "No selection to run." : "Nothing to run.", {
                    dim: true,
                    system: true
                });
                return;
            }
            const asyncioRunPattern = /\basyncio\.run\s*\(/;
            const loopRunPattern = /\brun_until_complete\s*\(/;
            if (!warnedAsyncioRun && (asyncioRunPattern.test(code) || loopRunPattern.test(code))) {
                const proceed = await confirmAsyncioRun();
                if (!proceed)
                    return;
                warnedAsyncioRun = true;
            }
            if (!ensureWorker())
                return;
            addConsoleLine(`Executing (${getRunModeLabel(mode)})…`, {
                dim: true,
                system: true
            });
            runStart = performance.now();
            const runPromise = new Promise((resolve) => {
                runResolve = resolve;
            });
            const runMessage = { type: "run", code };
            postToWorker(runMessage);
            const ok = await runPromise;
            flushStdoutBuffer();
            const dt = performance.now() - runStart;
            if (prefs.showExecTime) {
                addConsoleLine(`Finished in ${formatDuration(dt)}.`, { dim: true, system: true });
            }
            if (!ok) {
                addConsoleLine("Finished with errors.", { dim: true, system: true });
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
