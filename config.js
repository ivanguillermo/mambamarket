// config.js - Configuración general de la tienda
window.STORE_CONFIG= {
  nombre_tienda: "Mamba Market",
  tasa_cambio: 755,
  simbolo_moneda_alt: "Bs.",
  zonas_delivery: [],
  mensaje_bienvenida: "¡Bienvenidos a Mamba Market! Tu bodega y supermercado online.",
  horarios_entrega: "Lunes a Sábado: 8:00 AM - 7:00 PM",
  url_logo: "https://ivanguillermo.github.io/mambamarket/assets/mamba_logo.jpg",
  // Configuración de Zonas de Delivery (Zonas en Yaracuy / San Felipe como ejemplo)
  zonas_delivery: [
    { id: "centro", nombre: "San Felipe Centro", tarifa_base: 1.00, peso_incluido_kg: 3 },
    { id: "norte", nombre: "Sector Norte / Cují", tarifa_base: 1.50, peso_incluido_kg: 3 },
    { id: "periferia", nombre: "Zonas Aledañas / Afueras", tarifa_base: 2.50, peso_incluido_kg: 2 }
  ],
  costo_por_kg_extra: 0.50 // Si supera el peso base, se cobra adicional por kilo
};



 
