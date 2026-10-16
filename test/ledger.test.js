import assert from "node:assert/strict";
import test from "node:test";
import {
  cashMovements,
  correctPurchaseSale,
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

test("reads 1000 alış and 1500 satış as 500 left", () => {
  const fixed = correctPurchaseSale({
    openingCash: 0,
    jobs: [{
      id: "anten",
      date: "2026-10-16",
      product: "anten",
      supplier: "ÖDF",
      customer: "traqzbon elektronikk",
      cost: 1500,
      price: 1000,
      costPaid: true,
      collected: false,
      note: "",
      createdAt: "2026-10-16T00:00:00.000Z",
    }],
    expenses: [],
  });
  const job = fixed.jobs[0];
  assert.equal(job.supplier, "traqzbon elektronikk");
  assert.equal(job.customer, "ÖDF");
  assert.equal(job.cost, 1000);
  assert.equal(job.price, 1500);
  assert.equal(job.costPaid, false);
  assert.equal(job.collected, true);
  assert.equal(summarize(fixed, "all", new Date(2026, 9, 16)).grossProfit, 500);
});

test("shows 5000 still due when 15000 of a 20000 sale has arrived", () => {
  const summary = summarize({
    openingCash: 0,
    jobs: [{
      id: "kismi",
      date: "2026-10-16",
      product: "Ürün",
      supplier: "A Firması",
      customer: "Adam",
      cost: 10000,
      price: 20000,
      received: 15000,
      costPaid: true,
      collected: false,
      note: "",
      createdAt: "2026-10-16T00:00:00.000Z",
    }],
    expenses: [],
  }, "all", new Date(2026, 9, 16));

  assert.equal(summary.grossProfit, 10000);
  assert.equal(summary.cashIn, 15000);
  assert.equal(summary.cashOut, 10000);
  assert.equal(summary.balance, 5000);
  assert.equal(summary.receivable, 5000);
  assert.equal(summary.jobs[0].collected, false);
});

test("keeps a normal 15000 alış and 25000 satış row as written", () => {
  const fixed = correctPurchaseSale({
    openingCash: 0,
    jobs: [exampleJob("2026-10-07")],
    expenses: [],
  });
  assert.equal(fixed.jobs[0].supplier, "A Firması");
  assert.equal(fixed.jobs[0].customer, "B");
  assert.equal(fixed.jobs[0].cost, 15000);
  assert.equal(fixed.jobs[0].price, 25000);
  assert.equal(summarize(fixed, "all", NOW).grossProfit, 10000);
});
