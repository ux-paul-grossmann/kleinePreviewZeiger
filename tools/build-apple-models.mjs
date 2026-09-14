#!/usr/bin/env node
// Baut apple-models.json aus littlebyteorg/appledb + pbakondy/ios-device-list
// Quellen liegen in /tmp/apple-merge (per git clone), Ausgabe ins Repo-Root.
// Manuelle Kuratierung in apple-models.json bleibt (RAM, Aliase), neuer
// Kram wird ergänzt, keine Überschreibung bestehender A-Nummern.
import fs from "fs";
import path from "path";

const REPO = path.resolve(import.meta.dirname, "..");
const CUR_PATH = path.join(REPO, "apple-models.json");
const OUT_PATH = CUR_PATH;
const APPLEDB_ROOT = "/tmp/apple-merge/appledb/deviceFiles";
const IOS_LIST_ROOT = "/tmp/apple-merge/ios-list";

function jahrAus(released) {
  if (!released) return "";
  const s = Array.isArray(released) ? released[0] : released;
  const m = String(s).match(/^(\d{4})/);
  return m ? m[1] : "";
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function leseAktuell() {
  try {
    const d = JSON.parse(fs.readFileSync(CUR_PATH, "utf8"));
    return d.modelle || [];
  } catch { return []; }
}
const ERLAUBT = /^(Macbook|Mac|iMac|iPhone|iPad|Apple Watch|Mac mini|Mac Studio|Mac Pro|iPod|Apple Vision)/i;
function sammleAppleDB() {
  const out = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".json")) {
        try {
          const j = JSON.parse(fs.readFileSync(p, "utf8"));
          // Nur echte Geräte, kein Zubehör/Ladegeräte etc.
          if (!ERLAUBT.test(j.type || j.name || "")) {
            // Fallback: Pfad enthält erlaubtes Stichwort?
            if (!ERLAUBT.test(path.relative(APPLEDB_ROOT, p))) continue;
          }
          if (!j.model && !j.aNumber) continue;
          const model = j.model;
          const aNums = Array.isArray(model) ? model : model ? [model] : [];
          const filt = aNums.filter((x) => /^A\d{3,4}$/.test(String(x)));
          if (!filt.length) continue;
          const name = j.name || j.generation || j.Generation || "";
          const identifier = j.identifier || j.Identifier || "";
          const released = j.released || "";
          const soc = j.soc || j.SoC || "";
          const ram = j.info?.find((x) => x.type === "Memory")?.RAM?.[0] || "";
          const alias = new Set();
          if (name) alias.add(name.toLowerCase());
          const kurz = name.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase();
          if (kurz && kurz !== name.toLowerCase()) alias.add(kurz);
          // Größe-Alias wie "macbook pro 15" für Titel "MacBook Pro 15\" 2017"
          const inch = name.match(/(\d{2})\s*-?inch/i);
          if (inch) {
            const base = kurz.split(/\s+/).slice(0, 3).join(" "); // z.B. "macbook pro"
            if (base) alias.add(`${base} ${inch[1]}`.trim().toLowerCase());
            alias.add(`macbook pro ${inch[1]}`.toLowerCase());
            alias.add(`macbook air ${inch[1]}`.toLowerCase());
          }
          if (identifier) alias.add(identifier.toLowerCase());
          out.push({
            _src: `appledb:${path.relative(APPLEDB_ROOT, p)}`,
            name, identifier, a: filt, jahr: jahrAus(released), chip: String(soc || ""), ram: String(ram || ""),
            alias: [...alias].filter(Boolean),
          });
        } catch {}
      }
    }
  }
  if (fs.existsSync(APPLEDB_ROOT)) walk(APPLEDB_ROOT);
  return out;
}
function sammleIosList() {
  const out = [];
  const files = ["iphone.json", "ipad.json", "ipad_air.json", "ipad_mini.json", "ipad_pro.json", "apple_watch.json", "apple_tv.json"].map((f) => path.join(IOS_LIST_ROOT, f));
  for (const fp of files) {
    if (!fs.existsSync(fp)) continue;
    try {
      const arr = JSON.parse(fs.readFileSync(fp, "utf8"));
      for (const e of arr) {
        const an = e.ANumber;
        const aNums = Array.isArray(an) ? an : an ? [an] : [];
        const filt = aNums.filter((x) => /^A\d{3,4}$/.test(String(x)));
        if (!filt.length) continue;
        const name = e.Generation || "";
        const identifier = e.Identifier || "";
        out.push({
          _src: `ios-list:${path.basename(fp)}`,
          name, identifier, a: filt, jahr: "", chip: "", ram: "",
          alias: name ? [name.toLowerCase(), identifier.toLowerCase()].filter(Boolean) : [],
        });
      }
    } catch {}
  }
  return out;
}

