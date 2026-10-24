import { contextBridge, ipcRenderer } from 'electron';
import type { EngineStatus, LeuBridge } from '../contracts/bridge';

const bridge: LeuBridge = {
  getAppInfo: () => ipcRenderer.invoke('leu:app-info'),
  getEngineStatus: () => ipcRenderer.invoke('leu:engine-status'),
  onEngineStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: EngineStatus) => callback(status);
    ipcRenderer.on('leu:engine-status-changed', listener);
    return () => {
      ipcRenderer.removeListener('leu:engine-status-changed', listener);
    };
  },
  restartEngine: () => ipcRenderer.invoke('leu:engine-restart'),
  listPrograms: () => ipcRenderer.invoke('leu:list-programs'),
  getProgramIcon: (programId) => ipcRenderer.invoke('leu:program-icon', programId),
};
contextBridge.exposeInMainWorld('leu', Object.freeze(bridge));
