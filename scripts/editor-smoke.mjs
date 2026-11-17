#!/usr/bin/env node
// Drives the editor in headless Chrome against the server-mode build and
// checks the pane arrangements: which one a window shape gets, that nothing
// is cut off, the work-area tabs, hiding panes, the dividers, and editing
// text with the viewer hidden.
//
//   CGO_ENABLED=0 go build -tags server -o /tmp/mousqueau-headless .
//   node scripts/editor-smoke.mjs /tmp/mousqueau-headless
//
// It needs Node 22 or later and Chrome or Chromium (set CHROME to its path
// when it is not on PATH). Nothing is installed and nothing outside a
// temporary directory is written; the server listens on loopback only.
// This is a browser check: it says nothing about the native window.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const binary = process.argv[2];
if (!binary || !existsSync(binary)) {
  console.error("usage: node scripts/editor-smoke.mjs <server-mode binary>");
  process.exit(2);
}

function findChrome() {
  const names = [
    process.env.CHROME,
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const name of names) {
    if (name.includes("/") ? existsSync(name) : onPath(name)) return name;
  }
  return null;
}
function onPath(name) {
  return spawnSync("sh", ["-c", `command -v ${name}`]).status === 0;
}
const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const chrome = findChrome();
if (!chrome) {
  console.error("Chrome or Chromium was not found; set CHROME to its path.");
  process.exit(2);
}

const work = await mkdtemp(join(tmpdir(), "mousqueau-smoke-"));
const children = [];
const failures = [];
let checks = 0;
function check(name, ok, detail = "") {
  checks++;
  if (!ok) failures.push(detail ? `${name}: ${detail}` : name);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
}

