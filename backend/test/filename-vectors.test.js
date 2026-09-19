// Runs every vector in tests/filename-vectors.json against BOTH naming-template
// implementations: this file (the real renderer) and frontend/src/lib/filename.ts
// (the editor's live-preview renderer). They must behave identically — see
// CLAUDE.md, "The naming template renderer exists twice."
//
// Imports frontend/src/lib/filename.ts directly. Node 22.18 strips its type
// annotations at load time with no flag or build step required (verified on
// this machine: `node --test` runs this file unmodified). If that ever stops
// being true, node --test will fail loudly on the import below rather than
// silently skipping the frontend half of every vector.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as backend from "../src/utils/filename.js";
import * as frontend from "../../frontend/src/lib/filename.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(path.join(here, "..", "..", "tests", "filename-vectors.json"), "utf8"));

const IMPLEMENTATIONS = [
  ["backend/src/utils/filename.js", backend],
  ["frontend/src/lib/filename.ts", frontend],
];

for (const [implName, impl] of IMPLEMENTATIONS) {
  test(`renderFileName vectors — ${implName}`, () => {
    for (const vector of vectors.render) {
      const kind = vector.kind ?? "image";
      const actual = impl.renderFileName(vector.template, vector.values, {
        originalName: vector.originalName,
        mimeType: vector.mimeType,
        kind,
      });
      assert.equal(actual, vector.expected, `render vector "${vector.name}" (${implName})`);
    }
  });

  test(`validateTemplate vectors — ${implName}`, () => {
    for (const vector of vectors.validate) {
      const kind = vector.kind ?? "image";
      const errors = impl.validateTemplate(vector.template, vector.tagKeys ?? [], kind);
      const label = `validate vector template=${JSON.stringify(vector.template)} kind=${kind} (${implName})`;
      assert.equal(errors.length === 0, vector.valid, `${label}: got errors ${JSON.stringify(errors)}`);
      if (vector.message) {
        assert.ok(errors.includes(vector.message), `${label}: expected message ${JSON.stringify(vector.message)} in ${JSON.stringify(errors)}`);
      }
    }
  });
}

// The whole point of this file: catch the two renderers drifting apart, not just each being individually correct.
test("both implementations render every vector identically", () => {
  for (const vector of vectors.render) {
    const kind = vector.kind ?? "image";
    const opts = { originalName: vector.originalName, mimeType: vector.mimeType, kind };
    const fromBackend = backend.renderFileName(vector.template, vector.values, opts);
    const fromFrontend = frontend.renderFileName(vector.template, vector.values, opts);
    assert.equal(fromBackend, fromFrontend, `render vector "${vector.name}" diverges between implementations`);
  }
});

test("both implementations validate every vector identically", () => {
  for (const vector of vectors.validate) {
    const kind = vector.kind ?? "image";
    const tagKeys = vector.tagKeys ?? [];
    const fromBackend = backend.validateTemplate(vector.template, tagKeys, kind);
    const fromFrontend = frontend.validateTemplate(vector.template, tagKeys, kind);
    assert.deepEqual(
      fromBackend,
      fromFrontend,
      `validate vector template=${JSON.stringify(vector.template)} kind=${kind} diverges between implementations`,
    );
  }
});
