// Links the repo root into dev-vault/.obsidian/plugins/felisidian so that
// `npm run dev` rebuilds main.js straight into the test vault.
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const plugins = resolve(root, "dev-vault/.obsidian/plugins");
const link = resolve(plugins, "felisidian");

mkdirSync(plugins, { recursive: true });
if (!existsSync(link)) symlinkSync(root, link, "junction");

writeFileSync(
  resolve(root, "dev-vault/.obsidian/community-plugins.json"),
  JSON.stringify(["felisidian"])
);
console.log(`Linked ${link}\nNow open the dev-vault folder as a vault in Obsidian.`);
