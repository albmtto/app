/* ==============================================================
   MaintenancePRO · script.js
   ------------------------------------------------------------
   Lógica de la aplicación. Depende de config.js (debe cargarse
   antes que este archivo, ya que usa APP_CONFIG y EVENTOS_MOCK).

   Estructura:
     1. Navegación entre módulos (sidebar)
     2. Menú móvil (drawer)
     3. Pestañas (tabs) reutilizables
     4. Calendario anual de mantenimientos
     5. Inicialización

   A partir de aquí puedes ir añadiendo la lógica real de negocio
   (crear/editar OT, guardar equipos, generar reportes, etc.).
   Cada bloque está separado para que sea fácil ubicar dónde
   agregar tus funciones sin desordenar el resto.
   ============================================================== */

/* ==============================================================
   1. NAVEGACIÓN ENTRE MÓDULOS
   ============================================================== */
function initNavegacion() {
  const enlaces = document.querySelectorAll(APP_CONFIG.SELECTORES.enlacesNav);
  const secciones = document.querySelectorAll(APP_CONFIG.SELECTORES.secciones);

  function mostrarModulo(enlace) {
    enlaces.forEach(x => x.removeAttribute('aria-current'));
    secciones.forEach(s => s.hidden = true);
    enlace.setAttribute('aria-current', 'page');
    document.getElementById(enlace.dataset.mod).hidden = false;
  }

  enlaces.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      mostrarModulo(a);
      history.replaceState(null, '', a.getAttribute('href'));
      cerrarMenu();
    });
  });

  // Si la URL trae un hash (#equipos, #calendario, etc.), abrir ese módulo
  const inicial = location.hash.slice(1);
  if (inicial && document.getElementById(inicial)) {
    const enlaceInicial = document.querySelector(`[data-mod="${inicial}"]`);
    if (enlaceInicial) mostrarModulo(enlaceInicial);
  }
}

/* ==============================================================
   2. MENÚ MÓVIL (drawer derecho)
   ============================================================== */
let btnMenu, overlay;

function abrirMenu() {
  document.body.classList.add('menu-abierto');
  overlay.hidden = false;
  btnMenu.setAttribute('aria-expanded', 'true');
  btnMenu.setAttribute('aria-label', 'Cerrar menú de navegación');
}

function cerrarMenu() {
  if (!btnMenu || !overlay) return;
  document.body.classList.remove('menu-abierto');
  overlay.hidden = true;
  btnMenu.setAttribute('aria-expanded', 'false');
  btnMenu.setAttribute('aria-label', 'Abrir menú de navegación');
}

function initMenuMovil() {
  btnMenu = document.querySelector(APP_CONFIG.SELECTORES.btnMenu);
  overlay = document.querySelector(APP_CONFIG.SELECTORES.overlay);
  if (!btnMenu || !overlay) return;

  btnMenu.addEventListener('click', () => {
    document.body.classList.contains('menu-abierto') ? cerrarMenu() : abrirMenu();
  });
  overlay.addEventListener('click', cerrarMenu);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarMenu();
  });
}

/* ==============================================================
   3. PESTAÑAS (tabs) — funciona para cualquier grupo [role="tablist"]
   ============================================================== */
function initPestanas() {
  document.querySelectorAll(APP_CONFIG.SELECTORES.tablist).forEach(tablist => {
    const tabs = [...tablist.querySelectorAll(APP_CONFIG.SELECTORES.tab)];
    const paneles = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));

    function activarTab(i) {
      tabs.forEach((t, j) => {
        t.setAttribute('aria-selected', j === i);
        t.tabIndex = j === i ? 0 : -1;
      });
      paneles.forEach((p, j) => { if (p) p.hidden = j !== i; });
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activarTab(i));
      tab.addEventListener('keydown', e => {
        let destino = null;
        if (e.key === 'ArrowRight') destino = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') destino = (i - 1 + tabs.length) % tabs.length;
        if (destino !== null) {
          e.preventDefault();
          activarTab(destino);
          tabs[destino].focus();
        }
      });
    });
  });
}

