import { setClass } from "../utils/dom.js";
import { AppState } from "./types.js";
import { DomRefs } from "./dom-refs.js";

export function updateStatusBar(state: AppState, dom: DomRefs) {
  dom.sbRun.innerHTML = `<span class="sbDot"></span><strong>${
    state.isRunning ? "Running" : "Ready"
  }</strong>`;
  setClass(dom.sbRun, state.isRunning ? "warn" : "good");

  dom.sbDirty.innerHTML = `<span class="sbDot"></span><strong>${
    state.isDirty ? "Unsaved" : "Saved"
  }</strong>`;
  setClass(dom.sbDirty, state.isDirty ? "warn" : "good");

  dom.sbPy.innerHTML = `<span class="sbDot"></span><strong>${
    state.pyodideReady ? "Pyodide: ready" : "Pyodide: not loaded"
  }</strong>`;
  setClass(dom.sbPy, state.pyodideReady ? "good" : "bad");
}

export function setFilenameStatus(name: string, dom: DomRefs) {
  dom.fileMeta.textContent = name;
  dom.sbFile.textContent = name;
}

export function updateCursorStatus(editor: CodeMirrorEditor, dom: DomRefs) {
  const c = editor.getCursor();
  dom.sbPos.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
  const selLen = editor.somethingSelected() ? editor.getSelection().length : 0;
  dom.sbSel.textContent = `Sel ${selLen}`;
}

export function updateClock(dom: DomRefs) {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  dom.sbClock.textContent = `${hh}:${mm}:${ss}`;
}
