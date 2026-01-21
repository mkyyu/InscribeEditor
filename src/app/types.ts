import { DEFAULT_PREFS } from "../constants.js";

export type RunMode = "all" | "selection" | "cell";
export type Prefs = typeof DEFAULT_PREFS;

export type AppState = {
  isRunning: boolean;
  isDirty: boolean;
  pyodideReady: boolean;
  pyodideInstance: any;
  runMode: RunMode;
};
