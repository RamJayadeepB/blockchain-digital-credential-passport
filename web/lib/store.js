// Tiny JSON-file store for the student's credential list. Swap for Postgres in production.
import fs from "fs";
import path from "path";

const file = path.join(process.cwd(), "data", "credentials.json");

function readAll() {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return []; }
}
function writeAll(rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}

export const listAll = () => readAll();
export const listBySubject = (did) => readAll().filter((r) => r.subjectDid.toLowerCase() === did.toLowerCase());
export function save(record) {
  const rows = readAll();
  if (!rows.some((r) => r.credentialHash === record.credentialHash)) rows.unshift(record);
  writeAll(rows);
}
