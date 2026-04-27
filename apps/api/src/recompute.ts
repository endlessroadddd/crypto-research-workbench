import { createDb, recomputeWorkspace } from "./service.js";

const db = createDb();
const result = recomputeWorkspace(db);
// eslint-disable-next-line no-console
console.log(JSON.stringify({
  generatedAt: result.generatedAt,
  candidates: result.candidates.map((candidate) => ({
    symbol: candidate.symbol,
    routerDecision: candidate.routerDecision,
    confidenceBand: candidate.confidenceBand
  }))
}, null, 2));
db.close();

