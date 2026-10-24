// mambamarket.js - Lógica híbrida con Caché Local Inteligente y Sincronización Silenciosa

const API_URL = "https://script.google.com/macros/s/AKfycbztLJ7jR6YXcTLJxmdCRa7ltE-yKNK9Z4DcLQN0YLtWagzy_RNfzVlADtRgRc8882U5cw/exec";
const WHATSAPP_NUMERO = "584126216661"; 
const CSV_URL = "productos.csv";

// Configuración inicial segura
let storeConfig = window.STORE_CONFIG || {
  nombre_tienda: "Mamba Market",
  simbolo_moneda_alt: "Bs.",
  zonas_delivery: []
};

let productosList = [];
let carrito = [];
try {
    carrito = JSON.parse(localStorage.getItem("mamba_carrito")) || [];
} catch (e) {
    console.warn("El carrito guardado estaba corrupto, se reinició.", e);
    localStorage.removeItem("mamba_carrito");
    carrito = [];
}
const PRODUCTOS_POR_PAGINA = 20;
const IMG_POR_DEFECTO = "https://ivanguillermo.github.io/mambamarket/assets/mamba_logo.jpg";

// ---------- Utilidades ----------
function escapeHTML(valor) {
  return String(valor === undefined || valor === null ? "" : valor).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Acepta 1.5, "1.5" y "1,5"
function parsePrecio(valor) {
  return Number(String(valor === undefined || valor === null ? "" : valor).replace(",", ".")) || 0;
}

// Vacío / sin columna = activo. Solo FALSE, NO o 0 lo ocultan.
function esActivo(prod) {
  const v = prod.activo;
  if (v === undefined || v === null || v === "") return true;
  if (typeof v === "boolean") return v;
  return !["FALSE", "NO", "0"].includes(String(v).trim().toUpperCase());
}

// Filtra inactivos / sin id y ordena por ventas (de mayor a menor)
function prepararProductos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter(p => p && p.id_producto !== undefined && p.id_producto !== "" && esActivo(p))
    .sort((a, b) => Number(b.ventas || 0) - Number(a.ventas || 0));
}

// El id siempre se maneja como texto (Sheets puede devolverlo como número)
carrito = Array.isArray(carrito) ? carrito.map(item => ({ ...item, id: String(item.id) })) : [];
let categoriaActiva = "TODOS";
let listaFiltrada = [];
let limiteVisible = PRODUCTOS_POR_PAGINA;
let modoMonedaBs = false;
let toastTimeout;
let zonaDeliverySeleccionada = "";

let tipoEntregaSeleccionada = "delivery"; // "delivery" o "pickup"
let direccionCliente = "";
let metodoPagoSeleccionado = "Pago Móvil (Bs.)";
let datosCliente = { nombre: "", telefono: "", correo: "" };
let refPagoMovil = "";
const CLAVE_CLIENTE = "mamba_cliente";

// Claves para el caché local (expira cada 30 minutos)
const CACHE_KEY_PRODS = "mamba_cache_productos";
const CACHE_KEY_CONFIG = "mamba_cache_config";
const CACHE_KEY_TIME = "mamba_cache_tiempo";
const CACHE_EXPIRACION_MS = 30 * 60 * 1000;

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('btn-instalar').style.display = 'block';
});

document.getElementById('btn-instalar').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
    document.getElementById('btn-instalar').style.display = 'none';
  }
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  
  // 1. Intentar cargar primero desde el Caché Local o CSV para velocidad instantánea
  if (cargarDatosDesdeCacheLocal()) {
    console.log("Cargado instantáneamente desde el caché local.");
  } else {
    aplicarConfiguracion();
    cargarProductosCSVLocal();
  }

  // 2. Sincronización en segundo plano con Google Sheets
  sincronizarConGoogleSheets();
});

