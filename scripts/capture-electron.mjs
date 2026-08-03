import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const outputPath = process.env.PURRPAUSE_CAPTURE_PATH;
if (!outputPath) throw new Error("PURRPAUSE_CAPTURE_PATH is required");

app.setPath("userData", path.join(os.tmpdir(), "purrpause-ui-capture"));

await app.whenReady();
const window = new BrowserWindow({
  width: 1440,
  height: 1024,
  show: false,
  backgroundColor: "#fcf8f0",
});

await window.loadURL(process.env.PURRPAUSE_CAPTURE_URL || "http://127.0.0.1:4173/");
await new Promise((resolve) => setTimeout(resolve, 1600));
const image = await window.capturePage();
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, image.toPNG());

const interactions = await window.webContents.executeJavaScript(`
  (() => {
    const findButton = (label) =>
      [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);
    findButton('Reminders')?.click();
    const remindersOpened = Boolean(
      [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Add custom nudge'))
    );
    findButton('Settings')?.click();
    const settingsOpened = document.body.textContent?.includes('Make PurrPause yours') ?? false;
    findButton('Today')?.click();
    return {
      remindersOpened,
      settingsOpened,
      buttonCount: document.querySelectorAll('button').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()
`);

console.log(JSON.stringify({ outputPath, interactions }));
window.destroy();
app.quit();
