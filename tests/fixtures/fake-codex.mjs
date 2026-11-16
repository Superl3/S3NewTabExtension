// Stands in for `codex exec ...` in tests. Behaviour is chosen with FAKE_CODEX_MODE.
import fs from "node:fs";

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const model = value("-m");
const outFile = value("-o");
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const mode = process.env.FAKE_CODEX_MODE || "ok";
  if (mode === "hang") {
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === "unsupported") {
    console.error(`ERROR: {"status":400,"error":{"message":"The '${model}' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}`);
    process.exit(1);
  }
  if (mode === "login") {
    console.error("Not logged in. Run codex login.");
    process.exit(1);
  }
  if (mode === "limit") {
    console.error("You have hit your usage limit.");
    process.exit(1);
  }
  if (mode === "empty") {
    process.exit(0);
  }
  if (mode === "fail") {
    console.error("something exploded\nat line two\nat line three");
    process.exit(3);
  }
  fs.writeFileSync(outFile, JSON.stringify({ args, input }));
  process.stdout.write("done\n");
  process.exit(0);
});
