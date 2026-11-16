"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const mysql = require("mysql2/promise");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const database = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "12345",
  database: process.env.MYSQL_DATABASE || "Inventario",
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: true
});

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

function textField(data, name) {
  const value = data[name];
  if (typeof value !== "string" || !value.trim() || value.trim().length > 45) {
    throw new RequestError("Completa los campos del producto (máximo 45 caracteres).");
  }
  return value.trim();
}

function integerField(data, name, minimum = 0) {
  const value = data[name];
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RequestError("La cantidad debe ser un número entero válido.");
  }
  return value;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let tooLarge = false;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        tooLarge = true;
      } else if (!tooLarge) {
        body += chunk;
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new RequestError("La solicitud es demasiado grande.", 413));
        return;
      }
      try {
        const data = JSON.parse(body);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("invalid body");
        }
        resolve(data);
      } catch {
        reject(new RequestError("No se recibieron datos válidos."));
      }
    });
    request.on("error", reject);
  });
}

async function inTransaction(work) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getData() {
  const [products] = await database.query(
    "SELECT idProducto AS id, Codigo AS code, Nombre AS name, Categoria AS category " +
    "FROM Producto ORDER BY Nombre, Codigo"
  );
  const [stocks] = await database.query(
    "SELECT idStock_Sistema AS id, Cantidad_Sistema AS quantity, " +
    "Ult_Actualizacion AS date, Producto_idProducto AS productId " +
    "FROM Stock_Sistema ORDER BY idStock_Sistema"
  );
  const [counts] = await database.query(
    "SELECT idReg_Conteo AS id, Fecha AS date, CantidadCont AS quantity, " +
    "Producto_idProducto AS productId FROM Reg_Conteo ORDER BY Fecha, idReg_Conteo"
  );
  const [reports] = await database.query(
    "SELECT idReporte_Diferencias AS id, Fecha_Generacion AS date " +
    "FROM Reporte_Diferencias ORDER BY idReporte_Diferencias"
  );
  const [comparisons] = await database.query(
    "SELECT idComparacion_Inv AS id, Fecha AS date, Diferencia AS difference, " +
    "Producto_idProducto AS productId, " +
    "Reporte_Diferencias_idReporte_Diferencias AS reportId " +
    "FROM Comparacion_Inv ORDER BY idComparacion_Inv"
  );
  return { products, stocks, counts, reports, comparisons };
}

async function addProduct(data) {
  const code = textField(data, "code");
  const name = textField(data, "name");
  const category = textField(data, "category");
  const stock = integerField(data, "stock");

  await inTransaction(async (connection) => {
    const [product] = await connection.execute(
      "INSERT INTO Producto (Codigo, Nombre, Categoria) VALUES (?, ?, ?)",
      [code, name, category]
    );
    await connection.execute(
      "INSERT INTO Stock_Sistema " +
      "(Cantidad_Sistema, Ult_Actualizacion, Producto_idProducto) " +
      "VALUES (?, CURRENT_DATE, ?)",
      [stock, product.insertId]
    );
  });
}

async function updateStockOrCount(action, data) {
  const productId = integerField(data, "productId", 1);
  const quantity = integerField(data, "quantity");

  if (action === "update_stock") {
    await database.execute(
      "INSERT INTO Stock_Sistema " +
      "(Cantidad_Sistema, Ult_Actualizacion, Producto_idProducto) " +
      "VALUES (?, CURRENT_DATE, ?)",
      [quantity, productId]
    );
  } else {
    await database.execute(
      "INSERT INTO Reg_Conteo (Fecha, CantidadCont, Producto_idProducto) " +
      "VALUES (CURRENT_DATE, ?, ?)",
      [quantity, productId]
    );
  }
}

