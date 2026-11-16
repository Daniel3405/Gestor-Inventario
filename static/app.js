const state = {
  products: [],
  stocks: [],
  counts: [],
  reports: [],
  comparisons: []
};

let dataLoaded = false;
let activeFilter = "todos";
let activeTable = "Producto";

const notice = document.getElementById("notice");
const productForm = document.getElementById("product-form");
const stockForm = document.getElementById("stock-form");
const countForm = document.getElementById("count-form");
const scanForm = document.getElementById("scan-form");

function showMessage(message, type) {
  notice.textContent = message;
  notice.className = "notice " + type;
}

async function request(action, payload) {
  const options = action === "datos"
    ? { method: "GET", cache: "no-store" }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      };

  let response;
  try {
    response = await fetch(action === "datos" ? "/api?action=datos" : "/api", options);
  } catch (error) {
    throw new Error("No se pudo acceder al servidor Node.js. Inícialo y abre la página desde http://localhost:3000.");
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("El servidor no devolvió JSON. Comprueba que Node.js esté activo.");
  }
  if (!response.ok) throw new Error(result.error || "La solicitud no se pudo completar.");
  return result;
}

function normalizeState(data) {
  const names = ["products", "stocks", "counts", "reports", "comparisons"];
  for (const name of names) {
    if (!Array.isArray(data[name])) throw new Error("Respuesta incompleta del servidor: " + name);
  }
  return {
    products: data.products.map((item) => ({
      id: Number(item.id), code: item.code, name: item.name, category: item.category
    })),
    stocks: data.stocks.map((item) => ({
      id: Number(item.id), productId: Number(item.productId),
      quantity: Number(item.quantity), date: item.date
    })),
    counts: data.counts.map((item) => ({
      id: Number(item.id), productId: Number(item.productId),
      quantity: Number(item.quantity), date: item.date
    })),
    reports: data.reports.map((item) => ({ id: Number(item.id), date: item.date })),
    comparisons: data.comparisons.map((item) => ({
      id: Number(item.id), productId: Number(item.productId),
      reportId: Number(item.reportId), difference: Number(item.difference), date: item.date
    }))
  };
}

async function refreshData(successMessage) {
  try {
    const data = await request("datos");
    Object.assign(state, normalizeState(data));
    dataLoaded = true;
    render();
    document.getElementById("connection-status").className = "connection";
    document.getElementById("connection-status").lastChild.textContent = " MySQL conectado";
    if (successMessage) showMessage(successMessage, "success");
    return true;
  } catch (error) {
    Object.assign(state, { products: [], stocks: [], counts: [], reports: [], comparisons: [] });
    dataLoaded = false;
    render();
    document.getElementById("connection-status").className = "connection offline";
    document.getElementById("connection-status").lastChild.textContent = " MySQL desconectado";
    showMessage(error.message, "error");
    return false;
  }
}

async function saveAction(action, payload, successMessage) {
  try {
    await request(action, payload);
    return await refreshData(successMessage);
  } catch (error) {
    showMessage(error.message, "error");
    return false;
  }
}

function latestRecord(records, productId) {
  let latest = null;
  for (const record of records) {
    if (record.productId === productId) latest = record;
  }
  return latest;
}

function systemStock(product) {
  const record = latestRecord(state.stocks, product.id);
  return record ? record.quantity : 0;
}

function physicalCount(product) {
  const record = latestRecord(state.counts, product.id);
  return record ? record.quantity : 0;
}

function difference(product) {
  return physicalCount(product) - systemStock(product);
}

function today() {
  const date = new Date();
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function currentProducts() {
  const query = document.getElementById("search-products").value.trim().toLocaleLowerCase();
  return state.products.filter((product) => {
    const matchesSearch = !query ||
      [product.code, product.name, product.category].some((value) =>
        value.toLocaleLowerCase().includes(query)
      );
    const amount = difference(product);
    const matchesFilter = activeFilter === "todos" ||
      (activeFilter === "coinciden" && amount === 0) ||
      (activeFilter === "faltantes" && amount < 0) ||
      (activeFilter === "sobrantes" && amount > 0);
    return matchesSearch && matchesFilter;
  });
}

function addCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value === null || value === undefined ? "" : String(value);
  row.appendChild(cell);
  return cell;
}

