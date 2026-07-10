import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, getDoc, setDoc, doc, updateDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---- CONFIGURACIÓN DEL NEGOCIO: cambiar acá para reusar este sitio con otro rubro ----
const WHATSAPP = "5492215424321";
const MENSAJE_WHATSAPP = (nombre) => `Hola! Te escribo por ${nombre}`;

const PALETAS = {
  calida:  { fondo: "var(--tan2)",  precio: "var(--oliva)",      acento: "var(--terracota)" },
  durazno: { fondo: "var(--flesh)", precio: "var(--brownsugar)", acento: "var(--ebony)" },
  palida:  { fondo: "var(--crema)", precio: "var(--ebony)",      acento: "var(--terracota)" }
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

let prendas = [];
let fotoIndices = {};
let lightboxPrenda = null;
let lightboxIdx = 0;
let sesionActiva = false;
let editandoId = null;
let fotosEnEdicion = [];
let zoomActivo = false;
let configSitio = {};

// ---------- Utilidades ----------
function iconoPercha() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="#2A2622" stroke-width="1.3"><path d="M8 3l4 2 4-2 3 4-3 2v11H5V9L2 7z"/></svg>';
}

function formatoPrecio(n) {
  return "$ " + Number(n).toLocaleString("es-AR");
}

function redimensionarImagen(file, maxWidth = 700, calidad = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Configuración del sitio (nombre, tagline, ciudad, paleta) ----------
function aplicarPaleta(nombre) {
  const p = PALETAS[nombre] || PALETAS.calida;
  document.documentElement.style.setProperty("--fondo", p.fondo);
  document.documentElement.style.setProperty("--precio-bg", p.precio);
  document.documentElement.style.setProperty("--acento", p.acento);
}

function aplicarConfigUI() {
  document.getElementById("txtNombre").textContent = configSitio.nombre || "podriausarlo";
  document.getElementById("txtTagline").textContent = configSitio.tagline || "ropa usada, vintage, excelente estado";
  document.getElementById("txtCiudad").textContent = configSitio.ciudad || "La Plata, Buenos Aires";
  document.title = (configSitio.nombre || "podriausarlo");
  aplicarPaleta(configSitio.paleta || "calida");

  document.getElementById("cfg_nombre").value = configSitio.nombre || "";
  document.getElementById("cfg_tagline").value = configSitio.tagline || "";
  document.getElementById("cfg_ciudad").value = configSitio.ciudad || "";
  document.getElementById("cfg_paleta").value = configSitio.paleta || "calida";
}

async function cargarConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "sitio"));
    if (snap.exists()) configSitio = snap.data();
  } catch (e) { /* todavía no existe, se usan los valores por defecto */ }
  aplicarConfigUI();
}

async function guardarConfiguracion() {
  configSitio = {
    nombre: document.getElementById("cfg_nombre").value.trim(),
    tagline: document.getElementById("cfg_tagline").value.trim(),
    ciudad: document.getElementById("cfg_ciudad").value.trim(),
    paleta: document.getElementById("cfg_paleta").value
  };
  await setDoc(doc(db, "config", "sitio"), configSitio);
  aplicarConfigUI();
  const aviso = document.getElementById("avisoConfig");
  aviso.style.display = "block";
  aviso.textContent = "Configuración guardada.";
}

// ---------- Catálogo (Firestore) ----------
async function cargarCatalogo() {
  const q = query(collection(db, "prendas"), orderBy("creado", "desc"));
  const snap = await getDocs(q);
  prendas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGrid();
  if (sesionActiva) renderListaAdmin();
}

function limpiarFormPrenda() {
  document.getElementById("f_nombre").value = "";
  document.getElementById("f_precio").value = "";
  document.getElementById("f_talle").value = "";
  document.getElementById("f_descripcion").value = "";
  document.getElementById("f_observaciones").value = "";
  document.getElementById("f_reel").value = "";
  document.getElementById("f_foto").value = "";
}

