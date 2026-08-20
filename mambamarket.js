const API_URL = "https://script.google.com/macros/s/AKfycbxYr-CK3-uTvdKZz-GItmYnGbaLAAzrtWlCPu3Pr9-KE3UNQBKsTnRMpU4Dy_Sw_pRqQw/exec";
const WHATSAPP_NUMERO = "584120000000"; // Reemplaza con tu número de WhatsApp de Mamba Market (código país + número)

let storeConfig = {
  nombre_tienda: "Mamba Market",
  tasa_cambio: 36.50,
  simbolo_moneda_alt: "Bs."
};
let productosList = [];
let carrito = JSON.parse(localStorage.getItem("mamba_carrito")) || [];
let categoriaActiva = "TODOS";
let modoMonedaBs = false;
let toastTimeout;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  cargarProductosCSVLocal();
  sincronizarConGoogleSheets();
});

// 1. Cargar datos iniciales desde el CSV local del servidor
async function cargarProductosCSVLocal() {
  try {
    const res = await fetch("productos.csv");
    const csvText = await res.text();
    productosList = parsearCSV(csvText);
    
    // Ordenar por popularidad (ventas desc) y limitar a los primeros 20
    productosList.sort((a, b) => Number(b.ventas || 0) - Number(a.ventas || 0));
    
    procesarCargaTienda();
  } catch (error) {
    console.log("No se pudo cargar productos.csv local, esperando red.");
  }
}

function parsearCSV(texto) {
  const lineas = texto.trim().split("\n");
  const headers = lineas[0].split(",").map(h => h.trim());
  const resultados = [];

  for (let i = 1; i < lineas.length; i++) {
    const fila = lineas[i].split(",");
    if (fila.length < headers.length) continue;
    
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = fila[index] ? fila[index].trim() : "";
    });
    resultados.push(obj);
  }
  return resultados;
}

function procesarCargaTienda() {
  aplicarConfiguracion();
  renderizarCategorias();
  // Mostrar estrictamente los primeros 20 productos ordenados por popularidad en la carga inicial
  renderizarProductos(productosList.slice(0, 20));
  actualizarContadorCarrito();
}

// 2. Sincronización en segundo plano con Google Sheets
async function sincronizarConGoogleSheets() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (data.status === "success") {
      storeConfig = { ...storeConfig, ...data.configuracion };
      if (data.productos && data.productos.length > 0) {
        productosList = data.productos;
        productosList.sort((a, b) => Number(b.ventas || 0) - Number(a.ventas || 0));
      }
      procesarCargaTienda();
    }
  } catch (error) {
    console.log("Modo offline: usando datos locales.");
  }
}

// 3. Aplicar Configuración de Marca y SEO
function aplicarConfiguracion() {
  const nombre = storeConfig.nombre_tienda || "Mamba Market";
  document.title = `${nombre} | Supermercado Online`;
  document.getElementById("nombre-tienda").textContent = nombre;
  document.getElementById("footer-nombre").textContent = nombre;
  document.getElementById("mensaje-bienvenida").textContent = storeConfig.mensaje_bienvenida || `¡Bienvenidos a ${nombre}!`;
  
  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  document.getElementById("tasa-valor").textContent = `1 USD = ${simAlt} ${tasa.toFixed(2)}`;

  if (storeConfig.horarios_entrega) {
    document.getElementById("horario-atencion").textContent = `Horarios de Entrega: ${storeConfig.horarios_entrega}`;
  }

  if (storeConfig.url_logo) {
    const logoImg = document.getElementById("logo-tienda");
    logoImg.src = storeConfig.url_logo;
    logoImg.classList.remove("hidden");

    const favicon = document.getElementById("dynamic-favicon");
    favicon.href = storeConfig.url_logo;
  }

  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.classList.add("hidden");
}

// 4. Renderizar Categorías
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

// 5. Renderizar Productos
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

// 6. Filtro de Búsqueda
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

// 7. Switch de Moneda
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

// 8. Manejo del Carrito
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
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  let totalUSD = 0;

  carrito.forEach(item => {
    const subtotalUSD = item.precio * item.cantidad;
    totalUSD += subtotalUSD;

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

  const totalBs = totalUSD * tasa;
  document.getElementById("total-usd").textContent = `$${totalUSD.toFixed(2)}`;
  document.getElementById("total-bs").textContent = `${simAlt} ${totalBs.toFixed(2)}`;
}

// 9. Toast No Invasivo
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

// 10. Finiquitar Pedido por WhatsApp
function iniciarCheckout() {
  if (carrito.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";
  
  let mensaje = `*¡Hola Mamba Market! Deseo realizar el siguiente pedido:*\n\n`;
  let totalUSD = 0;

  carrito.forEach((item, index) => {
    const subtotal = item.precio * item.cantidad;
    totalUSD += subtotal;
    mensaje += `${index + 1}. *${item.nombre}* \n   Cantidad: ${item.cantidad} x $${item.precio.toFixed(2)} = *$${subtotal.toFixed(2)}*\n`;
  });

  const totalBs = totalUSD * tasa;
  mensaje += `\n--------------------------\n`;
  mensaje += `*Total USD:* $${totalUSD.toFixed(2)}\n`;
  mensaje += `*Total Bs (${simAlt}):* ${simAlt} ${totalBs.toFixed(2)} (Tasa: ${tasa})\n`;
  mensaje += `--------------------------\n`;
  mensaje += `Quedo atento para coordinar el pago y la entrega. ¡Gracias!`;

  const urlWhatsApp = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  window.open(urlWhatsApp, "_blank");
}
