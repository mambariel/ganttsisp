const FIELDS = [
  "id",
  "task name",
  "subtask name",
  "start",
  "end",
  "duration (days)",
  "dependency",
  "resources",
  "type",
  "status",
  "observações"
];

const SAMPLE_DATA = [
  {
    id: 1,
    "task name": "Premissas transversais",
    "subtask name": "Ambientes, APIs e interlocutores",
    start: "2026-06-16",
    end: "2026-06-16",
    "duration (days)": 1,
    dependency: "",
    resources: "SESP, PRODERJ, EDS, Vert",
    type: "Premissa",
    status: "Concluído",
    "observações": "Marco inicial de organização das premissas."
  },
  {
    id: 2,
    "task name": "SISP Mulher nativo",
    "subtask name": "Subida PRD",
    start: "2026-06-17",
    end: "2026-06-20",
    "duration (days)": 4,
    dependency: "1",
    resources: "EDS, PRODERJ",
    type: "Produção",
    status: "Em andamento",
    "observações": "Acompanhar janela de publicação."
  },
  {
    id: 3,
    "task name": "SISP Mulher nativo",
    "subtask name": "Scripts e itens de menu",
    start: "2026-06-18",
    end: "2026-06-24",
    "duration (days)": 7,
    dependency: "2",
    resources: "EDS",
    type: "Desenvolvimento",
    status: "Não iniciado",
    "observações": ""
  },
  {
    id: 4,
    "task name": "Escaneamento Territorial",
    "subtask name": "Reformulação do módulo",
    start: "2026-06-21",
    end: "2026-07-05",
    "duration (days)": 15,
    dependency: "",
    resources: "EDS, SESP",
    type: "Desenvolvimento",
    status: "Bloqueado",
    "observações": "Depende de confirmação de requisitos."
  }
];

const state = {
  rows: [],
  mode: "view",
  apiUrl: localStorage.getItem("ganttApiUrl") || "",
  usingSample: false
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("api-url").value = state.apiUrl;

  $("btn-view").addEventListener("click", () => setMode("view"));
  $("btn-edit").addEventListener("click", () => setMode("edit"));
  $("btn-config").addEventListener("click", () => $("config-panel").classList.toggle("hidden"));
  $("btn-refresh").addEventListener("click", loadRows);
  $("btn-save-config").addEventListener("click", saveConfig);
  $("btn-load-sample").addEventListener("click", useSampleData);
  $("btn-clear-form").addEventListener("click", clearForm);
  $("task-form").addEventListener("submit", saveForm);

  $("start").addEventListener("change", updateDurationField);
  $("end").addEventListener("change", updateDurationField);
  $("search").addEventListener("input", renderAll);
  $("status-filter").addEventListener("change", renderAll);
  $("type-filter").addEventListener("change", renderAll);

  setMode("view");

  if (state.apiUrl) {
    loadRows();
  } else {
    useSampleData(false);
    showAlert("Configure a URL da API do Apps Script para salvar e carregar dados reais do Google Sheets. Enquanto isso, o sistema está exibindo dados de exemplo.");
  }
});

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("edit-mode", mode === "edit");
  $("editor-card").classList.toggle("hidden", mode !== "edit");
  $("btn-view").classList.toggle("active", mode === "view");
  $("btn-edit").classList.toggle("active", mode === "edit");
  renderAll();
}

function saveConfig() {
  const url = $("api-url").value.trim();
  if (!url || !url.includes("/exec")) {
    showAlert("Informe a URL do Web App do Apps Script terminada em /exec.");
    return;
  }

  state.apiUrl = url;
  localStorage.setItem("ganttApiUrl", url);
  $("config-panel").classList.add("hidden");
  showAlert("Configuração salva. Carregando dados do Google Sheets...", "ok");
  loadRows();
}

function useSampleData(showMessage = true) {
  state.rows = SAMPLE_DATA.map(normalizeRow);
  state.usingSample = true;
  renderAll();
  if (showMessage) {
    showAlert("Dados de exemplo carregados. Para persistir alterações, configure a URL do Apps Script.");
  }
}

