// Test-only production-container preload. Real provider traffic is intercepted.
const assert = require("node:assert/strict");
const { readFileSync, appendFileSync } = require("node:fs");

const directory = "/fold-provider-test";
const actualFetch = globalThis.fetch;
const sheets = new Map();
const emails = new Set();
const json = (body, status = 200) => Response.json(body, { status });
const record = event => appendFileSync(`${directory}/events.ndjson`, JSON.stringify(event) + "\n");
function controls() { return JSON.parse(readFileSync(`${directory}/controls.json`, "utf8")); }
function sheet(file) {
  if (!sheets.has(file)) sheets.set(file, { header: [], rows: [], markers: new Set(), property: null, uncertain: false });
  return sheets.get(file);
}

globalThis.fetch = async function controlledFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "api.resend.com") {
    assert.equal(url.pathname, "/emails");
    const request = new Request(input, init);
    assert.equal(request.headers.get("authorization"), "Bearer synthetic-fold-provider-test");
    const key = request.headers.get("idempotency-key");
    const message = await request.json();
    const mode = controls().mail;
    record({ type: "mail-attempt", key, message });
    if (emails.has(key)) return json({ id: key });
    if (mode === "fail" && key.startsWith("fold-response-alert-")) return json({}, 503);
    emails.add(key);
    record({ type: "mail-accepted", key, message });
    if (mode === "lost" && key.startsWith("fold-response-alert-")) throw new Error("Fixture lost the mail acknowledgment");
    return json({ id: key });
  }
  if (url.hostname === "oauth2.googleapis.com" || (url.hostname === "www.googleapis.com" && url.pathname.endsWith("/token"))) {
    return json({ access_token: "synthetic-google-access", expires_in: 3600, token_type: "Bearer" });
  }
  if (url.hostname === "sheets.googleapis.com") {
    const [, file, suffix] = /^\/v4\/spreadsheets\/([\w-]+)(.*)$/.exec(url.pathname);
    const request = new Request(input, init);
    assert.equal(request.headers.get("authorization"), "Bearer synthetic-google-access");
    const mode = controls().sheets;
    if (mode === "forbidden") return json({}, 403);
    const target = sheet(file);
    if (suffix.startsWith("/values/")) {
      const range = decodeURIComponent(suffix.slice(8));
      if (range === "'Fold setup'!A1") return json({ values: [[controls().proofs[file] ?? ""]] });
      if (range === `'${target.property?.title}'!1:1`) return json({ values: [target.header] });
      if (target.uncertain && mode === "lost") return json({}, 503);
      if (target.markers.has(range)) return json({ values: [[target.header[0]]] });
      return json({}, 404);
    }
    assert.equal(suffix, ":batchUpdate");
    const { requests } = await request.json();
    if (requests[0].addSheet) {
      const property = requests[0].addSheet.properties;
      if (target.property) return json({}, 400);
      assert.equal(requests[1].updateCells.start.sheetId, property.sheetId);
      target.property = property;
      target.header = readCells(requests[1].updateCells.rows[0]);
      record({ type: "sheet-created", file, columns: target.header });
      return json({ spreadsheetId: file, replies: [{}, {}] });
    }
    assert.equal(requests.length, 2);
    const marker = requests[0].addNamedRange.namedRange;
    const append = requests[1].appendCells;
    assert.equal(marker.range.sheetId, target.property.sheetId);
    assert.equal(append.sheetId, target.property.sheetId);
    if (target.markers.has(marker.name)) return json({}, 400);
    const row = readCells(append.rows[0]);
    assert.equal(marker.name, "fold_response_" + row[0].replaceAll("-", ""));
    target.rows.push(row);
    target.markers.add(marker.name);
    record({ type: "sheet-written", file, row });
    if (mode === "lost") {
      target.uncertain = true;
      throw new Error("Fixture accepted the atomic write and lost its acknowledgment");
    }
    return json({ spreadsheetId: file, replies: [{}, {}] });
  }
  return actualFetch(input, init);
};

function readCells(row) {
  return row.values.map(cell => {
    assert.deepEqual(Object.keys(cell.userEnteredValue), ["stringValue"]);
    return cell.userEnteredValue.stringValue;
  });
}