function renderFotosExistentes() {
  const cont = document.getElementById("fotosExistentes");
  const contWrap = document.getElementById("fotosExistentesCont");
  contWrap.style.display = fotosEnEdicion.length ? "block" : "none";
  cont.innerHTML = fotosEnEdicion.map((foto, i) => `
    <div class="foto-existente">
      <img src="${foto}" alt="">
      <div class="fila-botones">
        <button data-idx="${i}" data-accion="izq" ${i === 0 ? "disabled" : ""}>&#8249;</button>
        <button data-idx="${i}" data-accion="borrar">&#10005;</button>
        <button data-idx="${i}" data-accion="der" ${i === fotosEnEdicion.length - 1 ? "disabled" : ""}>&#8250;</button>
      </div>
    </div>
  `).join("");
  cont.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.idx);
      if (b.dataset.accion === "izq" && i > 0) { [fotosEnEdicion[i - 1], fotosEnEdicion[i]] = [fotosEnEdicion[i], fotosEnEdicion[i - 1]]; }
      if (b.dataset.accion === "der" && i < fotosEnEdicion.length - 1) { [fotosEnEdicion[i + 1], fotosEnEdicion[i]] = [fotosEnEdicion[i], fotosEnEdicion[i + 1]]; }
      if (b.dataset.accion === "borrar") { fotosEnEdicion.splice(i, 1); }
      renderFotosExistentes();
    });
  });
}