// Comprobar si hay caché válido en localStorage
function cargarDatosDesdeCacheLocal() {
  const tiempoGuardado = localStorage.getItem(CACHE_KEY_TIME);
  const prodsGuardados = localStorage.getItem(CACHE_KEY_PRODS);
  const configGuardada = localStorage.getItem(CACHE_KEY_CONFIG);

  if (tiempoGuardado && prodsGuardados && (Date.now() - Number(tiempoGuardado) < CACHE_EXPIRACION_MS)) {
    try {
      productosList = prepararProductos(JSON.parse(prodsGuardados));
      if (configGuardada) {
        storeConfig = { ...storeConfig, ...JSON.parse(configGuardada) };
      }
    } catch (e) {
      console.warn("Caché local corrupto, se ignora.", e);
      localStorage.removeItem(CACHE_KEY_TIME);
      return false;
    }
    procesarCargaTienda();
    return true;
  }
  return false;
}

// Carga de respaldo si no hay caché (desde el CSV local)
async function cargarProductosCSVLocal() {
  try {
    const response = await fetch(CSV_URL);
    const dataText = await response.text();
    productosList = prepararProductos(parsearCSV(dataText));
    procesarCargaTienda();
  } catch (error) {
    console.error("Error al cargar el archivo CSV local:", error);
    const loadingEl = document.getElementById("loading");
    if (loadingEl) loadingEl.textContent = "Error al cargar los productos locales.";
  }
}

function parsearCSV(text) {
  const lines = text.split("\n").filter(line => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].split(",");
    if (currentLine.length < headers.length) continue;

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = currentLine[j] ? currentLine[j].trim().replace(/^"|"$/g, "") : "";
      
      if (["costo_usd", "precio_usd", "stock", "liked", "shared", "ventas"].includes(headers[j])) {
        obj[headers[j]] = Number(val) || 0;
      } else if (["destacado", "activo"].includes(headers[j])) {
        obj[headers[j]] = val.toUpperCase() === "TRUE";
      } else {
        obj[headers[j]] = val;
      }
    }
    result.push(obj);
  }
  return result;
}

function procesarCargaTienda() {
  aplicarConfiguracion();
  // Si la categoría activa ya no existe tras sincronizar, volver a TODOS
  const categoriasValidas = new Set(productosList.map(p => p.categoria));
  if (categoriaActiva !== "TODOS" && !categoriasValidas.has(categoriaActiva)) {
    categoriaActiva = "TODOS";
  }
  renderizarCategorias();
  filtrarProductos(true); // respeta búsqueda, categoría y "Ver más" actuales
  actualizarContadorCarrito();
}

// Sincronización silenciosa con Google Sheets y actualización de Caché
async function sincronizarConGoogleSheets() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    
    if (data.status === "success") {
      let huboCambios = false;

      if (data.configuracion) {
        storeConfig = { ...storeConfig, ...data.configuracion };
        localStorage.setItem(CACHE_KEY_CONFIG, JSON.stringify(data.configuracion));
        huboCambios = true;
      }
      if (data.productos && data.productos.length > 0) {
        productosList = prepararProductos(data.productos);
        localStorage.setItem(CACHE_KEY_PRODS, JSON.stringify(productosList));
        huboCambios = true;
      }

      if (huboCambios) {
        localStorage.setItem(CACHE_KEY_TIME, Date.now().toString());
        procesarCargaTienda();
        mostrarIndicadorSincronizado();
        console.log("Tienda sincronizada con Google Sheets y caché actualizada.");
      }
    }
  } catch (error) {
    console.log("Modo offline: operando con caché local o CSV.");
  }
}

// Indicador visual discreto de que se actualizó con la nube
function mostrarIndicadorSincronizado() {
  const badgeTasa = document.getElementById("badge-tasa");
  if (badgeTasa) {
    const originalHTML = badgeTasa.innerHTML;
    badgeTasa.innerHTML = `<i class="fa-solid fa-cloud-arrow-down" style="color: #2e7d32;"></i> ¡Datos actualizados de la nube!`;
    setTimeout(() => {
      badgeTasa.innerHTML = originalHTML;
    }, 4000);
  }
}