function renderInventory() {
  const body = document.getElementById("inventory-rows");
  body.replaceChildren();
  const products = currentProducts();

  if (!dataLoaded || products.length === 0) {
    const row = document.createElement("tr");
    const text = !dataLoaded
      ? "No se pudieron cargar productos desde MySQL."
      : state.products.length
        ? "No hay productos que coincidan con la búsqueda o el filtro."
        : "No hay productos. Usa “Nuevo producto” para agregar el primero.";
    const cell = addCell(row, text);
    cell.colSpan = 6;
    cell.className = "empty";
    body.appendChild(row);
    return;
  }

  for (const product of products) {
    const row = document.createElement("tr");
    addCell(row, product.code).className = "code";

    const description = addCell(row, "");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const category = document.createElement("span");
    category.className = "category";
    category.textContent = product.category;
    description.append(name, category);

    const physical = physicalCount(product);
    const stock = systemStock(product);
    const amount = physical - stock;
    addCell(row, physical);
    addCell(row, stock);
    addCell(row, amount > 0 ? "+" + amount : amount);
    const statusCell = addCell(row, "");
    const badge = document.createElement("span");
    badge.className = amount === 0 ? "badge exact" : amount < 0 ? "badge missing" : "badge surplus";
    badge.textContent = amount === 0 ? "Coincide" : amount < 0 ? "Faltante" : "Sobrante";
    statusCell.appendChild(badge);
    body.appendChild(row);
  }
}

function updateSelect(select) {
  select.replaceChildren();
  for (const product of state.products) {
    const option = document.createElement("option");
    option.value = String(product.id);
    option.textContent = product.code + " — " + product.name;
    select.appendChild(option);
  }
  const unavailable = !dataLoaded || state.products.length === 0;
  select.disabled = unavailable;
  select.form.elements.cantidad.disabled = unavailable;
  select.form.querySelector('button[type="submit"]').disabled = unavailable;
}

function databaseRows() {
  const productName = (id) => {
    const product = state.products.find((item) => item.id === id);
    return product ? product.name : "Producto no encontrado";
  };
  if (activeTable === "Producto") {
    return {
      headings: ["idProducto", "Codigo", "Nombre", "Categoria"],
      rows: state.products.map((item) => [item.id, item.code, item.name, item.category])
    };
  }
  if (activeTable === "Stock_Sistema") {
    return {
      headings: ["idStock_Sistema", "Cantidad_Sistema", "Ult_Actualizacion", "Producto"],
      rows: state.stocks.map((item) => [item.id, item.quantity, item.date, productName(item.productId)])
    };
  }
  if (activeTable === "Reg_Conteo") {
    return {
      headings: ["idReg_Conteo", "Fecha", "CantidadCont", "Producto"],
      rows: state.counts.map((item) => [item.id, item.date, item.quantity, productName(item.productId)])
    };
  }
  if (activeTable === "Reporte_Diferencias") {
    return {
      headings: ["idReporte_Diferencias", "Fecha_Generacion"],
      rows: state.reports.map((item) => [item.id, item.date])
    };
  }
  return {
    headings: ["idComparacion_Inv", "Fecha", "Diferencia", "Producto", "Reporte"],
    rows: state.comparisons.map((item) => [
      item.id, item.date, item.difference, productName(item.productId), item.reportId
    ])
  };
}

function renderDatabaseTable() {
  const data = databaseRows();
  const headings = document.getElementById("database-headings");
  const body = document.getElementById("database-rows");
  headings.replaceChildren();
  body.replaceChildren();
  for (const heading of data.headings) addCell(headings, heading);
  if (!dataLoaded || data.rows.length === 0) {
    const row = document.createElement("tr");
    const cell = addCell(row, dataLoaded ? "Esta tabla no tiene registros." : "Sin conexión a MySQL.");
    cell.colSpan = data.headings.length;
    cell.className = "empty";
    body.appendChild(row);
    return;
  }
  for (const values of data.rows) {
    const row = document.createElement("tr");
    for (const value of values) addCell(row, value);
    body.appendChild(row);
  }
}

