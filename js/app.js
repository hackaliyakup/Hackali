import {
  CATEGORIES,
  categoryLabel,
  emptyState,
  exampleJob,
  formatDate,
  formatMoney,
  inRange,
  jobProfit,
  normalize,
  parseMoney,
  summarize,
} from "./ledger.js";

const STORAGE_KEY = "hackali-kasa-v1";

const ui = {
  tab: "ozet",
  range: "month",
  editingJobId: null,
  editingExpenseId: null,
  editingOpening: false,
  message: "",
  error: "",
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    return normalize(JSON.parse(raw));
  } catch {
    localStorage.setItem(`${STORAGE_KEY}-bozuk`, raw);
    ui.message = "Kayıtlı defter okunamadı. Bozuk kayıt yedeklendi ve yeni bir defter açıldı.";
    return emptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showError(message) {
  ui.error = message;
  const main = document.querySelector("main");
  if (!main) return;
  let box = main.querySelector(".error-notice");
  if (!box) {
    box = el("div", { class: "notice error-notice" }, [message]);
    main.prepend(box);
    return;
  }
  box.textContent = message;
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function field(name, label, control, className) {
  return el("label", { class: className }, [el("span", {}, [label]), control]);
}

function textInput(name, value, extra = {}) {
  return el("input", { name, value: value ?? "", ...extra });
}

function currentSummary() {
  return summarize(state, ui.range, new Date());
}

function render() {
  const root = document.querySelector("#app");
  const summary = currentSummary();
  root.replaceChildren(header(), board(summary), tabs(), panel(summary));
}

function header() {
  return el("header", { class: "topbar" }, [
    el("div", {}, [
      el("h1", {}, ["Hackali Kasa"]),
      el("p", { class: "sub" }, ["Ne oldu, kimden geldi, nereye gitti, ne kadar kaldı."]),
    ]),
    el("div", { class: "toolbar" }, [
      el("select", { "data-action": "range", "aria-label": "Dönem" }, [
        option("month", "Bu ay", ui.range),
        option("year", "Bu yıl", ui.range),
        option("all", "Tümü", ui.range),
      ]),
      el("button", { class: "btn", type: "button", "data-action": "export" }, ["Yedek al"]),
      el("button", { class: "btn", type: "button", "data-action": "import" }, ["Yedek yükle"]),
    ]),
  ]);
}

function option(value, label, current) {
  return el("option", { value, selected: value === current }, [label]);
}

function board(summary) {
  const opening = state.openingCash
    ? `Kasa ${formatMoney(state.openingCash)} ile açıldı. `
    : "";
  const sales = summary.jobs.reduce((total, job) => total + Math.round(job.price * 100), 0) / 100;
  const margin = sales ? Math.round((summary.grossProfit / sales) * 100) : 0;
  const collected = summary.jobs.filter((job) => job.collected).length;
  const cards = [
    ["Gelen", formatMoney(summary.cashIn), "Kimden geldi", `${collected} tahsilat işlendi`, "in", "positive"],
    ["Giden", formatMoney(summary.cashOut), "Nere gitti", `Gider ${formatMoney(summary.expenseTotal)}`, "out", "negative"],
    ["Kâr", formatMoney(summary.netProfit), "Ne kadar kaldı", sales ? `Satışın %${margin}'ı kâr` : "Bu dönemde satış yok", "profit", summary.netProfit < 0 ? "negative" : "positive"],
    ["Bekleyen", formatMoney(summary.receivable + summary.payable), "Henüz kapanmadı", `Gelmedi ${formatMoney(summary.receivable)} · Gitmedi ${formatMoney(summary.payable)}`, "wait", ""],
  ];
  return el("section", { class: "board" }, [
    el("article", { class: "kasa-card" }, [
      el("div", { class: "eyebrow" }, ["Kasada"]),
      el("div", { class: summary.balance < 0 ? "balance negative" : "balance" }, [formatMoney(summary.balance)]),
      el("p", { class: "hint" }, [opening, "Gelen paradan giden para çıkınca kasada bu kalır."]),
      ui.editingOpening
        ? openingForm()
        : el("button", { class: "text-btn", type: "button", "data-action": "edit-opening" }, [
            `Başlangıç parası: ${formatMoney(state.openingCash)}`,
          ]),
    ]),
    el("div", { class: "facts" }, cards.map(([label, value, hint, detail, kind, tone]) =>
      el("article", { class: `stat ${kind}` }, [
        el("span", { class: "ask" }, [label]),
        el("b", { class: tone }, [value]),
        el("span", { class: "meta" }, [hint]),
        el("span", { class: "meta" }, [detail]),
      ]),
    )),
  ]);
}

function openingForm() {
  return el("form", { id: "opening-form" }, [
    field("openingCash", "Kasanın başlangıç parası", textInput("openingCash", String(state.openingCash), { inputmode: "decimal", required: "true" })),
    el("div", { class: "actions" }, [
      el("button", { class: "btn primary", type: "submit" }, ["Kaydet"]),
      el("button", { class: "btn", type: "button", "data-action": "cancel-opening" }, ["Vazgeç"]),
    ]),
  ]);
}

function tabs() {
  const items = [
    ["ozet", "Defter"],
    ["isler", "Yeni iş"],
    ["giderler", "Gider"],
  ];
  return el("nav", { class: "tabs", "aria-label": "Bölümler" }, items.map(([id, label]) =>
    el("button", {
      class: ui.tab === id ? "tab active" : "tab",
      type: "button",
      "data-action": "tab",
      "data-tab": id,
    }, [label]),
  ));
}

function panel(summary) {
  const body = [alerts(summary)];
  if (ui.tab === "ozet") body.push(overview(summary));
  if (ui.tab === "isler") body.push(jobSection(summary));
  if (ui.tab === "giderler") body.push(expenseSection(summary));
  return el("main", { class: "panel" }, body);
}

function alerts(summary) {
  const nodes = [];
  if (ui.message) nodes.push(el("div", { class: "notice" }, [ui.message]));
  if (ui.error) nodes.push(el("div", { class: "notice error-notice" }, [ui.error]));
  if (summary.hiddenReceivableCount || summary.hiddenPayableCount) {
    nodes.push(el("div", { class: "notice" }, [
      "Başka ayda henüz gelmemiş veya gitmemiş para var. Hepsini görmek için dönemi Tümü yap.",
    ]));
  }
  return nodes;
}

function stories(summary) {
  return [
    ...summary.jobs.map((job) => ({ kind: "job", date: job.date, createdAt: job.createdAt, job })),
    ...summary.expenses.map((expense) => ({ kind: "expense", date: expense.date, createdAt: expense.createdAt, expense })),
  ].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function overview(summary) {
  const items = stories(summary);
  return el("section", {}, [
    items.length
      ? ledgerTable(items)
      : sampleStory(),
    dangerZone(),
  ]);
}

function sampleStory() {
  const sample = exampleJob(todayISO());
  return el("div", {}, [
    el("p", { class: "hint" }, ["Boş defter. Örnek satır şöyle durur:"]),
    ledgerTable([{ kind: "job", date: sample.date, createdAt: sample.createdAt, job: sample }], { sample: true }),
    el("button", { class: "btn primary", type: "button", "data-action": "example" }, ["Bu örneği deftere yaz"]),
  ]);
}

function ledgerTable(items, options = {}) {
  const geldi = sumColumn(items, "in");
  const gitti = sumColumn(items, "out");
  const kaldi = sumColumn(items, "left");
  const jobs = items.filter((item) => item.kind === "job").length;
  const expenses = items.length - jobs;
  const headers = ["#", "Tarih", "Ne oldu", "Kimden geldi", "Ne kadar geldi", "Nere gitti", "Ne kadar gitti", "Ne kadar kaldı", ""];
  return el("div", {}, [
    el("div", { class: "sheet-bar" }, [
      el("strong", {}, ["Defter"]),
      el("span", {}, [`${items.length} satır · ${jobs} iş · ${expenses} gider`]),
    ]),
    el("div", { class: "sheet-wrap" }, [
      el("table", { class: "sheet" }, [
        el("thead", {}, [
          el("tr", {}, headers.map((label, index) =>
            el("th", { class: index === 4 || index === 6 || index === 7 ? "num" : "" }, [label]),
          )),
        ]),
        el("tbody", {}, items.map((item, index) => (
          item.kind === "job" ? jobRow(item.job, options.sample, index + 1) : expenseRow(item.expense, index + 1)
        ))),
        options.sample ? null : el("tfoot", {}, [
          el("tr", {}, [
            el("td", { colspan: "4" }, ["Toplam"]),
            el("td", { class: "num" }, [formatMoney(geldi)]),
            el("td", {}, []),
            el("td", { class: "num" }, [formatMoney(gitti)]),
            el("td", { class: kaldi < 0 ? "num negative" : "num positive" }, [formatMoney(kaldi)]),
            el("td", {}, []),
          ]),
        ]),
      ]),
    ]),
  ]);
}

function sumColumn(items, key) {
  const cents = items.reduce((total, item) => total + Math.round(figures(item)[key] * 100), 0);
  return cents / 100;
}

function figures(item) {
  if (item.kind === "job") {
    return { in: item.job.price, out: item.job.cost, left: jobProfit(item.job) };
  }
  return { in: 0, out: item.expense.amount, left: -item.expense.amount };
}

function rate(part, whole) {
  if (!whole) return "";
  return `%${Math.round((part / whole) * 100)}`;
}

function badge(text, kind) {
  return el("span", { class: `badge ${kind}` }, [text]);
}

function jobRow(job, sample, index) {
  const profit = jobProfit(job);
  return el("tr", {}, [
    el("td", { class: "muted-cell" }, [String(index)]),
    el("td", {}, [formatDate(job.date)]),
    el("td", {}, [
      el("div", {}, [badge("İş", "kind"), el("span", { class: "cell-title" }, [job.product])]),
      job.note ? el("div", { class: "meta" }, [job.note]) : null,
    ]),
    el("td", {}, [
      el("div", { class: "cell-title" }, [job.customer]),
      badge(job.collected ? "Geldi" : "Henüz gelmedi", job.collected ? "good" : "wait"),
    ]),
    moneyCell(job.price, job.collected ? "positive" : "wait"),
    el("td", {}, [
      el("div", { class: "cell-title" }, [job.supplier]),
      badge(job.costPaid ? "Gitti" : "Henüz gitmedi", job.costPaid ? "bad" : "wait"),
    ]),
    moneyCell(job.cost, job.costPaid ? "negative" : "wait"),
    moneyCell(profit, profit < 0 ? "negative" : "positive", rate(profit, job.price)),
    sample ? el("td", {}, []) : el("td", { class: "ops" }, [
      el("button", { class: "text-btn", type: "button", "data-action": "edit-job", "data-id": job.id }, ["Düzenle"]),
      el("button", { class: "text-btn danger", type: "button", "data-action": "delete-job", "data-id": job.id }, ["Sil"]),
    ]),
  ]);
}

function expenseRow(expense, index) {
  const what = [expense.person, expense.note].filter(Boolean).join(" · ");
  return el("tr", {}, [
    el("td", { class: "muted-cell" }, [String(index)]),
    el("td", {}, [formatDate(expense.date)]),
    el("td", {}, [
      el("div", {}, [badge("Gider", "kind"), el("span", { class: "cell-title" }, [categoryLabel(expense.category)])]),
      what ? el("div", { class: "meta" }, [what]) : null,
    ]),
    el("td", { class: "muted-cell" }, ["—"]),
    el("td", { class: "num muted-cell" }, ["—"]),
    el("td", {}, [
      el("div", { class: "cell-title" }, [categoryLabel(expense.category)]),
      badge("Gitti", "bad"),
    ]),
    moneyCell(expense.amount, "negative"),
    moneyCell(-expense.amount, "negative"),
    el("td", { class: "ops" }, [
      el("button", { class: "text-btn", type: "button", "data-action": "edit-expense", "data-id": expense.id }, ["Düzenle"]),
      el("button", { class: "text-btn danger", type: "button", "data-action": "delete-expense", "data-id": expense.id }, ["Sil"]),
    ]),
  ]);
}

function moneyCell(amount, tone, extra) {
  return el("td", { class: "num" }, [
    el("div", { class: tone || "" }, [formatMoney(amount)]),
    extra ? el("div", { class: "meta" }, [extra]) : null,
  ]);
}

function jobSection(summary) {
  const editing = state.jobs.find((job) => job.id === ui.editingJobId);
  return el("section", {}, [
    jobForm(editing),
    summary.jobs.length
      ? ledgerTable(summary.jobs.map((job) => ({ kind: "job", date: job.date, createdAt: job.createdAt, job })))
      : el("p", { class: "empty" }, ["Bu dönemde iş yok."]),
  ]);
}

function jobForm(job) {
  const value = job || {
    date: todayISO(),
    product: "",
    supplier: "",
    cost: "",
    customer: "",
    price: "",
    note: "",
    costPaid: true,
    collected: true,
  };
  return el("form", { id: "job-form" }, [
    el("div", { class: "block" }, [
      el("h3", {}, ["Ne oldu"]),
      el("div", { class: "grid" }, [
        field("date", "Tarih", textInput("date", value.date, { type: "date", required: "true" })),
        field("product", "İş", textInput("product", value.product, { required: "true", maxlength: "120", placeholder: "Klima takıldı" })),
        field("note", "Kısa not", textInput("note", value.note || "", { maxlength: "400", placeholder: "İstersen boş bırak" }), "wide"),
      ]),
    ]),
    el("div", { class: "block" }, [
      el("h3", {}, ["Nere gitti"]),
      el("div", { class: "grid" }, [
        field("supplier", "Kime gitti", textInput("supplier", value.supplier, { required: "true", maxlength: "120", placeholder: "A Firması" })),
        field("cost", "Ne kadar gitti", textInput("cost", value.cost === "" ? "" : String(value.cost), { inputmode: "decimal", required: "true", placeholder: "15.000" })),
        el("label", { class: "check" }, [
          el("input", { type: "checkbox", name: "costPaid", checked: value.costPaid ? "true" : false }),
          "Para gitti",
        ]),
      ]),
    ]),
    el("div", { class: "block" }, [
      el("h3", {}, ["Kimden geldi"]),
      el("div", { class: "grid" }, [
        field("customer", "Kimden geldi", textInput("customer", value.customer, { required: "true", maxlength: "120", placeholder: "B" })),
        field("price", "Ne kadar geldi", textInput("price", value.price === "" ? "" : String(value.price), { inputmode: "decimal", required: "true", placeholder: "25.000" })),
        el("label", { class: "check" }, [
          el("input", { type: "checkbox", name: "collected", checked: value.collected ? "true" : false }),
          "Para geldi",
        ]),
      ]),
    ]),
    el("div", { class: "preview" }, [
      el("span", {}, ["Ne kadar kaldı"]),
      el("strong", { id: "profit-preview" }, [moneyPreview(value.cost, value.price)]),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "btn primary", type: "submit" }, [job ? "Güncelle" : "Deftere yaz"]),
      job ? el("button", { class: "btn", type: "button", "data-action": "cancel-job" }, ["Vazgeç"]) : null,
    ]),
  ]);
}

function moneyPreview(cost, price) {
  const parsedCost = parseMoney(cost);
  const parsedPrice = parseMoney(price);
  if (!Number.isFinite(parsedCost) || !Number.isFinite(parsedPrice)) return "—";
  return formatMoney(parsedPrice - parsedCost);
}

function expenseSection(summary) {
  const editing = state.expenses.find((expense) => expense.id === ui.editingExpenseId);
  return el("section", {}, [
    expenseForm(editing),
    summary.expenses.length
      ? ledgerTable(summary.expenses.map((expense) => ({ kind: "expense", date: expense.date, createdAt: expense.createdAt, expense })))
      : el("p", { class: "empty" }, ["Bu dönemde giden para yok."]),
  ]);
}

function expenseForm(expense) {
  const value = expense || { date: todayISO(), category: "yemek", person: "", amount: "", note: "" };
  return el("form", { id: "expense-form" }, [
    el("div", { class: "block" }, [
      el("h3", {}, ["Ne oldu"]),
      el("div", { class: "grid" }, [
        field("date", "Tarih", textInput("date", value.date, { type: "date", required: "true" })),
        field("category", "Tür", el("select", { name: "category" }, CATEGORIES.map((item) =>
          option(item.id, item.label, value.category),
        ))),
        field("person", "Kim", textInput("person", value.person, { maxlength: "120", placeholder: "Ali" })),
        field("note", "Kısa not", textInput("note", value.note || "", { maxlength: "400", placeholder: "Öğle yemeği" })),
      ]),
    ]),
    el("div", { class: "block" }, [
      el("h3", {}, ["Nere gitti"]),
      field("amount", "Ne kadar gitti", textInput("amount", value.amount === "" ? "" : String(value.amount), { inputmode: "decimal", required: "true", placeholder: "350" })),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "btn primary", type: "submit" }, [expense ? "Güncelle" : "Deftere yaz"]),
      expense ? el("button", { class: "btn", type: "button", "data-action": "cancel-expense" }, ["Vazgeç"]) : null,
    ]),
  ]);
}