// Aplicar Configuración de Marca y SEO
function aplicarConfiguracion() {
  const nombre = storeConfig.nombre_tienda || "Mamba Market";
  document.title = `${nombre} | Supermercado Online`;
  
  const elNombreTienda = document.getElementById("nombre-tienda");
  if (elNombreTienda) elNombreTienda.textContent = nombre;
  
  const elFooterNombre = document.getElementById("footer-nombre");
  if (elFooterNombre) elFooterNombre.textContent = nombre;
  
  const elBienvenida = document.getElementById("mensaje-bienvenida");
  if (elBienvenida) elBienvenida.textContent = storeConfig.mensaje_bienvenida || `¡Bienvenidos a ${nombre}!`;
  
  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  const elTasaValor = document.getElementById("tasa-valor");
  if (elTasaValor) elTasaValor.textContent = `1 USD = ${simAlt} ${tasa.toFixed(2)}`;

  const elHorario = document.getElementById("horario-atencion");
  if (elHorario && storeConfig.horarios_entrega) {
    elHorario.textContent = `Horarios de Entrega: ${storeConfig.horarios_entrega}`;
  }

  if (storeConfig.url_logo) {
    const logoImg = document.getElementById("logo-tienda");
    if (logoImg) {
      logoImg.src = storeConfig.url_logo;
      logoImg.classList.remove("hidden");
    }
    const favicon = document.getElementById("dynamic-favicon");
    if (favicon) favicon.href = storeConfig.url_logo;
  }

  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.classList.add("hidden");
}

// Renderizar Categorías
function renderizarCategorias() {
  const container = document.getElementById("categorias-container");
  if (!container) return;
  
  const categorias = ["TODOS", ...new Set(productosList.map(p => p.categoria).filter(Boolean))];
  
  container.innerHTML = categorias.map(cat => `
    <button class="cat-btn ${cat === categoriaActiva ? 'active' : ''}" data-cat="${escapeHTML(cat)}" onclick="seleccionarCategoria(this.dataset.cat)">
      ${escapeHTML(cat)}
    </button>
  `).join("");
}

function seleccionarCategoria(cat) {
  categoriaActiva = cat;
  renderizarCategorias();
  filtrarProductos();
}

