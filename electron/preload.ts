import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  AppSnapshot,
  CustomNudgeInput,
  PurrPauseApi,
} from "../shared/types";

const api: PurrPauseApi = {
  getSnapshot: () => ipcRenderer.invoke("purr:get-snapshot"),
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("purr:snapshot", listener);
    return () => ipcRenderer.removeListener("purr:snapshot", listener);
  },
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke("purr:update-settings", patch),
  setPaused: (paused: boolean) => ipcRenderer.invoke("purr:set-paused", paused),
  resetSession: () => ipcRenderer.invoke("purr:reset-session"),
  startBreak: (minutes?: number) => ipcRenderer.invoke("purr:start-break", minutes),
  completeReminder: () => ipcRenderer.invoke("purr:complete-reminder"),
  snoozeReminder: (minutes?: number) => ipcRenderer.invoke("purr:snooze-reminder", minutes),
  dismissReminder: () => ipcRenderer.invoke("purr:dismiss-reminder"),
  addCustomNudge: (input: CustomNudgeInput) => ipcRenderer.invoke("purr:add-custom", input),
  deleteCustomNudge: (id: string) => ipcRenderer.invoke("purr:delete-custom", id),
  clearHistory: () => ipcRenderer.invoke("purr:clear-history"),
  exportHistory: () => ipcRenderer.invoke("purr:export-history"),
  exportBackup: () => ipcRenderer.invoke("purr:export-backup"),
  importBackup: () => ipcRenderer.invoke("purr:import-backup"),
  openExternal: (url: string) => ipcRenderer.invoke("purr:open-external", url),
  showDashboard: () => ipcRenderer.invoke("purr:show-dashboard"),
  hideMascot: () => ipcRenderer.invoke("purr:hide-mascot"),
};

contextBridge.exposeInMainWorld("purrPause", api);