function dangerZone() {
  if (!state.jobs.length && !state.expenses.length) return null;
  return el("div", { class: "footer-actions" }, [
    el("button", { class: "text-btn danger", type: "button", "data-action": "reset" }, ["Tüm kayıtları sil"]),
  ]);
}

function upsert(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [item, ...list];
  const next = list.slice();
  next[index] = item;
  return next;
}

function readJob(form) {
  const data = new FormData(form);
  const cost = parseMoney(data.get("cost"));
  const price = parseMoney(data.get("price"));
  if (!data.get("product") || !data.get("supplier") || !data.get("customer")) {
    return { error: "Ne oldu, para nereye gitti ve kimden geldi yazılmalı." };
  }
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0) {
    return { error: "Ne kadar geldiğini ve ne kadar gittiğini sayı yaz. Örnek: 15.000" };
  }
  const existing = state.jobs.find((job) => job.id === ui.editingJobId);
  return {
    job: {
      id: existing?.id || crypto.randomUUID(),
      date: String(data.get("date")),
      product: String(data.get("product")),
      supplier: String(data.get("supplier")),
      customer: String(data.get("customer")),
      cost,
      price,
      costPaid: data.get("costPaid") === "on",
      collected: data.get("collected") === "on",
      note: String(data.get("note") || ""),
      createdAt: existing?.createdAt || new Date().toISOString(),
    },
  };
}

