const API_URL = "https://script.google.com/macros/s/AKfycbxYr-CK3-uTvdKZz-GItmYnGbaLAAzrtWlCPu3Pr9-KE3UNQBKsTnRMpU4Dy_Sw_pRqQw/exec";

let storeConfig = {};
let productosList = [];
let carrito = JSON.parse(localStorage.getItem("mamba_carrito")) || [];
let categoriaActiva = "TODOS";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  cargarDatosTienda();
});


// 1. Cargar datos del Backend
async function cargarDatosTienda() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    if (data.status === "success") {
      storeConfig = data.configuracion;
      productosList = data.productos;

      aplicarConfiguracion();
      renderizarCategorias();
      renderizarProductos(productosList);
      actualizarContadorCarrito();
    } else {
      document.getElementById("loading").textContent = "Error cargando la tienda.";
    }
  } catch (error) {
    document.getElementById("loading").textContent = "Error de conexión con el servidor.";
  }
}

// 2. Aplicar estilos y textos dinámicos de Marca Blanca
function aplicarConfiguracion() {
  document.title = storeConfig.nombre_tienda || "Tienda Online";
  document.getElementById("nombre-tienda").textContent = storeConfig.nombre_tienda || "Mamba Market";
  document.getElementById("footer-nombre").textContent = storeConfig.nombre_tienda || "Mamba Market";
  document.getElementById("mensaje-bienvenida").textContent = storeConfig.mensaje_bienvenida || "¡Bienvenidos!";
  
  if (storeConfig.horarios_entrega) {
    document.getElementById("horario-atencion").textContent = `Horarios de Entrega: ${storeConfig.horarios_entrega}`;
  }

  if (storeConfig.url_logo) {
    const logo = document.getElementById("logo-tienda");
    logo.src = storeConfig.url_logo;
    logo.classList.remove("hidden");
  }

  // Variables CSS dinámicas
  const root = document.documentElement;
  if (storeConfig.color_primario) root.style.setProperty('--color-primario', storeConfig.color_primario);
  if (storeConfig.color_fondo) root.style.setProperty('--color-fondo', storeConfig.color_fondo);
  if (storeConfig.color_tarjeta) root.style.setProperty('--color-tarjeta', storeConfig.color_tarjeta);
  if (storeConfig.color_texto) root.style.setProperty('--color-texto', storeConfig.color_texto);

  document.getElementById("loading").classList.add("hidden");
}

// 3. Renderizar Categorías
function renderizarCategorias() {
  const container = document.getElementById("categorias-container");
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

// 4. Renderizar Tarjetas de Productos
function renderizarProductos(lista) {
  const grid = document.getElementById("grid-productos");
  grid.innerHTML = "";

  if (lista.length === 0) {
    grid.innerHTML = "<p>No se encontraron productos disponibles.</p>";
    return;
  }

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";

  lista.forEach(prod => {
    const precioBs = (Number(prod.precio_usd) * tasa).toFixed(2);
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div>
        <img class="product-img" src="${prod.imagen_url || 'https://via.placeholder.com/200'}" alt="${prod.nombre}" loading="lazy">
        <span class="product-brand">${prod.marca || ''}</span>
        <h4 class="product-title">${prod.nombre}</h4>
      </div>
      <div>
        <div class="product-price">$${Number(prod.precio_usd).toFixed(2)}</div>
        <div class="product-price-alt">${simAlt} ${precioBs} / ${prod.unidad_medida || 'Unidad'}</div>
        <button class="btn-add" onclick="agregarAlCarrito('${prod.id_producto}')">Agregar</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 5. Filtro de Búsqueda
function filtrarProductos() {
  const query = document.getElementById("input-busqueda").value.toLowerCase();
  const filtrados = productosList.filter(prod => {
    const coincideCat = categoriaActiva === "TODOS" || prod.categoria === categoriaActiva;
    const coincideTexto = prod.nombre.toLowerCase().includes(query) || (prod.marca && prod.marca.toLowerCase().includes(query));
    return coincideCat && coincideTexto;
  });
  renderizarProductos(filtrados);
}

// 6. Manejo Básico de Carrito
function agregarAlCarrito(id) {
  const prod = productosList.find(p => p.id_producto === id);
  if (!prod) return;

  const itemEnCarrito = carrito.find(item => item.id === id);
  if (itemEnCarrito) {
    itemEnCarrito.cantidad += 1;
  } else {
    carrito.push({ id: prod.id_producto, nombre: prod.nombre, precio: Number(prod.precio_usd), cantidad: 1 });
  }

  guardarCarrito();
  actualizarContadorCarrito();
}

function guardarCarrito() {
  localStorage.setItem("mamba_carrito", JSON.stringify(carrito));
}

function actualizarContadorCarrito() {
  const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  document.getElementById("cart-count").textContent = totalItems;
}

function toggleCarrito() {
  const modal = document.getElementById("modal-carrito");
  modal.classList.toggle("hidden");
  if (!modal.classList.contains("hidden")) {
    renderizarCarrito();
  }
}

function renderizarCarrito() {
  const container = document.getElementById("items-carrito");
  container.innerHTML = "";
  let totalUSD = 0;

  carrito.forEach((item, index) => {
    const subtotal = item.precio * item.cantidad;
    totalUSD += subtotal;

    const div = document.createElement("div");
    div.style.cssText = "display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;";
    div.innerHTML = `
      <span>${item.nombre} x${item.cantidad}</span>
      <strong>$${subtotal.toFixed(2)}</strong>
    `;
    container.appendChild(div);
  });

  const tasa = Number(storeConfig.tasa_cambio) || 1;
  const simAlt = storeConfig.simbolo_moneda_alt || "Bs.";

  document.getElementById("total-usd").textContent = `$${totalUSD.toFixed(2)}`;
  document.getElementById("total-bs").textContent = `${simAlt} ${(totalUSD * tasa).toFixed(2)}`;
}

function iniciarCheckout() {
  alert("Siguiente paso: Diseñar formulario de entrega/pickup y envío a WhatsApp.");
}