async function scanProduct(data) {
  const code = textField(data, "code");

  await inTransaction(async (connection) => {
    const [products] = await connection.execute(
      "SELECT idProducto FROM Producto WHERE Codigo = ? FOR UPDATE",
      [code]
    );
    if (products.length === 0) {
      throw new RequestError("No existe un producto con ese código.", 404);
    }

    const productId = products[0].idProducto;
    const [counts] = await connection.execute(
      "SELECT CantidadCont FROM Reg_Conteo WHERE Producto_idProducto = ? " +
      "ORDER BY Fecha DESC, idReg_Conteo DESC LIMIT 1",
      [productId]
    );
    const quantity = counts.length ? counts[0].CantidadCont + 1 : 1;
    await connection.execute(
      "INSERT INTO Reg_Conteo (Fecha, CantidadCont, Producto_idProducto) " +
      "VALUES (CURRENT_DATE, ?, ?)",
      [quantity, productId]
    );
  });
}

async function createReport() {
  await inTransaction(async (connection) => {
    const [report] = await connection.execute(
      "INSERT INTO Reporte_Diferencias (Fecha_Generacion) VALUES (CURRENT_DATE)"
    );
    const [products] = await connection.query(
      "SELECT p.idProducto, " +
      "COALESCE((SELECT s.Cantidad_Sistema FROM Stock_Sistema s " +
      "WHERE s.Producto_idProducto = p.idProducto " +
      "ORDER BY s.idStock_Sistema DESC LIMIT 1), 0) AS sistema, " +
      "COALESCE((SELECT r.CantidadCont FROM Reg_Conteo r " +
      "WHERE r.Producto_idProducto = p.idProducto " +
      "ORDER BY r.Fecha DESC, r.idReg_Conteo DESC LIMIT 1), 0) AS fisico " +
      "FROM Producto p"
    );

    for (const product of products) {
      const difference = product.fisico - product.sistema;
      await connection.execute(
        "INSERT INTO Comparacion_Inv " +
        "(Fecha, Diferencia, Producto_idProducto, " +
        "Reporte_Diferencias_idReporte_Diferencias) " +
        "VALUES (CURRENT_DATE, ?, ?, ?)",
        [difference, product.idProducto, report.insertId]
      );
    }
  });
}

function sendApiError(response, error) {
  if (error instanceof RequestError) {
    sendJson(response, error.status, { error: error.message });
  } else if (error.code === "ER_DUP_ENTRY") {
    sendJson(response, 409, { error: "Ya existe un producto con ese código (SKU)." });
  } else if (
    ["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"].includes(error.code)
  ) {
    sendJson(response, 503, { error: "No se pudo conectar con MySQL: " + error.message });
  } else {
    sendJson(response, 500, {
      error: "No se pudo completar la operación: " + error.message
    });
  }
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET") {
      if (url.searchParams.get("action") !== "datos") {
        sendJson(response, 400, { error: "La consulta solicitada no es válida." });
        return;
      }
      sendJson(response, 200, await getData());
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Método no permitido." });
      return;
    }

    const data = await readJson(request);
    switch (data.action) {
      case "add_product":
        await addProduct(data);
        sendJson(response, 201, { ok: true });
        return;
      case "update_stock":
      case "record_count":
        await updateStockOrCount(data.action, data);
        sendJson(response, 201, { ok: true });
        return;
      case "scan":
        await scanProduct(data);
        sendJson(response, 201, { ok: true });
        return;
      case "report":
        await createReport();
        sendJson(response, 201, { ok: true });
        return;
      default:
        sendJson(response, 400, { error: "La acción solicitada no es válida." });
    }
  } catch (error) {
    sendApiError(response, error);
  }
}

function serveStatic(url, response) {
  const files = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/static/app.js": ["static/app.js", "text/javascript; charset=utf-8"],
    "/static/style.css": ["static/style.css", "text/css; charset=utf-8"]
  };
  const file = files[url.pathname];
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No se encontró el recurso solicitado.");
    return;
  }

  fs.readFile(path.join(root, file[0]), (error, content) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("No se pudo leer el archivo de la página.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": file[1],
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/api") {
    handleApi(request, response, url);
  } else if (request.method === "GET") {
    serveStatic(url, response);
  } else {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Método no permitido.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log("Gestor de inventario disponible en http://localhost:" + port);
});