function render() {
  let exact = 0;
  let missing = 0;
  let surplus = 0;
  for (const product of state.products) {
    const amount = difference(product);
    if (amount === 0) exact++;
    else if (amount < 0) missing++;
    else surplus++;
  }
  const precision = state.products.length
    ? Math.round(exact * 100 / state.products.length)
    : 0;
  const availableText = dataLoaded ? null : "—";

  document.getElementById("product-count").textContent = dataLoaded ? state.products.length : availableText;
  document.getElementById("exact-count").textContent = dataLoaded ? exact : availableText;
  document.getElementById("discrepancy-count").textContent = dataLoaded ? missing + surplus : availableText;
  document.getElementById("missing-count").textContent = dataLoaded ? missing : availableText;
  document.getElementById("surplus-count").textContent = dataLoaded ? surplus : availableText;
  document.getElementById("precision").textContent = dataLoaded ? precision : availableText;
  document.getElementById("precision-sign").textContent = dataLoaded ? "%" : "";
  document.getElementById("precision-bar").value = dataLoaded ? precision : 0;

  for (const input of productForm.querySelectorAll("input, button")) input.disabled = !dataLoaded;
  document.getElementById("search-products").disabled = !dataLoaded;
  updateSelect(stockForm.elements.producto);
  updateSelect(countForm.elements.producto);
  document.getElementById("scan-code").disabled = !dataLoaded || state.products.length === 0;
  scanForm.querySelector("button").disabled = !dataLoaded || state.products.length === 0;
  document.getElementById("report-button").disabled = !dataLoaded || state.products.length === 0;
  document.getElementById("export-button").disabled = !dataLoaded || state.products.length === 0;
  renderInventory();
  renderDatabaseTable();
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(productForm);
  const code = String(form.get("codigo")).trim();
  const name = String(form.get("nombre")).trim();
  const category = String(form.get("categoria")).trim();
  const stock = Number(form.get("stock"));
  if (!code || !name || !category || !Number.isInteger(stock) || stock < 0) {
    showMessage("Completa los campos y usa cantidades enteras iguales o mayores que cero.", "error");
    return;
  }
  const saved = await saveAction("add_product", { code, name, category, stock }, "Producto guardado en MySQL.");
  if (saved) {
    productForm.reset();
    productForm.elements.stock.value = "0";
  }
});

stockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productId = Number(stockForm.elements.producto.value);
  const quantity = Number(stockForm.elements.cantidad.value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    showMessage("El stock debe ser un número entero igual o mayor que cero.", "error");
    return;
  }
  if (await saveAction("update_stock", { productId, quantity }, "Stock actualizado en MySQL.")) stockForm.reset();
});

countForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productId = Number(countForm.elements.producto.value);
  const quantity = Number(countForm.elements.cantidad.value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    showMessage("El conteo debe ser un número entero igual o mayor que cero.", "error");
    return;
  }
  if (await saveAction("record_count", { productId, quantity }, "Conteo físico guardado en MySQL.")) countForm.reset();
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = scanForm.elements.codigo.value.trim();
  if (await saveAction("scan", { code }, "Conteo actualizado: se agregó una unidad.")) scanForm.reset();
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderInventory();
  });
});

document.getElementById("search-products").addEventListener("input", renderInventory);

document.querySelectorAll("[data-table]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTable = button.dataset.table;
    document.querySelectorAll("[data-table]").forEach((item) => item.classList.toggle("active", item === button));
    renderDatabaseTable();
  });
});

document.getElementById("report-button").addEventListener("click", async () => {
  await saveAction("report", {}, "Reporte de diferencias guardado en MySQL.");
});

document.getElementById("export-button").addEventListener("click", () => {
  const csvCell = (value) => '"' + String(value).replace(/"/g, '""') + '"';
  const lines = [
    ["Codigo", "Producto", "Categoria", "Fisico", "Stock sistema", "Diferencia", "Estado"],
    ...state.products.map((product) => {
      const amount = difference(product);
      return [
        product.code, product.name, product.category, physicalCount(product),
        systemStock(product), amount,
        amount === 0 ? "Coincide" : amount < 0 ? "Faltante" : "Sobrante"
      ];
    })
  ];
  const csv = "\uFEFF" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
  const fileUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = "inventario.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
});

document.getElementById("refresh-button").addEventListener("click", () => {
  refreshData("Datos actualizados desde MySQL.");
});

render();
refreshData();
