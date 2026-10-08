// Run from repository root after pnpm install --frozen-lockfile (frontend) and go mod download.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { productionDependencyPaths } from "./frontend-dependencies.mjs";
const chunks = [
  "Mousqueau v0.1 third-party notices\n\nExternal yt-dlp and FFmpeg binaries are not bundled. See docs/licensing.md.\n",
];
function append(name, version, directory) {
  const files = readdirSync(directory).filter(
    (f) =>
      /^(licen[cs]e|copying|notice)([._-]|$)/i.test(f) &&
      statSync(join(directory, f)).isFile(),
  );
  const fallback = {
    "@ant-design/icons-svg": "third_party/licenses/ant-design-icons.txt",
    "@wailsio/runtime": "third_party/licenses/wails-runtime.txt",
    "toggle-selection": "third_party/licenses/toggle-selection.txt",
  }[name];
  if (!files.length && !fallback)
    throw new Error(`Missing license file for ${name} at ${directory}`);
  chunks.push(`\n${"=".repeat(72)}\n${name} ${version}\n`);
  if (!files.length)
    chunks.push(
      `\n--- upstream license (see third_party/README.md) ---\n${readFileSync(fallback, "utf8")}\n`,
    );
  for (const file of files.sort())
    chunks.push(
      `\n--- ${file} ---\n${readFileSync(join(directory, file), "utf8")}\n`,
    );
}
const projects = JSON.parse(execFileSync(
  "pnpm", ["list", "--prod", "--depth", "Infinity", "--json"],
  { cwd: "frontend", encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
));
const frontendPackages = new Map();
for (const dir of productionDependencyPaths(projects)) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  frontendPackages.set(`${pkg.name}@${pkg.version}`, { pkg, dir });
}
for (const { pkg, dir } of [...frontendPackages.values()].sort((a, b) =>
  a.pkg.name.localeCompare(b.pkg.name) || a.pkg.version.localeCompare(b.pkg.version),
)) {
  append(pkg.name, pkg.version, dir);
}
// Collect modules actually imported by each desktop target, not Wails CLI tooling.
const modules = new Map();
for (const target of ["darwin", "linux", "windows"]) {
  const output = execFileSync(
    "go",
    [
      "list",
      "-e",
      "-deps",
      "-f",
      "{{if .Module}}{{if not .Module.Main}}{{.Module.Path}}@{{.Module.Version}}|{{.Module.Dir}}{{end}}{{end}}",
      ".",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, GOOS: target, CGO_ENABLED: "1" },
    },
  );
  for (const line of output.split("\n").filter(Boolean)) {
    const [id, dir] = line.split("|");
    modules.set(id, dir);
  }
}
for (const [id, cachedDirectory] of [...modules.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const [name, version] = id.split("@");
  const dir =
    cachedDirectory ||
    JSON.parse(
      execFileSync("go", ["mod", "download", "-json", id], {
        encoding: "utf8",
      }),
    ).Dir;
  append(name, version, dir);
}
writeFileSync(
  "THIRD_PARTY_NOTICES.txt",
  chunks
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd() + "\n",
);
console.log("Wrote THIRD_PARTY_NOTICES.txt");