async function loadRows() {
  if (!state.apiUrl) {
    useSampleData();
    return;
  }

  try {
    const response = await fetch(`${state.apiUrl}?action=list&ts=${Date.now()}`, {
      method: "GET"
    });

    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "Erro ao carregar dados.");

    state.rows = (result.data || []).map(normalizeRow);
    state.usingSample = false;
    renderAll();
    showAlert("Dados atualizados com sucesso.", "ok");
  } catch (error) {
    console.error(error);
    showAlert("Não foi possível carregar a planilha. Verifique se o Web App está publicado para 'Qualquer pessoa' e se a URL termina em /exec.");
  }
}

async function postAction(payload) {
  if (!state.apiUrl) {
    throw new Error("API não configurada.");
  }

  const response = await fetch(state.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Erro ao salvar dados.");
  return result;
}

async function saveForm(event) {
  event.preventDefault();

  const record = {};
  FIELDS.forEach((field) => {
    const element = document.querySelector(`[name="${cssEscape(field)}"]`);
    if (element) record[field] = element.value.trim();
  });

  record.id = $("id").value.trim();
  record["duration (days)"] = calculateDuration(record.start, record.end);
  record.status = record.status || "Não iniciado";

  if (!record["task name"] || !record["subtask name"] || !record.start || !record.end) {
    showAlert("Preencha task name, subtask name, start e end.");
    return;
  }

  if (new Date(record.end) < new Date(record.start)) {
    showAlert("A data final não pode ser anterior à data inicial.");
    return;
  }

  try {
    if (state.usingSample || !state.apiUrl) {
      upsertLocal(record);
      showAlert("Registro salvo localmente nos dados de exemplo. Configure a API para gravar no Google Sheets.", "ok");
    } else {
      const result = await postAction({ action: "upsert", record });
      await loadRows();
      showAlert(`Registro salvo com ID ${result.id}.`, "ok");
    }

    clearForm();
    renderAll();
  } catch (error) {
    console.error(error);
    showAlert(error.message || "Erro ao salvar registro.");
  }
}

function upsertLocal(record) {
  if (!record.id) {
    record.id = nextLocalId();
  }

  const index = state.rows.findIndex((row) => String(row.id) === String(record.id));
  const normalized = normalizeRow(record);

  if (index >= 0) {
    state.rows[index] = normalized;
  } else {
    state.rows.push(normalized);
  }
}

function nextLocalId() {
  const max = state.rows.reduce((acc, row) => Math.max(acc, Number(row.id) || 0), 0);
  return max + 1;
}

async function deleteRow(id) {
  if (!confirm(`Excluir o registro ID ${id}?`)) return;

  try {
    if (state.usingSample || !state.apiUrl) {
      state.rows = state.rows.filter((row) => String(row.id) !== String(id));
      renderAll();
      showAlert("Registro excluído localmente.", "ok");
    } else {
      await postAction({ action: "delete", id });
      await loadRows();
      showAlert("Registro excluído.", "ok");
    }
  } catch (error) {
    console.error(error);
    showAlert(error.message || "Erro ao excluir registro.");
  }
}

function editRow(id) {
  const row = state.rows.find((item) => String(item.id) === String(id));
  if (!row) return;

  setMode("edit");
  $("id").value = row.id || "";
  $("task-name").value = row["task name"] || "";
  $("subtask-name").value = row["subtask name"] || "";
  $("start").value = row.start || "";
  $("end").value = row.end || "";
  $("duration").value = row["duration (days)"] || "";
  $("dependency").value = row.dependency || "";
  $("resources").value = row.resources || "";
  $("type").value = row.type || "Projeto";
  $("status").value = row.status || "Não iniciado";
  $("observacoes").value = row["observações"] || "";

  window.scrollTo({ top: $("editor-card").offsetTop - 18, behavior: "smooth" });
}

function clearForm() {
  $("task-form").reset();
  $("id").value = "";
  $("duration").value = "";
  $("status").value = "Não iniciado";
  $("type").value = "Projeto";
}

function updateDurationField() {
  $("duration").value = calculateDuration($("start").value, $("end").value) || "";
}

function calculateDuration(start, end) {
  if (!start || !end) return "";
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = Math.round((endDate - startDate) / 86400000);
  return diff >= 0 ? diff + 1 : "";
}

function normalizeRow(row) {
  const normalized = {};
  FIELDS.forEach((field) => {
    normalized[field] = row[field] ?? "";
  });
  normalized.id = normalized.id || row.ID || row.Id || "";
  normalized.start = toIsoDate(normalized.start);
  normalized.end = toIsoDate(normalized.end);
  normalized["duration (days)"] = normalized["duration (days)"] || calculateDuration(normalized.start, normalized.end);
  return normalized;
}

function toIsoDate(value) {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function filteredRows() {
  const term = $("search").value.trim().toLowerCase();
  const status = $("status-filter").value;
  const type = $("type-filter").value;

  return state.rows
    .filter((row) => {
      const haystack = [
        row["task name"],
        row["subtask name"],
        row.resources,
        row.type,
        row.status,
        row["observações"]
      ].join(" ").toLowerCase();

      if (term && !haystack.includes(term)) return false;
      if (status && row.status !== status) return false;
      if (type && row.type !== type) return false;

      return true;
    })
    .sort((a, b) => {
      const taskCompare = String(a["task name"]).localeCompare(String(b["task name"]), "pt-BR");
      if (taskCompare !== 0) return taskCompare;
      return String(a.start).localeCompare(String(b.start));
    });
}

function renderAll() {
  updateTypeFilter();
  const rows = filteredRows();
  renderMetrics(state.rows);
  renderCharts(state.rows);
  renderGantt(rows);
  renderTable(rows);
}

function updateTypeFilter() {
  const select = $("type-filter");
  const current = select.value;
  const types = [...new Set(state.rows.map((row) => row.type).filter(Boolean))].sort();

  select.innerHTML = '<option value="">Todos os tipos</option>';
  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });

  if (types.includes(current)) select.value = current;
}

