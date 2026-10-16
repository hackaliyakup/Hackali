import fs from "node:fs";

const css = fs.readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
const ledger = fs.readFileSync(new URL("../js/ledger.js", import.meta.url), "utf8").replace(/^export /gm, "");
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8")
  .replace(/^import \{[\s\S]*?\} from "\.\/ledger\.js";\n+/, "");

const html = `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hackali Kasa</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230b1220'/%3E%3Cpath d='M8 12h16M8 16h10M8 20h13' stroke='white' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
${ledger}
${app}
    </script>
  </body>
</html>
`;

for (const name of ["defter.html", "kasa.html"]) {
  fs.writeFileSync(new URL(`../${name}`, import.meta.url), html);
}
