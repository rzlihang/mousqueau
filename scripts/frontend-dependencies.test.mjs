import assert from "node:assert/strict";
import { test } from "node:test";
import { productionDependencyPaths } from "./frontend-dependencies.mjs";

test("collects transitive and optional production dependencies without duplicates", () => {
  const shared = { version: "1.0.0", path: "/app/node_modules/.pnpm/shared/node_modules/shared" };
  const projects = [{
    name: "app", version: "0.1.0", path: "/app",
    dependencies: {
      first: { version: "1.0.0", path: "/app/node_modules/first", dependencies: { shared } },
      second: { version: "1.0.0", path: "/app/node_modules/second", dependencies: { shared } },
    },
    optionalDependencies: { optional: { version: "1.0.0", path: "/app/node_modules/optional" } },
    devDependencies: { tool: { version: "1.0.0", path: "/app/node_modules/tool" } },
  }];
  assert.deepEqual(productionDependencyPaths(projects), [
    "/app/node_modules/.pnpm/shared/node_modules/shared",
    "/app/node_modules/first",
    "/app/node_modules/optional",
    "/app/node_modules/second",
  ]);
});

test("retains separate installed versions and handles an empty production graph", () => {
  assert.deepEqual(productionDependencyPaths([{ path: "/app" }]), []);
  assert.deepEqual(productionDependencyPaths([{
    path: "/app",
    dependencies: {
      first: { version: "1.0.0", path: "/store/lib@1", dependencies: {
        lib: { version: "2.0.0", path: "/store/lib@2" },
      } },
    },
  }]), ["/store/lib@1", "/store/lib@2"]);
});

test("a shallow deduped entry does not hide a later entry's dependencies", () => {
  assert.deepEqual(productionDependencyPaths([{
    path: "/app",
    dependencies: {
      alias: { from: "shared", version: "1.0.0", path: "/store/shared", deduped: true },
      shared: { from: "shared", version: "1.0.0", path: "/store/shared", dependencies: {
        nested: { version: "1.0.0", path: "/store/nested" },
      } },
    },
  }]), ["/store/nested", "/store/shared"]);
});