function readExpense(form) {
  const data = new FormData(form);
  const amount = parseMoney(data.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Ne kadar gittiğini yaz. Örnek: 350" };
  const existing = state.expenses.find((expense) => expense.id === ui.editingExpenseId);
  return {
    expense: {
      id: existing?.id || crypto.randomUUID(),
      date: String(data.get("date")),
      category: String(data.get("category")),
      person: String(data.get("person") || ""),
      amount,
      note: String(data.get("note") || ""),
      createdAt: existing?.createdAt || new Date().toISOString(),
    },
  };
}

function updateJob(id, change) {
  state = {
    ...state,
    jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...change } : job)),
  };
  saveState();
  render();
}

function exportLedger() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `hackali-kasa-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importLedger() {
  const input = el("input", { type: "file", accept: "application/json,.json" });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const next = normalize(JSON.parse(await file.text()));
      state = next;
      saveState();
      ui.message = "Defter içeri aktarıldı.";
      ui.error = "";
      render();
    } catch {
      ui.error = "Bu dosya bir yedek değil.";
      ui.tab = "ozet";
      render();
    }
  });
  input.click();
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === "opening-form") {
    event.preventDefault();
    const opening = parseMoney(new FormData(form).get("openingCash"));
    if (!Number.isFinite(opening)) {
      showError("Açılış kasasını sayı olarak yaz.");
      return;
    }
    state = { ...state, openingCash: opening };
    ui.editingOpening = false;
    ui.error = "";
    saveState();
    render();
  }
  if (form.id === "job-form") {
    event.preventDefault();
    const result = readJob(form);
    if (result.error) {
      showError(result.error);
      return;
    }
    const saved = normalize({ jobs: [result.job] }).jobs[0];
    if (!saved) {
      showError("İş kaydedilemedi. Tarihi ve tutarları kontrol et.");
      return;
    }
    if (!inRange(saved.date, ui.range, new Date())) ui.range = "all";
    state = { ...state, jobs: upsert(state.jobs, saved) };
    ui.editingJobId = null;
    ui.error = "";
    ui.message = "";
    saveState();
    render();
  }
  if (form.id === "expense-form") {
    event.preventDefault();
    const result = readExpense(form);
    if (result.error) {
      showError(result.error);
      return;
    }
    const saved = normalize({ expenses: [result.expense] }).expenses[0];
    if (!saved) {
      showError("Gider kaydedilemedi.");
      return;
    }
    if (!inRange(saved.date, ui.range, new Date())) ui.range = "all";
    state = { ...state, expenses: upsert(state.expenses, saved) };
    ui.editingExpenseId = null;
    ui.error = "";
    saveState();
    render();
  }
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "tab") {
    ui.tab = button.dataset.tab;
    ui.error = "";
    render();
  }
  if (action === "edit-opening") {
    ui.editingOpening = true;
    render();
  }
  if (action === "cancel-opening") {
    ui.editingOpening = false;
    render();
  }
  if (action === "example") {
    state = { ...state, jobs: upsert(state.jobs, exampleJob(todayISO())) };
    ui.message = "Yazıldı. B'den 25.000 ₺ geldi. A Firmasına 15.000 ₺ gitti. 10.000 ₺ kaldı.";
    saveState();
    render();
  }
  if (action === "export") exportLedger();
  if (action === "import") importLedger();
  if (action === "edit-job") {
    ui.editingJobId = id;
    ui.tab = "isler";
    ui.error = "";
    render();
  }
  if (action === "cancel-job") {
    ui.editingJobId = null;
    render();
  }
  if (action === "delete-job" && confirm("Bu iş silinsin mi?")) {
    state = { ...state, jobs: state.jobs.filter((job) => job.id !== id) };
    saveState();
    render();
  }
  if (action === "toggle-collected") {
    const job = state.jobs.find((item) => item.id === id);
    updateJob(id, { collected: !job.collected });
  }
  if (action === "toggle-paid") {
    const job = state.jobs.find((item) => item.id === id);
    updateJob(id, { costPaid: !job.costPaid });
  }
  if (action === "edit-expense") {
    ui.editingExpenseId = id;
    ui.tab = "giderler";
    ui.error = "";
    render();
  }
  if (action === "cancel-expense") {
    ui.editingExpenseId = null;
    render();
  }
  if (action === "delete-expense" && confirm("Bu gider silinsin mi?")) {
    state = { ...state, expenses: state.expenses.filter((expense) => expense.id !== id) };
    saveState();
    render();
  }
  if (action === "reset" && confirm("Bütün işler, giderler ve kasa bakiyesi silinsin mi?")) {
    state = emptyState();
    ui.message = "";
    saveState();
    render();
  }
}

function onInput(event) {
  if (event.target.closest("#job-form")) {
    const form = document.querySelector("#job-form");
    const preview = document.querySelector("#profit-preview");
    if (!form || !preview) return;
    const data = new FormData(form);
    preview.textContent = moneyPreview(data.get("cost"), data.get("price"));
  }
}

function onChange(event) {
  if (event.target.matches("[data-action='range']")) {
    ui.range = event.target.value;
    ui.error = "";
    render();
  }
}

document.addEventListener("submit", onSubmit);
document.addEventListener("click", onClick);
document.addEventListener("input", onInput);
document.addEventListener("change", onChange);
render();
