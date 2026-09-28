/* Le serveur auto-hébergé démarre et sert le site et l'API avec le même code que le site public. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("serveur auto-hébergé : pages, API, en-têtes de sécurité et chemins interdits", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const p = spawn(process.execPath, ["--no-warnings", new URL("../auto-hebergement/serveur.mjs", import.meta.url).pathname],
    { env: { ...process.env, PORT: String(port), HOTE: "127.0.0.1", DONNEES_DIR: dir }, stdio: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    let pret = false;
    for (let i = 0; i < 50 && !pret; i++) {
      await new Promise((r) => setTimeout(r, 200));
      pret = await fetch(base + "/").then((r) => r.ok, () => false);
    }
    assert.ok(pret, "le serveur n'a pas démarré");
    const accueil = await fetch(base + "/");
    assert.match(await accueil.text(), /Atlas Pacifica/);
    assert.ok(accueil.headers.get("content-security-policy"), "CSP absente");
    assert.equal((await fetch(base + "/api/catalogue")).status, 200);
    assert.equal((await fetch(base + "/_headers")).status, 404);
    assert.equal((await fetch(base + "/api/nexiste-pas")).status, 404);
    assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  } finally {
    p.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
