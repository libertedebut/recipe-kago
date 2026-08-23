// core.js を app-template.html に埋め込んで、1枚のHTMLを作る。
// 外部ファイルを一切読まないので、保存すればそのまま動く。

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const core = readFileSync(join(here, "core.js"), "utf8")
  .replace(/^export (const|function) /gm, "$1 ")
  .trim();

const template = readFileSync(join(here, "app-template.html"), "utf8");
let output = template.replace("/*__CORE__*/", core);

if (output === template) {
  console.error("差し込み位置 /*__CORE__*/ が見つかりませんでした");
  process.exit(1);
}

// 不具合の報告と、手元のコードを突き合わせるための目印。
// 日付とコミットが分かれば、どの版で起きたのか迷わない。
const date = new Date().toISOString().slice(0, 10);
let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
} catch {
  commit = "手元";
}
const build = `${date}-${commit}`;
output = output.replace("__BUILD__", build);

const target = join(here, "index.html");
writeFileSync(target, output);
console.log(`できました: ${target}  (${Math.round(output.length / 1024)} KB)  版 ${build}`);
