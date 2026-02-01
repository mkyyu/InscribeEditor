/// <reference lib="webworker" />

type WorkerGlobal = DedicatedWorkerGlobalScope & {
  loadPyodide?: () => Promise<any>;
  inscribeStdout?: (text?: string) => void;
  inscribeStdoutFlush?: () => void;
  __inscribeReadline?: (prompt?: string) => string;
};

const ctx = self as WorkerGlobal;

type InitMessage = {
  type: "init";
  stdinSab: SharedArrayBuffer;
  stdinMaxBytes: number;
};

type RunMessage = {
  type: "run";
  code: string;
};

type ResetMessage = { type: "reset" };

type InboundMessage = InitMessage | RunMessage | ResetMessage;

let pyodide: any = null;
let stdinI32: Int32Array | null = null;
let stdinU8: Uint8Array | null = null;

const textDecoder = new TextDecoder();

function post(type: string, payload: Record<string, unknown> = {}) {
  ctx.postMessage({ type, ...payload });
}

function setupStdin(sab: SharedArrayBuffer, maxBytes: number) {
  stdinI32 = new Int32Array(sab, 0, 2);
  stdinU8 = new Uint8Array(sab, 8, maxBytes);
}

function readLine(prompt?: string) {
  if (!stdinI32 || !stdinU8) {
    post("error-line", { text: "Input bridge unavailable (no SharedArrayBuffer)." });
    return "";
  }

  Atomics.store(stdinI32, 0, 1);
  Atomics.store(stdinI32, 1, 0);
  post("input", { prompt: prompt ? String(prompt) : "" });
  Atomics.wait(stdinI32, 0, 1);

  const length = Math.max(0, Math.min(stdinI32[1], stdinU8.length));
  const copy = new Uint8Array(length);
  if (length > 0) {
    copy.set(stdinU8.subarray(0, length));
  }
  const value = textDecoder.decode(copy);
  Atomics.store(stdinI32, 0, 0);
  return value;
}

async function ensurePyodide() {
  if (pyodide) return;

  const baseUrl = new URL(".", ctx.location.href);
  const pyodideUrl = new URL("../../assets/vendor/pyodide/pyodide.js", baseUrl).toString();
  ctx.importScripts(pyodideUrl);

  if (!ctx.loadPyodide) {
    throw new Error("Pyodide failed to load (loadPyodide missing).");
  }

  pyodide = await ctx.loadPyodide();

  ctx.inscribeStdout = (text?: string) => {
    post("stdout", { text: String(text ?? "") });
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
    return js.__inscribeReadline(prompt)
builtins.input = custom_input
  `);
}

ctx.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      setupStdin(message.stdinSab, message.stdinMaxBytes);
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
      } catch (err) {
        const msg = err?.toString?.() ?? String(err);
        msg.split("\\n").forEach((line: string) => {
          if (line.trim()) post("error-line", { text: line });
        });
        post("run-complete", { ok: false });
      }
      return;
    }
  } catch (err) {
    const msg = err?.toString?.() ?? String(err);
    post("error-line", { text: msg });
    post("run-complete", { ok: false });
  }
};