const aktuell = leseAktuell();
const existA = new Set(aktuell.flatMap((m) => m.a || []));
console.log(`Aktuell: ${aktuell.length} Einträge, ${existA.size} A-Nummern`);

const adb = sammleAppleDB();
console.log(`AppleDB Kandidaten mit A-Nummer: ${adb.length}`);
const ios = sammleIosList();
console.log(`iOS-list Kandidaten: ${ios.length}`);

// Dedupe nach A-Nummer, aktuell gewinnt
const neu = [];
const gesehen = new Set(existA);
for (const src of [...adb, ...ios]) {
  const neueA = src.a.filter((a) => !gesehen.has(a));
  if (!neueA.length) continue;
  // Nur aufnehmen wenn mindestens ein neues A dabei
  // Baue Modell-Eintrag im Repo-Schema
  const id = slug(`${src.name} ${src.identifier}`.trim()) || slug(neueA[0]);
  const jahr = src.jahr || "";
  neu.push({
    id,
    namen: src.alias.length ? src.alias.slice(0, 4) : [src.name.toLowerCase()].filter(Boolean),
    a: neueA,
    emc: [],
    jahr,
    chip: src.chip || "",
    ram: src.ram || "",
    _src: src._src,
  });
  neueA.forEach((a) => gesehen.add(a));
}
console.log(`Neue A-Nummern ergänzt: ${neu.length} Modelle (${neu.flatMap((x) => x.a).length} A-Nummern)`);
if (neu.length) {
  console.log(neu.slice(0, 8).map((x) => `  ${x.a.join(",")} -> ${x.namen[0]} (${x.jahr} ${x.chip}) [${x._src}]`).join("\n"));
}
// Mergen und schreiben (aktuell + neu)
const merged = [...aktuell, ...neu];
merged.sort((a, b) => (a.id || "").localeCompare(b.id || ""));
const out = {
  _hinweis: "Kuratiert + auto-generiert aus littlebyteorg/appledb und pbakondy/ios-device-list. Quellen in _src pro Eintrag.",
  _quellen: ["https://github.com/littlebyteorg/appledb (MIT)", "https://github.com/pbakondy/ios-device-list (MIT)"],
  _erzeugt: new Date().toISOString(),
  modelle: merged.map(({ _src, ...rest }) => rest),
};
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`Geschrieben: ${OUT_PATH} mit ${merged.length} Modellen`);

// Dry-Run Erkennung auf deinen Screenshots
const probe = ["MacBook Air 13 A1304", "MacBook A1278 mit MacOS X El Capitan", "iPhone 11 A2111", "MacBook Air M1 A2337"];
console.log("\nProbe Erkennung:");
for (const t of probe) {
  const up = t.toUpperCase();
  const hit = merged.filter((m) => (m.a || []).some((a) => up.includes(a.toUpperCase())));
  console.log(`  "${t}" -> ${hit.map((m) => `${m.a.join("/")}:${m.jahr || "?"} ${m.chip || ""}`.trim()).join(" | ") || "-"}`);
}
