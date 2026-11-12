import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage();
p.on("console", (m) => console.log("CONSOLE", m.text()));
await p.goto("http://localhost:8000/rt/test.html");
await p.waitForFunction(() => document.getElementById("o").textContent.includes("FERTIG"), null, { timeout: 280000 });
console.log(await p.textContent("#o")); await b.close();
