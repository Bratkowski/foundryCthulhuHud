import { runInventoryTests } from "./inventory.test.js";

const results = await runInventoryTests();
for (const result of results) console.log(`PASS ${result.name}`);
console.log(`${results.length} tests passed.`);
