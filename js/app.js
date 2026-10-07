import {
  CATEGORIES,
  cashMovements,
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

function signedMoney(value, direction) {
  const formatted = formatMoney(Math.abs(value));
  if (direction === "in") return `+${formatted}`;
  return `−${formatted}`;
}

function currentSummary() {
  return summarize(state, ui.range, new Date());
}

function render() {
  const root = document.querySelector("#app");
  const summary = currentSummary();
  root.replaceChildren(header(), hero(summary), stats(summary), tabs(), panel(summary));
}

function header() {
  return el("header", { class: "top" }, [
    el("div", { class: "brand" }, [
      el("div", { class: "mark", "aria-hidden": "true" }, ["₺"]),
      el("div", {}, [
        el("h1", {}, ["Hackali Kasa"]),
        el("p", { class: "sub" }, ["Alış, satış, kâr ve kasa aynı defterde"]),
      ]),
    ]),
    el("div", { class: "toolbar" }, [
      el("select", { "data-action": "range", "aria-label": "Dönem" }, [
        option("month", "Bu ay", ui.range),
        option("year", "Bu yıl", ui.range),
        option("all", "Tümü", ui.range),
      ]),
      el("button", { class: "btn", type: "button", "data-action": "export" }, ["Dışa aktar"]),
      el("button", { class: "btn", type: "button", "data-action": "import" }, ["İçe aktar"]),
    ]),
  ]);
}

function option(value, label, current) {
  return el("option", { value, selected: value === current }, [label]);
}

function hero(summary) {
  return el("section", { class: "hero" }, [
    el("div", {}, [
      el("div", { class: "eyebrow" }, ["Kasa kalan"]),
      el("div", { class: summary.balance < 0 ? "balance negative" : "balance" }, [formatMoney(summary.balance)]),
      el("p", { class: "hint" }, [
        "Açılış ",
        formatMoney(state.openingCash),
        " + tahsil edilen satışlar − ödenen alışlar − giderler. Bu bakiye tüm kayıtların bakiyesidir.",
      ]),
    ]),
    el("div", {}, [
      ui.editingOpening
        ? openingForm()
        : el("button", { class: "btn", type: "button", "data-action": "edit-opening" }, ["Açılış kasasını düzenle"]),
      el("p", { class: "hint" }, [
        "Kâr, satış fiyatından alış fiyatını düşünce kalır. Kasa ise paranın gerçekten girip çıktığı yerdir. Veresiye satış kâra yazılır, kasaya ancak tahsil edilince girer.",
      ]),
    ]),
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

function stats(summary) {
  const cards = [
    ["Kasa giren", summary.cashIn, "in"],
    ["Kasa çıkan", summary.cashOut, "out"],
    ["Brüt kâr", summary.grossProfit, summary.grossProfit < 0 ? "out" : "in"],
    ["Net kâr", summary.netProfit, summary.netProfit < 0 ? "out" : "in"],
    ["Gider", summary.expenseTotal, "out"],
    ["Bekleyen tahsilat", summary.receivable, "warn"],
    ["Ödenmemiş alış", summary.payable, "warn"],
  ];
  return el("section", { class: "stats" }, cards.map(([label, value, tone]) =>
    el("article", { class: `stat ${tone}` }, [
      el("span", {}, [label]),
      el("b", {}, [formatMoney(value)]),
    ]),
  ));
}

function tabs() {
  const items = [
    ["ozet", "Özet"],
    ["isler", "İşler"],
    ["giderler", "Giderler"],
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
      "Seçili dönemin dışında bekleyen tahsilat veya ödenmemiş alış var. Hepsini görmek için dönemi Tümü yap.",
    ]));
  }
  return nodes;
}

function overview(summary) {
  const moves = cashMovements(state, ui.range, new Date());
  return el("section", {}, [
    el("h2", {}, ["Kasa hareketleri"]),
    el("p", { class: "hint" }, ["Kasaya giren tahsilatlar, kasadan çıkan alış ödemeleri ve yemek gibi giderler."]),
    state.jobs.length === 0
      ? el("div", { class: "notice" }, [
          el("p", {}, ["Örnek: A firmasından 15.000 ₺’ye alınan ürün, B’ye 25.000 ₺’ye takılır. Kâr 10.000 ₺ olur ve bu para kasada kalır."]),
          el("button", { class: "btn primary", type: "button", "data-action": "example", style: "margin-top:10px" }, ["Bu örneği kasaya işle"]),
        ])
      : null,
    moves.length
      ? el("div", { class: "list" }, moves.map(movementRow))
      : el("p", { class: "empty" }, ["Bu dönemde kasa hareketi yok."]),
    dangerZone(),
  ]);
}

function movementRow(move) {
  const sign = move.kind === "in" ? "positive" : "negative";
  return el("article", { class: "move" }, [
    el("span", { class: "meta" }, [formatDate(move.date)]),
    el("div", {}, [
      el("strong", {}, [move.title]),
      el("div", { class: "meta" }, [move.detail]),
    ]),
    el("span", { class: `amount ${sign}` }, [signedMoney(move.amount, move.kind === "in" ? "in" : "out")]),
  ]);
}

function jobSection(summary) {
  const editing = state.jobs.find((job) => job.id === ui.editingJobId);
  return el("section", {}, [
    el("h2", {}, [editing ? "İşi düzenle" : "Yeni iş"]),
    jobForm(editing),
    el("div", { class: "list" }, summary.jobs.length
      ? summary.jobs.map(jobCard)
      : [el("p", { class: "empty" }, ["Bu dönemde iş yok."])]),
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
    el("div", { class: "grid" }, [
      field("date", "Tarih", textInput("date", value.date, { type: "date", required: "true" })),
      field("product", "Ürün", textInput("product", value.product, { required: "true", maxlength: "120", placeholder: "Örneğin klima" })),
      field("supplier", "Kimden alındı", textInput("supplier", value.supplier, { required: "true", maxlength: "120", placeholder: "A Firması" })),
      field("cost", "Alış fiyatı", textInput("cost", value.cost === "" ? "" : String(value.cost), { inputmode: "decimal", required: "true", placeholder: "15.000" })),
      field("customer", "Kime takıldı / satıldı", textInput("customer", value.customer, { required: "true", maxlength: "120", placeholder: "B" })),
      field("price", "Satış fiyatı", textInput("price", value.price === "" ? "" : String(value.price), { inputmode: "decimal", required: "true", placeholder: "25.000" })),
      el("label", { class: "check" }, [
        el("input", { type: "checkbox", name: "costPaid", checked: value.costPaid ? "true" : false }),
        "Alış parasını ödedim",
      ]),
      el("label", { class: "check" }, [
        el("input", { type: "checkbox", name: "collected", checked: value.collected ? "true" : false }),
        "Satış parası kasaya girdi",
      ]),
      field("note", "Not", el("textarea", { name: "note", maxlength: "400" }, [value.note || ""]), "wide"),
    ]),
    el("div", { class: "preview" }, [
      el("span", {}, ["Bu işin kârı"]),
      el("strong", { id: "profit-preview" }, [moneyPreview(value.cost, value.price)]),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "btn primary", type: "submit" }, [job ? "İşi güncelle" : "İşi kaydet"]),
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

function jobCard(job) {
  return el("article", { class: "card" }, [
    el("div", { class: "row" }, [
      el("h3", {}, [`${job.product}`]),
      el("span", { class: "meta" }, [formatDate(job.date)]),
    ]),
    el("p", { class: "meta" }, [`${job.supplier} → ${job.customer}`]),
    el("div", { class: "formula" }, [
      `${formatMoney(job.price)} − ${formatMoney(job.cost)} = ${formatMoney(jobProfit(job))}`,
    ]),
    el("div", { class: "status-row" }, [
      el("span", { class: job.collected ? "pill good" : "pill" }, [job.collected ? "Kasaya girdi" : "Tahsil bekliyor"]),
      el("span", { class: job.costPaid ? "pill bad" : "pill" }, [job.costPaid ? "Alış kasadan çıktı" : "Alış henüz ödenmedi"]),
    ]),
    job.note ? el("p", { class: "meta" }, [job.note]) : null,
    el("div", { class: "actions" }, [
      el("button", { class: "text-btn", type: "button", "data-action": "toggle-collected", "data-id": job.id }, [
        job.collected ? "Tahsilatı geri al" : "Tahsil edildi",
      ]),
      el("button", { class: "text-btn", type: "button", "data-action": "toggle-paid", "data-id": job.id }, [
        job.costPaid ? "Ödemeyi geri al" : "Alış ödendi",
      ]),
      el("button", { class: "text-btn", type: "button", "data-action": "edit-job", "data-id": job.id }, ["Düzenle"]),
      el("button", { class: "text-btn danger", type: "button", "data-action": "delete-job", "data-id": job.id }, ["Sil"]),
    ]),
  ]);
}

function expenseSection(summary) {
  const editing = state.expenses.find((expense) => expense.id === ui.editingExpenseId);
  return el("section", {}, [
    el("h2", {}, [editing ? "Gideri düzenle" : "Yeni gider"]),
    el("p", { class: "hint" }, ["Eleman yemek yediğinde ya da gider olacak bir ürün alındığında buraya yaz. Tutar kasadan ve net kârdan düşer."]),
    expenseForm(editing),
    el("div", { class: "list" }, summary.expenses.length
      ? summary.expenses.map(expenseCard)
      : [el("p", { class: "empty" }, ["Bu dönemde gider yok."])]),
  ]);
}

function expenseForm(expense) {
  const value = expense || { date: todayISO(), category: "yemek", person: "", amount: "", note: "" };
  return el("form", { id: "expense-form" }, [
    el("div", { class: "grid" }, [
      field("date", "Tarih", textInput("date", value.date, { type: "date", required: "true" })),
      field("category", "Tür", el("select", { name: "category" }, CATEGORIES.map((item) =>
        option(item.id, item.label, value.category),
      ))),
      field("person", "Kim", textInput("person", value.person, { maxlength: "120", placeholder: "Eleman adı" })),
      field("amount", "Tutar", textInput("amount", value.amount === "" ? "" : String(value.amount), { inputmode: "decimal", required: "true", placeholder: "250" })),
      field("note", "Ne oldu", el("textarea", { name: "note", maxlength: "400" }, [value.note || ""])),
    ]),
    el("div", { class: "actions" }, [
      el("button", { class: "btn primary", type: "submit" }, [expense ? "Gideri güncelle" : "Gideri kaydet"]),
      expense ? el("button", { class: "btn", type: "button", "data-action": "cancel-expense" }, ["Vazgeç"]) : null,
    ]),
  ]);
}

function expenseCard(expense) {
  const who = expense.person ? `${expense.person} · ` : "";
  return el("article", { class: "card" }, [
    el("div", { class: "row" }, [
      el("h3", {}, [`${categoryLabel(expense.category)}`]),
      el("span", { class: "amount negative" }, [signedMoney(expense.amount, "out")]),
    ]),
    el("p", { class: "meta" }, [`${formatDate(expense.date)} · ${who}${expense.note || "Gider"}`]),
    el("div", { class: "actions" }, [
      el("button", { class: "text-btn", type: "button", "data-action": "edit-expense", "data-id": expense.id }, ["Düzenle"]),
      el("button", { class: "text-btn danger", type: "button", "data-action": "delete-expense", "data-id": expense.id }, ["Sil"]),
    ]),
  ]);
}

function dangerZone() {
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
    return { error: "Ürün, alınan yer ve satılan kişi gerekli." };
  }
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0) {
    return { error: "Alış ve satış fiyatını sayı olarak yaz. Örnek: 15.000" };
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
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Gider tutarını yaz. Örnek: 250" };
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
      ui.error = "Bu dosya bir kasa defteri değil.";
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
    ui.message = "Örnek işlendi: alış 15.000 ₺, satış 25.000 ₺, kâr ve kasada kalan 10.000 ₺.";
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
