const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const outputPath = process.env.PURRPAUSE_CAPTURE_PATH;
if (!outputPath) throw new Error("PURRPAUSE_CAPTURE_PATH is required");

app.setPath("userData", path.join(os.tmpdir(), `purrpause-ui-capture-${process.pid}`));

app.whenReady().then(async () => {
  const consoleErrors = [];
  const window = new BrowserWindow({
    width: 1440,
    height: 1024,
    useContentSize: true,
    show: true,
    skipTaskbar: true,
    backgroundColor: "#fcf8f0",
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });
  await window.loadURL(process.env.PURRPAUSE_CAPTURE_URL || "http://127.0.0.1:4173/");
  await window.webContents.executeJavaScript(`
    Promise.all(
      [...document.images].map((image) => image.decode().catch(() => undefined))
    )
  `);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const image = await window.capturePage();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, image.toPNG());

  const interactions = await window.webContents.executeJavaScript(`
    (async () => {
      const imageStates = [...document.images].map((image) => ({
        src: image.currentSrc,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        rect: {
          x: Math.round(image.getBoundingClientRect().x),
          y: Math.round(image.getBoundingClientRect().y),
          width: Math.round(image.getBoundingClientRect().width),
          height: Math.round(image.getBoundingClientRect().height),
        },
        style: {
          opacity: getComputedStyle(image).opacity,
          display: getComputedStyle(image).display,
          visibility: getComputedStyle(image).visibility,
          zIndex: getComputedStyle(image).zIndex,
        },
      }));
      const findButton = (label) =>
        [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);
      findButton('Reminders')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const remindersOpened = Boolean(
        [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Add custom nudge'))
      );
      findButton('Settings')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const settingsOpened = document.body.textContent?.includes('Make PurrPause yours') ?? false;
      const darkButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Dark');
      darkButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const darkThemeApplied = document.documentElement.dataset.theme === 'dark';
      findButton('Today')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        remindersOpened,
        settingsOpened,
        darkThemeApplied,
        buttonCount: document.querySelectorAll('button').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        documentSize: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        imageStates,
      };
    })()
  `);
  interactions.consoleErrors = consoleErrors;
  await fs.writeFile(
    path.join(path.dirname(outputPath), "implementation-evidence.json"),
    JSON.stringify(interactions, null, 2),
    "utf8",
  );
  console.log(JSON.stringify({ outputPath, interactions }));
  window.destroy();
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
