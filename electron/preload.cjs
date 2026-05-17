const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("uncommonhacks", {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});

contextBridge.exposeInMainWorld("pairpodDesktop", {
  platform: process.platform,
  getOverlayState: () => ipcRenderer.invoke("pairpod-overlay:get-state"),
  onOverlayTargetChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("pairpod-overlay:target-changed", listener);
    return () => ipcRenderer.removeListener("pairpod-overlay:target-changed", listener);
  },
});
