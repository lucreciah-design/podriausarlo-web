import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---- CONFIGURACIÓN DEL NEGOCIO: cambiar acá para reusar este sitio con otro rubro ----
const WHATSAPP = "5492215424321";
const MENSAJE_WHATSAPP = (nombre) => `Hola! Te escribo por ${nombre}`;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let prendas = [];
let fotoIndices = {};
let lightboxPrenda = null;
let lightboxIdx = 0;
let sesionActiva = false;

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

// ---------- Catálogo (Firestore) ----------
async function cargarCatalogo() {
  const q = query(collection(db, "prendas"), orderBy("creado", "desc"));
  const snap = await getDocs(q);
  prendas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGrid();
  if (sesionActiva) renderListaAdmin();
}

async function guardarPrenda() {
  const nombre = document.getElementById("f_nombre").value.trim();
  const precio = document.getElementById("f_precio").value;
  const talle = document.getElementById("f_talle").value.trim();
  const descripcion = document.getElementById("f_descripcion").value.trim();
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

  let fotosBase64 = [];
  if (fotoInput.files && fotoInput.files.length) {
    const archivos = Array.from(fotoInput.files).slice(0, 4);
    fotosBase64 = await Promise.all(archivos.map(f => redimensionarImagen(f)));
  }

  await addDoc(collection(db, "prendas"), {
    nombre, precio: Number(precio), talle, descripcion,
    fotos: fotosBase64, reel, vendido: false, creado: Date.now()
  });

  aviso.textContent = "Prenda guardada.";
  document.getElementById("f_nombre").value = "";
  document.getElementById("f_precio").value = "";
  document.getElementById("f_talle").value = "";
  document.getElementById("f_descripcion").value = "";
  document.getElementById("f_reel").value = "";
  document.getElementById("f_foto").value = "";

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
        <p class="desc">${p.descripcion}</p>
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
        <button data-accion="toggle" data-id="${p.id}">${p.vendido ? 'Reactivar' : 'Marcar vendido'}</button>
        <button data-accion="eliminar" data-id="${p.id}">Eliminar</button>
      </div>
    </div>
  `).join("");

  cont.querySelectorAll("[data-accion='toggle']").forEach(b => b.addEventListener("click", () => toggleVendido(b.dataset.id)));
  cont.querySelectorAll("[data-accion='eliminar']").forEach(b => b.addEventListener("click", () => eliminarPrenda(b.dataset.id)));
}

// ---------- Lightbox (ampliar foto, deslizar / flechas) ----------
function abrirLightbox(id) {
  const p = prendas.find(x => x.id === id);
  if (!p || !p.fotos || p.fotos.length === 0) return;
  lightboxPrenda = p;
  lightboxIdx = fotoIndices[id] || 0;
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
}

function lightboxAnterior() { lightboxIdx -= 1; renderLightbox(); }
function lightboxSiguiente() { lightboxIdx += 1; renderLightbox(); }

// swipe táctil
let touchStartX = 0;
document.getElementById("lightboxImg")?.addEventListener?.("touchstart", () => {});
function initSwipe() {
  const img = document.getElementById("lightboxImg");
  img.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; });
  img.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { dx > 0 ? lightboxAnterior() : lightboxSiguiente(); }
  });
}

// ---------- Login / sesión ----------
function abrirLogin() {
  if (sesionActiva) {
    mostrarAdmin();
    return;
  }
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
  if (user) mostrarAdmin();
});

// ---------- Conexión de botones ----------
document.getElementById("btnAdminIcono").addEventListener("click", abrirLogin);
document.getElementById("btnCerrarLogin").addEventListener("click", cerrarLogin);
document.getElementById("btnIngresar").addEventListener("click", iniciarSesion);
document.getElementById("btnOlvide").addEventListener("click", recuperarPass);
document.getElementById("btnCerrarLightbox").addEventListener("click", cerrarLightbox);
document.getElementById("btnFlechaIzq").addEventListener("click", lightboxAnterior);
document.getElementById("btnFlechaDer").addEventListener("click", lightboxSiguiente);
document.getElementById("btnGuardarPrenda").addEventListener("click", guardarPrenda);
document.getElementById("btnCerrarSesion").addEventListener("click", () => { signOut(auth); mostrarVidriera(); });

initSwipe();
cargarCatalogo();
