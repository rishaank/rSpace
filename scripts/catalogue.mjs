// Shared read/write for src/lib/catalogue.json.
//
// The app imports that file directly — Vite resolves a JSON import on its own.
// Node does not: it wants `with { type: "json" }`, which would put a syntax
// choice made for the scripts into the browser bundle. Reading the file is
// simpler than making both agree.

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../src/lib/catalogue.json", import.meta.url);

export function readCatalogue() {
  return JSON.parse(readFileSync(FILE, "utf8"));
}

export function writeCatalogue(catalogue) {
  writeFileSync(FILE, `${JSON.stringify(catalogue, null, 2)}\n`);
}
