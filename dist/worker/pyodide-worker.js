"use strict";
/// <reference lib="webworker" />
const ctx = self;
let pyodide = null;
let stdinI32 = null;
let stdinU8 = null;
let interruptI32 = null;
const textDecoder = new TextDecoder();
function post(type, payload = {}) {
    ctx.postMessage({ type, ...payload });
}
function setupStdin(sab, maxBytes) {
    stdinI32 = new Int32Array(sab, 0, 2);
    stdinU8 = new Uint8Array(sab, 8, maxBytes);
}
function setupInterrupt(sab) {
    interruptI32 = new Int32Array(sab);
}
function readLine(prompt) {
    if (!stdinI32 || !stdinU8) {
        post("error-line", { text: "Input bridge unavailable (no SharedArrayBuffer)." });
        return "";
    }
    Atomics.store(stdinI32, 0, 1);
    Atomics.store(stdinI32, 1, 0);
    post("input", { prompt: prompt ? String(prompt) : "" });
    Atomics.wait(stdinI32, 0, 1);
    const rawLength = stdinI32[1];
    if (rawLength < 0) {
        stdinI32[1] = 0;
        Atomics.store(stdinI32, 0, 0);
        return null;
    }
    const length = Math.max(0, Math.min(rawLength, stdinU8.length));
    const copy = new Uint8Array(length);
    if (length > 0) {
        copy.set(stdinU8.subarray(0, length));
    }
    const value = textDecoder.decode(copy);
    Atomics.store(stdinI32, 0, 0);
    return value;
}
async function ensurePyodide() {
    if (pyodide)
        return;
    const baseUrl = new URL(".", ctx.location.href);
    const pyodideUrl = new URL("../../assets/vendor/pyodide/pyodide.js", baseUrl).toString();
    ctx.importScripts(pyodideUrl);
    if (!ctx.loadPyodide) {
        throw new Error("Pyodide failed to load (loadPyodide missing).");
    }
    pyodide = await ctx.loadPyodide();
    if (interruptI32 && typeof pyodide.setInterruptBuffer === "function") {
        pyodide.setInterruptBuffer(interruptI32);
    }
    ctx.inscribeStdout = (text) => {
        post("stdout", { text: String(text !== null && text !== void 0 ? text : "") });
    };
    ctx.inscribeStdoutFlush = () => {
        post("stdout-flush");
    };
    ctx.__inscribeReadline = readLine;
    pyodide.runPython(`
import sys
import js
import builtins

class JSConsole:
    def write(self, s):
        js.inscribeStdout(s)
    def flush(self):
        js.inscribeStdoutFlush()

sys.stdout = JSConsole()
sys.stderr = JSConsole()

  def custom_input(prompt=""):
    val = js.__inscribeReadline(prompt)
    if val is None:
        raise KeyboardInterrupt("Execution interrupted")
    return val
builtins.input = custom_input
  `);
}
ctx.onmessage = async (event) => {
    var _a, _b, _c, _d;
    const message = event.data;
    try {
        if (message.type === "init") {
            setupStdin(message.stdinSab, message.stdinMaxBytes);
            setupInterrupt(message.interruptSab);
            await ensurePyodide();
            post("ready");
            return;
        }
        if (message.type === "reset") {
            pyodide = null;
            post("status", { ready: false });
            return;
        }
        if (message.type === "run") {
            await ensurePyodide();
            try {
                await pyodide.runPythonAsync(message.code);
                post("run-complete", { ok: true });
            }
            catch (err) {
                const msg = (_b = (_a = err === null || err === void 0 ? void 0 : err.toString) === null || _a === void 0 ? void 0 : _a.call(err)) !== null && _b !== void 0 ? _b : String(err);
                if (msg.includes("KeyboardInterrupt")) {
                    post("interrupted");
                }
                else {
                    msg.split("\\n").forEach((line) => {
                        if (line.trim())
                            post("error-line", { text: line });
                    });
                }
                post("run-complete", { ok: false });
            }
            return;
        }
    }
    catch (err) {
        const msg = (_d = (_c = err === null || err === void 0 ? void 0 : err.toString) === null || _c === void 0 ? void 0 : _c.call(err)) !== null && _d !== void 0 ? _d : String(err);
        post("error-line", { text: msg });
        post("run-complete", { ok: false });
    }
};
