const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");

const isDev = !app.isPackaged;
const devServerUrl = process.env.ELECTRON_START_URL ?? "http://localhost:3000";
const isWindows = process.platform === "win32";
const overlaySize = { width: 360, height: 620 };
let overlayWindow = null;
let overlayTarget = null;
let overlayPoll = null;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f172a",
    title: "PairPod",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isDev && url.startsWith(devServerUrl)) {
      return;
    }

    if (!isDev && url.startsWith("file://")) {
      return;
    }

    event.preventDefault();
    shell.openExternal(url);
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  void mainWindow.loadFile(path.join(app.getAppPath(), "out", "index.html"));
}

function createOverlayWindow() {
  if (!isWindows) {
    return null;
  }

  overlayWindow = new BrowserWindow({
    width: overlaySize.width,
    height: overlaySize.height,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "PairPod Overlay",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void overlayWindow.loadURL(`${devServerUrl}/overlay`);
  } else {
    void overlayWindow.loadFile(path.join(app.getAppPath(), "out", "overlay", "index.html"));
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    if (overlayPoll) {
      clearInterval(overlayPoll);
      overlayPoll = null;
    }
  });

  startOverlayTracking();
  return overlayWindow;
}

function startOverlayTracking() {
  if (!isWindows || overlayPoll) {
    return;
  }

  overlayPoll = setInterval(() => {
    void updateOverlayTarget();
  }, 1200);
  void updateOverlayTarget();
}

async function updateOverlayTarget() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const target = await getWindowsForegroundTarget();
  if (!target) {
    return;
  }

  if (isOwnWindowTarget(target)) {
    return;
  }

  overlayTarget = target;
  positionOverlayBesideTarget(target);
  overlayWindow.webContents.send("pairpod-overlay:target-changed", {
    platform: process.platform,
    target,
  });

  if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive();
  }
}

function positionOverlayBesideTarget(target) {
  const display = screen.getDisplayMatching({
    x: target.left,
    y: target.top,
    width: Math.max(1, target.width),
    height: Math.max(1, target.height),
  });
  const workArea = display.workArea;
  const width = overlaySize.width;
  const height = Math.min(overlaySize.height, Math.max(420, target.height - 80));
  const besideX = target.left + target.width - width - 24;
  const x = clamp(besideX, workArea.x + 12, workArea.x + workArea.width - width - 12);
  const y = clamp(target.top + 72, workArea.y + 12, workArea.y + workArea.height - height - 12);
  overlayWindow.setBounds({ x, y, width, height }, false);
}

function isOwnWindowTarget(target) {
  const processName = String(target.processName ?? "").toLowerCase();
  const executableName = path.parse(process.execPath).name.toLowerCase();
  const appName = app.getName().toLowerCase();
  return processName === executableName || processName === appName;
}

function getWindowsForegroundTarget() {
  return new Promise((resolve) => {
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class PairPodWinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$hwnd = [PairPodWinApi]::GetForegroundWindow()
$rect = New-Object PairPodWinApi+RECT
[void][PairPodWinApi]::GetWindowRect($hwnd, [ref]$rect)
$pidValue = 0
[void][PairPodWinApi]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)
$title = New-Object System.Text.StringBuilder 512
[void][PairPodWinApi]::GetWindowText($hwnd, $title, $title.Capacity)
$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
[pscustomobject]@{
  title = $title.ToString()
  processName = if ($process) { $process.ProcessName } else { "" }
  left = $rect.Left
  top = $rect.Top
  width = $rect.Right - $rect.Left
  height = $rect.Bottom - $rect.Top
} | ConvertTo-Json -Compress
`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 1800, windowsHide: true },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }

        try {
          const target = JSON.parse(stdout.trim());
          if (!target?.width || !target?.height) {
            resolve(null);
            return;
          }

          resolve(target);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

app.whenReady().then(() => {
  createWindow();
  createOverlayWindow();

  ipcMain.handle("pairpod-overlay:get-state", () => ({
    platform: process.platform,
    target: overlayTarget,
  }));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOverlayWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (overlayPoll) {
    clearInterval(overlayPoll);
    overlayPoll = null;
  }
});