/* ==============================================================
   4. CALENDARIO ANUAL DE MANTENIMIENTOS
   ============================================================== */
let anioVista;
let calGrid, calTitulo;

function renderCalendario() {
  if (!calGrid || !calTitulo) return;

  calTitulo.textContent = anioVista;
  calGrid.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const esMesActual = m === APP_CONFIG.HOY.getMonth() && anioVista === APP_CONFIG.HOY.getFullYear();
    const esPasado = anioVista < APP_CONFIG.HOY.getFullYear() ||
      (anioVista === APP_CONFIG.HOY.getFullYear() && m < APP_CONFIG.HOY.getMonth());

    const mes = document.createElement('article');
    mes.className = 'cal-mes' + (esMesActual ? ' actual' : '');
    if (esPasado) mes.style.opacity = '.55';

    const h = document.createElement('h3');
    h.textContent = APP_CONFIG.MESES[m];
    mes.appendChild(h);

    const ul = document.createElement('ul');
    ul.className = 'cal-mes-eventos';

    const eventos = (EVENTOS_MOCK[`${anioVista}-${m + 1}`] || []).slice().sort((a, b) => a.d - b.d);

    if (eventos.length === 0) {
      const li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = 'Sin mantenimientos programados';
      ul.appendChild(li);
    } else {
      eventos.forEach(ev => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.className = `cal-chip ${ev.c}`;
        span.textContent = `${ev.d} · ${ev.t} – ${APP_CONFIG.TIPO_LABEL[ev.c] || ev.c}`;
        li.appendChild(span);
        ul.appendChild(li);
      });
    }

    mes.appendChild(ul);
    calGrid.appendChild(mes);
  }
}

function initCalendario() {
  calGrid = document.querySelector(APP_CONFIG.SELECTORES.calGrid);
  calTitulo = document.querySelector(APP_CONFIG.SELECTORES.calTitulo);
  const calPrev = document.querySelector(APP_CONFIG.SELECTORES.calPrev);
  const calNext = document.querySelector(APP_CONFIG.SELECTORES.calNext);

  if (!calGrid || !calTitulo) return;

  anioVista = APP_CONFIG.HOY.getFullYear();

  if (calPrev) calPrev.addEventListener('click', () => { anioVista--; renderCalendario(); });
  if (calNext) calNext.addEventListener('click', () => { anioVista++; renderCalendario(); });

  renderCalendario();
}

/* ==============================================================
   5. CONFIGURACIÓN · LOGO DE LA EMPRESA
   ------------------------------------------------------------
   El logo se guarda como base64 en un único documento de Firestore
   (configuracion/empresa), siguiendo el mismo patrón de "fotos en
   base64" que usa el resto de la app (sin depender de Storage).
   ============================================================== */
let logoFileInput, logoPreviewImg;

function initLogo() {
  logoFileInput = document.getElementById('logo-file');
  logoPreviewImg = document.getElementById('logoActualImg');
  if (!logoFileInput || !logoPreviewImg) return;

  cargarLogoGuardado();
  logoFileInput.addEventListener('change', manejarSeleccionLogo);
}

async function cargarLogoGuardado() {
  try {
    const doc = await db.collection(APP_CONFIG.COLECCIONES.configuracion).doc('empresa').get();
    if (doc.exists && doc.data().logoBase64) {
      logoPreviewImg.src = doc.data().logoBase64;
    }
  } catch (err) {
    console.error('No se pudo cargar el logo guardado:', err);
  }
}

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

