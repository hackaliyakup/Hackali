import assert from "node:assert/strict";
import test from "node:test";
import {
  cashMovements,
  exampleJob,
  parseMoney,
  summarize,
} from "../js/ledger.js";

const NOW = new Date(2026, 9, 7);

test("parses Turkish and plain money inputs", () => {
  assert.equal(parseMoney("15000"), 15000);
  assert.equal(parseMoney("15.000"), 15000);
  assert.equal(parseMoney("15.000,50"), 15000.5);
  assert.equal(parseMoney("15000,5"), 15000.5);
  assert.equal(parseMoney("15,000.50"), 15000.5);
  assert.equal(parseMoney("₺ 15.000"), 15000);
  assert.equal(parseMoney(""), NaN);
  assert.equal(parseMoney("abc"), NaN);
});

test("tracks the buy-sell-profit story and a meal expense", () => {
  const state = {
    openingCash: 0,
    jobs: [exampleJob("2026-10-07")],
    expenses: [
      {
        id: "yemek-1",
        date: "2026-10-07",
        category: "yemek",
        person: "Ali",
        amount: 350,
        note: "Öğle yemeği",
        createdAt: "2026-10-07T12:00:00.000Z",
      },
    ],
  };

  const summary = summarize(state, "month", NOW);
  assert.equal(summary.cashIn, 25000);
  assert.equal(summary.cashOut, 15350);
  assert.equal(summary.balance, 9650);
  assert.equal(summary.grossProfit, 10000);
  assert.equal(summary.expenseTotal, 350);
  assert.equal(summary.netProfit, 9650);
  assert.equal(summary.receivable, 0);
  assert.equal(summary.payable, 0);
});

test("keeps profit when the customer has not paid yet", () => {
  const job = exampleJob("2026-10-07");
  job.collected = false;
  const summary = summarize({ openingCash: 5000, jobs: [job], expenses: [] }, "all", NOW);

  assert.equal(summary.grossProfit, 10000);
  assert.equal(summary.cashIn, 0);
  assert.equal(summary.balance, -10000);
  assert.equal(summary.receivable, 25000);
  assert.equal(summary.payable, 0);
});

test("does not drop the cash balance for a job outside the selected month", () => {
  const oldJob = exampleJob("2026-09-30");
  oldJob.collected = false;
  oldJob.costPaid = false;
  const current = exampleJob("2026-10-02");
  current.id = "ekim";

  const summary = summarize({ openingCash: 0, jobs: [oldJob, current], expenses: [] }, "month", NOW);
  assert.equal(summary.cashIn, 25000);
  assert.equal(summary.grossProfit, 10000);
  assert.equal(summary.balance, 10000);
  assert.equal(summary.receivable, 25000);
  assert.equal(summary.payable, 15000);
  assert.equal(summary.hiddenReceivableCount, 1);
  assert.equal(summary.hiddenPayableCount, 1);
  assert.equal(summary.jobs.length, 1);
});

test("lists cash coming in, purchase money going out, and expenses", () => {
  const state = {
    openingCash: 0,
    jobs: [exampleJob("2026-10-07")],
    expenses: [
      {
        id: "malzeme-1",
        date: "2026-10-06",
        category: "malzeme",
        person: "",
        amount: 80,
        note: "Vida",
        createdAt: "2026-10-06T09:00:00.000Z",
      },
    ],
  };

  const moves = cashMovements(state, "month", NOW);
  assert.deepEqual(
    moves.map((move) => [move.kind, move.amount]),
    [
      ["in", 25000],
      ["out", 15000],
      ["expense", 80],
    ],
  );
});