try {
  // The editor, with its own empty configuration.
  const port = await freePort();
  const server = spawn(resolve(binary), [], {
    env: {
      ...process.env,
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      LANGUAGE: "en_US",
      XDG_CONFIG_HOME: join(work, "config"),
      XDG_DATA_HOME: join(work, "data"),
      XDG_CACHE_HOME: join(work, "cache"),
      HOME: join(work, "home"),
      WAILS_SERVER_HOST: "127.0.0.1",
      WAILS_SERVER_PORT: String(port),
    },
    stdio: "ignore",
  });
  children.push(server);
  const url = `http://127.0.0.1:${port}/?chrome=custom&controls=close&theme=dark`;
  for (let i = 0; ; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) break;
    if (i > 100) throw new Error("the editor did not start");
    await sleep(100);
  }

  // Chrome, spoken to over its DevTools protocol.
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(work, "chrome")}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      // Only this loopback page is loaded, and CI runners refuse the sandbox.
      "--no-sandbox",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  children.push(browser);
  const endpoint = await new Promise((done, fail) => {
    let log = "";
    const timer = setTimeout(() => fail(new Error(`Chrome did not start: ${log}`)), 30000);
    browser.stderr.on("data", (chunk) => {
      log += chunk;
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (found) {
        clearTimeout(timer);
        done(found[1]);
      }
    });
    browser.once("exit", () => fail(new Error(`Chrome exited: ${log}`)));
  });
  const socket = new WebSocket(endpoint);
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  const waiting = new Map();
  const pageErrors = [];
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown")
      pageErrors.push(message.params.exceptionDetails.exception?.description ?? "exception");
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    if (message.error) pending.fail(new Error(message.error.message));
    else pending.done(message.result);
  });
  let sessionId;
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++nextId;
      waiting.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  ({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }));
  await send("Runtime.enable");
  await send("Page.enable");

  async function evaluate(expression) {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  async function until(expression, what) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await sleep(50);
    }
    throw new Error(`timed out waiting for ${what}`);
  }
  async function resize(width, height) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(150);
  }
  async function press(key, code, modifiers = 0) {
    const event = { key, code, modifiers, windowsVirtualKeyCode: KEY_CODES[code] };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
    await sleep(120);
  }
  const KEY_CODES = { Enter: 13, ArrowLeft: 37, ArrowDown: 40 };
  // The keymap's $mod: ⌘ on macOS, Ctrl elsewhere.
  const MOD = process.platform === "darwin" ? 4 : 2;

  // Page-side helpers.
  const rect = (selector) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
  // Elements that reach past the window, outside the panes that scroll and
  // the hidden timeline.
  const overflowing = () =>
    evaluate(`[...document.querySelectorAll(".shell *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          (r.right > innerWidth + 1 || r.bottom > innerHeight + 1) &&
          !el.closest(".track-scroll, .grid-body, .inspector-body, .timeline-body") &&
          !el.closest('[data-hide~="timeline"] .timeline-dock')
        );
      })
      .map((el) => el.tagName.toLowerCase() + "." + String(el.className.baseVal ?? el.className).split(" ")[0])`);
  const layout = () => evaluate(`document.querySelector(".shell").dataset.layout`);
  const togglePane = async (index) => {
    await evaluate(`document.querySelectorAll(".pane-toggles button")[${index}].click()`);
    await sleep(150);
  };
  const stored = () => evaluate(`JSON.parse(localStorage.getItem("mousqueau-layout") ?? "{}")`);

  await send("Page.navigate", { url });
  await until(`!!document.querySelector(".shell")`, "the editor");
  // The demo button appears once the settings have loaded.
  const demo = `[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Load Demo")`;
  await until(`!!${demo}`, "the Load Demo button");
  await evaluate(`${demo}.click()`);
  await until(`document.querySelectorAll(".cue-row").length === 4`, "the demo cues");
  await evaluate(`document.querySelector(".cue-row").click()`);

  // 1. The arrangement each window shape gets, with nothing cut off.
  const shapes = [
    [1440, 900, "wide"],
    [1100, 720, "wide"],
    [950, 1040, "column"], // half of a 1920×1080 screen
    [630, 1040, "column"], // a third
    [1080, 1920, "column"], // a rotated monitor
    [950, 520, "compact"], // a quarter
    [480, 420, "compact"], // the minimum window
  ];
  for (const [width, height, expected] of shapes) {
    await resize(width, height);
    check(`${width}×${height} is ${expected}`, (await layout()) === expected, await layout());
    const over = await overflowing();
    check(`${width}×${height} cuts nothing off`, over.length === 0, over.join(" "));
  }

  // 2. Column: the cue list and the inspector share the work area.
  await resize(630, 1040);
  await evaluate(`document.querySelectorAll(".work-tabs .ant-segmented-item input")[1].click()`);
  await sleep(150);
  check(
    "the Edit tab shows the inspector in place of the cue list",
    (await rect(".inspector")).height > 0 && (await rect(".cue-grid")).height === 0,
  );
  await evaluate(`document.querySelectorAll(".work-tabs .ant-segmented-item input")[0].click()`);
  await sleep(150);
  check(
    "the Subtitles tab shows the cue list again",
    (await rect(".cue-grid")).height > 0 && (await rect(".inspector")).height === 0,
  );

  // 3. Dividers, with a size per arrangement.
  const before = Math.round((await rect(".viewer")).height);
  await evaluate(`document.querySelector(".viewer > .splitter").focus()`);
  await press("ArrowDown", "ArrowDown");
  await press("ArrowDown", "ArrowDown");
  check("the column divider grows the viewer", (await rect(".viewer")).height === before + 20, `${before} → ${(await rect(".viewer")).height}`);
  check("column keeps its own viewer size", (await stored()).columnViewer === before + 20);
  await resize(480, 420);
  await evaluate(`document.querySelector(".viewer > .splitter").focus()`);
  await press("ArrowLeft", "ArrowLeft");
  check("compact keeps its own viewer size", typeof (await stored()).compactViewer === "number" && (await stored()).columnViewer === before + 20);
  const cut = await overflowing();
  check("the minimum window cuts nothing off after its divider moved", cut.length === 0, cut.join(" "));
  const viewer = await rect(".viewer");
  const controls = await evaluate(`Math.max(...[...document.querySelectorAll(".transport *")].map((el) => el.getBoundingClientRect().right))`);
  check("the transport stays inside a narrow viewer", controls <= viewer.x + viewer.width + 1, `${controls} > ${viewer.x + viewer.width}`);

  // 4. Hiding panes gives their room to the others.
  await resize(950, 1040);
  for (const [index, selector, name] of [
    [2, ".timeline-dock", "timeline"],
    [0, ".viewer", "viewer"],
  ]) {
    const list = (await rect(".cue-grid")).height;
    await togglePane(index);
    check(`hiding the ${name} collapses it`, (await rect(selector)).height === 0);
    check(`hiding the ${name} enlarges the cue list`, (await rect(".cue-grid")).height > list);
    const over = await overflowing();
    check(`hiding the ${name} cuts nothing off`, over.length === 0, over.join(" "));
  }
  check("hidden panes are remembered", JSON.stringify((await stored()).hidden) === '["timeline","viewer"]', JSON.stringify((await stored()).hidden));

  // 5. With the viewer hidden, the text is edited in the inspector.
  await evaluate(`document.activeElement.blur()`);
  await press("Enter", "Enter");
  await sleep(200);
  check(
    "Enter puts the cursor in the inspector's text field",
    await evaluate(`document.activeElement.tagName === "TEXTAREA" && !!document.activeElement.closest(".inspector")`),
  );
  await send("Input.insertText", { text: " smoke" });
  await press("Enter", "Enter", MOD);
  await evaluate(`document.querySelectorAll(".work-tabs .ant-segmented-item input")[0].click()`);
  await until(`document.querySelector(".cue-row .row-text")?.innerText.endsWith(" smoke")`, "the edit to apply");
  check("the edit reaches the cue list", true);

  // 6. Showing the panes again restores the arrangement.
  await togglePane(0);
  await togglePane(2);
  check("shown panes return", (await rect(".viewer")).height > 0 && (await rect(".timeline-dock")).height > 0);

  check("the page raised no errors", pageErrors.length === 0, pageErrors.join("; "));
  socket.close();
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.error(error);
} finally {
  for (const child of children) child.kill();
  await sleep(200);
  await rm(work, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${checks} checks, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