async function manejarSeleccionLogo(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;

  if (!APP_CONFIG.LOGO_TIPOS_PERMITIDOS.includes(archivo.type)) {
    alert('El logo debe ser un archivo PNG o SVG.');
    logoFileInput.value = '';
    return;
  }
  if (archivo.size > APP_CONFIG.LOGO_MAX_BYTES) {
    alert('El logo no debe superar 2 MB.');
    logoFileInput.value = '';
    return;
  }

  const srcAnterior = logoPreviewImg.src;
  try {
    const base64 = await leerArchivoComoBase64(archivo);
    logoPreviewImg.src = base64; // vista previa inmediata, antes de confirmar el guardado
    await db.collection(APP_CONFIG.COLECCIONES.configuracion).doc('empresa').set({
      logoBase64: base64,
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('Error al subir el logo:', err);
    logoPreviewImg.src = srcAnterior;
    alert('No se pudo guardar el logo. Inténtalo de nuevo.');
  } finally {
    logoFileInput.value = '';
  }
}

/* ==============================================================
   6. CONFIGURACIÓN · TÉCNICOS
   ------------------------------------------------------------
   CRUD (crear, listar, editar, eliminar) de técnicos en la
   colección "tecnicos" de Firestore. A diferencia de usuarios.js,
   los técnicos NO tienen cuenta de acceso (usuario/contraseña):
   son solo un registro de personal para asignar en OTs y reportes.
   ============================================================== */
let listaTecnicosEl, modalTecnico, formTecnico, modalTecnicoTitulo, modalTecnicoError,
    tecnicoIdEdicionInput, campoTecnicoNombre, campoTecnicoCargo,
    campoTecnicoFirma, tecnicoFirmaPreview, tecnicoFirmaVacia,
    btnAgregarTecnico, btnGuardarTecnico;

let tecnicoFirmaBase64Actual = null; // firma seleccionada pendiente de guardar (o ya guardada, en edición)

const FIRMA_MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const FIRMA_TIPOS_PERMITIDOS = ['image/png', 'image/jpeg'];

function cachearElementosTecnicos() {
  listaTecnicosEl = document.getElementById('listaTecnicos');
  modalTecnico = document.getElementById('modalTecnico');
  formTecnico = document.getElementById('formTecnico');
  modalTecnicoTitulo = document.getElementById('modalTecnicoTitulo');
  modalTecnicoError = document.getElementById('modalTecnicoError');
  tecnicoIdEdicionInput = document.getElementById('tecnicoIdEdicion');
  campoTecnicoNombre = document.getElementById('campoTecnicoNombre');
  campoTecnicoCargo = document.getElementById('campoTecnicoCargo');
  campoTecnicoFirma = document.getElementById('campoTecnicoFirma');
  tecnicoFirmaPreview = document.getElementById('tecnicoFirmaPreview');
  tecnicoFirmaVacia = document.getElementById('tecnicoFirmaVacia');
  btnAgregarTecnico = document.getElementById('btnAgregarTecnico');
  btnGuardarTecnico = document.getElementById('btnGuardarTecnico');
}

function inicialesTecnico(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2)
    .map(p => p[0].toUpperCase()).join('') || '--';
}

function crearTarjetaTecnico(id, datos) {
  const div = document.createElement('div');
  div.className = 'persona';
  div.setAttribute('role', 'listitem');
  div.dataset.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'p-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = inicialesTecnico(datos.nombre || '');

  const h3 = document.createElement('h3');
  h3.textContent = datos.nombre || '(sin nombre)';

  const spanCargo = document.createElement('span');
  spanCargo.className = 'rol';
  spanCargo.textContent = datos.cargo || '';

  const divDato = document.createElement('div');
  divDato.className = 'p-dato';
  if (datos.firmaBase64) {
    const btnVerFirma = document.createElement('button');
    btnVerFirma.className = 'btn secundario btn-chico';
    btnVerFirma.type = 'button';
    btnVerFirma.textContent = 'Ver firma';
    btnVerFirma.addEventListener('click', () => verFirmaTecnico(datos));
    divDato.appendChild(btnVerFirma);
  } else {
    const spanSinDato = document.createElement('span');
    spanSinDato.style.fontSize = 'var(--fs-xs)';
    spanSinDato.style.color = 'var(--text-muted)';
    spanSinDato.textContent = 'Sin firma cargada';
    divDato.appendChild(spanSinDato);
  }

  const acciones = document.createElement('div');
  acciones.className = 'doc-acciones';

  const btnEditar = document.createElement('button');
  btnEditar.className = 'btn secundario btn-chico';
  btnEditar.type = 'button';
  btnEditar.textContent = 'Editar';
  btnEditar.addEventListener('click', () => abrirModalEdicionTecnico(id, datos));

  const btnEliminar = document.createElement('button');
  btnEliminar.className = 'btn peligro btn-chico';
  btnEliminar.type = 'button';
  btnEliminar.textContent = 'Eliminar';
  btnEliminar.addEventListener('click', () => eliminarTecnico(id, datos));

  acciones.appendChild(btnEditar);
  acciones.appendChild(btnEliminar);

  div.appendChild(avatar);
  div.appendChild(h3);
  div.appendChild(spanCargo);
  div.appendChild(divDato);
  div.appendChild(acciones);
  return div;
}

function verFirmaTecnico(datos) {
  const ventana = window.open('', '_blank');
  if (!ventana) {
    alert('El navegador bloqueó la ventana emergente. Habilítala para ver la firma.');
    return;
  }
  ventana.document.write(
    `<title>Firma · ${datos.nombre || ''}</title>` +
    `<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9">` +
    `<img src="${datos.firmaBase64}" style="max-width:90vw;max-height:90vh;background:#fff;padding:16px;border-radius:8px">` +
    `</body>`
  );
}

function renderizarListaTecnicos(snapshot) {
  listaTecnicosEl.innerHTML = '';

  if (snapshot.empty) {
    const vacio = document.createElement('p');
    vacio.className = 'lista-vacia';
    vacio.textContent = 'Todavía no hay técnicos registrados.';
    listaTecnicosEl.appendChild(vacio);
    return;
  }

  snapshot.forEach(doc => {
    listaTecnicosEl.appendChild(crearTarjetaTecnico(doc.id, doc.data()));
  });
}

function initEscuchaTecnicos() {
  db.collection(APP_CONFIG.COLECCIONES.tecnicos)
    .orderBy('nombre')
    .onSnapshot(
      renderizarListaTecnicos,
      err => {
        console.error('Error al cargar técnicos:', err);
        listaTecnicosEl.innerHTML = '<p class="lista-vacia">No se pudo cargar la lista de técnicos.</p>';
      }
    );
}

function mostrarErrorModalTecnico(mensaje) {
  modalTecnicoError.textContent = mensaje;
  modalTecnicoError.hidden = false;
}

function ocultarErrorModalTecnico() {
  modalTecnicoError.hidden = true;
  modalTecnicoError.textContent = '';
}

function abrirModalCreacionTecnico() {
  formTecnico.reset();
  ocultarErrorModalTecnico();
  tecnicoIdEdicionInput.value = '';
  tecnicoFirmaBase64Actual = null;
  mostrarFirmaEnPreview(null);
  modalTecnicoTitulo.textContent = 'Agregar técnico';
  modalTecnico.hidden = false;
  campoTecnicoNombre.focus();
}

function abrirModalEdicionTecnico(id, datos) {
  formTecnico.reset();
  ocultarErrorModalTecnico();
  tecnicoIdEdicionInput.value = id;
  tecnicoFirmaBase64Actual = datos.firmaBase64 || null;
  mostrarFirmaEnPreview(tecnicoFirmaBase64Actual);
  modalTecnicoTitulo.textContent = 'Editar técnico';
  campoTecnicoNombre.value = datos.nombre || '';
  campoTecnicoCargo.value = datos.cargo || '';
  modalTecnico.hidden = false;
  campoTecnicoNombre.focus();
}

function mostrarFirmaEnPreview(base64) {
  if (base64) {
    tecnicoFirmaPreview.src = base64;
    tecnicoFirmaPreview.style.display = 'block';
    tecnicoFirmaVacia.style.display = 'none';
  } else {
    tecnicoFirmaPreview.src = '';
    tecnicoFirmaPreview.style.display = 'none';
    tecnicoFirmaVacia.style.display = 'block';
  }
}

async function manejarSeleccionFirmaTecnico(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;

  if (!FIRMA_TIPOS_PERMITIDOS.includes(archivo.type)) {
    alert('La firma debe ser una imagen PNG o JPG.');
    campoTecnicoFirma.value = '';
    return;
  }
  if (archivo.size > FIRMA_MAX_BYTES) {
    alert('La imagen de la firma no debe superar 1 MB.');
    campoTecnicoFirma.value = '';
    return;
  }

  try {
    const base64 = await leerArchivoComoBase64(archivo);
    tecnicoFirmaBase64Actual = base64; // se guarda al enviar el formulario
    mostrarFirmaEnPreview(base64);
  } catch (err) {
    console.error('Error al leer la imagen de la firma:', err);
    alert('No se pudo leer la imagen. Inténtalo de nuevo.');
  } finally {
    campoTecnicoFirma.value = '';
  }
}

function cerrarModalTecnico() {
  modalTecnico.hidden = true;
  formTecnico.reset();
  tecnicoFirmaBase64Actual = null;
  ocultarErrorModalTecnico();
}

async function manejarSubmitTecnico(e) {
  e.preventDefault();
  ocultarErrorModalTecnico();

  const idEdicion = tecnicoIdEdicionInput.value;
  const nombre = campoTecnicoNombre.value.trim();
  const cargo = campoTecnicoCargo.value.trim();

  if (!nombre) {
    mostrarErrorModalTecnico('Escribe el nombre completo.');
    return;
  }
  if (!cargo) {
    mostrarErrorModalTecnico('Escribe el cargo del técnico.');
    return;
  }

  btnGuardarTecnico.disabled = true;
  const textoOriginal = btnGuardarTecnico.textContent;
  btnGuardarTecnico.textContent = 'Guardando…';

  try {
    const datos = { nombre, cargo, firmaBase64: tecnicoFirmaBase64Actual || null };
    if (idEdicion) {
      await db.collection(APP_CONFIG.COLECCIONES.tecnicos).doc(idEdicion).update(datos);
    } else {
      datos.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(APP_CONFIG.COLECCIONES.tecnicos).add(datos);
    }
    cerrarModalTecnico();
  } catch (err) {
    console.error('Error al guardar técnico:', err);
    mostrarErrorModalTecnico('No se pudo guardar el técnico. Inténtalo de nuevo.');
  } finally {
    btnGuardarTecnico.disabled = false;
    btnGuardarTecnico.textContent = textoOriginal;
  }
}

async function eliminarTecnico(id, datos) {
  const confirmado = confirm(`¿Eliminar al técnico "${datos.nombre || ''}"?`);
  if (!confirmado) return;

  try {
    await db.collection(APP_CONFIG.COLECCIONES.tecnicos).doc(id).delete();
  } catch (err) {
    console.error('Error al eliminar técnico:', err);
    alert('No se pudo eliminar el técnico. Inténtalo de nuevo.');
  }
}

function initTecnicos() {
  cachearElementosTecnicos();
  if (!listaTecnicosEl || !modalTecnico) return;

  btnAgregarTecnico.addEventListener('click', abrirModalCreacionTecnico);
  formTecnico.addEventListener('submit', manejarSubmitTecnico);
  campoTecnicoFirma.addEventListener('change', manejarSeleccionFirmaTecnico);

  modalTecnico.querySelectorAll('[data-cerrar-modal]').forEach(el => {
    el.addEventListener('click', cerrarModalTecnico);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalTecnico.hidden) cerrarModalTecnico();
  });

  initEscuchaTecnicos();
}

/* ==============================================================
   7. INICIALIZACIÓN
   ============================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initNavegacion();
  initMenuMovil();
  initPestanas();
  initCalendario();
  initLogo();
  initTecnicos();

  // TODO: aquí es donde puedes ir conectando la lógica real de
  // negocio, por ejemplo:
  //   initDashboard();     -> cargar KPIs desde la API
  //   initEquipos();       -> CRUD de equipos y hoja de vida
  //   initGenerarOT();     -> formulario para crear órdenes de trabajo
  //   initEjecutarOT();    -> flujo de ejecución de OT
  //   initReportes();      -> generación de reportes
  //   (logo y técnicos ya están conectados arriba)
});