function renderMetrics(rows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const late = rows.filter((row) => {
    const endDate = new Date(`${row.end}T00:00:00`);
    return row.end && endDate < today && !["Concluído", "Cancelado"].includes(row.status);
  }).length;

  $("metric-total").textContent = rows.length;
  $("metric-progress").textContent = rows.filter((row) => row.status === "Em andamento").length;
  $("metric-done").textContent = rows.filter((row) => row.status === "Concluído").length;
  $("metric-late").textContent = late;
}

function renderCharts(rows) {
  renderBarChart("status-chart", countBy(rows, "status"));
  renderBarChart("type-chart", countBy(rows, "type"));
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || "Não informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function renderBarChart(elementId, counts) {
  const container = $(elementId);
  container.innerHTML = "";

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  if (!entries.length) {
    container.innerHTML = '<p class="muted">Sem dados.</p>';
    return;
  }

  entries.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-label">${escapeHtml(label)}</span>
      <span class="bar-bg"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
      <span class="bar-count">${count}</span>
    `;
    container.appendChild(row);
  });
}

function renderGantt(rows) {
  const container = $("gantt");
  container.innerHTML = "";

  if (!rows.length) {
    container.innerHTML = '<div class="empty">Nenhum registro encontrado.</div>';
    return;
  }

  const dates = rows.flatMap((row) => [row.start, row.end]).filter(Boolean).map((date) => new Date(`${date}T00:00:00`));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const days = dateRange(minDate, maxDate);
  const dayWidth = 38;

  const grid = document.createElement("div");
  grid.className = "gantt-grid";

  const leftHead = document.createElement("div");
  leftHead.className = "gantt-left-head";
  leftHead.textContent = "Task / Subtask";

  const timeHead = document.createElement("div");
  timeHead.className = "gantt-time-head";
  timeHead.style.gridTemplateColumns = `repeat(${days.length}, ${dayWidth}px)`;
  days.forEach((date) => {
    const day = document.createElement("div");
    day.className = "gantt-day";
    day.textContent = formatDay(date);
    timeHead.appendChild(day);
  });

  grid.appendChild(leftHead);
  grid.appendChild(timeHead);

  let currentTask = null;
  rows.forEach((row) => {
    if (row["task name"] !== currentTask) {
      currentTask = row["task name"];
      const group = document.createElement("div");
      group.className = "gantt-group";
      group.textContent = currentTask || "Sem task name";
      grid.appendChild(group);
    }

    const left = document.createElement("div");
    left.className = "gantt-left-cell";
    left.innerHTML = `
      <span class="subtask">${escapeHtml(row["subtask name"] || "Sem subtask")}</span>
      <span class="meta">ID ${escapeHtml(row.id)} · ${escapeHtml(row.status || "Sem status")} · ${escapeHtml(row.resources || "Sem recurso")}</span>
    `;

    const time = document.createElement("div");
    time.className = "gantt-time-cell";
    time.style.gridTemplateColumns = `repeat(${days.length}, ${dayWidth}px)`;

    const offset = daysBetween(minDate, new Date(`${row.start}T00:00:00`));
    const duration = Math.max(1, daysBetween(new Date(`${row.start}T00:00:00`), new Date(`${row.end}T00:00:00`)) + 1);
    const isLate = isRowLate(row);

    const bar = document.createElement("div");
    bar.className = `gantt-bar ${statusClass(row.status)} ${isLate ? "status-atrasado" : ""}`;
    bar.style.left = `${offset * dayWidth + 4}px`;
    bar.style.width = `${duration * dayWidth - 8}px`;
    bar.title = `${row["subtask name"]} | ${row.start} a ${row.end}`;
    bar.textContent = `${row["subtask name"] || ""}`;

    time.appendChild(bar);
    grid.appendChild(left);
    grid.appendChild(time);
  });

  container.appendChild(grid);
}

function renderTable(rows) {
  const tbody = $("table-body");
  tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12">Nenhum registro encontrado.</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const lateClass = isRowLate(row) ? "atrasado" : statusClass(row.status).replace("status-", "");
    const statusText = isRowLate(row) ? `${row.status || "Sem status"} / Atrasado` : row.status;

    tr.innerHTML = `
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row["task name"])}</td>
      <td>${escapeHtml(row["subtask name"])}</td>
      <td>${escapeHtml(row.start)}</td>
      <td>${escapeHtml(row.end)}</td>
      <td>${escapeHtml(row["duration (days)"])}</td>
      <td>${escapeHtml(row.dependency)}</td>
      <td>${escapeHtml(row.resources)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td><span class="status-pill ${lateClass}">${escapeHtml(statusText || "Sem status")}</span></td>
      <td>${escapeHtml(row["observações"])}</td>
      <td class="edit-only"></td>
    `;

    const actionsCell = tr.querySelector(".edit-only");
    const editButton = document.createElement("button");
    editButton.className = "mini edit-row";
    editButton.type = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => editRow(row.id));

    const deleteButton = document.createElement("button");
    deleteButton.className = "mini danger delete-row";
    deleteButton.type = "button";
    deleteButton.textContent = "Excluir";
    deleteButton.addEventListener("click", () => deleteRow(row.id));

    actionsCell.appendChild(editButton);
    actionsCell.appendChild(document.createTextNode(" "));
    actionsCell.appendChild(deleteButton);

    tbody.appendChild(tr);
  });
}

function isRowLate(row) {
  if (!row.end || ["Concluído", "Cancelado"].includes(row.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${row.end}T00:00:00`);
  return end < today;
}

function statusClass(status) {
  const value = normalizeStatus(status);

  if (value === "nao-iniciado" || value.startsWith("nao-iniciado")) return "status-nao-iniciado";
  if (value === "em-andamento" || value.startsWith("em-andamento")) return "status-em-andamento";
  if (value === "concluido" || value.startsWith("concluido")) return "status-concluido";
  if (value === "bloqueado" || value.startsWith("bloqueado")) return "status-bloqueado";
  if (value === "cancelado" || value.startsWith("cancelado")) return "status-cancelado";
  return "";
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}



function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function daysBetween(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

function formatDay(date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function showAlert(message, type = "warn") {
  const alert = $("alert");
  alert.textContent = message;
  alert.classList.remove("hidden");
  alert.style.background = type === "ok" ? "#ecfdf3" : "#fff7ed";
  alert.style.borderColor = type === "ok" ? "#abefc6" : "#fed7aa";
  alert.style.color = type === "ok" ? "#027a48" : "#9a3412";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
