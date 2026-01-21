import { LS_KEYS } from "../constants.js";
import { safeLS } from "../utils/storage.js";
export function createInitialState() {
    return {
        isRunning: false,
        isDirty: false,
        pyodideReady: false,
        pyodideInstance: null,
        runMode: safeLS.get(LS_KEYS.RUNMODE) || "all"
    };
}
