import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), ".next", "static");
const forbiddenNames = ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "OTP_PEPPER", "ADMIN_ACCESS_KEY"];
const forbiddenValues = forbiddenNames.map((name) => process.env[name]).filter((value) => value && value.length >= 8);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

for (const file of await files(root)) {
  const contents = await readFile(file, "utf8");
  for (const marker of [...forbiddenNames, ...forbiddenValues]) {
    if (contents.includes(marker)) throw new Error(`Client bundle contains forbidden server secret marker in ${path.relative(process.cwd(), file)}`);
  }
}

console.log("Client bundle secret scan passed.");
