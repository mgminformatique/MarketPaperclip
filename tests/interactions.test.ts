import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { favoriteIds, readFavorites } from "../lib/market/browser-state";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

test("invalid or obsolete saved favorites cannot crash the application", () => {
  for (const stored of ["null", "{}", '"old-schema"', "42", "broken-json"]) {
    assert.deepEqual(readFavorites({ getItem: () => stored }), []);
  }
  assert.deepEqual(
    readFavorites({ getItem: () => '["demo-1",null,12,"demo-1","demo-2",""]' }),
    ["demo-1", "demo-2"],
  );
  assert.deepEqual(
    readFavorites({
      getItem: () => {
        throw new Error("Storage blocked");
      },
    }),
    [],
  );
  assert.deepEqual(favoriteIds(undefined), []);
});

test("failed client startup displays independent recovery controls", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://marketpaperclip.test/agents",
    runScripts: "outside-only",
  });
  const w = dom.window;
  let expire: () => void = () => {};
  w.setTimeout = (callback: () => void) => {
    expire = callback;
    return 1;
  };
  w.eval(
    readFileSync(
      new URL("../public/interaction-recovery.js", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(w.document.querySelector('[role="alert"]'), null);
  expire();
  assert.equal(w.document.querySelector("button")?.textContent, "Réessayer");
  assert.equal(
    w.document.querySelector("a")?.href,
    "https://marketpaperclip.test/agents",
  );
  w.document.dispatchEvent(new w.Event("marketpaperclip:ready"));
  assert.equal(w.document.querySelector('[role="alert"]'), null);
  dom.window.close();
});

test("successful startup does not show a false recovery warning", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
  });
  const w = dom.window;
  let expire: () => void = () => {};
  w.setTimeout = (callback: () => void) => {
    expire = callback;
    return 1;
  };
  w.eval(
    readFileSync(
      new URL("../public/interaction-recovery.js", import.meta.url),
      "utf8",
    ),
  );
  w.document.dispatchEvent(new w.Event("marketpaperclip:ready"));
  expire();
  assert.equal(w.document.querySelector('[role="alert"]'), null);
  dom.window.close();
});
