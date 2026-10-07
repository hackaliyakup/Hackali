export const CATEGORIES = [
  { id: "yemek", label: "Yemek" },
  { id: "malzeme", label: "Malzeme" },
  { id: "ulasim", label: "Ulaşım" },
  { id: "diger", label: "Diğer" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyState() {
  return { openingCash: 0, jobs: [], expenses: [] };
}

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sumMoney(values) {
  const cents = values.reduce((total, value) => total + Math.round(value * 100), 0);
  return cents / 100;
}

export function parseMoney(raw) {
  if (typeof raw === "number") return roundMoney(raw);
  let text = String(raw ?? "").trim().replace(/₺/g, "").replace(/\s/g, "");
  if (!text) return NaN;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = text.split(",");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      text = `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = text.split(".");
    if (!(parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2)) {
      text = text.replace(/\./g, "");
    }
  }

  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  return roundMoney(text);
}

export function formatMoney(value) {
  const amount = roundMoney(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const hasCents = Math.round(Math.abs(safe) * 100) % 100 !== 0;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatDate(iso) {
  if (!DATE_RE.test(iso || "")) return iso || "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function categoryLabel(id) {
  return CATEGORIES.find((item) => item.id === id)?.label || "Diğer";
}

export function inRange(iso, range, now = new Date()) {
  if (range === "all") return true;
  if (!DATE_RE.test(iso || "")) return false;
  const [year, month] = iso.split("-").map(Number);
  if (range === "year") return year === now.getFullYear();
  if (range === "month") return year === now.getFullYear() && month === now.getMonth() + 1;
  return true;
}

function cleanText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeJob(job) {
  if (!job || typeof job !== "object") return null;
  const cost = Number(job.cost);
  const price = Number(job.price);
  if (!Number.isFinite(cost) || !Number.isFinite(price) || cost < 0 || price < 0) return null;
  const product = cleanText(job.product, 120);
  const supplier = cleanText(job.supplier, 120);
  const customer = cleanText(job.customer, 120);
  if (!product || !supplier || !customer || !DATE_RE.test(job.date || "")) return null;
  return {
    id: cleanText(job.id, 80),
    date: job.date,
    product,
    supplier,
    customer,
    cost: roundMoney(cost),
    price: roundMoney(price),
    costPaid: Boolean(job.costPaid),
    collected: Boolean(job.collected),
    note: cleanText(job.note, 400),
    createdAt: cleanText(job.createdAt, 40) || job.date,
  };
}

function normalizeExpense(expense) {
  if (!expense || typeof expense !== "object") return null;
  const amount = Number(expense.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !DATE_RE.test(expense.date || "")) return null;
  const category = CATEGORIES.some((item) => item.id === expense.category) ? expense.category : "diger";
  return {
    id: cleanText(expense.id, 80),
    date: expense.date,
    category,
    person: cleanText(expense.person, 120),
    amount: roundMoney(amount),
    note: cleanText(expense.note, 400),
    createdAt: cleanText(expense.createdAt, 40) || expense.date,
  };
}

export function normalize(data) {
  const opening = Number(data?.openingCash);
  return {
    openingCash: Number.isFinite(opening) ? roundMoney(opening) : 0,
    jobs: Array.isArray(data?.jobs) ? data.jobs.map(normalizeJob).filter(Boolean) : [],
    expenses: Array.isArray(data?.expenses) ? data.expenses.map(normalizeExpense).filter(Boolean) : [],
  };
}

export function jobProfit(job) {
  return roundMoney(job.price - job.cost);
}

export function summarize(state, range = "all", now = new Date()) {
  const source = normalize(state);
  const jobs = source.jobs.filter((job) => inRange(job.date, range, now));
  const expenses = source.expenses.filter((expense) => inRange(expense.date, range, now));

  const grossProfit = sumMoney(jobs.map((job) => job.price - job.cost));
  const expenseTotal = sumMoney(expenses.map((expense) => expense.amount));
  const cashIn = sumMoney(jobs.filter((job) => job.collected).map((job) => job.price));
  const purchaseOut = sumMoney(jobs.filter((job) => job.costPaid).map((job) => job.cost));
  const cashOut = sumMoney([purchaseOut, expenseTotal]);

  const allCashIn = sumMoney(source.jobs.filter((job) => job.collected).map((job) => job.price));
  const allPurchaseOut = sumMoney(source.jobs.filter((job) => job.costPaid).map((job) => job.cost));
  const allExpenses = sumMoney(source.expenses.map((expense) => expense.amount));
  const balance = sumMoney([source.openingCash, allCashIn, -allPurchaseOut, -allExpenses]);

  return {
    grossProfit,
    expenseTotal,
    netProfit: sumMoney([grossProfit, -expenseTotal]),
    cashIn,
    cashOut,
    balance,
    receivable: sumMoney(source.jobs.filter((job) => !job.collected).map((job) => job.price)),
    payable: sumMoney(source.jobs.filter((job) => !job.costPaid).map((job) => job.cost)),
    hiddenReceivableCount: source.jobs.filter((job) => !job.collected && !inRange(job.date, range, now)).length,
    hiddenPayableCount: source.jobs.filter((job) => !job.costPaid && !inRange(job.date, range, now)).length,
    jobs,
    expenses,
  };
}

export function cashMovements(state, range = "all", now = new Date()) {
  const source = normalize(state);
  const items = [];

  for (const job of source.jobs) {
    if (!inRange(job.date, range, now)) continue;
    if (job.collected) {
      items.push({
        id: `${job.id}:in`,
        date: job.date,
        createdAt: job.createdAt,
        kind: "in",
        title: `${job.product} · ${job.customer}`,
        detail: "Satış tahsilatı",
        amount: job.price,
      });
    }
    if (job.costPaid) {
      items.push({
        id: `${job.id}:out`,
        date: job.date,
        createdAt: job.createdAt,
        kind: "out",
        title: `${job.product} · ${job.supplier}`,
        detail: "Alış ödemesi",
        amount: job.cost,
      });
    }
  }

  for (const expense of source.expenses) {
    if (!inRange(expense.date, range, now)) continue;
    const who = expense.person ? ` · ${expense.person}` : "";
    items.push({
      id: expense.id,
      date: expense.date,
      createdAt: expense.createdAt,
      kind: "expense",
      title: `${categoryLabel(expense.category)}${who}`,
      detail: expense.note || "Gider",
      amount: expense.amount,
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return items;
}

export function exampleJob(date) {
  return {
    id: "ornek-is",
    date,
    product: "Ürün",
    supplier: "A Firması",
    customer: "B",
    cost: 15000,
    price: 25000,
    costPaid: true,
    collected: true,
    note: "A firmasından alınıp B'ye takıldı.",
    createdAt: `${date}T00:00:00.000Z`,
  };
}
