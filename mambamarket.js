// mambamarket.js - Lógica híbrida con Caché Local Inteligente y Sincronización Silenciosa

const API_URL = "https://script.google.com/macros/s/AKfycbxYr-CK3-uTvdKZz-GItmYnGbaLAAzrtWlCPu3Pr9-KE3UNQBKsTnRMpU4Dy_Sw_pRqQw/exec";
const WHATSAPP_NUMERO = "584126216661"; 
const CSV_URL = "productos.csv";

// Configuración inicial segura
let storeConfig = window.STORE_CONFIG || {
  nombre_tienda: "Mamba Market",
  tasa_cambio: 755,
  simbolo_moneda_alt: "Bs.",
  zonas_delivery: []
};

let productosList = [];
let carrito = JSON.parse(localStorage.getItem("mamba_carrito")) || [];
let categoriaActiva = "TODOS";
let modoMonedaBs = false;
let toastTimeout;
let zonaDeliverySeleccionada = "";

// Claves para el caché local (expira cada 30 minutos)
const CACHE_KEY_PRODS = "mamba_cache_productos";
const CACHE_KEY_CONFIG = "mamba_cache_config";
const CACHE_KEY_TIME = "mamba_cache_tiempo";
const CACHE_EXPIRACION_MS = 30 * 60 * 1000; 

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
    productosList = JSON.parse(prodsGuardados);
    if (configGuardada) {
      storeConfig = { ...storeConfig, ...JSON.parse(configGuardada) };
    }
    productosList.sort((a, b) => Number(b.ventas || 0) - Number(a.ventas || 0));
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
    productosList = parsearCSV(dataText);
    productosList.sort((a, b) => Number(b.ventas || 0) - Number(b.ventas || 0));
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
  renderizarCategorias();
  renderizarProductos(productosList.slice(0, 20));
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
        productosList = data.productos;
        productosList.sort((a, b) => Number(b.ventas || 0) - Number(b.ventas || 0));
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
    <button class="cat-btn ${cat === categoriaActiva ? 'active' : ''}" onclick="seleccionarCategoria('${cat}')">
      ${cat}
    </button>
  `).join("");
}

function seleccionarCategoria(cat) {
  categoriaActiva = cat;
  renderizarCategorias();
  filtrarProductos();
}

// Renderizar Productos
function renderizarProductos(lista) {
  const grid = document.getElementById("grid-productos");
  if (!grid) return;
  grid.innerHTML = "";

  if (lista.length === 0) {
    grid.innerHTML = "<p style='grid-column: span 2; text-align: center; color: #64748b;'>No se encontraron productos disponibles.</p>";
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";

  lista.forEach(prod => {
    const precioUSD = Number(prod.precio_usd);
    const precioBs = precioUSD * tasa;

    const textoPrecioPrincipal = modoMonedaBs 
      ? `${simAlt} ${precioBs.toFixed(2)}` 
      : `$${precioUSD.toFixed(2)}`;
      
    const textoPrecioSecundario = modoMonedaBs 
      ? `($${precioUSD.toFixed(2)}) / ${prod.unidad_medida || 'Unidad'}` 
      : `(${simAlt} ${precioBs.toFixed(2)}) / ${prod.unidad_medida || 'Unidad'}`;

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div>
        <img class="product-img" src="${prod.imagen_url || 'https://via.placeholder.com/220x170.png?text=Mamba+Market'}" alt="${prod.nombre}" loading="lazy">
        <span class="product-brand">${prod.marca || ''}</span>
        <h4 class="product-title">${prod.nombre}</h4>
      </div>
      <div>
        <div class="product-price-main">${textoPrecioPrincipal}</div>
        <div class="product-price-sub">${textoPrecioSecundario}</div>
        <button class="btn-add" onclick="agregarAlCarrito('${prod.id_producto}')">
          <i class="fa-solid fa-plus"></i> Agregar
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Filtro de Búsqueda
function filtrarProductos() {
  const inputBusqueda = document.getElementById("input-busqueda");
  const query = inputBusqueda ? inputBusqueda.value.toLowerCase() : "";
  
  const filtrados = productosList.filter(prod => {
    const coincideCat = categoriaActiva === "TODOS" || prod.categoria === categoriaActiva;
    const coincideTexto = prod.nombre.toLowerCase().includes(query) || (prod.marca && prod.marca.toLowerCase().includes(query));
    return coincideCat && coincideTexto;
  });
  renderizarProductos(filtrados);
}

// Switch de Moneda
function toggleMoneda() {
  modoMonedaBs = !modoMonedaBs;
  const labelCurrency = document.getElementById("label-currency");
  if (labelCurrency) {
    labelCurrency.textContent = modoMonedaBs ? "Ver en USD" : "Ver en Bs.";
  }
  filtrarProductos();
  
  const modalCarrito = document.getElementById("modal-carrito");
  if (modalCarrito && !modalCarrito.classList.contains("hidden")) {
    renderizarCarrito();
  }
}

// Manejo del Carrito
function agregarAlCarrito(id) {
  const prod = productosList.find(p => p.id_producto === id);
  if (!prod) return;

  const itemEnCarrito = carrito.find(item => item.id === id);
  if (itemEnCarrito) {
    itemEnCarrito.cantidad += 1;
  } else {
    carrito.push({
      id: prod.id_producto,
      nombre: prod.nombre,
      precio: Number(prod.precio_usd),
      unidad: prod.unidad_medida || 'Unidad',
      cantidad: 1
    });
  }

  guardarCarrito();
  actualizarContadorCarrito();
  mostrarToast(`Agregado: ${prod.nombre}`);
}

function modificarCantidad(id, delta) {
  const index = carrito.findIndex(item => item.id === id);
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
  carrito = carrito.filter(item => item.id !== id);
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
    
    const factorPeso = item.unidad === "Kg" ? 1 : 0.5;
    pesoTotalKg += (item.cantidad * factorPeso);

    const row = document.createElement("div");
    row.className = "cart-item-row";
    row.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.nombre}</div>
        <div class="cart-item-price">$${item.precio.toFixed(2)} c/u</div>
      </div>
      <div class="cart-qty-controls">
        <button class="btn-qty" onclick="modificarCantidad('${item.id}', -1)">-</button>
        <span style="font-weight: 600; font-size: 13px;">${item.cantidad}</span>
        <button class="btn-qty" onclick="modificarCantidad('${item.id}', 1)">+</button>
        <button class="btn-remove" onclick="eliminarDelCarrito('${item.id}')" title="Eliminar">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  let costoDeliveryUSD = 0;
  const zonas = storeConfig.zonas_delivery || [];
  const zonaObj = zonas.find(z => z.id === zonaDeliverySeleccionada);

  if (zonaObj) {
    costoDeliveryUSD = zonaObj.tarifa_base;
    if (pesoTotalKg > zonaObj.peso_incluido_kg) {
      const kgExtra = pesoTotalKg - zonaObj.peso_incluido_kg;
      costoDeliveryUSD += kgExtra * (storeConfig.costo_por_kg_extra || 0.50);
    }
  }

  let deliveryBoxHTML = `
    <div class="checkout-delivery-box">
      <label><i class="fa-solid fa-motorcycle"></i> Selecciona tu zona de entrega:</label>
      <select id="select-zona-delivery" onchange="cambiarZonaDelivery(this.value)">
        <option value="">-- Elige una zona --</option>
        ${zonas.map(z => `<option value="${z.id}" ${z.id === zonaDeliverySeleccionada ? 'selected' : ''}>${z.nombre} (Base: $${z.tarifa_base.toFixed(2)})</option>`).join('')}
      </select>
      <div class="delivery-summary-text">
        Peso aprox. estimado: <b>${pesoTotalKg.toFixed(1)} kg</b> | Delivery: <b>$${costoDeliveryUSD.toFixed(2)}</b>
      </div>
    </div>
  `;
  
  const resumenContainer = document.getElementById("resumen-carrito-totales");
  if (resumenContainer) {
    resumenContainer.innerHTML = deliveryBoxHTML;
  }

  const totalGeneralUSD = totalProductosUSD + costoDeliveryUSD;
  const totalBs = totalGeneralUSD * tasa;

  document.getElementById("total-usd").textContent = `$${totalGeneralUSD.toFixed(2)}`;
  document.getElementById("total-bs").textContent = `${simAlt} ${totalBs.toFixed(2)}`;
}

function cambiarZonaDelivery(idZona) {
  zonaDeliverySeleccionada = idZona;
  renderizarCarrito();
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

// Finiquitar Pedido por WhatsApp
function iniciarCheckout() {
  if (carrito.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  
  let mensaje = `*¡Hola Mamba Market! Deseo realizar el siguiente pedido:*\n\n`;
  let totalProductosUSD = 0;
  let pesoTotalKg = 0;

  carrito.forEach((item, index) => {
    const subtotal = item.precio * item.cantidad;
    totalProductosUSD += subtotal;
    pesoTotalKg += item.unidad === "Kg" ? item.cantidad : (item.cantidad * 0.5);
    mensaje += `${index + 1}. *${item.nombre}* \n   Cantidad: ${item.cantidad} x $${item.precio.toFixed(2)} = *$${subtotal.toFixed(2)}*\n`;
  });

  let costoDeliveryUSD = 0;
  let nombreZonaTexto = "No especificada";
  const zonas = storeConfig.zonas_delivery || [];
  const zonaObj = zonas.find(z => z.id === zonaDeliverySeleccionada);

  if (zonaObj) {
    nombreZonaTexto = zonaObj.nombre;
    costoDeliveryUSD = zonaObj.tarifa_base;
    if (pesoTotalKg > zonaObj.peso_incluido_kg) {
      costoDeliveryUSD += (pesoTotalKg - zonaObj.peso_incluido_kg) * (storeConfig.costo_por_kg_extra || 0.50);
    }
  }

  const totalGeneralUSD = totalProductosUSD + costoDeliveryUSD;
  const totalBs = totalGeneralUSD * tasa;

  mensaje += `\n--------------------------\n`;
  mensaje += `*Subtotal Productos:* $${totalProductosUSD.toFixed(2)}\n`;
  mensaje += `*Zona de Entrega:* ${nombreZonaTexto}\n`;
  mensaje += `*Costo Delivery:* $${costoDeliveryUSD.toFixed(2)} (~${pesoTotalKg.toFixed(1)} kg)\n`;
  mensaje += `--------------------------\n`;
  mensaje += `*TOTAL A PAGAR:* $${totalGeneralUSD.toFixed(2)} (${simAlt} ${totalBs.toFixed(2)})\n`;
  mensaje += `--------------------------\n`;
  mensaje += `Quedo atento para coordinar el pago. ¡Gracias!`;

  const urlWhatsApp = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  window.open(urlWhatsApp, "_blank");
}