// Renderizar Productos (con etiquetas de Agotado y Más Vendido)
function renderizarProductos(lista) {
  const grid = document.getElementById("grid-productos");
  if (!grid) return;
  grid.innerHTML = "";

  if (lista.length === 0) {
    grid.innerHTML = "<p style='grid-column: 1 / -1; text-align: center; color: #64748b;'>No se encontraron productos disponibles.</p>";
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";

  lista.forEach(prod => {
    const precioUSD = parsePrecio(prod.precio_usd);
    const precioBs = precioUSD * tasa;
    const stockActual = Number(prod.stock !== undefined ? prod.stock : 99); // Sin columna stock = libre
    const ventasCount = Number(prod.ventas || 0);
    const estaAgotado = stockActual <= 0;
    const unidad = escapeHTML(prod.unidad_medida || "Unidad");

    const textoPrecioPrincipal = modoMonedaBs
      ? `${simAlt} ${precioBs.toFixed(2)}`
      : `$${precioUSD.toFixed(2)}`;

    const textoPrecioSecundario = modoMonedaBs
      ? `($${precioUSD.toFixed(2)}) / ${unidad}`
      : `(${simAlt} ${precioBs.toFixed(2)}) / ${unidad}`;

    let badgeHTML = "";
    if (estaAgotado) {
      badgeHTML = `<span class="product-badge badge-agotado">Agotado</span>`;
    } else if (ventasCount >= 10) {
      badgeHTML = `<span class="product-badge badge-popular"><i class="fa-solid fa-fire"></i> Más Vendido</span>`;
    }

    const card = document.createElement("div");
    card.className = `product-card ${estaAgotado ? 'card-agotado' : ''}`;
    card.innerHTML = `
      <div style="position: relative;">
        ${badgeHTML}
        <img class="product-img" src="${escapeHTML(prod.imagen_url || IMG_POR_DEFECTO)}" alt="${escapeHTML(prod.nombre)}" loading="lazy">
        <span class="product-brand">${escapeHTML(prod.marca || '')}</span>
        <h4 class="product-title">${escapeHTML(prod.nombre)}</h4>
      </div>
      <div>
        <div class="product-price-main">${textoPrecioPrincipal}</div>
        <div class="product-price-sub">${textoPrecioSecundario}</div>
        ${estaAgotado
          ? `<button class="btn-add btn-disabled" disabled>No disponible</button>`
          : `<button class="btn-add" data-id="${escapeHTML(prod.id_producto)}" onclick="agregarAlCarrito(this.dataset.id)"><i class="fa-solid fa-plus"></i> Agregar</button>`
        }
      </div>
    `;
    grid.appendChild(card);
  });
}

// Filtro de búsqueda + categoría + paginación ("Ver más")
// filtrarProductos() reinicia la paginación; filtrarProductos(true) la conserva.
function filtrarProductos(mantenerLimite) {
  if (mantenerLimite !== true) limiteVisible = PRODUCTOS_POR_PAGINA;

  const inputBusqueda = document.getElementById("input-busqueda");
  const query = inputBusqueda ? inputBusqueda.value.toLowerCase().trim() : "";

  listaFiltrada = productosList.filter(prod => {
    const coincideCat = categoriaActiva === "TODOS" || prod.categoria === categoriaActiva;
    const nombre = String(prod.nombre || "").toLowerCase();
    const marca = String(prod.marca || "").toLowerCase();
    const categoria = String(prod.categoria || "").toLowerCase();
    const coincideTexto = nombre.includes(query) || marca.includes(query) || categoria.includes(query);
    return coincideCat && coincideTexto;
  });

  renderizarProductos(listaFiltrada.slice(0, limiteVisible));
  actualizarBotonVerMas();
}

function actualizarBotonVerMas() {
  let cont = document.getElementById("ver-mas-container");
  if (!cont) {
    const grid = document.getElementById("grid-productos");
    if (!grid) return;
    cont = document.createElement("div");
    cont.id = "ver-mas-container";
    cont.style.cssText = "text-align: center; margin: 20px 0;";
    grid.insertAdjacentElement("afterend", cont);
  }
  const restantes = listaFiltrada.length - limiteVisible;
  cont.innerHTML = restantes > 0
    ? `<button class="btn-primary" style="max-width: 260px; display: block; margin: 0 auto;" onclick="verMasProductos()">Ver más productos (${restantes})</button>`
    : "";
}

function verMasProductos() {
  limiteVisible += PRODUCTOS_POR_PAGINA;
  filtrarProductos(true);
}

// Switch de Moneda
function toggleMoneda() {
  modoMonedaBs = !modoMonedaBs;
  const labelCurrency = document.getElementById("label-currency");
  if (labelCurrency) {
    labelCurrency.textContent = modoMonedaBs ? "Ver en USD" : "Ver en Bs.";
  }
  filtrarProductos(true);
  
  const modalCarrito = document.getElementById("modal-carrito");
  if (modalCarrito && !modalCarrito.classList.contains("hidden")) {
    renderizarCarrito();
  }
}

// Manejo del Carrito
function agregarAlCarrito(id) {
  id = String(id);
  const prod = productosList.find(p => String(p.id_producto) === id);
  if (!prod) return;

  const precioLimpio = parsePrecio(prod.precio_usd);

  const itemEnCarrito = carrito.find(item => item.id === id);
  if (itemEnCarrito) {
    itemEnCarrito.cantidad += 1;
  } else {
    carrito.push({
      id: String(prod.id_producto),
      nombre: prod.nombre,
      precio: precioLimpio,
      unidad: prod.unidad_medida || 'Unidad',
      cantidad: 1
    });
  }

  guardarCarrito();
  actualizarContadorCarrito();
  mostrarToast(`Agregado: ${prod.nombre}`);
}

function modificarCantidad(id, delta) {
  const index = carrito.findIndex(item => item.id === String(id));
  if (index === -1) return;

  carrito[index].cantidad += delta;
  if (carrito[index].cantidad <= 0) {
    carrito.splice(index, 1);
  }

  guardarCarrito();
  actualizarContadorCarrito();
  renderizarCarrito();
}

function eliminarDelCarrito(id) {
  carrito = carrito.filter(item => item.id !== String(id));
  guardarCarrito();
  actualizarContadorCarrito();
  renderizarCarrito();
}

function guardarCarrito() {
  localStorage.setItem("mamba_carrito", JSON.stringify(carrito));
}

function actualizarContadorCarrito() {
  const cartCount = document.getElementById("cart-count");
  if (cartCount) {
    const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    cartCount.textContent = totalItems;
  }
}

function toggleCarrito() {
  const modal = document.getElementById("modal-carrito");
  if (!modal) return;
  modal.classList.toggle("hidden");
  if (!modal.classList.contains("hidden")) {
    renderizarCarrito();
  }
}

// Reemplaza o ajusta esta parte dentro de renderizarCarrito() donde manejabas las zonas
function renderizarCarrito() {
  const container = document.getElementById("items-carrito");
  if (!container) return;
  container.innerHTML = "";
  
  if (carrito.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #94a3b8; margin-top: 40px;">
      <i class="fa-solid fa-basket-shopping" style="font-size: 2.5rem; margin-bottom: 10px;"></i>
      <p>Tu carrito está vacío</p>
    </div>`;
    document.getElementById("total-usd").textContent = "$0.00";
    document.getElementById("total-bs").textContent = "Bs. 0.00";
    const resumenContainer = document.getElementById("resumen-carrito-totales");
    if (resumenContainer) resumenContainer.innerHTML = "";
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  let totalProductosUSD = 0;
  let pesoTotalKg = 0;

  carrito.forEach(item => {
    const subtotalUSD = item.precio * item.cantidad;
    totalProductosUSD += subtotalUSD;
    const factorPeso = (item.unidad === "Kg" || item.unidad === "K") ? 1 : 0.5;
    pesoTotalKg += (item.cantidad * factorPeso);

    const row = document.createElement("div");
    row.className = "cart-item-row";
    row.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHTML(item.nombre)}</div>
        <div class="cart-item-price">$${item.precio.toFixed(2)} c/u</div>
      </div>
      <div class="cart-qty-controls">
        <button class="btn-qty" data-id="${escapeHTML(item.id)}" onclick="modificarCantidad(this.dataset.id, -1)">-</button>
        <span style="font-weight: 600; font-size: 13px;">${item.cantidad}</span>
        <button class="btn-qty" data-id="${escapeHTML(item.id)}" onclick="modificarCantidad(this.dataset.id, 1)">+</button>
        <button class="btn-remove" data-id="${escapeHTML(item.id)}" onclick="eliminarDelCarrito(this.dataset.id)" title="Eliminar">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  let costoDeliveryUSD = 0;
  const zonas = storeConfig.zonas_delivery || [];
  
  // Si es delivery, calculamos el costo
  if (tipoEntregaSeleccionada === "delivery") {
    const zonaObj = zonas.find(z => z.id === zonaDeliverySeleccionada);
    if (zonaObj) {
      costoDeliveryUSD = zonaObj.tarifa_base;
      if (pesoTotalKg > zonaObj.peso_incluido_kg) {
        const kgExtra = pesoTotalKg - zonaObj.peso_incluido_kg;
        costoDeliveryUSD += kgExtra * (storeConfig.costo_por_kg_extra || 0.50);
      }
    }
  }

  // Rellenar las opciones del select de zonas de delivery de forma dinámica
  setTimeout(() => {
    const selectZona = document.getElementById("select-zona-delivery");
    if (selectZona && selectZona.options.length <= 1) {
      selectZona.innerHTML = `<option value="">-- Elige una zona --</option>` + 
        zonas.map(z => `<option value="${z.id}" ${z.id === zonaDeliverySeleccionada ? 'selected' : ''}>${z.nombre} (Base: $${z.tarifa_base.toFixed(2)})</option>`).join('');
    }

    // Mostrar u ocultar campos según Pickup o Delivery
    const wrapperZona = document.getElementById("contenedor-zona-wrapper");
    const wrapperDir = document.getElementById("contenedor-direccion");
    if (tipoEntregaSeleccionada === "pickup") {
      if (wrapperZona) wrapperZona.style.display = "none";
      if (wrapperDir) wrapperDir.style.display = "none";
    } else {
      if (wrapperZona) wrapperZona.style.display = "block";
      if (wrapperDir) wrapperDir.style.display = "block";
    }
  }, 50);

  const totalGeneralUSD = totalProductosUSD + costoDeliveryUSD;
  const totalBs = totalGeneralUSD * tasa;

  document.getElementById("total-usd").textContent = `$${totalGeneralUSD.toFixed(2)}`;
  document.getElementById("total-bs").textContent = `${simAlt} ${totalBs.toFixed(2)}`;
}

function cambiarTipoEntrega(tipo) {
  tipoEntregaSeleccionada = tipo;
  if (tipo === "pickup") {
    zonaDeliverySeleccionada = ""; // Se limpia el delivery si retira en tienda
  }
  renderizarCarrito();
}

function cambiarZonaDelivery(idZona) {
  zonaDeliverySeleccionada = idZona;
  renderizarCarrito();
}

function guardarDatosCheckout() {
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };

  direccionCliente = val("input-direccion-cliente");
  datosCliente = {
    nombre: val("input-nombre-cliente"),
    telefono: val("input-telefono-cliente"),
    correo: val("input-correo-cliente")
  };
  refPagoMovil = val("input-ref-pagomovil");

  const selectPago = document.getElementById("select-metodo-pago");
  if (selectPago) metodoPagoSeleccionado = selectPago.value;

  // La referencia solo aplica si paga con Pago Móvil
  const wrapRef = document.getElementById("contenedor-ref-pagomovil");
  if (wrapRef) wrapRef.style.display = metodoPagoSeleccionado.indexOf("Pago M") === 0 ? "block" : "none";

  // Recordar datos del cliente para su próxima compra
  try {
    localStorage.setItem(CLAVE_CLIENTE, JSON.stringify({ ...datosCliente, direccion: direccionCliente }));
  } catch (e) { /* almacenamiento lleno o bloqueado: no es crítico */ }
}

function cargarDatosCliente() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_CLIENTE)) || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set("input-nombre-cliente", g.nombre);
    set("input-telefono-cliente", g.telefono);
    set("input-correo-cliente", g.correo);
    set("input-direccion-cliente", g.direccion);
  } catch (e) { /* datos guardados corruptos: se ignoran */ }
  guardarDatosCheckout();
}

// Toast No Invasivo
function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  
  document.getElementById("toast-message").textContent = mensaje;
  toast.classList.remove("hidden");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2200);
}

// Totales calculados en la web. El servidor los recalcula con los precios reales del Sheet.
function calcularPedidoLocal() {
  const tasa = Number(storeConfig.tasa_cambio) || 1;
  let subtotal = 0;
  let pesoKg = 0;
  carrito.forEach(item => {
    subtotal += item.precio * item.cantidad;
    pesoKg += (item.unidad === "Kg" || item.unidad === "K") ? item.cantidad : (item.cantidad * 0.5);
  });

  let costoEnvio = 0;
  let zonaObj = null;
  if (tipoEntregaSeleccionada === "delivery") {
    zonaObj = (storeConfig.zonas_delivery || []).find(z => z.id === zonaDeliverySeleccionada) || null;
    if (zonaObj) {
      costoEnvio = Number(zonaObj.tarifa_base) || 0;
      if (pesoKg > zonaObj.peso_incluido_kg) {
        costoEnvio += (pesoKg - zonaObj.peso_incluido_kg) * (storeConfig.costo_por_kg_extra || 0.50);
      }
    }
  }
  const total = subtotal + costoEnvio;
  return { subtotal, pesoKg, costoEnvio, zonaObj, total, totalBs: total * tasa };
}

// Devuelve { id, mensaje } si falta algo, o null si todo está bien
function validarCheckout() {
  if (datosCliente.nombre.trim().length < 2) {
    return { id: "input-nombre-cliente", mensaje: "Escribe tu nombre para poder procesar el pedido." };
  }
  if (datosCliente.telefono.replace(/\D/g, "").length < 10) {
    return { id: "input-telefono-cliente", mensaje: "Escribe un teléfono válido (con código de área)." };
  }
  const correo = datosCliente.correo.trim();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return { id: "input-correo-cliente", mensaje: "El correo no parece válido. Corrígelo o déjalo en blanco." };
  }
  if (tipoEntregaSeleccionada === "delivery") {
    const hayZonas = (storeConfig.zonas_delivery || []).length > 0;
    if (hayZonas && !zonaDeliverySeleccionada) {
      return { id: "select-zona-delivery", mensaje: "Elige tu zona de entrega." };
    }
    if (direccionCliente.trim().length < 5) {
      return { id: "input-direccion-cliente", mensaje: "Escribe tu dirección o un punto de referencia." };
    }
  }
  return null;
}

// Guarda el pedido en la hoja "Preordenes" y luego abre WhatsApp con el resumen
async function iniciarCheckout() {
  if (carrito.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  guardarDatosCheckout();

  const problema = validarCheckout();
  if (problema) {
    alert(problema.mensaje);
    const el = document.getElementById(problema.id);
    if (el) el.focus();
    return;
  }

  const btn = document.getElementById("btn-checkout");
  const textoBtn = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Enviando pedido..."; }

  // Se abre la ventana ANTES de esperar al servidor: si no, el navegador bloquea el popup de WhatsApp
  const ventanaWA = window.open("", "_blank");

  const local = calcularPedidoLocal();
  const esDelivery = tipoEntregaSeleccionada === "delivery";
  let registro = null;

  try {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 20000);

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita el preflight CORS de Apps Script
      body: JSON.stringify({
        action: "crearPedido",
        cliente: {
          nombre: datosCliente.nombre.trim(),
          telefono: datosCliente.telefono.trim(),
          correo: datosCliente.correo.trim()
        },
        items: carrito.map(i => ({ id: i.id, cantidad: i.cantidad })),
        tipo_entrega: tipoEntregaSeleccionada,
        zona_id: zonaDeliverySeleccionada,
        zona_nombre: local.zonaObj ? local.zonaObj.nombre : "",
        costo_envio_cliente: local.costoEnvio,
        direccion: esDelivery ? direccionCliente.trim() : "",
        metodo_pago: metodoPagoSeleccionado,
        ref_pagomovil: metodoPagoSeleccionado.indexOf("Pago M") === 0 ? refPagoMovil.trim() : ""
      }),
      signal: controlador.signal
    });
    clearTimeout(temporizador);
    const data = await resp.json();

    if (data.status === "success") {
      registro = data;
    } else if (data.validacion) {
      // Error "de negocio" (producto agotado, stock, dato inválido): se avisa y NO se continúa
      if (ventanaWA) ventanaWA.close();
      alert(data.message);
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
      return;
    } else {
      console.warn("El servidor no pudo registrar el pedido:", data.message);
    }
  } catch (err) {
    // Sin internet o servidor lento: no se pierde la venta, se manda igual por WhatsApp
    console.warn("No se pudo registrar el pedido en el Sheet:", err);
  }

  // Si el servidor respondió, sus totales (con precios reales) mandan sobre los locales
  const srv = registro && registro.pedido ? registro.pedido : null;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  const subtotal = srv ? srv.subtotal_usd : local.subtotal;
  const costoEnvio = srv ? srv.costo_envio_usd : local.costoEnvio;
  const totalUSD = srv ? srv.total_usd : local.total;
  const totalBs = srv && srv.total_bs !== "" ? srv.total_bs : local.totalBs;
  const pesoKg = srv ? srv.peso_kg : local.pesoKg;
  const zonaTexto = srv && srv.zona ? srv.zona : (local.zonaObj ? local.zonaObj.nombre : "N/A");

  let mensaje = `*¡Hola Mamba Market! Deseo realizar el siguiente pedido:*\n`;
  if (registro) mensaje += `*Pedido N°:* ${registro.id}\n`;
  mensaje += `*Cliente:* ${datosCliente.nombre.trim()}\n*Teléfono:* ${datosCliente.telefono.trim()}\n\n`;

  carrito.forEach((item, index) => {
    const sub = item.precio * item.cantidad;
    mensaje += `${index + 1}. *${item.nombre}* \n   Cantidad: ${item.cantidad} x $${item.precio.toFixed(2)} = *$${sub.toFixed(2)}*\n`;
  });

  mensaje += `\n--------------------------\n`;
  mensaje += `*Subtotal Productos:* $${Number(subtotal).toFixed(2)}\n`;
  mensaje += `*Modalidad:* ${esDelivery ? 'Delivery a domicilio' : 'Retiro en Tienda (Pickup)'}\n`;
  if (esDelivery) {
    mensaje += `*Zona:* ${zonaTexto}\n`;
    mensaje += `*Dirección:* ${direccionCliente.trim()}\n`;
    mensaje += `*Costo Delivery:* $${Number(costoEnvio).toFixed(2)} (~${Number(pesoKg).toFixed(1)} kg)\n`;
  }
  mensaje += `*Método de Pago:* ${metodoPagoSeleccionado}\n`;
  if (metodoPagoSeleccionado.indexOf("Pago M") === 0 && refPagoMovil.trim()) {
    mensaje += `*Referencia Pago Móvil:* ${refPagoMovil.trim()}\n`;
  }
  mensaje += `--------------------------\n`;
  mensaje += `*TOTAL A PAGAR:* $${Number(totalUSD).toFixed(2)} (${simAlt} ${Number(totalBs).toFixed(2)})\n`;
  mensaje += `--------------------------\n`;
  mensaje += `Quedo atento para coordinar el pago. ¡Gracias!`;

  const urlWhatsApp = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  if (ventanaWA && !ventanaWA.closed) {
    ventanaWA.location.href = urlWhatsApp;
  } else {
    window.location.href = urlWhatsApp; // el navegador bloqueó la ventana: se usa la misma pestaña
  }

  if (btn) { btn.disabled = false; btn.textContent = textoBtn; }

  // Pedido registrado: se vacía el carrito para no duplicarlo
  if (registro) {
    carrito = [];
    guardarCarrito();
    actualizarContadorCarrito();
    renderizarCarrito();
    const modal = document.getElementById("modal-carrito");
    if (modal) modal.classList.add("hidden");
    mostrarToast(`Pedido ${registro.id} registrado`);
  }
}

async function pedirPermisoNotificaciones() {
  if (!("Notification" in window)) {
    console.warn("Este navegador no soporta notificaciones.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    // Aquí es donde obtienes el Token de Firebase si ya lo tienes implementado
    console.log("Permiso concedido. Registrando token...");
    // integrarFirebaseMessaging(); 
  }
}

function registrarTokenFirebase() {
  const messaging = firebase.messaging();
  
  messaging.getToken({ vapidKey: 'TU_CLAVE_VAPID_DE_FIREBASE' })
    .then((currentToken) => {
      if (currentToken) {
        // Enviamos al Apps Script
        fetch('URL_DE_TU_WEB_APP_SCRIPT', {
          method: 'POST',
          body: JSON.stringify({
            action: 'registrarToken',
            id_cliente: 'usuario_' + Date.now(), // O un ID generado
            token: currentToken
          })
        });
      }
    }).catch((err) => {
      console.log('Error al obtener token:', err);
    });
}

// Exponer explícitamente las funciones al ámbito global para los eventos inline del HTML
window.seleccionarCategoria = seleccionarCategoria;
window.agregarAlCarrito = agregarAlCarrito;
window.modificarCantidad = modificarCantidad;
window.eliminarDelCarrito = eliminarDelCarrito;
window.toggleMoneda = toggleMoneda;
window.toggleCarrito = toggleCarrito;
window.cambiarTipoEntrega = cambiarTipoEntrega;
window.cambiarZonaDelivery = cambiarZonaDelivery;
window.iniciarCheckout = iniciarCheckout;
window.filtrarProductos = filtrarProductos;
window.verMasProductos = verMasProductos;
window.guardarDatosCheckout = guardarDatosCheckout;

// Rellena los datos del cliente guardados de compras anteriores
cargarDatosCliente();
