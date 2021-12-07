const { build } = require("esbuild");
const fs = require("fs");

(async () => {
  const contractEntries = fs
    .readdirSync("./contract", { withFileTypes: true })
    .filter((el) => el.isDirectory())
    .map((el) => `${el.name}/contract.ts`);

  await build({
    entryPoints: contractEntries.map((entry) => `./contract/${entry}`),
    outdir: "./build/vehicle",
    format: "esm",
    bundle: true,
  });

  for (const entry of contractEntries) {
    const filename = `./build/${entry.replace(/\.ts$/, ".js")}`;
    let src = fs.readFileSync(filename).toString();

    src = src.replace("export {\n  handle\n};\n", "");
    fs.writeFileSync(filename, src);
  }
})();