function editarPrenda(id) {
  const p = prendas.find(x => x.id === id);
  if (!p) return;
  editandoId = id;
  fotosEnEdicion = [...(p.fotos || [])];

  document.getElementById("f_nombre").value = p.nombre || "";
  document.getElementById("f_precio").value = p.precio || "";
  document.getElementById("f_talle").value = p.talle || "";
  document.getElementById("f_descripcion").value = p.descripcion || "";
  document.getElementById("f_observaciones").value = p.observaciones || "";
  document.getElementById("f_reel").value = p.reel || "";
  document.getElementById("f_foto").value = "";

  document.getElementById("tituloFormPrenda").textContent = "Editar prenda";
  document.getElementById("btnGuardarPrenda").textContent = "Guardar cambios";
  document.getElementById("btnCancelarEdicion").style.display = "block";
  document.getElementById("labelFotos").textContent = "Agregar más fotos (opcional)";

  renderFotosExistentes();
  document.getElementById("f_nombre").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelarEdicion() {
  editandoId = null;
  fotosEnEdicion = [];
  document.getElementById("tituloFormPrenda").textContent = "Cargar prenda nueva";
  document.getElementById("btnGuardarPrenda").textContent = "Guardar prenda";
  document.getElementById("btnCancelarEdicion").style.display = "none";
  document.getElementById("labelFotos").textContent = "Fotos (hasta 4)";
  document.getElementById("fotosExistentesCont").style.display = "none";
  limpiarFormPrenda();
}

async function guardarPrenda() {
  const nombre = document.getElementById("f_nombre").value.trim();
  const precio = document.getElementById("f_precio").value;
  const talle = document.getElementById("f_talle").value.trim();
  const descripcion = document.getElementById("f_descripcion").value.trim();
  const observaciones = document.getElementById("f_observaciones").value.trim();
  const reel = document.getElementById("f_reel").value.trim();
  const fotoInput = document.getElementById("f_foto");
  const aviso = document.getElementById("avisoGuardado");

  if (!nombre || !precio) {
    aviso.style.display = "block";
    aviso.textContent = "Faltan el nombre o el precio.";
    return;
  }

  aviso.style.display = "block";
  aviso.textContent = "Guardando...";

  let nuevasFotos = [];
  if (fotoInput.files && fotoInput.files.length) {
    nuevasFotos = await Promise.all(Array.from(fotoInput.files).map(f => redimensionarImagen(f)));
  }
  const fotosFinal = [...fotosEnEdicion, ...nuevasFotos].slice(0, 4);
  const datos = { nombre, precio: Number(precio), talle, descripcion, observaciones, fotos: fotosFinal, reel };

  if (editandoId) {
    await updateDoc(doc(db, "prendas", editandoId), datos);
    aviso.textContent = "Cambios guardados.";
  } else {
    await addDoc(collection(db, "prendas"), { ...datos, vendido: false, creado: Date.now() });
    aviso.textContent = "Prenda guardada.";
  }

  cancelarEdicion();
  await cargarCatalogo();
}

async function toggleVendido(id) {
  const p = prendas.find(x => x.id === id);
  if (!p) return;
  await updateDoc(doc(db, "prendas", id), { vendido: !p.vendido });
  await cargarCatalogo();
}

async function eliminarPrenda(id) {
  if (!confirm("¿Eliminar esta prenda? No se puede deshacer.")) return;
  if (editandoId === id) cancelarEdicion();
  await deleteDoc(doc(db, "prendas", id));
  await cargarCatalogo();
}

// ---------- Render vidriera ----------
function cardFotoHTML(p) {
  const fotos = p.fotos || [];
  if (fotos.length === 0) return iconoPercha();
  const idx = (fotoIndices[p.id] || 0) % fotos.length;
  let html = `<img src="${fotos[idx]}" alt="${p.nombre}">`;
  if (fotos.length > 1) {
    html += `<div class="dots">` + fotos.map((_, i) => `<span class="dot ${i === idx ? 'activo' : ''}"></span>`).join("") + `</div>`;
  }
  return html;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const vacio = document.getElementById("vacio");
  if (prendas.length === 0) {
    grid.innerHTML = "";
    vacio.style.display = "block";
    return;
  }
  vacio.style.display = "none";
  grid.innerHTML = prendas.map(p => `
    <div class="card ${p.vendido ? 'vendido' : ''}">
      <div class="photo" data-id="${p.id}">
        ${cardFotoHTML(p)}
        ${p.vendido ? '<div class="sold-stamp">vendido</div>' : ''}
      </div>
      <div class="price-tag">${formatoPrecio(p.precio)}</div>
      <div class="info">
        <p class="nombre">${p.nombre}</p>
        <p class="detalle">Talle ${p.talle}</p>
        <p class="desc">${p.descripcion || ""}</p>
        ${p.observaciones ? `<p class="obs">${p.observaciones}</p>` : ''}
        <div class="acciones">
          ${p.reel ? `<a class="btn" href="${p.reel}" target="_blank">Ver en IG</a>` : ''}
          <a class="btn whatsapp" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MENSAJE_WHATSAPP(p.nombre))}" target="_blank">Consultar</a>
        </div>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".photo").forEach(el => {
    el.addEventListener("click", () => abrirLightbox(el.dataset.id));
  });
}

function renderListaAdmin() {
  const cont = document.getElementById("listaAdmin");
  if (prendas.length === 0) {
    cont.innerHTML = '<p style="font-size:13px; color:var(--carbon-soft);">Todavía no cargaste ninguna prenda.</p>';
    return;
  }
  cont.innerHTML = prendas.map(p => `
    <div class="lista-admin-item">
      <div class="mini-foto" style="background-image:url('${(p.fotos && p.fotos[0]) || ''}')"></div>
      <div class="lista-admin-info">
        <p class="li-nombre">${p.nombre}</p>
        <p class="li-precio">${formatoPrecio(p.precio)} · talle ${p.talle}</p>
      </div>
      <span class="badge-estado ${p.vendido ? 'vendido' : ''}">${p.vendido ? 'vendido' : 'disponible'}</span>
      <div class="li-botones">
        <button data-accion="editar" data-id="${p.id}">Editar</button>
        <button data-accion="toggle" data-id="${p.id}">${p.vendido ? 'Reactivar' : 'Marcar vendido'}</button>
        <button data-accion="eliminar" data-id="${p.id}">Eliminar</button>
      </div>
    </div>
  `).join("");

  cont.querySelectorAll("[data-accion='editar']").forEach(b => b.addEventListener("click", () => editarPrenda(b.dataset.id)));
  cont.querySelectorAll("[data-accion='toggle']").forEach(b => b.addEventListener("click", () => toggleVendido(b.dataset.id)));
  cont.querySelectorAll("[data-accion='eliminar']").forEach(b => b.addEventListener("click", () => eliminarPrenda(b.dataset.id)));
}

// ---------- Lightbox (ampliar foto, deslizar / flechas / zoom) ----------
function abrirLightbox(id) {
  const p = prendas.find(x => x.id === id);
  if (!p || !p.fotos || p.fotos.length === 0) return;
  lightboxPrenda = p;
  lightboxIdx = fotoIndices[id] || 0;
  zoomActivo = false;
  document.getElementById("lightboxBox").classList.remove("zoom");
  document.getElementById("lightbox").style.display = "flex";
  renderLightbox();
}

function renderLightbox() {
  if (!lightboxPrenda) return;
  const fotos = lightboxPrenda.fotos;
  lightboxIdx = (lightboxIdx + fotos.length) % fotos.length;
  document.getElementById("lightboxImg").src = fotos[lightboxIdx];
  const dotsCont = document.getElementById("lightboxDots");
  dotsCont.innerHTML = fotos.length > 1
    ? fotos.map((_, i) => `<span class="dot ${i === lightboxIdx ? 'activo' : ''}"></span>`).join("")
    : "";
  document.querySelector("#lightbox .flecha.izq").style.display = fotos.length > 1 ? "flex" : "none";
  document.querySelector("#lightbox .flecha.der").style.display = fotos.length > 1 ? "flex" : "none";
}

function cerrarLightbox() {
  document.getElementById("lightbox").style.display = "none";
  if (lightboxPrenda) fotoIndices[lightboxPrenda.id] = lightboxIdx;
  lightboxPrenda = null;
  zoomActivo = false;
  document.getElementById("lightboxBox").classList.remove("zoom");
}

function lightboxAnterior() { zoomActivo = false; document.getElementById("lightboxBox").classList.remove("zoom"); lightboxIdx -= 1; renderLightbox(); }
function lightboxSiguiente() { zoomActivo = false; document.getElementById("lightboxBox").classList.remove("zoom"); lightboxIdx += 1; renderLightbox(); }

function toggleZoom() {
  zoomActivo = !zoomActivo;
  document.getElementById("lightboxBox").classList.toggle("zoom", zoomActivo);
}

let touchStartX = 0;
function initSwipe() {
  const img = document.getElementById("lightboxImg");
  img.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; });
  img.addEventListener("touchend", (e) => {
    if (zoomActivo) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { dx > 0 ? lightboxAnterior() : lightboxSiguiente(); }
  });
  img.addEventListener("dblclick", toggleZoom);
}

// ---------- Login / sesión ----------
function abrirLogin() {
  if (sesionActiva) { mostrarAdmin(); return; }
  document.getElementById("loginModal").style.display = "flex";
}

function cerrarLogin() {
  document.getElementById("loginModal").style.display = "none";
}

async function iniciarSesion() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const aviso = document.getElementById("loginAviso");
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    cerrarLogin();
  } catch (e) {
    aviso.style.display = "block";
    aviso.textContent = "Mail o contraseña incorrectos.";
  }
}

async function recuperarPass() {
  const email = document.getElementById("loginEmail").value.trim();
  const aviso = document.getElementById("loginAviso");
  if (!email) {
    aviso.style.display = "block";
    aviso.textContent = "Escribí tu mail arriba primero.";
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    aviso.style.display = "block";
    aviso.textContent = "Te mandamos un mail para crear una nueva contraseña.";
  } catch (e) {
    aviso.style.display = "block";
    aviso.textContent = "No pudimos enviar el mail. Revisá que esté bien escrito.";
  }
}

function mostrarAdmin() {
  document.getElementById("vidriera").style.display = "none";
  document.getElementById("admin").style.display = "block";
  renderListaAdmin();
}

function mostrarVidriera() {
  document.getElementById("admin").style.display = "none";
  document.getElementById("vidriera").style.display = "block";
}

onAuthStateChanged(auth, (user) => {
  sesionActiva = !!user;
});

// ---------- Conexión de botones ----------
document.getElementById("btnAdminIcono").addEventListener("click", abrirLogin);
document.getElementById("btnCerrarLogin").addEventListener("click", cerrarLogin);
document.getElementById("btnIngresar").addEventListener("click", iniciarSesion);
document.getElementById("btnOlvide").addEventListener("click", recuperarPass);
document.getElementById("btnCerrarLightbox").addEventListener("click", cerrarLightbox);
document.getElementById("btnZoom").addEventListener("click", toggleZoom);
document.getElementById("btnFlechaIzq").addEventListener("click", lightboxAnterior);
document.getElementById("btnFlechaDer").addEventListener("click", lightboxSiguiente);
document.getElementById("btnGuardarPrenda").addEventListener("click", guardarPrenda);
document.getElementById("btnCancelarEdicion").addEventListener("click", cancelarEdicion);
document.getElementById("btnGuardarConfig").addEventListener("click", guardarConfiguracion);
document.getElementById("btnVerVidriera").addEventListener("click", mostrarVidriera);
document.getElementById("btnCerrarSesion").addEventListener("click", () => { signOut(auth); mostrarVidriera(); });

initSwipe();
cargarConfig();
cargarCatalogo();
