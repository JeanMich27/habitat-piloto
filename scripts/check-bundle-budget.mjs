import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "assets");
const jsFiles = readdirSync(assetsDir).filter((file) => file.endsWith(".js"));
const entries = jsFiles.map((file) => ({ file, bytes: statSync(join(assetsDir, file)).size }));
const initial = entries.filter(({ file }) => file.startsWith("index-"));
const initialBytes = initial.reduce((sum, item) => sum + item.bytes, 0);
const maxInitialBytes = 500 * 1024;

console.log(`Initial JS: ${(initialBytes / 1024).toFixed(1)} KiB (budget ${(maxInitialBytes / 1024).toFixed(0)} KiB)`);
console.log(`Lazy chunks: ${entries.length - initial.length}`);

if (initialBytes > maxInitialBytes) {
  console.error("Bundle budget exceeded. Move optional views/dependencies behind dynamic imports.");
  process.exit(1);
}
