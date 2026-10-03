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
   0. CARGA DIFERIDA DE LIBRERÍAS PESADAS (xlsx, jsPDF)
   ------------------------------------------------------------
   xlsx (~1 MB) y jsPDF (~350 KB) solo se necesitan cuando el
   usuario importa/exporta Excel o genera/ve un PDF. En vez de
   cargarlas siempre en el <head>/<body> (alargando la carga
   inicial de toda la app), las inyectamos dinámicamente la
   primera vez que hacen falta y reutilizamos la misma promesa
   si ya se cargaron o se están cargando.
   ============================================================== */
const LIBRERIAS_CDN = {
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'jspdf-autotable': 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
};
const promesasLibrerias = {};

function cargarLibreria(nombre) {
  if (promesasLibrerias[nombre]) return promesasLibrerias[nombre];
  promesasLibrerias[nombre] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIBRERIAS_CDN[nombre];
    script.onload = () => resolve();
    script.onerror = () => {
      delete promesasLibrerias[nombre]; // permite reintentar si falló (ej. sin internet)
      reject(new Error(`No se pudo cargar la librería "${nombre}".`));
    };
    document.head.appendChild(script);
  });
  return promesasLibrerias[nombre];
}

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

    // Cada vez que se entra a "Generar reporte" se reinicia el
    // asistente en el paso 1 (por si había quedado a mitad de camino
    // en una visita anterior).
    if (enlace.dataset.mod === 'reporte' && typeof repIrAPaso === 'function') {
      repIrAPaso(1);
    }
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
   1.1 PERMISOS POR ROL
   ------------------------------------------------------------
   Los usuarios con rol "Técnico" solo deben poder ver el
   módulo de Generar Reporte. Se llama desde auth.js
   (initEscuchaSesion) apenas se conoce el perfil.
   ============================================================== */
const MODULOS_PERMITIDOS_TECNICO = ['reporte'];

function aplicarPermisosPorRol(perfil) {
  const enlaces = document.querySelectorAll(APP_CONFIG.SELECTORES.enlacesNav);

  // Primero restauramos todos los enlaces (por si un usuario anterior en
  // esta misma sesión de navegador era Técnico y quedaron ocultos).
  enlaces.forEach(a => {
    if (a.dataset.mod) a.style.display = '';
  });

  if (!perfil || perfil.rol !== 'Técnico') return; // Administrador ve todo

  enlaces.forEach(a => {
    if (a.dataset.mod && !MODULOS_PERMITIDOS_TECNICO.includes(a.dataset.mod)) {
      a.style.display = 'none';
    }
  });

  // Si el módulo visible en este momento no está permitido, saltar
  // al primero que sí lo esté.
  const actual = document.querySelector(`${APP_CONFIG.SELECTORES.enlacesNav}[aria-current="page"]`);
  if (!actual || (actual.dataset.mod && !MODULOS_PERMITIDOS_TECNICO.includes(actual.dataset.mod))) {
    const permitido = document.querySelector(`[data-mod="${MODULOS_PERMITIDOS_TECNICO[0]}"]`);
    if (permitido) permitido.click();
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
   ------------------------------------------------------------
   Ya no usa datos de ejemplo (EVENTOS_MOCK). Se alimenta de dos
   fuentes reales:
     - Preventivo / Metrología -> equiposCache (mismo caché que
       usan la pestaña "Lista de equipos" y el cronograma), leyendo
       mantenimiento.meses / certificacion.meses de cada equipo.
     - Correctivo -> colección "reportes" (los reportes de tipo
       "Correctivo" que se generan en Generar Orden), que sí traen
       una fecha exacta con día.
   ============================================================== */
let anioVista;
let calGrid, calTitulo;
let reportesCorrectivosCache = []; // reportes tipo "Correctivo" de todos los años (se filtra por año al renderizar)

// Junta, para un mes puntual (1-12) de un año, los eventos de las tres fuentes.
function obtenerEventosMes(anio, mes) {
  const eventos = [];

  equiposCache.forEach(datos => {
    const nombreEquipo = datos.nombre || '—';
    const codigoEquipo = datos.codigo || '—';
    const equipoTexto = `${codigoEquipo} ${nombreEquipo}`;

    const mesesMant = (datos.mantenimiento && datos.mantenimiento.meses) || [];
    if (mesesMant.includes(mes)) {
      eventos.push({
        t: equipoTexto,
        c: 'preventivo'
      });
    }

    const mesesCert = (datos.certificacion && datos.certificacion.meses) || [];
    if (mesesCert.includes(mes)) {
      eventos.push({
        t: equipoTexto,
        c: 'metrologia'
      });
    }
  });

  reportesCorrectivosCache.forEach(r => {
    if (!r.fecha) return;

    const [y, m, d] = r.fecha.split('-').map(Number);

    if (y === anio && m === mes) {
      const nombreEquipo = r.equipoNombre || '—';
      const codigoEquipo = r.equipoCodigo || '—';

      eventos.push({
        d,
        t: `${codigoEquipo} ${nombreEquipo}`,
        c: 'correctivo'
      });
    }
  });

  // Orden solicitado: primero Correctivos (ordenados por día), después
  // Preventivos (alfabético) y por último Metrología (alfabético).
  const ORDEN_TIPO = { correctivo: 0, preventivo: 1, metrologia: 2 };
  return eventos.sort((a, b) => {
    const ordenTipo = (ORDEN_TIPO[a.c] ?? 9) - (ORDEN_TIPO[b.c] ?? 9);
    if (ordenTipo !== 0) return ordenTipo;
    if (a.c === 'correctivo') return (a.d || 99) - (b.d || 99) || a.t.localeCompare(b.t);
    return a.t.localeCompare(b.t);
  });
}

const CAL_MAX_EVENTOS_VISIBLES = 5;

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

    const eventos = obtenerEventosMes(anioVista, m + 1);

    if (eventos.length === 0) {
      const li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = 'Sin mantenimientos programados';
      ul.appendChild(li);
    } else {
      eventos.slice(0, CAL_MAX_EVENTOS_VISIBLES).forEach(ev => {
        ul.appendChild(crearItemEventoCalendario(ev));
      });
      if (eventos.length > CAL_MAX_EVENTOS_VISIBLES) {
        const li = document.createElement('li');
        li.className = 'vacio';
        li.style.cursor = 'pointer';
        li.style.textDecoration = 'underline';
        li.textContent = `+${eventos.length - CAL_MAX_EVENTOS_VISIBLES} más…`;
        ul.appendChild(li);
      }
    }

    if (eventos.length > 0) {
      mes.style.cursor = 'pointer';
      mes.title = 'Ver todos los mantenimientos programados de este mes';
      mes.addEventListener('click', () => abrirModalMesCalendario(APP_CONFIG.MESES[m], anioVista, eventos));
    }

    mes.appendChild(ul);
    calGrid.appendChild(mes);
  }
}

function crearItemEventoCalendario(ev) {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.className = `cal-chip ${ev.c}`;
  const prefijo = ev.d ? `${ev.d} · ` : '';
  span.textContent = `${prefijo}${ev.t} – ${APP_CONFIG.TIPO_LABEL[ev.c] || ev.c}`;
  li.appendChild(span);
  return li;
}

/* ---------- Modal: todos los mantenimientos programados de un mes ---------- */
let modalMesCalendario, modalMesCalendarioTitulo, modalMesCalendarioLista;

function cachearElementosModalMes() {
  modalMesCalendario = document.getElementById('modalMesCalendario');
  modalMesCalendarioTitulo = document.getElementById('modalMesCalendarioTitulo');
  modalMesCalendarioLista = document.getElementById('modalMesCalendarioLista');
}

function abrirModalMesCalendario(nombreMes, anio, eventos) {
  if (!modalMesCalendario) return;
  modalMesCalendarioTitulo.textContent = `Mantenimientos programados · ${nombreMes} ${anio}`;
  modalMesCalendarioLista.innerHTML = '';
  eventos.forEach(ev => modalMesCalendarioLista.appendChild(crearItemEventoCalendario(ev)));
  modalMesCalendario.hidden = false;
}

function cerrarModalMesCalendario() {
  if (modalMesCalendario) modalMesCalendario.hidden = true;
}

function initModalMesCalendario() {
  cachearElementosModalMes();
  if (!modalMesCalendario) return;
  modalMesCalendario.querySelectorAll('[data-cerrar-modal]').forEach(el => {
    el.addEventListener('click', cerrarModalMesCalendario);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalMesCalendario.hidden) cerrarModalMesCalendario();
  });
}

// Escucha en tiempo real solo los reportes de tipo "Correctivo" (son los
// únicos que el calendario necesita de esta colección). Se guardan todos
// sin filtrar por año: el filtro por año se hace al renderizar, así no
// hay que reabrir el listener cada vez que el usuario cambia de año.
function initEscuchaReportesCorrectivos() {
  db.collection(APP_CONFIG.COLECCIONES.reportes)
    .where('tipo', '==', 'Correctivo')
    .onSnapshot(
      snapshot => {
        reportesCorrectivosCache = snapshot.docs.map(doc => doc.data());
        renderCalendario();
      },
      err => console.error('Error al cargar los reportes correctivos para el calendario:', err)
    );
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
  initEscuchaReportesCorrectivos();
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
  div.appendChild(acciones);
  return div;
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
      snapshot => {
        renderizarListaTecnicos(snapshot);
        actualizarSelectsTecnicos(snapshot); // alimenta "Quien realiza" y "Quien aprueba" con el mismo snapshot
      },
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
   7. EQUIPOS · PESTAÑA "LISTA DE EQUIPOS"
   ------------------------------------------------------------
   La lista vive en la colección "equipos" de Firestore. Cada
   documento usa como ID el propio código del equipo/área (EQ-001,
   AR-001...), así que importar el mismo Excel dos veces actualiza
   en vez de duplicar filas.
   Campos por documento: { codigo, nombre, ubicacion, tipo }
   ============================================================== */
let tablaEquiposBody, equiposImportarInput, equiposImportarEstado, btnExportarEquiposExcel, equiposBuscadorInput;
let modalEquipo, formEquipo, modalEquipoTitulo, modalEquipoError, equipoCodigoEdicionInput,
    campoEquipoCodigo, campoEquipoNombre, campoEquipoUbicacion, campoEquipoTipo,
    btnAgregarEquipo, btnGuardarEquipo;
let modalImportarEquipos, btnImportarEquiposExcel, btnElegirArchivoEquipos, btnDescargarPlantillaEquipos;
let campoEquipoFrecuencia, campoEquipoMesInicioWrap, campoEquipoMesInicio, previewMesesMantenimiento,
    fieldsetCertificacion, campoEquipoFrecuenciaCert, campoEquipoMesInicioCert, previewMesesCertificacion;
let equiposCache = []; // último snapshot leído, para exportar sin volver a consultar Firestore

function cachearElementosEquipos() {
  tablaEquiposBody = document.getElementById('tablaEquiposBody');
  equiposImportarInput = document.getElementById('equiposImportarInput');
  equiposImportarEstado = document.getElementById('equiposImportarEstado');
  btnExportarEquiposExcel = document.getElementById('btnExportarEquiposExcel');
  equiposBuscadorInput = document.getElementById('equiposBuscador');

  modalImportarEquipos = document.getElementById('modalImportarEquipos');
  btnImportarEquiposExcel = document.getElementById('btnImportarEquiposExcel');
  btnElegirArchivoEquipos = document.getElementById('btnElegirArchivoEquipos');
  btnDescargarPlantillaEquipos = document.getElementById('btnDescargarPlantillaEquipos');

  modalEquipo = document.getElementById('modalEquipo');
  formEquipo = document.getElementById('formEquipo');
  modalEquipoTitulo = document.getElementById('modalEquipoTitulo');
  modalEquipoError = document.getElementById('modalEquipoError');
  equipoCodigoEdicionInput = document.getElementById('equipoCodigoEdicion');
  campoEquipoCodigo = document.getElementById('campoEquipoCodigo');
  campoEquipoNombre = document.getElementById('campoEquipoNombre');
  campoEquipoUbicacion = document.getElementById('campoEquipoUbicacion');
  campoEquipoTipo = document.getElementById('campoEquipoTipo');
  btnAgregarEquipo = document.getElementById('btnAgregarEquipo');
  btnGuardarEquipo = document.getElementById('btnGuardarEquipo');

  campoEquipoFrecuencia = document.getElementById('campoEquipoFrecuencia');
  campoEquipoMesInicioWrap = document.getElementById('campoEquipoMesInicioWrap');
  campoEquipoMesInicio = document.getElementById('campoEquipoMesInicio');
  previewMesesMantenimiento = document.getElementById('previewMesesMantenimiento');
  fieldsetCertificacion = document.getElementById('fieldsetCertificacion');
  campoEquipoFrecuenciaCert = document.getElementById('campoEquipoFrecuenciaCert');
  campoEquipoMesInicioCert = document.getElementById('campoEquipoMesInicioCert');
  previewMesesCertificacion = document.getElementById('previewMesesCertificacion');
}

/* ==============================================================
   7.1 PROGRAMACIÓN DE MESES POR FRECUENCIA (a prueba de errores)
   ------------------------------------------------------------
   En vez de dejar que el usuario marque los meses a mano (lo que
   permitiría combinaciones inválidas), el usuario solo elige la
   FRECUENCIA y un MES DE INICIO. Con esos dos datos el resto de
   los meses se calculan solos, siempre correctamente espaciados:

     Mensual    -> los 12 meses (no requiere mes de inicio)
     Trimestral -> 4 meses, cada 3
     Semestral  -> 2 meses, cada 6
     Anual      -> 1 mes

   El <select> de "mes de inicio" solo ofrece los meses que en
   verdad generan combinaciones distintas (1..intervalo), así que
   es físicamente imposible construir un cronograma mal espaciado.
   ============================================================== */
const INTERVALO_FRECUENCIA = { Mensual: 1, Trimestral: 3, Semestral: 6, Anual: 12 };

function calcularMesesProgramados(frecuencia, mesInicio) {
  const intervalo = INTERVALO_FRECUENCIA[frecuencia];
  if (!intervalo) return [];
  if (frecuencia === 'Mensual') return [1,2,3,4,5,6,7,8,9,10,11,12];

  const inicio = Number(mesInicio) || 1;
  const cantidad = 12 / intervalo;
  const meses = [];
  for (let i = 0; i < cantidad; i++) {
    const mes = ((inicio - 1 + i * intervalo) % 12) + 1;
    meses.push(mes);
  }
  return meses.sort((a, b) => a - b);
}

// Rellena un <select> de "mes de inicio" solo con los meses 1..intervalo
// (Enero..N), que son los únicos que producen un patrón distinto.
function poblarSelectMesInicio(select, frecuencia, valorPrevio) {
  if (!select) return;
  const intervalo = INTERVALO_FRECUENCIA[frecuencia] || 12;
  const valorAnterior = valorPrevio || select.value;
  select.innerHTML = '';
  for (let m = 1; m <= intervalo; m++) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = APP_CONFIG.MESES[m - 1];
    select.appendChild(opt);
  }
  const conservar = [...select.options].some(o => o.value === String(valorAnterior));
  select.value = conservar ? String(valorAnterior) : '1';
}

function formatearMesesProgramados(meses) {
  if (!meses || meses.length === 0) return '—';
  return meses.map(m => APP_CONFIG.MESES[m - 1]).join(', ');
}

// Actualiza el selector de mes de inicio + la vista previa para el
// bloque de mantenimiento, según la frecuencia elegida.
function actualizarUIFrecuenciaMantenimiento(valorMesPrevio) {
  if (!campoEquipoFrecuencia) return;
  const frecuencia = campoEquipoFrecuencia.value;

  if (frecuencia === 'Mensual') {
    campoEquipoMesInicioWrap.hidden = true;
    campoEquipoMesInicio.required = false;
  } else {
    campoEquipoMesInicioWrap.hidden = false;
    campoEquipoMesInicio.required = true;
    poblarSelectMesInicio(campoEquipoMesInicio, frecuencia, valorMesPrevio);
  }

  const meses = calcularMesesProgramados(frecuencia, campoEquipoMesInicio.value);
  previewMesesMantenimiento.textContent = formatearMesesProgramados(meses);
}

// Igual que la anterior, pero para el bloque de certificación de metrología.
function actualizarUIFrecuenciaCertificacion(valorMesPrevio) {
  if (!campoEquipoFrecuenciaCert) return;
  const frecuencia = campoEquipoFrecuenciaCert.value;
  poblarSelectMesInicio(campoEquipoMesInicioCert, frecuencia, valorMesPrevio);
  const meses = calcularMesesProgramados(frecuencia, campoEquipoMesInicioCert.value);
  previewMesesCertificacion.textContent = formatearMesesProgramados(meses);
}

// Muestra u oculta el bloque de certificación de metrología según el tipo.
function actualizarUITipoEquipo() {
  const esMetrologia = campoEquipoTipo.value === 'Metrología';
  fieldsetCertificacion.hidden = !esMetrologia;
  campoEquipoFrecuenciaCert.required = esMetrologia;
  campoEquipoMesInicioCert.required = esMetrologia;
  if (esMetrologia) actualizarUIFrecuenciaCertificacion();
}

function renderizarTablaEquipos(snapshot) {
  equiposCache = snapshot.docs.map(doc => doc.data());

  if (snapshot.empty) {
    tablaEquiposBody.innerHTML =
      '<tr><td colspan="5" class="lista-vacia">Todavía no hay equipos registrados. Usa "Importar Excel" o "Agregar equipo".</td></tr>';
    return;
  }

  renderizarFilasEquipos(filtrarEquiposPorBusqueda(equiposCache));
}

// Filtra una lista de equipos según lo escrito en el buscador (sin tildes,
// sin importar mayúsculas), comparando contra código, nombre, ubicación y tipo.
function filtrarEquiposPorBusqueda(lista) {
  const termino = equiposBuscadorInput ? normalizarClave(equiposBuscadorInput.value) : '';
  if (!termino) return lista;
  return lista.filter(d => {
    const texto = normalizarClave(`${d.codigo || ''} ${d.nombre || ''} ${d.ubicacion || ''} ${d.tipo || ''}`);
    return termino.split(/\s+/).every(palabra => texto.includes(palabra));
  });
}

function renderizarFilasEquipos(lista) {
  tablaEquiposBody.innerHTML = '';

  if (lista.length === 0) {
    tablaEquiposBody.innerHTML =
      '<tr><td colspan="5" class="lista-vacia">No se encontraron equipos que coincidan con la búsqueda.</td></tr>';
    return;
  }

  lista.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${escaparHtml(d.codigo)}</td>` +
      `<td>${escaparHtml(d.nombre)}</td>` +
      `<td>${escaparHtml(d.ubicacion)}</td>` +
      `<td>${escaparHtml(d.tipo)}</td>`;

    const tdAcciones = document.createElement('td');
    const divAcciones = document.createElement('div');
    divAcciones.className = 'doc-acciones';

    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn secundario btn-chico';
    btnEditar.type = 'button';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => abrirModalEdicionEquipo(d));

    const btnEliminar = document.createElement('button');
    btnEliminar.className = 'btn peligro btn-chico';
    btnEliminar.type = 'button';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', () => eliminarEquipo(d));

    divAcciones.appendChild(btnEditar);
    divAcciones.appendChild(btnEliminar);
    tdAcciones.appendChild(divAcciones);
    tr.appendChild(tdAcciones);

    tablaEquiposBody.appendChild(tr);
  });
}

function escaparHtml(valor) {
  const div = document.createElement('div');
  div.textContent = valor == null ? '' : String(valor);
  return div.innerHTML;
}

function initEscuchaEquipos() {
  db.collection(APP_CONFIG.COLECCIONES.equipos)
    .orderBy('codigo')
    .onSnapshot(
      snapshot => {
        renderizarTablaEquipos(snapshot);
        actualizarSelectsEquipos(snapshot); // alimenta "hv-equipo" y "rep-equipo" con el mismo snapshot
        if (typeof renderCalendario === 'function') renderCalendario(); // el calendario depende de equiposCache
      },
      err => {
        console.error('Error al cargar equipos:', err);
        tablaEquiposBody.innerHTML = '<tr><td colspan="5" class="lista-vacia">No se pudo cargar la lista de equipos.</td></tr>';
      }
    );
}

/* ---------- Importar desde Excel ---------- */

// Normaliza encabezados de columna: sin tildes, minúsculas, sin espacios sobrantes.
// Así "Código", "codigo", " Código " todos coinciden con la misma clave.
function normalizarClave(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .trim().toLowerCase();
}

// Mapea distintos nombres de columna posibles a nuestras claves internas.
const ALIAS_COLUMNAS_EQUIPOS = {
  codigo: 'codigo', 'código': 'codigo',
  nombre: 'nombre',
  ubicacion: 'ubicacion', 'ubicación': 'ubicacion',
  tipo: 'tipo',
  marca: 'marca',
  modelo: 'modelo',
  serie: 'serie', 'número de serie': 'serie', 'numero de serie': 'serie', 'n° serie': 'serie', 'no. serie': 'serie',
  'frecuencia mantenimiento': 'frecuencia', frecuencia: 'frecuencia',
  'mes inicio mantenimiento': 'mesInicio', 'mes de inicio mantenimiento': 'mesInicio', 'mes inicio': 'mesInicio',
  'frecuencia certificacion': 'frecuenciaCert', 'frecuencia de certificacion': 'frecuenciaCert',
  'mes inicio certificacion': 'mesInicioCert', 'mes de inicio certificacion': 'mesInicioCert'
};

// Convierte un valor de mes (nombre "Marzo", abreviatura "mar" o número "3")
// a su número 1-12. Devuelve null si no se pudo interpretar.
function parsearMes(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  if (Number.isInteger(numero) && numero >= 1 && numero <= 12) return numero;
  const texto = normalizarClave(valor);
  const indice = APP_CONFIG.MESES.findIndex(m => normalizarClave(m) === texto || normalizarClave(m).startsWith(texto));
  return indice === -1 ? null : indice + 1;
}

const FRECUENCIAS_MANTENIMIENTO_VALIDAS = ['Mensual', 'Trimestral', 'Semestral', 'Anual'];
const FRECUENCIAS_CERTIFICACION_VALIDAS = ['Semestral', 'Anual'];

// Interpreta un valor de frecuencia sin importar tildes/mayúsculas y lo
// deja en su forma canónica ("trimestral" -> "Trimestral"), o null si no coincide.
function parsearFrecuencia(valor, opcionesValidas) {
  const texto = normalizarClave(valor);
  return opcionesValidas.find(op => normalizarClave(op) === texto) || null;
}

function mostrarEstadoImportacion(mensaje, esError) {
  equiposImportarEstado.textContent = mensaje;
  equiposImportarEstado.hidden = false;
  equiposImportarEstado.style.color = esError ? 'var(--danger)' : 'var(--text-muted)';
}

/* ---------- Modal de aviso: cómo debe venir el Excel a importar ---------- */
function abrirModalImportarEquipos() {
  modalImportarEquipos.hidden = false;
}

function cerrarModalImportarEquipos() {
  modalImportarEquipos.hidden = true;
}

// Genera y descarga una plantilla .xlsx con los encabezados correctos
// y un par de filas de ejemplo (una normal, una de metrología).
async function descargarPlantillaEquipos() {
  await cargarLibreria('xlsx');

  const filas = [
    {
      'Código': 'EQ-001', 'Nombre': 'Compresor A-12', 'Ubicación': 'Planta 1', 'Tipo': 'Equipo',
      'Marca': 'Copeland', 'Modelo': 'ZR-61', 'Serie': '24681012',
      'Frecuencia mantenimiento': 'Trimestral', 'Mes inicio mantenimiento': 'Enero',
      'Frecuencia certificación': '', 'Mes inicio certificación': ''
    },
    {
      'Código': 'EQ-010', 'Nombre': 'Termómetro digital', 'Ubicación': 'Laboratorio', 'Tipo': 'Metrología',
      'Marca': 'Testo', 'Modelo': '104-IR', 'Serie': '30512099',
      'Frecuencia mantenimiento': 'Semestral', 'Mes inicio mantenimiento': 'Marzo',
      'Frecuencia certificación': 'Semestral', 'Mes inicio certificación': 'Marzo'
    }
  ];

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 24 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Equipos');
  XLSX.writeFile(libro, 'plantilla_equipos.xlsx');
}

async function manejarImportarEquiposExcel(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;

  mostrarEstadoImportacion('Cargando…', false);

  try {
    await cargarLibreria('xlsx');
    mostrarEstadoImportacion('Leyendo archivo…', false);
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, { type: 'array' });
    const primeraHoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(primeraHoja, { defval: '' });

    if (filas.length === 0) {
      mostrarEstadoImportacion('El archivo no tiene filas para importar.', true);
      return;
    }

    // Normalizamos las claves de cada fila según los alias conocidos
    // (Código/código -> codigo, Ubicación/ubicacion -> ubicacion, etc.)
    const filasNormalizadas = filas.map(fila => {
      const normalizada = {};
      Object.keys(fila).forEach(claveOriginal => {
        const claveNormalizada = ALIAS_COLUMNAS_EQUIPOS[normalizarClave(claveOriginal)];
        if (claveNormalizada) normalizada[claveNormalizada] = String(fila[claveOriginal]).trim();
      });
      return normalizada;
    });

    const validas = filasNormalizadas.filter(f => f.codigo);
    const omitidas = filasNormalizadas.length - validas.length;

    if (validas.length === 0) {
      mostrarEstadoImportacion(
        'No se encontró la columna "Código" (o venía vacía) en ninguna fila. Revisa los encabezados del Excel: Código, Nombre, Ubicación, Tipo.',
        true
      );
      return;
    }

    // Para cada fila calculamos mantenimiento/certificación con la misma
    // lógica "a prueba de errores" del formulario manual: frecuencia + mes
    // de inicio -> arreglo de meses programados. Si la frecuencia no viene
    // o no es válida, se asume Mensual (no requiere mes de inicio).
    const filasConDatos = validas.map(fila => {
      const tipo = fila.tipo && ['Equipo', 'Área', 'Metrología'].includes(fila.tipo) ? fila.tipo : (fila.tipo || 'Equipo');

      const frecuencia = parsearFrecuencia(fila.frecuencia, FRECUENCIAS_MANTENIMIENTO_VALIDAS) || 'Mensual';
      const mesInicio = frecuencia === 'Mensual' ? 1 : (parsearMes(fila.mesInicio) || 1);
      const mantenimiento = { frecuencia, mesInicio, meses: calcularMesesProgramados(frecuencia, mesInicio) };

      let certificacion = null;
      if (tipo === 'Metrología') {
        const frecuenciaCert = parsearFrecuencia(fila.frecuenciaCert, FRECUENCIAS_CERTIFICACION_VALIDAS) || 'Anual';
        const mesInicioCert = parsearMes(fila.mesInicioCert) || 1;
        certificacion = { frecuencia: frecuenciaCert, mesInicio: mesInicioCert, meses: calcularMesesProgramados(frecuenciaCert, mesInicioCert) };
      }

      return { ...fila, tipo, mantenimiento, certificacion };
    });

    // Firestore permite máximo 500 operaciones por batch; dividimos si el archivo es grande.
    const LOTE_MAX = 450;
    for (let i = 0; i < filasConDatos.length; i += LOTE_MAX) {
      const lote = filasConDatos.slice(i, i + LOTE_MAX);
      const batch = db.batch();
      lote.forEach(fila => {
        const ref = db.collection(APP_CONFIG.COLECCIONES.equipos).doc(fila.codigo);
        const datos = {
          codigo: fila.codigo,
          nombre: fila.nombre || '',
          ubicacion: fila.ubicacion || '',
          tipo: fila.tipo || '',
          marca: fila.marca || '',
          modelo: fila.modelo || '',
          serie: fila.serie || '',
          mantenimiento: fila.mantenimiento
        };
        if (fila.certificacion) datos.certificacion = fila.certificacion;
        batch.set(ref, datos, { merge: true });
      });
      await batch.commit();
    }

    mostrarEstadoImportacion(
      `Se importaron ${filasConDatos.length} equipo(s)/área(s) correctamente` +
      (omitidas > 0 ? ` (se omitieron ${omitidas} fila(s) sin código).` : '.'),
      false
    );
  } catch (err) {
    console.error('Error al importar el Excel de equipos:', err);
    mostrarEstadoImportacion('No se pudo leer el archivo. Verifica tu conexión y que sea un .xlsx, .xls o .csv válido.', true);
  } finally {
    equiposImportarInput.value = '';
  }
}

/* ---------- Exportar a Excel ---------- */
async function manejarExportarEquiposExcel() {
  if (equiposCache.length === 0) {
    alert('No hay equipos para exportar todavía.');
    return;
  }

  try {
    await cargarLibreria('xlsx');
  } catch (err) {
    console.error(err);
    alert('No se pudo cargar el módulo de Excel. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }

  const filas = equiposCache.map(d => ({
    'Código': d.codigo || '',
    'Nombre': d.nombre || '',
    'Ubicación': d.ubicacion || '',
    'Tipo': d.tipo || '',
    'Marca': d.marca || '',
    'Modelo': d.modelo || '',
    'Serie': d.serie || ''
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Equipos');

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `equipos_${fecha}.xlsx`);
}

/* ---------- Agregar / editar / eliminar equipo (modal) ---------- */

function mostrarErrorModalEquipo(mensaje) {
  modalEquipoError.textContent = mensaje;
  modalEquipoError.hidden = false;
}

function ocultarErrorModalEquipo() {
  modalEquipoError.hidden = true;
  modalEquipoError.textContent = '';
}

function abrirModalCreacionEquipo() {
  formEquipo.reset();
  ocultarErrorModalEquipo();
  equipoCodigoEdicionInput.value = '';
  modalEquipoTitulo.textContent = 'Agregar equipo';
  campoEquipoCodigo.disabled = false; // al crear, el código se escribe y será el ID del documento
  campoEquipoTipo.value = 'Equipo';
  campoEquipoFrecuencia.value = 'Mensual';
  actualizarUIFrecuenciaMantenimiento();
  campoEquipoFrecuenciaCert.value = 'Semestral';
  actualizarUITipoEquipo();
  modalEquipo.hidden = false;
  campoEquipoCodigo.focus();
}

function abrirModalEdicionEquipo(datos) {
  formEquipo.reset();
  ocultarErrorModalEquipo();
  equipoCodigoEdicionInput.value = datos.codigo;
  modalEquipoTitulo.textContent = 'Editar equipo';
  campoEquipoCodigo.value = datos.codigo || '';
  campoEquipoCodigo.disabled = true; // el código es el ID del documento: no se cambia desde aquí
  campoEquipoNombre.value = datos.nombre || '';
  campoEquipoUbicacion.value = datos.ubicacion || '';
  campoEquipoTipo.value = datos.tipo || 'Equipo';

  const mant = datos.mantenimiento || {};
  campoEquipoFrecuencia.value = mant.frecuencia || 'Mensual';
  actualizarUIFrecuenciaMantenimiento(mant.mesInicio);

  const cert = datos.certificacion || {};
  campoEquipoFrecuenciaCert.value = cert.frecuencia || 'Semestral';
  actualizarUITipoEquipo(); // muestra/oculta el bloque según el tipo
  if (campoEquipoTipo.value === 'Metrología') {
    actualizarUIFrecuenciaCertificacion(cert.mesInicio);
  }

  modalEquipo.hidden = false;
  campoEquipoNombre.focus();
}

function cerrarModalEquipo() {
  modalEquipo.hidden = true;
  formEquipo.reset();
  campoEquipoCodigo.disabled = false;
  ocultarErrorModalEquipo();
}

async function manejarSubmitEquipo(e) {
  e.preventDefault();
  ocultarErrorModalEquipo();

  const codigoEdicion = equipoCodigoEdicionInput.value;
  const codigo = campoEquipoCodigo.value.trim();
  const nombre = campoEquipoNombre.value.trim();
  const ubicacion = campoEquipoUbicacion.value.trim();
  const tipo = campoEquipoTipo.value;

  if (!codigo) {
    mostrarErrorModalEquipo('Escribe el código del equipo o área.');
    return;
  }
  if (!nombre) {
    mostrarErrorModalEquipo('Escribe el nombre.');
    return;
  }
  if (!ubicacion) {
    mostrarErrorModalEquipo('Escribe la ubicación.');
    return;
  }

  // ---- Programación de mantenimiento (mes de inicio + frecuencia -> meses) ----
  const frecuencia = campoEquipoFrecuencia.value;
  const mesInicio = frecuencia === 'Mensual' ? 1 : Number(campoEquipoMesInicio.value);
  const mesesMantenimiento = calcularMesesProgramados(frecuencia, mesInicio);
  const mantenimiento = { frecuencia, mesInicio, meses: mesesMantenimiento };

  // ---- Certificación de metrología (solo si el tipo es Metrología) ----
  let certificacion = null;
  if (tipo === 'Metrología') {
    const frecuenciaCert = campoEquipoFrecuenciaCert.value;
    const mesInicioCert = Number(campoEquipoMesInicioCert.value);
    const mesesCert = calcularMesesProgramados(frecuenciaCert, mesInicioCert);
    certificacion = { frecuencia: frecuenciaCert, mesInicio: mesInicioCert, meses: mesesCert };
  }

  btnGuardarEquipo.disabled = true;
  const textoOriginal = btnGuardarEquipo.textContent;
  btnGuardarEquipo.textContent = 'Guardando…';

  try {
    if (!codigoEdicion) {
      // Creación: verificamos que el código no exista ya, para no pisar un equipo existente.
      const ref = db.collection(APP_CONFIG.COLECCIONES.equipos).doc(codigo);
      const existente = await ref.get();
      if (existente.exists) {
        mostrarErrorModalEquipo('Ya existe un equipo o área con ese código.');
        return;
      }
      const datosGuardar = { codigo, nombre, ubicacion, tipo, mantenimiento };
      if (certificacion) datosGuardar.certificacion = certificacion;
      await ref.set(datosGuardar);
    } else {
      const datosActualizar = {
        nombre, ubicacion, tipo, mantenimiento,
        certificacion: certificacion || firebase.firestore.FieldValue.delete()
      };
      await db.collection(APP_CONFIG.COLECCIONES.equipos).doc(codigoEdicion).update(datosActualizar);
    }
    cerrarModalEquipo();
  } catch (err) {
    console.error('Error al guardar el equipo:', err);
    mostrarErrorModalEquipo('No se pudo guardar el equipo. Inténtalo de nuevo.');
  } finally {
    btnGuardarEquipo.disabled = false;
    btnGuardarEquipo.textContent = textoOriginal;
  }
}

async function eliminarEquipo(datos) {
  const confirmado = confirm(
    `¿Eliminar "${datos.nombre || datos.codigo}" (${datos.codigo})?\n\n` +
    `ADVERTENCIA: también se eliminarán TODOS los reportes de mantenimiento ` +
    `asociados a este equipo.\n\n` +
    `Esta acción no se puede deshacer.`
  );

  if (!confirmado) return;

  try {
    const codigoEquipo = datos.codigo;

    // Buscar todos los reportes asociados al equipo
    const reportesSnapshot = await db
      .collection(APP_CONFIG.COLECCIONES.reportes)
      .where('equipoCodigo', '==', codigoEquipo)
      .get();

    // Firestore permite máximo 500 operaciones por batch.
    // Usamos 450 para mantener margen.
    const LOTE_MAX = 450;

    const documentosReportes = reportesSnapshot.docs;

    // Borrar también las fotos (subcolección) de esos reportes.
    for (const docReporte of documentosReportes) {
      await eliminarFotosReporte(docReporte.id);
    }

    for (let i = 0; i < documentosReportes.length; i += LOTE_MAX) {
      const lote = documentosReportes.slice(i, i + LOTE_MAX);
      const batch = db.batch();

      lote.forEach(docReporte => {
        batch.delete(docReporte.ref);
      });

      await batch.commit();
    }

    // Finalmente eliminar el equipo
    await db
      .collection(APP_CONFIG.COLECCIONES.equipos)
      .doc(codigoEquipo)
      .delete();

    alert(
      `Equipo eliminado correctamente.\n\n` +
      `También se eliminaron ${documentosReportes.length} reporte(s) asociado(s).`
    );

  } catch (err) {
    console.error('Error al eliminar el equipo y sus reportes:', err);

    alert(
      'No se pudo completar la eliminación.\n\n' +
      'Verifica tu conexión e inténtalo de nuevo.'
    );
  }
}

function initEquiposLista() {
  cachearElementosEquipos();
  if (!tablaEquiposBody) return;

  equiposImportarInput.addEventListener('change', manejarImportarEquiposExcel);
  btnExportarEquiposExcel.addEventListener('click', manejarExportarEquiposExcel);
  if (equiposBuscadorInput) {
    equiposBuscadorInput.addEventListener('input', () => renderizarFilasEquipos(filtrarEquiposPorBusqueda(equiposCache)));
  }

  btnImportarEquiposExcel.addEventListener('click', abrirModalImportarEquipos);
  btnElegirArchivoEquipos.addEventListener('click', () => {
    cerrarModalImportarEquipos();
    equiposImportarInput.click();
  });
  btnDescargarPlantillaEquipos.addEventListener('click', descargarPlantillaEquipos);
  modalImportarEquipos.querySelectorAll('[data-cerrar-modal]').forEach(el => {
    el.addEventListener('click', cerrarModalImportarEquipos);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalImportarEquipos.hidden) cerrarModalImportarEquipos();
  });

  btnAgregarEquipo.addEventListener('click', abrirModalCreacionEquipo);
  formEquipo.addEventListener('submit', manejarSubmitEquipo);
  modalEquipo.querySelectorAll('[data-cerrar-modal]').forEach(el => {
    el.addEventListener('click', cerrarModalEquipo);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalEquipo.hidden) cerrarModalEquipo();
  });

  campoEquipoTipo.addEventListener('change', actualizarUITipoEquipo);
  campoEquipoFrecuencia.addEventListener('change', () => actualizarUIFrecuenciaMantenimiento());
  campoEquipoMesInicio.addEventListener('change', () => actualizarUIFrecuenciaMantenimiento(campoEquipoMesInicio.value));
  campoEquipoFrecuenciaCert.addEventListener('change', () => actualizarUIFrecuenciaCertificacion());
  campoEquipoMesInicioCert.addEventListener('change', () => actualizarUIFrecuenciaCertificacion(campoEquipoMesInicioCert.value));

  initEscuchaEquipos();
}

/* ==============================================================
   7.2 CRONOGRAMA DE MANTENIMIENTO (Gestión documental)
   ------------------------------------------------------------
   Se genera automáticamente a partir de `equiposCache` (mismo
   snapshot que alimenta la pestaña "Lista de equipos"), usando
   los campos `mantenimiento.meses` y `certificacion.meses` que
   se calculan al guardar cada equipo. No requiere una colección
   ni un listener aparte.
   ============================================================== */
let modalCronograma, tablaCronogramaBody, btnVerCronograma, btnGenerarPdfCronograma;

function cachearElementosCronograma() {
  modalCronograma = document.getElementById('modalCronograma');
  tablaCronogramaBody = document.getElementById('tablaCronogramaBody');
  btnVerCronograma = document.getElementById('btnVerCronograma');
  btnGenerarPdfCronograma = document.getElementById('btnGenerarPdfCronograma');
}

// Devuelve la celda de un mes para un equipo: chip(s) de mantenimiento
// y/o certificación si ese mes (1-12) está programado para ese equipo.
function celdaMesCronograma(datos, mes) {
  const chips = [];
  const mesesMant = (datos.mantenimiento && datos.mantenimiento.meses) || [];
  const mesesCert = (datos.certificacion && datos.certificacion.meses) || [];

  if (mesesMant.includes(mes)) {
    chips.push('<span class="cal-chip preventivo" title="Mantenimiento" style="padding:1px 6px">M</span>');
  }
  if (mesesCert.includes(mes)) {
    chips.push('<span class="cal-chip metrologia" title="Certificación" style="padding:1px 6px">C</span>');
  }
  return chips.join(' ') || '';
}

function renderizarTablaCronograma() {
  if (!tablaCronogramaBody) return;
  tablaCronogramaBody.innerHTML = '';

  if (equiposCache.length === 0) {
    tablaCronogramaBody.innerHTML =
      '<tr><td colspan="16" class="lista-vacia">No hay equipos registrados todavía.</td></tr>';
    return;
  }

  const equiposOrdenados = [...equiposCache].sort((a, b) =>
    (a.codigo || '').localeCompare(b.codigo || ''));

  equiposOrdenados.forEach(datos => {
    const mant = datos.mantenimiento || {};
    const tr = document.createElement('tr');

    let celdas =
      `<td>${escaparHtml(datos.codigo || '')}</td>` +
      `<td>${escaparHtml(datos.nombre || '')}</td>` +
      `<td>${escaparHtml(datos.tipo || '')}</td>` +
      `<td>${escaparHtml(mant.frecuencia || '—')}</td>`;

    for (let mes = 1; mes <= 12; mes++) {
      celdas += `<td>${celdaMesCronograma(datos, mes)}</td>`;
    }

    tr.innerHTML = celdas;
    tablaCronogramaBody.appendChild(tr);
  });
}

function abrirModalCronograma() {
  renderizarTablaCronograma();
  modalCronograma.hidden = false;
}

function cerrarModalCronograma() {
  modalCronograma.hidden = true;
}

/* ---------- Generar el PDF del cronograma (mismo encabezado que los reportes) ---------- */
async function construirPdfCronograma() {
  await cargarLibreria('jspdf');
  await cargarLibreria('jspdf-autotable');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' });
  const margen = 12;
  const anchoUtil = 279 - margen * 2; // letter landscape: 279mm de ancho
  let y = margen - 5;

  const logo = await obtenerLogoEmpresaBase64();
  const fr = APP_CONFIG.FORMATO_REPORTE || {};
  const anio = APP_CONFIG.HOY ? APP_CONFIG.HOY.getFullYear() : new Date().getFullYear();

  /* ================= Encabezado: logo · título · ficha del documento ================= */
  const alturaEncabezado = 22;
  const colLogoAncho = anchoUtil * 0.14;
  const colInfoAncho = anchoUtil * 0.22;
  const colTituloAncho = anchoUtil - colLogoAncho - colInfoAncho;
  const xLogo = margen;
  const xTitulo = margen + colLogoAncho;
  const xInfo = margen + colLogoAncho + colTituloAncho;

  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.rect(margen, y, anchoUtil, alturaEncabezado);
  doc.line(xTitulo, y, xTitulo, y + alturaEncabezado);
  doc.line(xInfo, y, xInfo, y + alturaEncabezado);

  if (logo) {
    await insertarImagenAjustada(doc, logo, xLogo + 1, y + 0.5, colLogoAncho - 1, alturaEncabezado - 1);
  }

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0);
  const tituloDoc = 'CRONOGRAMA DE MANTENIMIENTO';
  const lineasTitulo = doc.splitTextToSize(tituloDoc, colTituloAncho - 8);
  const altoTitulo = lineasTitulo.length * 6;
  doc.text(lineasTitulo, xTitulo + colTituloAncho / 2, y + alturaEncabezado / 2 - altoTitulo / 2 + 4, { align: 'center' });

  const filaInfoAlto = alturaEncabezado / 3;
  doc.line(xInfo, y + filaInfoAlto, xInfo + colInfoAncho, y + filaInfoAlto);
  doc.line(xInfo, y + filaInfoAlto * 2, xInfo + colInfoAncho, y + filaInfoAlto * 2);


  y += alturaEncabezado + 8;

  /* ================= Leyenda ================= */
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text(`Año: ${new Date().getFullYear()}`, margen, y);
  y += 5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('M = Mantenimiento preventivo     C = Certificación de metrología', margen, y);
  y += 5;

  /* ================= Tabla del cronograma ================= */
  const equiposOrdenados = [...equiposCache].sort((a, b) =>
    (a.codigo || '').localeCompare(b.codigo || ''));

  const encabezados = ['Código', 'Nombre', 'Tipo', 'Frecuencia',
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const cuerpo = equiposOrdenados.map(datos => {
    const mant = datos.mantenimiento || {};
    const mesesMant = mant.meses || [];
    const mesesCert = (datos.certificacion && datos.certificacion.meses) || [];
    const filaMeses = [];
    for (let mes = 1; mes <= 12; mes++) {
      const marcas = [];
      if (mesesMant.includes(mes)) marcas.push('M');
      if (mesesCert.includes(mes)) marcas.push('C');
      filaMeses.push(marcas.join('/'));
    }
    return [datos.codigo || '', datos.nombre || '', datos.tipo || '', mant.frecuencia || '—', ...filaMeses];
  });

  if (cuerpo.length === 0) {
    cuerpo.push(['—', 'No hay equipos registrados todavía.', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  }

  doc.autoTable({
    head: [encabezados],
    body: cuerpo,
    startY: y,
    margin: { left: margen, right: margen },
    styles: { font: 'courier', fontSize: 7.5, halign: 'center', cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
    headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' }, 2: { halign: 'left' }, 3: { halign: 'left' } }
  });


  return doc;
}

async function manejarGenerarPdfCronograma(e) {
  const boton = e.currentTarget;
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando…';
  try {
    const doc = await construirPdfCronograma();
    const fecha = new Date().toISOString().slice(0, 10);
    doc.save(`cronograma_mantenimiento_${fecha}.pdf`);
  } catch (err) {
    console.error('Error al generar el PDF del cronograma:', err);
    alert('No se pudo generar el PDF. Verifica tu conexión e inténtalo de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function initCronograma() {
  cachearElementosCronograma();
  if (!modalCronograma || !btnVerCronograma) return;

  btnVerCronograma.addEventListener('click', abrirModalCronograma);
  btnGenerarPdfCronograma.addEventListener('click', manejarGenerarPdfCronograma);
  modalCronograma.querySelectorAll('[data-cerrar-modal]').forEach(el => {
    el.addEventListener('click', cerrarModalCronograma);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalCronograma.hidden) cerrarModalCronograma();
  });
}

/* ==============================================================
   8. SELECTS DINÁMICOS DE EQUIPO / TÉCNICO / ADMINISTRADOR
   ------------------------------------------------------------
   Varios módulos necesitan un <select> con la lista de equipos
   (Hoja de vida, Generar Reporte), de técnicos (Generar Reporte)
   o de administradores (Generar Reporte, "quien aprueba"). En vez
   de repetir la lógica de Firestore en cada módulo, la centralizamos
   aquí: un solo listener por colección alimenta todos los <select>
   que la necesiten y mantiene las opciones sincronizadas en vivo.
   ============================================================== */
let hvEquipoSelect, hvTipoEquipoSelect, hvBuscadorInput, hvBuscadorResultados,
    repEquipoSelect, repTipoEquipoSelect, repRealizaSelect, repApruebaSelect,
    repBuscadorInput, repBuscadorResultados;

// Arma las opciones de un <select> de equipos filtradas por tipo, listadas
// como "Nombre · Código · Ubicación" y ordenadas alfabéticamente por nombre.
// Se reutiliza tanto en "Generar reporte" como en "Hoja de vida".
function opcionesEquipoPorTipo(tipoFiltro) {
  return equiposCache
    .filter(d => (d.tipo || 'Equipo') === tipoFiltro)
    .slice()
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
    .map(d => ({
      value: d.codigo,
      label: `${d.nombre || '(sin nombre)'} · ${d.codigo} · ${d.ubicacion || '—'}`,
      dataset: {
        nombre: d.nombre || '',
        ubicacion: d.ubicacion || '',
        marca: d.marca || '',
        modelo: d.modelo || '',
        serie: d.serie || ''
      }
    }));
}

// Reemplaza las <option> de un <select>, conservando el valor
// seleccionado si sigue existiendo en la nueva lista de opciones.
function actualizarOpcionesSelect(selectEl, opciones, textoVacio) {
  if (!selectEl) return;

  const valorPrevio = selectEl.value;
  selectEl.innerHTML = '';

  // Opción inicial
  const opcionInicial = document.createElement('option');
  opcionInicial.value = '';
  opcionInicial.textContent = '— Seleccione —';
  opcionInicial.disabled = true;
  opcionInicial.selected = true;
  selectEl.appendChild(opcionInicial);

  if (opciones.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = textoVacio;
    opt.disabled = true;
    selectEl.appendChild(opt);

    selectEl.value = '';
    selectEl.disabled = true;
    return;
  }

  selectEl.disabled = false;

  opciones.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;

    if (o.dataset) {
      Object.assign(opt.dataset, o.dataset);
    }

    selectEl.appendChild(opt);
  });

  // Solo conserva la selección anterior si todavía existe.
  if (
    valorPrevio &&
    [...selectEl.options].some(o => o.value === valorPrevio)
  ) {
    selectEl.value = valorPrevio;
  } else {
    selectEl.value = '';
  }
}

// Un solo listener de "equipos" (arriba, en initEscuchaEquipos) alimenta
// tanto la tabla de la pestaña Equipos como estos dos <select>, para no
// abrir 2 escuchas distintas sobre la misma colección.
function actualizarSelectsEquipos(snapshot) {
  // "Hoja de vida" y "Generar reporte" ahora filtran por el tipo elegido.
  actualizarOpcionesHvEquipo();
  actualizarOpcionesRepEquipo();

  // Cada vez que cambia la lista de equipos, refrescamos también
  // el historial de reportes del equipo actualmente seleccionado
  // en Hoja de vida (por ejemplo, si le cambiaron el nombre).
  if (hvEquipoSelect) cargarHistorialReportes(hvEquipoSelect.value);
}

// Repuebla el <select> "rep-equipo" solo con los equipos cuyo campo
// "tipo" coincide con el elegido en "rep-tipo-equipo". Si todavía no
// se ha elegido un tipo, el select queda vacío y bloqueado.
function actualizarOpcionesRepEquipo() {
  if (!repEquipoSelect) return;

  const tipoFiltro = repTipoEquipoSelect ? repTipoEquipoSelect.value : '';

  if (!tipoFiltro) {
    actualizarOpcionesSelect(repEquipoSelect, [], 'Primero selecciona el tipo de equipo');
    return;
  }

  actualizarOpcionesSelect(repEquipoSelect, opcionesEquipoPorTipo(tipoFiltro), `No hay equipos de tipo "${tipoFiltro}" registrados`);
}

// Igual que la anterior, pero para el <select> "hv-equipo" de Hoja de vida.
function actualizarOpcionesHvEquipo() {
  if (!hvEquipoSelect) return;

  const tipoFiltro = hvTipoEquipoSelect ? hvTipoEquipoSelect.value : '';

  if (!tipoFiltro) {
    actualizarOpcionesSelect(hvEquipoSelect, [], 'Primero selecciona el tipo de equipo');
    return;
  }

  actualizarOpcionesSelect(hvEquipoSelect, opcionesEquipoPorTipo(tipoFiltro), `No hay equipos de tipo "${tipoFiltro}" registrados`);
}

/* ---------- Buscador inteligente de equipos (Hoja de vida) ---------- */
// Permite elegir el equipo escribiendo directamente, sin tener que
// escoger primero el tipo. Filtra equiposCache por código/nombre/
// ubicación (sin tildes ni mayúsculas) y muestra sugerencias; al elegir
// una, sincroniza el filtro por tipo y selecciona el equipo real.
function renderizarSugerenciasHv(lista) {
  hvBuscadorResultados.innerHTML = '';

  if (lista.length === 0) {
    hvBuscadorResultados.style.display = 'none';
    return;
  }

  lista.slice(0, 12).forEach(d => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'reporte-item';
    item.style.cssText = 'display:block;width:100%;text-align:left;border:none;border-bottom:1px solid var(--border);background:none;padding:var(--s2) var(--s3);cursor:pointer';
    item.textContent = `${d.tipo} · ${d.nombre || '(sin nombre)'} · ${d.codigo} · ${d.ubicacion || '—'}`;
    item.addEventListener('click', () => seleccionarEquipoDesdeBuscadorHv(d));
    hvBuscadorResultados.appendChild(item);
  });

  hvBuscadorResultados.style.display = 'block';
}

function seleccionarEquipoDesdeBuscadorHv(d) {
  const tipo = d.tipo || 'Equipo';
  hvTipoEquipoSelect.value = tipo;
  actualizarOpcionesHvEquipo();
  hvEquipoSelect.value = d.codigo;
  hvEquipoSelect.dispatchEvent(new Event('change'));
  hvBuscadorResultados.style.display = 'none';
  hvBuscadorInput.value = '';
}

function manejarBusquedaHv() {
  const termino = normalizarClave(hvBuscadorInput.value);
  if (!termino) {
    hvBuscadorResultados.style.display = 'none';
    return;
  }
  const palabras = termino.split(/\s+/);
  const resultados = equiposCache.filter(d => {
    const texto = normalizarClave(`${d.codigo || ''} ${d.nombre || ''} ${d.ubicacion || ''} ${d.tipo || ''}`);
    return palabras.every(p => texto.includes(p));
  }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

  renderizarSugerenciasHv(resultados);
}

/* ---------- Buscador inteligente de equipos (Generar reporte) ---------- */
// Igual que el buscador de Hoja de vida, pero para el paso 1 del
// asistente de "Generar reporte".
function renderizarSugerenciasRep(lista) {
  repBuscadorResultados.innerHTML = '';

  if (lista.length === 0) {
    repBuscadorResultados.style.display = 'none';
    return;
  }

  lista.slice(0, 12).forEach(d => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'reporte-item';
    item.style.cssText = 'display:block;width:100%;text-align:left;border:none;border-bottom:1px solid var(--border);background:none;padding:var(--s2) var(--s3);cursor:pointer';
    item.textContent = `${d.tipo} · ${d.nombre || '(sin nombre)'} · ${d.codigo} · ${d.ubicacion || '—'}`;
    item.addEventListener('click', () => seleccionarEquipoDesdeBuscadorRep(d));
    repBuscadorResultados.appendChild(item);
  });

  repBuscadorResultados.style.display = 'block';
}

function seleccionarEquipoDesdeBuscadorRep(d) {
  const tipo = d.tipo || 'Equipo';
  repTipoEquipoSelect.value = tipo;
  actualizarOpcionesRepEquipo();
  repEquipoSelect.value = d.codigo;
  repEquipoSelect.dispatchEvent(new Event('change'));
  repBuscadorResultados.style.display = 'none';
  repBuscadorInput.value = '';
}

function manejarBusquedaRep() {
  const termino = normalizarClave(repBuscadorInput.value);
  if (!termino) {
    repBuscadorResultados.style.display = 'none';
    return;
  }
  const palabras = termino.split(/\s+/);
  const resultados = equiposCache.filter(d => {
    const texto = normalizarClave(`${d.codigo || ''} ${d.nombre || ''} ${d.ubicacion || ''} ${d.tipo || ''}`);
    return palabras.every(p => texto.includes(p));
  }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

  renderizarSugerenciasRep(resultados);
}

function initSelectsEquipos() {
  hvEquipoSelect = document.getElementById('hv-equipo');
  hvTipoEquipoSelect = document.getElementById('hv-tipo-equipo');
  hvBuscadorInput = document.getElementById('hv-buscador');
  hvBuscadorResultados = document.getElementById('hv-buscador-resultados');
  repEquipoSelect = document.getElementById('rep-equipo');
  repTipoEquipoSelect = document.getElementById('rep-tipo-equipo');
  repBuscadorInput = document.getElementById('rep-buscador');
  repBuscadorResultados = document.getElementById('rep-buscador-resultados');

  if (repTipoEquipoSelect) {
    repTipoEquipoSelect.addEventListener('change', actualizarOpcionesRepEquipo);
  }
  if (hvTipoEquipoSelect) {
    hvTipoEquipoSelect.addEventListener('change', actualizarOpcionesHvEquipo);
  }
  if (hvBuscadorInput) {
    hvBuscadorInput.addEventListener('input', manejarBusquedaHv);
    document.addEventListener('click', e => {
      if (!hvBuscadorResultados) return;
      if (e.target !== hvBuscadorInput && !hvBuscadorResultados.contains(e.target)) {
        hvBuscadorResultados.style.display = 'none';
      }
    });
  }
  if (repBuscadorInput) {
    repBuscadorInput.addEventListener('input', manejarBusquedaRep);
    document.addEventListener('click', e => {
      if (!repBuscadorResultados) return;
      if (e.target !== repBuscadorInput && !repBuscadorResultados.contains(e.target)) {
        repBuscadorResultados.style.display = 'none';
      }
    });
  }
}

// Un solo listener de "tecnicos" (arriba, en initEscuchaTecnicos) alimenta
// tanto la lista de la pestaña Técnicos como estos dos <select>, para no
// abrir 3 escuchas distintas sobre la misma colección.
function actualizarSelectsTecnicos(snapshot) {
  const opciones = snapshot.docs.map(doc => {
    const d = doc.data();
    return {
      value: doc.id,
      label: `${d.nombre}${d.cargo ? ' · ' + d.cargo : ''}`,
      dataset: { nombre: d.nombre || '', cargo: d.cargo || '' }
    };
  });

  const valorPrevioRealiza = repRealizaSelect ? repRealizaSelect.value : '';
  actualizarOpcionesSelect(repRealizaSelect, opciones, 'No hay técnicos registrados');
  agregarOpcionProveedorExterno();
  if (valorPrevioRealiza === REALIZA_VALOR_EXTERNO) repRealizaSelect.value = REALIZA_VALOR_EXTERNO;
  actualizarUIRealizaExterno();

  actualizarOpcionesSelect(repApruebaSelect, opciones, 'No hay técnicos registrados');
}

function initSelectRealiza() {
  repRealizaSelect = document.getElementById('rep-realiza');
}

function initSelectAprueba() {
  repApruebaSelect = document.getElementById('rep-aprueba');
}

/* ==============================================================
   9. EQUIPOS · PESTAÑA "HOJA DE VIDA" (selector + historial)
   ------------------------------------------------------------
   Por ahora solo la parte de: elegir un equipo y ver el historial
   de reportes de mantenimiento hechos sobre él (colección
   "reportes", filtrando por equipoCodigo). El resto de la pestaña
   (ficha técnica, instructivos, actas...) queda pendiente.
   ============================================================== */
let hvHistorialEl;
let cancelarEscuchaHistorial = null; // para dejar de escuchar el equipo anterior al cambiar de selección

function claseTipoReporte(tipo) {
  const clave = normalizarClave(tipo);
  if (clave === 'correctivo') return 'correctivo';
  if (clave === 'locativo') return 'locativo';
  return '';
}

function formatearFechaLarga(fechaIso) {
  if (!fechaIso) return '';
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const fecha = new Date(anio, (mes || 1) - 1, dia || 1);
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function calcularDuracionHoras(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return null;
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaFin.split(':').map(Number);
  let minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutos < 0) minutos += 24 * 60; // por si el trabajo cruza la medianoche
  return minutos / 60;
}

function formatearDuracion(horas) {
  if (horas == null || isNaN(horas)) return '—';
  const texto = Number.isInteger(horas) ? String(horas) : horas.toFixed(1).replace('.', ',');
  return `${texto} hora${horas === 1 ? '' : 's'}`;
}

function renderizarHistorialReportes(snapshot) {
  hvHistorialEl.innerHTML = '';

  if (snapshot.empty) {
    hvHistorialEl.innerHTML = '<li><p class="lista-vacia">Este equipo todavía no tiene reportes registrados.</p></li>';
    return;
  }

  // Ordenamos en el cliente (más reciente primero) para no depender
  // de un índice compuesto de Firestore sobre equipoCodigo + fechaHora.
  const reportes = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.fechaHora?.toMillis?.() || 0) - (a.fechaHora?.toMillis?.() || 0));

  reportes.forEach(d => {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;align-items:stretch;gap:var(--s2)';
    const clase = claseTipoReporte(d.tipo);
    const duracion = formatearDuracion(calcularDuracionHoras(d.horaInicio, d.horaFin));

    const btn = document.createElement('button');
    btn.className = 'reporte-item' + (clase ? ' ' + clase : '');
    btn.type = 'button';
    btn.style.flex = '1';
    btn.innerHTML =
      '<svg class="flecha" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>' +
      `<h4>${escaparHtml(d.tipo)} — ${escaparHtml(d.equipoNombre)}</h4>` +
      `<span class="fecha">${escaparHtml(formatearFechaLarga(d.fecha))}</span>` +
      '<div class="meta">' +
        `<span>Realizado por: <b>${escaparHtml(d.realizaNombre)}</b></span>` +
        `<span>Estado: <b>${escaparHtml(d.estadoEquipo)}</b></span>` +
        `<span>Duración: <b>${duracion}</b></span>` +
      '</div>';
    btn.addEventListener('click', () => abrirModalDetalleReporte(d));

    const btnEliminar = document.createElement('button');
    btnEliminar.className = 'btn peligro btn-chico';
    btnEliminar.type = 'button';
    btnEliminar.style.alignSelf = 'center';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', ev => {
      ev.stopPropagation();
      eliminarReporte(d);
    });

    li.appendChild(btn);
    li.appendChild(btnEliminar);
    hvHistorialEl.appendChild(li);
  });
}

async function eliminarReporte(reporte) {
  const confirmado = confirm(
    `¿Eliminar este reporte de ${reporte.tipo || 'mantenimiento'} (${formatearFechaLarga(reporte.fecha) || 'sin fecha'})?\n\n` +
    `Esta acción no se puede deshacer.`
  );
  if (!confirmado) return;

  try {
    await eliminarFotosReporte(reporte.id);
    await db.collection(APP_CONFIG.COLECCIONES.reportes).doc(reporte.id).delete();
  } catch (err) {
    console.error('Error al eliminar el reporte:', err);
    alert('No se pudo eliminar el reporte. Inténtalo de nuevo.');
  }
}

function cargarHistorialReportes(codigoEquipo) {
  if (!hvHistorialEl) return;

  if (cancelarEscuchaHistorial) {
    cancelarEscuchaHistorial();
    cancelarEscuchaHistorial = null;
  }

  if (!codigoEquipo) {
    hvHistorialEl.innerHTML = '<li><p class="lista-vacia">Selecciona un equipo para ver su historial.</p></li>';
    return;
  }

  hvHistorialEl.innerHTML = '<li><p class="lista-vacia">Cargando historial…</p></li>';

  cancelarEscuchaHistorial = db.collection(APP_CONFIG.COLECCIONES.reportes)
    .where('equipoCodigo', '==', codigoEquipo)
    .onSnapshot(
      renderizarHistorialReportes,
      err => {
        console.error('Error al cargar el historial de reportes:', err);
        hvHistorialEl.innerHTML = '<li><p class="lista-vacia">No se pudo cargar el historial de reportes.</p></li>';
      }
    );
}

function initHojaDeVida() {
  hvHistorialEl = document.getElementById('hvHistorialReportes');
  if (!hvEquipoSelect || !hvHistorialEl) return;

  hvEquipoSelect.addEventListener('change', () => cargarHistorialReportes(hvEquipoSelect.value));
}

/* ==============================================================
   10. GENERAR REPORTE
   ------------------------------------------------------------
   Guarda un reporte de mantenimiento en la colección "reportes".
   Las fotos de evidencia se comprimen en el navegador y se guardan
   como base64 en la subcolección "fotos" del reporte
   (reportes/{id}/fotos/{n}), un documento por foto. Así cada foto
   tiene su propio límite de 1 MB y el reporte puede tener tantas
   fotos como se necesiten, sin usar Firebase Storage. En el documento
   del reporte solo se guarda "totalFotos". Los reportes antiguos
   (con el arreglo "fotos" dentro del propio documento) siguen
   funcionando.
   ============================================================== */
let formReporte, repFecha, repHini, repHfin, repActividades, repRepuestos, repObs, repEvidencia,
    repRealizaExternoWrap, repRealizaExternoNombre,
    repFirmaCanvas, repFirmaCtx, btnLimpiarFirmaExterna,
    btnRepAtras, btnRepSiguiente, btnRepGenerar, btnRepLimpiar,
    repPasoTituloEl, repPasoContadorEl, repBarraProgresoEl, repResumenFinalEl;

const REALIZA_VALOR_EXTERNO = '__externo__';

const EVIDENCIA_MAX_DIMENSION = 1024;       // lado más largo, en píxeles, tras comprimir
const EVIDENCIA_CALIDAD_JPEG = 0.65;        // calidad JPEG (0-1) usada al comprimir
const EVIDENCIA_MAX_BYTES_FOTO = 700 * 1024; // tope por foto (cada una es su propio documento de Firestore, máx. 1 MB)
const EVIDENCIA_LOTE_FOTOS = 10;            // fotos por batch de escritura (el batch admite ~10 MB en total)

// Títulos mostrados en la barra de progreso del asistente. El orden
// coincide con los atributos "data-paso" de cada bloque ".rep-paso" en
// el HTML.
const REP_PASOS = [
  'Selecciona el equipo',
  'Fecha del mantenimiento',
  'Hora de inicio',
  'Hora final',
  'Tipo de mantenimiento',
  'Estado actual del equipo',
  '¿Se detuvo la producción?',
  'Tareas ejecutadas',
  'Actividades realizadas',
  'Repuestos utilizados',
  'Observaciones',
  'Evidencia fotográfica',
  '¿Quién realiza el mantenimiento?',
  '¿Quién aprueba el reporte?',
  'Confirmar y generar'
];

let repPasoActual = 1;
let repFirmaTieneTrazo = false; // true en cuanto el usuario dibuja algo en el lienzo de firma

function cachearElementosReporte() {
  formReporte = document.getElementById('formReporte');
  repFecha = document.getElementById('rep-fecha');
  repHini = document.getElementById('rep-hini');
  repHfin = document.getElementById('rep-hfin');
  repActividades = document.getElementById('rep-actividades');
  repRepuestos = document.getElementById('rep-repuestos');
  repObs = document.getElementById('rep-obs');
  repEvidencia = document.getElementById('rep-evidencia');
  repRealizaExternoWrap = document.getElementById('rep-realiza-externo-wrap');
  repRealizaExternoNombre = document.getElementById('rep-realiza-externo-nombre');
  repFirmaCanvas = document.getElementById('rep-firma-canvas');
  btnLimpiarFirmaExterna = document.getElementById('btnLimpiarFirmaExterna');
  btnRepAtras = document.getElementById('btnRepAtras');
  btnRepSiguiente = document.getElementById('btnRepSiguiente');
  btnRepGenerar = document.getElementById('btnRepGenerar');
  btnRepLimpiar = document.getElementById('btnRepLimpiar');
  repPasoTituloEl = document.getElementById('repPasoTitulo');
  repPasoContadorEl = document.getElementById('repPasoContador');
  repBarraProgresoEl = document.getElementById('repBarraProgreso');
  repResumenFinalEl = document.getElementById('repResumenFinal');
}

// Añade la opción "Proveedor externo" al final del <select> "Quien realiza"
// (no se agrega a "Quien aprueba", que solo admite técnicos registrados).
function agregarOpcionProveedorExterno() {
  if (!repRealizaSelect) return;
  if ([...repRealizaSelect.options].some(o => o.value === REALIZA_VALOR_EXTERNO)) return;
  const opt = document.createElement('option');
  opt.value = REALIZA_VALOR_EXTERNO;
  opt.textContent = 'Proveedor externo';
  repRealizaSelect.appendChild(opt);
}

// Muestra/oculta el bloque de nombre + firma manuscrita del proveedor
// externo según lo elegido en "Quien realiza".
function actualizarUIRealizaExterno() {
  if (!repRealizaSelect || !repRealizaExternoWrap) return;
  const esExterno = repRealizaSelect.value === REALIZA_VALOR_EXTERNO;
  mostrarOcultar(repRealizaExternoWrap, esExterno);
  repRealizaExternoNombre.required = esExterno;
  if (!esExterno) {
    repRealizaExternoNombre.value = '';
    limpiarFirmaExterna();
  }
}

/* ---------- Firma manuscrita del proveedor externo (lienzo táctil) ----------
   En vez de escribir el nombre con el teclado a modo de firma, el
   proveedor externo dibuja su firma directamente en pantalla (con el
   dedo en móvil o con el mouse en escritorio), igual que firmaría en
   papel. Se usa la API de Pointer Events para soportar mouse, dedo y
   lápiz óptico con el mismo código. */
function limpiarFirmaExterna() {
  if (!repFirmaCanvas || !repFirmaCtx) return;
  repFirmaCtx.fillStyle = '#ffffff';
  repFirmaCtx.fillRect(0, 0, repFirmaCanvas.width, repFirmaCanvas.height);
  repFirmaTieneTrazo = false;
}

function posicionEnLienzoFirma(e) {
  const rect = repFirmaCanvas.getBoundingClientRect();
  const escalaX = repFirmaCanvas.width / rect.width;
  const escalaY = repFirmaCanvas.height / rect.height;
  return { x: (e.clientX - rect.left) * escalaX, y: (e.clientY - rect.top) * escalaY };
}

function initFirmaExternaCanvas() {
  if (!repFirmaCanvas) return;
  repFirmaCtx = repFirmaCanvas.getContext('2d');
  repFirmaCtx.lineWidth = 2.4;
  repFirmaCtx.lineCap = 'round';
  repFirmaCtx.lineJoin = 'round';
  repFirmaCtx.strokeStyle = '#0f172a';
  limpiarFirmaExterna();

  let dibujando = false;

  repFirmaCanvas.addEventListener('pointerdown', e => {
    dibujando = true;
    repFirmaTieneTrazo = true;
    const { x, y } = posicionEnLienzoFirma(e);
    repFirmaCtx.beginPath();
    repFirmaCtx.moveTo(x, y);
    repFirmaCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  repFirmaCanvas.addEventListener('pointermove', e => {
    if (!dibujando) return;
    const { x, y } = posicionEnLienzoFirma(e);
    repFirmaCtx.lineTo(x, y);
    repFirmaCtx.stroke();
    e.preventDefault();
  });

  const terminarTrazo = () => { dibujando = false; };
  repFirmaCanvas.addEventListener('pointerup', terminarTrazo);
  repFirmaCanvas.addEventListener('pointerleave', terminarTrazo);
  repFirmaCanvas.addEventListener('pointercancel', terminarTrazo);

  if (btnLimpiarFirmaExterna) {
    btnLimpiarFirmaExterna.addEventListener('click', limpiarFirmaExterna);
  }
}

/* ---------- Asistente paso a paso ----------
   Muestra un solo bloque ".rep-paso" a la vez (según su atributo
   "data-paso") y actualiza la barra de progreso. Los campos de los
   pasos que no están visibles no bloquean el envío del formulario
   (al tener el atributo "hidden" quedan fuera de la validación nativa
   del navegador), así que la validación real ocurre en
   repValidarPasoActual() antes de avanzar, y de nuevo en
   manejarSubmitReporte() como última comprobación. */
// Pequeño helper: alterna la visibilidad de un elemento usando tanto el
// atributo "hidden" como "style.display". Se hace así porque en este
// proyecto los botones ".btn" (y otros elementos) suelen traer su propio
// "display" (flex/inline-flex) desde style.css, y eso puede pisar el
// display:none que el navegador aplica por defecto al atributo "hidden".
// Forzando también el estilo en línea nos aseguramos de que sí se oculte.
function mostrarOcultar(el, mostrar) {
  if (!el) return;
  el.hidden = !mostrar;
  el.style.display = mostrar ? '' : 'none';
}

function repIrAPaso(n) {
  if (!formReporte) return;
  const total = REP_PASOS.length;
  n = Math.min(Math.max(n, 1), total);

  formReporte.querySelectorAll('.rep-paso').forEach(el => {
    mostrarOcultar(el, Number(el.dataset.paso) === n);
  });
  repPasoActual = n;

  if (repPasoTituloEl) repPasoTituloEl.textContent = REP_PASOS[n - 1];
  if (repPasoContadorEl) repPasoContadorEl.textContent = `Paso ${n} de ${total}`;
  if (repBarraProgresoEl) repBarraProgresoEl.style.width = `${(n / total) * 100}%`;

  const esUltimoPaso = n === total;
  mostrarOcultar(btnRepAtras, n !== 1);
  mostrarOcultar(btnRepSiguiente, !esUltimoPaso);
  mostrarOcultar(btnRepGenerar, esUltimoPaso);
  if (esUltimoPaso) repActualizarResumenFinal();

  const panel = formReporte.closest('.panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function repValidarPasoActual() {
  switch (repPasoActual) {
    case 1:
      if (!repEquipoSelect || !repEquipoSelect.value) {
        alert('Selecciona el equipo antes de continuar.');
        return false;
      }
      return true;
    case 2:
      if (!repFecha.value) { alert('Selecciona la fecha del mantenimiento.'); return false; }
      return true;
    case 3:
      if (!repHini.value) { alert('Selecciona la hora de inicio.'); return false; }
      return true;
    case 4:
      if (!repHfin.value) { alert('Selecciona la hora final.'); return false; }
      if (repHini.value && repHfin.value < repHini.value) {
        alert('La hora final no puede ser anterior a la hora de inicio.');
        return false;
      }
      return true;
    case 5:
      if (!document.querySelector('#reporte input[name="rep-tipo"]:checked')) {
        alert('Selecciona el tipo de mantenimiento.');
        return false;
      }
      return true;
    case 6:
      if (!document.querySelector('#reporte input[name="rep-estado"]:checked')) {
        alert('Selecciona el estado actual del equipo.');
        return false;
      }
      return true;
    case 7:
      if (!document.querySelector('#reporte input[name="rep-parada"]:checked')) {
        alert('Indica si se detuvo la producción debido a esta intervención.');
        return false;
      }
      return true;
    case 13: {
      if (!repRealizaSelect || !repRealizaSelect.value) {
        alert('Selecciona quién realiza el mantenimiento.');
        return false;
      }
      const esExterno = repRealizaSelect.value === REALIZA_VALOR_EXTERNO;
      if (esExterno) {
        if (!repRealizaExternoNombre.value.trim()) {
          alert('Escribe el nombre del proveedor externo.');
          return false;
        }
        if (!repFirmaTieneTrazo) {
          alert('Dibuja la firma del proveedor externo en el recuadro.');
          return false;
        }
      }
      return true;
    }
    case 14:
      if (!repApruebaSelect || !repApruebaSelect.value) {
        alert('Selecciona quién aprueba el reporte.');
        return false;
      }
      return true;
    default:
      return true; // pasos sin campos obligatorios (tareas, actividades, repuestos, observaciones, evidencia)
  }
}

function repActualizarResumenFinal() {
  if (!repResumenFinalEl) return;
  const equipoOpcion = repEquipoSelect.options[repEquipoSelect.selectedIndex];
  const tecnicoOpcion = repRealizaSelect.options[repRealizaSelect.selectedIndex];
  const apruebaOpcion = repApruebaSelect.options[repApruebaSelect.selectedIndex];
  const tipoSeleccionado = document.querySelector('#reporte input[name="rep-tipo"]:checked');
  const estadoSeleccionado = document.querySelector('#reporte input[name="rep-estado"]:checked');
  const paradaSeleccionada = document.querySelector('#reporte input[name="rep-parada"]:checked');
  const esExterno = repRealizaSelect.value === REALIZA_VALOR_EXTERNO;

  const nombreEquipo = equipoOpcion && equipoOpcion.dataset ? equipoOpcion.dataset.nombre : '';
  const nombreRealiza = esExterno
    ? `${repRealizaExternoNombre.value.trim() || '—'} (proveedor externo)`
    : (tecnicoOpcion && tecnicoOpcion.dataset ? tecnicoOpcion.dataset.nombre : '—');
  const nombreAprueba = apruebaOpcion && apruebaOpcion.dataset ? apruebaOpcion.dataset.nombre : '—';

  repResumenFinalEl.innerHTML =
    `<p><b>Equipo:</b> ${escaparHtml(nombreEquipo || '—')}</p>` +
    `<p><b>Fecha:</b> ${escaparHtml(repFecha.value || '—')} &nbsp; <b>Horario:</b> ${escaparHtml(repHini.value || '—')} a ${escaparHtml(repHfin.value || '—')}</p>` +
    `<p><b>Tipo de mantenimiento:</b> ${escaparHtml(tipoSeleccionado ? tipoSeleccionado.value : '—')}</p>` +
    `<p><b>Estado del equipo:</b> ${escaparHtml(estadoSeleccionado ? estadoSeleccionado.value : '—')}</p>` +
    `<p><b>¿Detuvo la producción?:</b> ${escaparHtml(paradaSeleccionada ? paradaSeleccionada.value : '—')}</p>` +
    `<p><b>Realiza:</b> ${escaparHtml(nombreRealiza || '—')}</p>` +
    `<p><b>Aprueba:</b> ${escaparHtml(nombreAprueba || '—')}</p>`;
}

function initWizardReporte() {
  if (!formReporte) return;

  if (btnRepSiguiente) {
    btnRepSiguiente.addEventListener('click', () => {
      if (repValidarPasoActual()) repIrAPaso(repPasoActual + 1);
    });
  }
  if (btnRepAtras) {
    btnRepAtras.addEventListener('click', () => repIrAPaso(repPasoActual - 1));
  }
  if (btnRepLimpiar) {
    btnRepLimpiar.addEventListener('click', () => {
      const confirmado = confirm('¿Limpiar todos los datos del reporte y empezar de nuevo?');
      if (!confirmado) return;
      formReporte.reset();
      actualizarOpcionesRepEquipo();
      actualizarUIRealizaExterno();
      limpiarFirmaExterna();
      repIrAPaso(1);
    });
  }

  // Evita que la tecla Enter envíe el formulario antes de llegar al
  // último paso (por ejemplo, al presionar Enter dentro de un campo
  // de texto en un paso intermedio).
  formReporte.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && repPasoActual !== REP_PASOS.length) {
      e.preventDefault();
    }
  });

  repIrAPaso(1);
}

// Redimensiona y recomprime una foto en el navegador (canvas) antes de
// convertirla a base64, para que ocupe mucho menos espacio sin perder
// nitidez perceptible. Así se pueden adjuntar muchas más fotos por reporte.
function comprimirImagenComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error(`No se pudo leer "${archivo.name}".`));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`"${archivo.name}" no es una imagen válida.`));
      img.onload = () => {
        let { width, height } = img;
        if (width > EVIDENCIA_MAX_DIMENSION || height > EVIDENCIA_MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round(height * (EVIDENCIA_MAX_DIMENSION / width));
            width = EVIDENCIA_MAX_DIMENSION;
          } else {
            width = Math.round(width * (EVIDENCIA_MAX_DIMENSION / height));
            height = EVIDENCIA_MAX_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        // Si por alguna razón la foto sigue siendo muy pesada, baja la calidad hasta que quepa.
        let calidad = EVIDENCIA_CALIDAD_JPEG;
        let resultado = canvas.toDataURL('image/jpeg', calidad);
        while (resultado.length > EVIDENCIA_MAX_BYTES_FOTO && calidad > 0.3) {
          calidad -= 0.1;
          resultado = canvas.toDataURL('image/jpeg', calidad);
        }
        resolve(resultado);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

async function leerEvidenciaComoBase64(fileList) {
  const archivos = Array.from(fileList || []);
  if (archivos.length === 0) return [];

  const resultados = [];

  for (const archivo of archivos) {
    if (!archivo.type.startsWith('image/')) {
      throw new Error(`"${archivo.name}" no es una imagen válida.`);
    }
    resultados.push(await comprimirImagenComoBase64(archivo));
  }
  return resultados;
}

/* ---------- Fotos del reporte en la subcolección reportes/{id}/fotos ---------- */

const cacheFotosReporte = new Map(); // idReporte -> arreglo de fotos (evita releer Firestore)

function coleccionFotosReporte(idReporte) {
  return db.collection(APP_CONFIG.COLECCIONES.reportes).doc(idReporte).collection('fotos');
}

// Guarda las fotos (data URL JPEG) como un documento por foto, en lotes.
// Si algo falla, borra lo que alcanzó a escribir y relanza el error.
async function guardarFotosReporte(idReporte, fotosBase64, alProgreso) {
  const col = coleccionFotosReporte(idReporte);
  try {
    for (let i = 0; i < fotosBase64.length; i += EVIDENCIA_LOTE_FOTOS) {
      const batch = db.batch();
      fotosBase64.slice(i, i + EVIDENCIA_LOTE_FOTOS).forEach((data, j) => {
        const orden = i + j;
        batch.set(col.doc(String(orden).padStart(4, '0')), { orden, data });
      });
      await batch.commit();
      if (alProgreso) alProgreso(Math.min(i + EVIDENCIA_LOTE_FOTOS, fotosBase64.length), fotosBase64.length);
    }
  } catch (err) {
    await eliminarFotosReporte(idReporte).catch(() => {});
    throw err;
  }
}

// Borra todas las fotos de un reporte (Firestore no borra subcolecciones solo).
async function eliminarFotosReporte(idReporte) {
  const snap = await coleccionFotosReporte(idReporte).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  cacheFotosReporte.delete(idReporte);
}

// Devuelve las fotos (data URL) de un reporte: las de reportes antiguos
// vienen dentro del propio documento; las nuevas se leen de la subcolección.
async function obtenerFotosReporte(reporte) {
  if (Array.isArray(reporte.fotos)) return reporte.fotos; // reporte antiguo o recién creado (en memoria)
  if (!reporte.id || !(reporte.totalFotos > 0)) return [];
  if (cacheFotosReporte.has(reporte.id)) return cacheFotosReporte.get(reporte.id);
  const snap = await coleccionFotosReporte(reporte.id).orderBy('orden').get();
  const fotos = snap.docs.map(d => d.data().data);
  cacheFotosReporte.set(reporte.id, fotos);
  return fotos;
}


async function manejarSubmitReporte(e) {
  e.preventDefault();

  const equipoOpcion = repEquipoSelect.options[repEquipoSelect.selectedIndex];
  if (!repEquipoSelect.value) {
    alert('Selecciona un equipo.');
    return;
  }

  const tecnicoOpcion = repRealizaSelect.options[repRealizaSelect.selectedIndex];
  if (!repRealizaSelect.value) {
    alert('Selecciona quién realiza el mantenimiento.');
    return;
  }

  const realizaEsExterno = repRealizaSelect.value === REALIZA_VALOR_EXTERNO;
  const nombreProveedorExterno = repRealizaExternoNombre ? repRealizaExternoNombre.value.trim() : '';
  if (realizaEsExterno && !nombreProveedorExterno) {
    alert('Escribe el nombre del proveedor externo.');
    return;
  }

  let firmaExternaBase64 = null;
  if (realizaEsExterno) {
    if (!repFirmaTieneTrazo) {
      alert('Dibuja la firma del proveedor externo en el recuadro.');
      return;
    }
    firmaExternaBase64 = repFirmaCanvas.toDataURL('image/png');
  }

  const apruebaOpcion = repApruebaSelect.options[repApruebaSelect.selectedIndex];
  if (!repApruebaSelect.value) {
    alert('Selecciona quién aprueba el reporte.');
    return;
  }

  const tipoSeleccionado = document.querySelector('#reporte input[name="rep-tipo"]:checked');
  const estadoSeleccionado = document.querySelector('#reporte input[name="rep-estado"]:checked');
  const paradaSeleccionada = document.querySelector('#reporte input[name="rep-parada"]:checked');
  if (!tipoSeleccionado) {
    alert('Selecciona el tipo de mantenimiento.');
    return;
  }
  if (!estadoSeleccionado) {
    alert('Selecciona el estado actual del equipo.');
    return;
  }
  if (!paradaSeleccionada) {
    alert('Indica si se detuvo la producción debido a esta intervención.');
    return;
  }
  const paradaProduccion = paradaSeleccionada.value === 'Sí';

  const fecha = repFecha.value;
  const horaInicio = repHini.value;
  const horaFin = repHfin.value;
  if (!fecha || !horaInicio || !horaFin) {
    alert('Completa la fecha, la hora de inicio y la hora final.');
    return;
  }

  const tareas = [...document.querySelectorAll('#reporte .tareas input[type="checkbox"]:checked')]
    .map(cb => cb.closest('label').textContent.trim());

  const btnSubmit = formReporte.querySelector('button[type="submit"]');
  const textoOriginal = btnSubmit.textContent;
  btnSubmit.disabled = true;

  let fotos;
  try {
    btnSubmit.textContent = 'Procesando fotos…';
    fotos = await leerEvidenciaComoBase64(repEvidencia.files);
  } catch (err) {
    alert(err.message);
    btnSubmit.disabled = false;
    btnSubmit.textContent = textoOriginal;
    return;
  }

  btnSubmit.textContent = 'Guardando…';

  // Armamos el objeto una sola vez: se usa tanto para guardarlo en
  // Firestore como para generar el PDF justo después.
  const datosReporte = {
    equipoCodigo: repEquipoSelect.value,
    equipoNombre: equipoOpcion.dataset.nombre || '',
    equipoUbicacion: equipoOpcion.dataset.ubicacion || '',
    equipoMarca: equipoOpcion.dataset.marca || '',
    equipoModelo: equipoOpcion.dataset.modelo || '',
    equipoSerie: equipoOpcion.dataset.serie || '',
    realizaId: realizaEsExterno ? null : repRealizaSelect.value,
    realizaEsExterno,
    realizaNombre: realizaEsExterno ? nombreProveedorExterno : (tecnicoOpcion.dataset.nombre || ''),
    realizaCargo: realizaEsExterno ? '' : (tecnicoOpcion.dataset.cargo || ''),
    firmaExternaBase64: realizaEsExterno ? firmaExternaBase64 : null,
    apruebaId: repApruebaSelect.value,
    apruebaNombre: apruebaOpcion.dataset.nombre || '',
    apruebaCargo: apruebaOpcion.dataset.cargo || '',
    fecha,
    horaInicio,
    horaFin,
    tipo: tipoSeleccionado.value,
    estadoEquipo: estadoSeleccionado.value,
    paradaProduccion,
    tareas,
    actividades: repActividades.value.trim(),
    repuestos: repRepuestos.value.trim(),
    observaciones: repObs.value.trim(),
    fotos // base64 en memoria: se usa solo para el PDF; en Firestore van en la subcolección "fotos"
  };

  try {
    // Id generado de antemano: las fotos se escriben primero y el reporte después,
    // así el historial nunca muestra un reporte con fotos a medio guardar.
    const refReporte = db.collection(APP_CONFIG.COLECCIONES.reportes).doc();

    if (fotos.length) {
      await guardarFotosReporte(refReporte.id, fotos, (n, total) => {
        btnSubmit.textContent = `Guardando fotos ${n} de ${total}…`;
      });
      btnSubmit.textContent = 'Guardando…';
    }

    const { fotos: _fotosBase64, ...datosSinFotos } = datosReporte;
    try {
      await refReporte.set({
        ...datosSinFotos,
        totalFotos: fotos.length,
        fechaHora: firebase.firestore.Timestamp.fromDate(new Date(`${fecha}T${horaInicio}`)),
        creadoPorUid: sesionActual ? sesionActual.uid : null,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (errGuardar) {
      await eliminarFotosReporte(refReporte.id).catch(() => {}); // no dejar fotos huérfanas
      throw errGuardar;
    }

    // Generamos y descargamos el PDF del reporte recién guardado.
    try {
      await generarYDescargarPdfReporte(datosReporte);
    } catch (errPdf) {
      console.error('El reporte se guardó, pero falló la generación del PDF:', errPdf);
      alert('El reporte se guardó correctamente, pero no se pudo generar el PDF.');
    }

    alert('Reporte guardado correctamente.');
    formReporte.reset();
    actualizarOpcionesRepEquipo(); // el reset del <select> nativo no dispara "change"
    actualizarUIRealizaExterno();
    limpiarFirmaExterna();
    repIrAPaso(1);
  } catch (err) {
    console.error('Error al guardar el reporte:', err);
    alert('No se pudo guardar el reporte. Inténtalo de nuevo.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = textoOriginal;
  }
}

function initGenerarReporte() {
  cachearElementosReporte();
  if (!formReporte) return;

  initSelectRealiza();
  initSelectAprueba();
  initFirmaExternaCanvas();
  initWizardReporte();

  if (repRealizaSelect) repRealizaSelect.addEventListener('change', actualizarUIRealizaExterno);

  formReporte.addEventListener('submit', manejarSubmitReporte);
}

/* ==============================================================
   11. DETALLE DE REPORTE (modal en Hoja de vida) + PDF
   ------------------------------------------------------------
   - abrirModalDetalleReporte(): al hacer clic en un ítem del
     historial, muestra sus datos completos en un modal de solo
     lectura, con un botón "Ver PDF".
   - construirPdfReporte(): arma el PDF (jsPDF) a partir de los
     datos de un reporte; se reutiliza tanto para el botón "Ver
     PDF" del historial como para la descarga automática al
     generar un reporte nuevo.
   ============================================================== */
let modalDetalleReporte, btnVerPdfReporte,
    detEquipo, detTipo, detFecha, detDuracion, detRealiza, detAprueba,
    detEstado, detParada, detTareas, detActividades, detRepuestos, detObservaciones,
    detFotosContenedor, detFotos;
let reporteSeleccionadoActual = null;

function cachearElementosDetalleReporte() {
  modalDetalleReporte = document.getElementById('modalDetalleReporte');
  if (!modalDetalleReporte) return;
  btnVerPdfReporte = document.getElementById('btnVerPdfReporte');
  detEquipo = document.getElementById('detEquipo');
  detTipo = document.getElementById('detTipo');
  detFecha = document.getElementById('detFecha');
  detDuracion = document.getElementById('detDuracion');
  detRealiza = document.getElementById('detRealiza');
  detAprueba = document.getElementById('detAprueba');
  detEstado = document.getElementById('detEstado');
  detParada = document.getElementById('detParada');
  detTareas = document.getElementById('detTareas');
  detActividades = document.getElementById('detActividades');
  detRepuestos = document.getElementById('detRepuestos');
  detObservaciones = document.getElementById('detObservaciones');
  detFotosContenedor = document.getElementById('detFotosContenedor');
  detFotos = document.getElementById('detFotos');
}

function abrirModalDetalleReporte(reporte) {
  if (!modalDetalleReporte) return;
  reporteSeleccionadoActual = reporte;

  detEquipo.textContent = reporte.equipoNombre || '—';
  detTipo.textContent = reporte.tipo || '—';
  detFecha.textContent = formatearFechaLarga(reporte.fecha) || '—';
  detDuracion.textContent = formatearDuracion(calcularDuracionHoras(reporte.horaInicio, reporte.horaFin));
  detRealiza.textContent = `${reporte.realizaNombre || '—'}${reporte.realizaCargo ? ' · ' + reporte.realizaCargo : ''}`;
  detAprueba.textContent = `${reporte.apruebaNombre || '—'}${reporte.apruebaCargo ? ' · ' + reporte.apruebaCargo : ''}`;
  detEstado.textContent = reporte.estadoEquipo || '—';
  detParada.textContent = reporte.paradaProduccion === true ? 'Sí' : (reporte.paradaProduccion === false ? 'No' : '—');
  detTareas.textContent = (reporte.tareas && reporte.tareas.length) ? reporte.tareas.join(', ') : 'Ninguna';
  detActividades.textContent = reporte.actividades || '—';
  detRepuestos.textContent = reporte.repuestos || 'Ninguno';
  detObservaciones.textContent = reporte.observaciones || '—';

  detFotos.innerHTML = '';
  const hayFotos = Array.isArray(reporte.fotos) ? reporte.fotos.length > 0 : reporte.totalFotos > 0;
  detFotosContenedor.hidden = !hayFotos;
  if (hayFotos) {
    detFotos.textContent = 'Cargando fotos…';
    obtenerFotosReporte(reporte).then(fotos => {
      if (reporteSeleccionadoActual !== reporte) return; // el usuario ya abrió otro reporte
      detFotos.innerHTML = '';
      fotos.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Evidencia fotográfica del reporte';
        img.addEventListener('click', () => {
          const w = window.open('', '_blank');
          if (w) w.document.write(`<img src="${src}" style="max-width:100%">`);
        });
        detFotos.appendChild(img);
      });
    }).catch(err => {
      console.error('No se pudieron cargar las fotos del reporte:', err);
      if (reporteSeleccionadoActual === reporte) detFotos.textContent = 'No se pudieron cargar las fotos.';
    });
  }

  modalDetalleReporte.hidden = false;
}

function cerrarModalDetalleReporte() {
  modalDetalleReporte.hidden = true;
  reporteSeleccionadoActual = null;
}

function initModalDetalleReporte() {
  cachearElementosDetalleReporte();
  if (!modalDetalleReporte) return;

  modalDetalleReporte.querySelectorAll('[data-cerrar-modal]').forEach(el => {
    el.addEventListener('click', cerrarModalDetalleReporte);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalDetalleReporte.hidden) cerrarModalDetalleReporte();
  });

  btnVerPdfReporte.addEventListener('click', async () => {
    if (!reporteSeleccionadoActual) return;
    const textoOriginal = btnVerPdfReporte.textContent;
    btnVerPdfReporte.disabled = true;
    btnVerPdfReporte.textContent = 'Generando PDF…';
    try {
      await verPdfReporte(reporteSeleccionadoActual);
    } catch (err) {
      console.error('Error al generar el PDF del reporte:', err);
      alert('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      btnVerPdfReporte.disabled = false;
      btnVerPdfReporte.textContent = textoOriginal;
    }
  });
}

/* ---------- Construcción del documento PDF con jsPDF ---------- */

async function obtenerLogoEmpresaBase64() {
  try {
    const doc = await db.collection(APP_CONFIG.COLECCIONES.configuracion).doc('empresa').get();
    if (doc.exists && doc.data().logoBase64) return doc.data().logoBase64;
  } catch (err) {
    console.error('No se pudo cargar el logo para el PDF:', err);
  }
  return null;
}

async function obtenerFirmaTecnicoPorId(id) {
  if (!id) return null;
  try {
    const doc = await db.collection(APP_CONFIG.COLECCIONES.tecnicos).doc(id).get();
    if (doc.exists && doc.data().firmaBase64) return doc.data().firmaBase64;
  } catch (err) {
    console.error('No se pudo cargar la firma del técnico para el PDF:', err);
  }
  return null;
}

function tipoImagenDesdeBase64(base64) {
  if (!base64) return 'PNG';
  if (base64.startsWith('data:image/jpeg') || base64.startsWith('data:image/jpg')) return 'JPEG';
  return 'PNG';
}

function cargarDimensionesImagen(base64) {
  return new Promise(resolve => {
    if (!base64) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

// Inserta una imagen dentro de una caja (x, y, ancho, alto) conservando su
// proporción original y centrándola, en vez de deformarla al tamaño exacto.
async function insertarImagenAjustada(doc, base64, x, y, ancho, alto) {
  if (!base64) return;
  const dim = await cargarDimensionesImagen(base64);
  let w = ancho, h = alto, offX = 0, offY = 0;
  if (dim && dim.w && dim.h) {
    const escala = Math.min(ancho / dim.w, alto / dim.h);
    w = dim.w * escala;
    h = dim.h * escala;
    offX = (ancho - w) / 2;
    offY = (alto - h) / 2;
  }
  try {
    doc.addImage(base64, tipoImagenDesdeBase64(base64), x + offX, y + offY, w, h, undefined, 'FAST');
  } catch (err) {
    console.warn('No se pudo insertar una imagen en el PDF:', err);
  }
}

function agregarTextoConSalto(doc, texto, x, y, maxAncho, lineHeight) {
  const lineas = doc.splitTextToSize(texto || '—', maxAncho);
  doc.text(lineas, x, y);
  return y + lineas.length * lineHeight;
}

// Dibuja una casilla de verificación (cuadro) seguida del texto de la
// opción; si "marcada" es true, la casilla aparece rellena con un check.
function dibujarOpcionCasilla(doc, x, y, texto, marcada) {
  const lado = 3.4;
  const cajaY = y - lado + 0.9;
  const radio = 0.5; // Radio de las esquinas

  // Recuadro gris claro con esquinas redondeadas
  doc.setFillColor(160, 160, 160);
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, cajaY, lado, lado, radio, radio, 'FD');

  // Palomita blanca
  if (marcada) {
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);

    doc.line(
      x + 0.6,
      cajaY + lado / 2,
      x + lado / 2,
      cajaY + lado - 0.6
    );

    doc.line(
      x + lado / 2,
      cajaY + lado - 0.6,
      x + lado - 0.5,
      cajaY + 0.5
    );
  }

  // Texto
  doc.setDrawColor(0);
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.text(texto, x + lado + 2.5, y);
}



// Dibuja una línea gruesa separadora entre segmentos del formato.
function lineaGruesa(doc, margen, anchoTotal, y) {
  doc.setDrawColor(15);
  doc.setLineWidth(0.45);
  doc.line(margen, y, margen + anchoTotal, y);
  doc.setLineWidth(0.2);
  doc.setDrawColor(0);
}

// Título de segmento (ej. "DATOS DEL EQUIPO O ÁREA"), en mayúsculas y negrita.
function tituloSegmento(doc, texto, x, y) {
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(texto.toUpperCase(), x, y);
}

function formatearDuracionCompleta(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return '—';
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaFin.split(':').map(Number);
  let minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutos < 0) minutos += 24 * 60; // por si el trabajo cruza la medianoche
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  const partes = [];
  if (horas > 0) partes.push(`${horas} hora${horas === 1 ? '' : 's'}`);
  if (mins > 0 || partes.length === 0) partes.push(`${mins} minuto${mins === 1 ? '' : 's'}`);
  return partes.join(' ');
}

const TIPO_ORDEN_LABEL_PDF = {
  Preventivo: 'Mantenimiento Preventivo',
  Correctivo: 'Mantenimiento correctivo'
};
// Columna izquierda y derecha, en el mismo orden que en el formulario.
const TIPO_ORDEN_COL_IZQ = ['Preventivo', 'Correctivo', 'Locativo'];
const TIPO_ORDEN_COL_DER = ['Instalación', 'Desinstalación', 'Dada de baja'];

const ESTADO_EQUIPO_OPCIONES = ['Funcionando', 'Con falla', 'Fuera de servicio'];

const TAREAS_COL_IZQ = ['Ajuste', 'Configuración', 'Reparación', 'Lubricación'];
const TAREAS_COL_DER = ['Test de temperatura', 'Limpieza interna', 'Limpieza externa', 'Verificación de fugas'];

async function construirPdfReporte(reporte) {
  await cargarLibreria('jspdf');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const margen = 15;
  const anchoUtil = 210 - margen * 2;
  let y = margen-5;

  const [logo, firmaRealiza, firmaAprueba] = await Promise.all([
    obtenerLogoEmpresaBase64(),
    obtenerFirmaTecnicoPorId(reporte.realizaId),
    obtenerFirmaTecnicoPorId(reporte.apruebaId)
  ]);

  const fr = APP_CONFIG.FORMATO_REPORTE || {};

  /* ================= Encabezado: logo · título · ficha del documento ================= */
  const alturaEncabezado = 22;
  const colLogoAncho = anchoUtil * 0.18;
  const colInfoAncho = anchoUtil * 0.30;
  const colTituloAncho = anchoUtil - colLogoAncho - colInfoAncho;
  const xLogo = margen;
  const xTitulo = margen + colLogoAncho;
  const xInfo = margen + colLogoAncho + colTituloAncho;

  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  // Marco exterior y divisiones de columnas.
  doc.rect(margen, y, anchoUtil, alturaEncabezado);
  doc.line(xTitulo, y, xTitulo, y + alturaEncabezado);
  doc.line(xInfo, y, xInfo, y + alturaEncabezado);

  // Logo (centrado dentro de su celda, conservando proporción).
  if (logo) {
    await insertarImagenAjustada(doc, logo, xLogo + 1, y + 0.5, colLogoAncho - 1, alturaEncabezado - 1);
  }

  // Título del documento, centrado en su celda.
  doc.setFont('courier', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  const lineasTitulo = doc.splitTextToSize(fr.titulo || 'FORMATO DE REPORTE DE MANTENIMIENTO', colTituloAncho - 8);
  const altoTitulo = lineasTitulo.length * 6;
  doc.text(lineasTitulo, xTitulo + colTituloAncho / 2, y + alturaEncabezado / 2 - altoTitulo / 2 + 4, { align: 'center' });

  // Ficha del documento: código / versión / fecha de emisión, en 3 filas.
  const filaInfoAlto = alturaEncabezado / 3;
  doc.line(xInfo, y + filaInfoAlto, xInfo + colInfoAncho, y + filaInfoAlto);
  doc.line(xInfo, y + filaInfoAlto * 2, xInfo + colInfoAncho, y + filaInfoAlto * 2);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(fr.codigo || '', xInfo + 1, y + filaInfoAlto * 1 - 2.5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.text(`Versión ${fr.version || ''}`, xInfo + 1, y + filaInfoAlto * 2 - 2.5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.text(`Fecha de emisión: ${fr.fechaEmision || ''}`, xInfo + 1, y + filaInfoAlto * 3 - 2.5);

  y += alturaEncabezado + 6;

  /* ================= Datos generales del reporte ================= */
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Fecha: ${formatearFechaLarga(reporte.fecha) || '—'}`, margen, y); y += 4;
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.text(`Hora de inicio: ${reporte.horaInicio || '—'}`, margen, y); y += 4;
  doc.text(`Hora Final: ${reporte.horaFin || '—'}`, margen, y); y += 4;
  doc.text(`Tiempo total: ${formatearDuracionCompleta(reporte.horaInicio, reporte.horaFin)}`, margen, y); y += 7;

  lineaGruesa(doc, margen, anchoUtil, y-4); y += 2;

  /* ================= Datos del equipo o área ================= */
  tituloSegmento(doc, 'Datos del equipo o área', margen, y); 
  y += 6;

  const colIzqX = margen;
  const colDerX = margen + anchoUtil / 2;

  const filasEquipo = [
    ['Código', reporte.equipoCodigo || 'No registra', 'Marca', reporte.equipoMarca || 'No registra'],
    ['Nombre', reporte.equipoNombre || 'No registra', 'Modelo', reporte.equipoModelo || 'No registra'],
    ['Ubicación', reporte.equipoUbicacion || 'No registra', 'Serie', reporte.equipoSerie || 'No registra']
  ];

  doc.setFontSize(9);

  // Ancho normal para los valores
  const anchoValorEquipo = anchoUtil / 2 - 24;

  // Ancho especial para el NOMBRE:
  // desde donde empieza el valor hasta antes de la columna derecha
  const anchoNombre = colDerX - (colIzqX + 20) - 10;

  filasEquipo.forEach(([lIzq, vIzq, lDer, vDer]) => {

    // Si es Nombre, usar todo el espacio disponible
    const anchoIzq = lIzq === 'Nombre'
      ? anchoNombre
      : anchoValorEquipo;

    const lineasIzq = doc.splitTextToSize(String(vIzq), anchoIzq);
    const lineasDer = doc.splitTextToSize(String(vDer), anchoValorEquipo);

    const cantidadLineas = Math.max(
      lineasIzq.length,
      lineasDer.length
    );

    // Etiqueta izquierda
    doc.setFont('courier', 'bold');
    doc.text(`${lIzq}:`, colIzqX, y - 1);

    // Valor izquierda
    doc.setFont('courier', 'normal');
    doc.text(
      lineasIzq,
      colIzqX + 20,
      y - 1
    );

    // Etiqueta derecha
    doc.setFont('courier', 'bold');
    doc.text(`${lDer}:`, colDerX, y - 1);

    // Valor derecha
    doc.setFont('courier', 'normal');
    doc.text(
      lineasDer,
      colDerX + 15,
      y - 1
    );

    // Ajustar altura según cantidad de líneas
    y += Math.max(5, cantidadLineas * 4.5);
  });

  y += 1;

  lineaGruesa(doc, margen, anchoUtil, y - 4); 
  y += 2;
  /* ================= Tipo de orden ================= */
  tituloSegmento(doc, 'Tipo de orden', margen, y); y += 6;
  for (let i = 0; i < 3; i++) {
    const valIzq = TIPO_ORDEN_COL_IZQ[i];
    const valDer = TIPO_ORDEN_COL_DER[i];
    dibujarOpcionCasilla(doc, colIzqX, y, TIPO_ORDEN_LABEL_PDF[valIzq] || valIzq, reporte.tipo === valIzq);
    dibujarOpcionCasilla(doc, colDerX, y, TIPO_ORDEN_LABEL_PDF[valDer] || valDer, reporte.tipo === valDer);
    y += 5;
  }
  y += 2;

  lineaGruesa(doc, margen, anchoUtil, y-4); y += 2;

  /* ================= Estado actual del equipo o área ================= */
  tituloSegmento(doc, 'Estado actual del equipo o área', margen, y); y += 6;
  ESTADO_EQUIPO_OPCIONES.forEach(estado => {
    dibujarOpcionCasilla(doc, colIzqX, y, estado, reporte.estadoEquipo === estado);
    y += 5;
  });
  y += 2;

  lineaGruesa(doc, margen, anchoUtil, y-4); y += 2;

  /* ================= Tareas ejecutadas ================= */
  tituloSegmento(doc, 'Tareas ejecutadas', margen, y); y += 6;
  const tareasReporte = reporte.tareas || [];
  for (let i = 0; i < 4; i++) {
    const valIzq = TAREAS_COL_IZQ[i];
    const valDer = TAREAS_COL_DER[i];
    dibujarOpcionCasilla(doc, colIzqX, y, valIzq, tareasReporte.includes(valIzq));
    dibujarOpcionCasilla(doc, colDerX, y, valDer, tareasReporte.includes(valDer));
    y += 5;
  }
  y += 2;

  lineaGruesa(doc, margen, anchoUtil, y-4); y += 2;

/* ================= Actividades / repuestos / observaciones ================= */
const cajasTexto = [
  ['Actividades realizadas', reporte.actividades],
  ['Repuestos utilizados', reporte.repuestos],
  ['Observaciones', reporte.observaciones]
];

cajasTexto.forEach(([titulo, texto]) => {

  // =========================
  // CONFIGURACIÓN DEL TEXTO
  // =========================
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0);

  // Margen interno del texto
  const margenInternoX = 2;

  // Ancho real disponible dentro de la caja
  const anchoTexto = anchoUtil - (margenInternoX * 2);

  // IMPORTANTE:
  // La fuente y tamaño ya están definidos antes de splitTextToSize()
  const lineas = doc.splitTextToSize(
    texto || 'N/A.',
    anchoTexto
  );

  // =========================
  // ALTURA DE LA CAJA
  // =========================
  const altoLinea = 3.2;
  const margenSuperior = 1.5;
  const margenInferior = 1.5;

  const altoCaja = Math.max(
    lineas.length * altoLinea + margenSuperior + margenInferior,
    8
  );

  // =========================
  // CONTROL DE PÁGINA
  // =========================
  if (y + 8 + altoCaja > 280) {
    doc.addPage();
    y = margen;
  }

  // =========================
  // TÍTULO
  // =========================
  tituloSegmento(doc, titulo, margen, y);
  y += 5;

  // =========================
  // RECUADRO
  // =========================
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);

  doc.rect(
    margen,
    y - 1,
    anchoUtil,
    altoCaja
  );

  // =========================
  // TEXTO
  // =========================
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0);

  doc.text(
    lineas,
    margen + margenInternoX,
    y + margenSuperior + 1.5
  );

  y += altoCaja + 6;
});

  /* ================= Firmas ================= */
  const altoFirmas = 34;
  if (y + altoFirmas > 280) { doc.addPage(); y = margen; }
  const anchoFirma = anchoUtil / 2 - 6;
  const xFirmaIzq = margen;
  const xFirmaDer = margen + anchoUtil / 2 + 6;

  doc.setFont('courier', 'bold');
  doc.setFontSize(10.5);
  doc.text('MANTENIMIENTO REALIZADO POR:', xFirmaIzq, y);
  doc.text('MANTENIMIENTO APROBADO POR:', xFirmaDer, y);
  y += 4;

  const yImagenFirma = y;
  const altoImagenFirma = 16;
  if (reporte.realizaEsExterno) {
    if (reporte.firmaExternaBase64) {
      // Firma manuscrita dibujada en pantalla por el proveedor externo.
      await insertarImagenAjustada(doc, reporte.firmaExternaBase64, xFirmaIzq, yImagenFirma, anchoFirma, altoImagenFirma);
    } else {
      // Compatibilidad con reportes antiguos guardados antes de tener
      // firma dibujada: se escribe el nombre a modo de firma manuscrita
      // (fuente cursiva), centrado en la caja.
      doc.setFont('courier', 'italic');
      doc.setFontSize(13);
      doc.setTextColor(0);
      doc.text(reporte.realizaNombre || '—', xFirmaIzq + anchoFirma / 2, yImagenFirma + altoImagenFirma / 2 + 3, { align: 'center' });
    }
  } else {
    await insertarImagenAjustada(doc, firmaRealiza, xFirmaIzq, yImagenFirma, anchoFirma, altoImagenFirma);
  }
  await insertarImagenAjustada(doc, firmaAprueba, xFirmaDer, yImagenFirma, anchoFirma, altoImagenFirma);
  y += altoImagenFirma;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(xFirmaIzq, y, xFirmaIzq + anchoFirma, y);
  doc.line(xFirmaDer, y, xFirmaDer + anchoFirma, y);
  y += 5;
// =========================
// DATOS DE LAS FIRMAS
// =========================
doc.setFontSize(9.5);

// ---------- NOMBRE ----------

// Firma izquierda: si es proveedor externo, se muestra igual que un
// técnico normal ("Nombre: <nombre ingresado>"); la leyenda
// "Proveedor externo" se escribe aparte, en el renglón de abajo
// (donde normalmente iría el cargo).
doc.setFont('courier', 'bold');
doc.text('Nombre:', xFirmaIzq, y);

const anchoNombreIzq = doc.getTextWidth('Nombre:');

doc.setFont('courier', 'normal');
doc.text(
  ` ${reporte.realizaNombre || '—'}`,
  xFirmaIzq + anchoNombreIzq,
  y
);

// Firma derecha
doc.setFont('courier', 'bold');
doc.text('Nombre:', xFirmaDer, y);

const anchoNombreDer = doc.getTextWidth('Nombre:');

doc.setFont('courier', 'normal');
doc.text(
  ` ${reporte.apruebaNombre || '—'}`,
  xFirmaDer + anchoNombreDer,
  y
);

y += 5;

// ---------- CARGO ----------

// Firma izquierda: cargo normal para técnicos; para proveedor externo,
// en este mismo renglón (debajo del nombre) se escribe la leyenda
// "Proveedor externo" en vez de un cargo.
if (reporte.realizaEsExterno) {
  doc.setFont('courier', 'bold');
  doc.text('Proveedor externo', xFirmaIzq, y);
} else {
  doc.setFont('courier', 'bold');
  doc.text('Cargo:', xFirmaIzq, y);

  const anchoCargoIzq = doc.getTextWidth('Cargo:');

  doc.setFont('courier', 'normal');
  doc.text(
    ` ${reporte.realizaCargo || '—'}`,
    xFirmaIzq + anchoCargoIzq,
    y
  );
}

// Firma derecha
doc.setFont('courier', 'bold');
doc.text('Cargo:', xFirmaDer, y);

const anchoCargoDer = doc.getTextWidth('Cargo:');

doc.setFont('courier', 'normal');
doc.text(
  ` ${reporte.apruebaCargo || '—'}`,
  xFirmaDer + anchoCargoDer,
  y
);

  /* ================= Evidencia fotográfica (nueva hoja, 2 columnas) ================= */
  const fotos = await obtenerFotosReporte(reporte);
  if (fotos.length) {
    doc.addPage();
    y = margen;
    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('EVIDENCIA FOTOGRÁFICA', margen, y);
    y += 8;

    const gap = 8;
    const anchoFoto = (anchoUtil - gap) / 2;
    const altoFoto = anchoFoto * 0.72;
    let x = margen;
    for (let i = 0; i < fotos.length; i++) {
      if (y + altoFoto > 280) { doc.addPage(); y = margen; x = margen; }
      await insertarImagenAjustada(doc, fotos[i], x, y, anchoFoto, altoFoto);
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.rect(x, y, anchoFoto, altoFoto);
      if ((i + 1) % 2 === 0) { x = margen; y += altoFoto + gap; }
      else { x += anchoFoto + gap; }
    }
  }

  /* ================= Pie de página ================= */
  const paginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generado el ${new Date().toLocaleString('es-CO')} · Página ${p} de ${paginas}`, margen, 290);
  }

  return doc;
}


function nombreArchivoPdfReporte(reporte) {
  const fechaOriginal = reporte.fecha || '';
  let fechaFormateada = fechaOriginal;

  if (fechaOriginal) {
    const partes = fechaOriginal.split('-');

    if (partes.length === 3) {
      const año = partes[0];
      const mes = parseInt(partes[1], 10);
      const dia = parseInt(partes[2], 10);

      const meses = [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre'
      ];

      fechaFormateada = `${dia} ${meses[mes - 1]} ${año}`;
    }
  }

  const codigoEquipo = (
    reporte.equipoCodigo ||
    reporte.codigoEquipo ||
    reporte.codigo ||
    'equipo'
  ).replace(/[^\w-]+/g, '_');

  return `MN-FOR-2 ${reporte.tipo || 'Mantenimiento'} ${fechaFormateada} ${codigoEquipo}.pdf`;
}

async function generarYDescargarPdfReporte(reporte) {
  const doc = await construirPdfReporte(reporte);
  doc.save(nombreArchivoPdfReporte(reporte));
}

async function verPdfReporte(reporte) {
  const doc = await construirPdfReporte(reporte);
  const url = doc.output('bloburl');
  const ventana = window.open(url, '_blank');

  if (!ventana) {
    alert('El navegador bloqueó la ventana emergente. Habilítala para ver el PDF.');
  }
}

/* ==============================================================
   11. DASHBOARD
   ------------------------------------------------------------
   Todo se calcula en el navegador a partir de un único listener
   en tiempo real sobre la colección "reportes" (la misma que
   alimenta Hoja de vida y Generar reporte). No se necesita
   ninguna colección ni campo adicional en Firestore, salvo el
   campo "paradaProduccion" (booleano) que ya se guarda desde el
   paso 7 del asistente de Generar reporte.

   - calcularEstadisticasDashboard(): recorre los reportes una
     sola vez y arma todos los totales/agrupaciones que necesita
     el dashboard (por tipo, por equipo, por área, paradas de
     producción).
   - Las tarjetas de "Mantenimientos ejecutados" e "Instalaciones
     y bajas" son clicables (atributo data-tipo): al hacer clic
     abren el modal de desglose con una gráfica de barras (SVG,
     sin librerías externas) y una tabla por equipo.
   - "Eficiencia desglosada" muestra, para los correctivos, el
     tiempo acumulado por equipo o por área (pestañas).
   - "Historial de reportes" lista los últimos reportes y abre el
     modal de detalle ya existente al hacer clic.
   ============================================================== */

const TIPOS_DASHBOARD = ['Preventivo', 'Correctivo', 'Locativo', 'Instalación', 'Desinstalación', 'Dada de baja'];

const COLOR_POR_TIPO_DASHBOARD = {
  'Preventivo': '#1e40af',
  'Correctivo': '#b91c1c',
  'Locativo': '#6d28d9',
  'Instalación': '#15803d',
  'Desinstalación': '#a16207',
  'Dada de baja': '#b91c1c'
};

let statsDashboardActual = null;
let modalDesglose, desgloseTitulo, desgloseResumen, desgloseGrafica, desgloseTablaBody;

// Recorre todos los reportes una sola vez y calcula todo lo que
// necesita el dashboard: totales por tipo (año/mes actual y por
// equipo), eficiencia de correctivos (por equipo y por área) y el
// acumulado de tiempo con producción detenida.
function calcularEstadisticasDashboard(reportes) {
  const hoy = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.HOY) ? APP_CONFIG.HOY : new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth(); // 0-11

  const porTipo = {};
  TIPOS_DASHBOARD.forEach(t => { porTipo[t] = { anio: 0, mes: 0, porEquipo: new Map() }; });

  let horasCorrectivoTotal = 0;
  let cantidadCorrectivoTotal = 0;
  let horasParadaTotal = 0;
  let cantidadParadaTotal = 0;

  const porEquipoEficiencia = new Map(); // solo correctivos, clave = código de equipo
  const porAreaEficiencia = new Map();   // solo correctivos, clave = ubicación/área

  reportes.forEach(d => {
    if (!d.fecha) return;
    const partes = d.fecha.split('-').map(Number);
    const anio = partes[0];
    const mes = (partes[1] || 1) - 1; // 0-11
    const esAnioActual = anio === anioActual;
    const esMesActual = esAnioActual && mes === mesActual;
    const horas = calcularDuracionHoras(d.horaInicio, d.horaFin) || 0;

    if (porTipo[d.tipo]) {
      if (esAnioActual) porTipo[d.tipo].anio++;
      if (esMesActual) porTipo[d.tipo].mes++;

      const clave = d.equipoCodigo || d.equipoNombre || '—';
      const mapaEquipos = porTipo[d.tipo].porEquipo;
      if (!mapaEquipos.has(clave)) {
        mapaEquipos.set(clave, { nombre: d.equipoNombre || clave, ubicacion: d.equipoUbicacion || '—', cantidad: 0, horas: 0 });
      }
      const entrada = mapaEquipos.get(clave);
      entrada.cantidad++;
      entrada.horas += horas;
    }

    if (d.tipo === 'Correctivo') {
      horasCorrectivoTotal += horas;
      cantidadCorrectivoTotal++;

      const claveEquipo = d.equipoCodigo || d.equipoNombre || '—';
      if (!porEquipoEficiencia.has(claveEquipo)) {
        porEquipoEficiencia.set(claveEquipo, { nombre: d.equipoNombre || claveEquipo, ubicacion: d.equipoUbicacion || '—', cantidad: 0, horas: 0 });
      }
      const eqEntrada = porEquipoEficiencia.get(claveEquipo);
      eqEntrada.cantidad++;
      eqEntrada.horas += horas;

      const claveArea = d.equipoUbicacion || 'Sin ubicación';
      if (!porAreaEficiencia.has(claveArea)) porAreaEficiencia.set(claveArea, { cantidad: 0, horas: 0 });
      const areaEntrada = porAreaEficiencia.get(claveArea);
      areaEntrada.cantidad++;
      areaEntrada.horas += horas;
    }

    if (d.paradaProduccion === true) {
      horasParadaTotal += horas;
      cantidadParadaTotal++;
    }
  });

  // Equipo que más falla: mayor cantidad de correctivos (empate -> más horas acumuladas)
  let equipoMasFalla = null;
  porEquipoEficiencia.forEach((v, codigo) => {
    if (!equipoMasFalla || v.cantidad > equipoMasFalla.cantidad ||
        (v.cantidad === equipoMasFalla.cantidad && v.horas > equipoMasFalla.horas)) {
      equipoMasFalla = { codigo, ...v };
    }
  });

  return {
    porTipo,
    correctivo: {
      cantidad: cantidadCorrectivoTotal,
      horasTotal: horasCorrectivoTotal,
      promedioHoras: cantidadCorrectivoTotal ? horasCorrectivoTotal / cantidadCorrectivoTotal : 0
    },
    equipoMasFalla,
    parada: { horasTotal: horasParadaTotal, cantidad: cantidadParadaTotal },
    porEquipoEficiencia,
    porAreaEficiencia
  };
}

// Gráfica de barras horizontales en SVG puro (sin dependencias externas).
// Recibe filas ya ordenadas de mayor a menor: [{ etiqueta, cantidad }, ...]
function construirGraficaBarras(filas, color) {
  if (!filas.length) return '<p class="ayuda">No hay datos suficientes para graficar.</p>';

  const max = Math.max(...filas.map(f => f.cantidad), 1);
  const alturaFila = 28;
  const alturaTotal = filas.length * alturaFila + 8;
  const anchoBarras = 220;
  const xBarras = 148;

  let contenido = '';
  filas.forEach((f, i) => {
    const y = i * alturaFila + 4;
    const ancho = Math.max((f.cantidad / max) * anchoBarras, 3);
    const etiqueta = (f.etiqueta.length > 20 ? f.etiqueta.slice(0, 19) + '…' : f.etiqueta);
    contenido +=
      `<text x="0" y="${y + 13}" font-size="12" fill="currentColor">${escaparHtml(etiqueta)}</text>` +
      `<rect x="${xBarras}" y="${y}" width="${ancho}" height="16" rx="4" fill="${color}"></rect>` +
      `<text x="${xBarras + ancho + 6}" y="${y + 13}" font-size="12" fill="currentColor" opacity=".65">${f.cantidad}</text>`;
  });

  return `<svg viewBox="0 0 400 ${alturaTotal}" width="100%" height="${alturaTotal}" role="img" aria-label="Gráfica de barras por equipo" style="color:var(--text)">${contenido}</svg>`;
}

// Actualiza las tarjetas resumidas y los tres indicadores de eficiencia.
function renderResumenDashboard(stats) {
  const idsPorTipo = {
    'Preventivo': ['dashPreventivoAnio', 'dashPreventivoMes'],
    'Correctivo': ['dashCorrectivoAnio', 'dashCorrectivoMes'],
    'Locativo': ['dashLocativoAnio', 'dashLocativoMes'],
    'Instalación': ['dashInstalacionAnio', 'dashInstalacionMes'],
    'Desinstalación': ['dashDesinstalacionAnio', 'dashDesinstalacionMes'],
    'Dada de baja': ['dashBajaAnio', 'dashBajaMes']
  };

  Object.entries(idsPorTipo).forEach(([tipo, [idAnio, idMes]]) => {
    const elAnio = document.getElementById(idAnio);
    const elMes = document.getElementById(idMes);
    const datos = stats.porTipo[tipo] || { anio: 0, mes: 0 };
    if (elAnio) elAnio.innerHTML = `${datos.anio} <small>año</small>`;
    if (elMes) elMes.textContent = `${datos.mes} este mes`;
  });

  const elEfi = document.getElementById('dashEficienciaCorrectivo');
  const elEfiDet = document.getElementById('dashEficienciaCorrectivoDetalle');
  if (elEfi) {
    elEfi.innerHTML = stats.correctivo.cantidad
      ? `${formatearDuracion(stats.correctivo.promedioHoras)} <span style="font-size:var(--fs-sm);font-weight:500;color:var(--text-muted)">de promedio</span>`
      : '— <span style="font-size:var(--fs-sm);font-weight:500;color:var(--text-muted)">de promedio</span>';
  }
  if (elEfiDet) {
    elEfiDet.textContent = stats.correctivo.cantidad
      ? `Tiempo promedio en que se ejecuta un mantenimiento correctivo, calculado sobre ${stats.correctivo.cantidad} reporte(s) registrados.`
      : 'Todavía no hay reportes correctivos registrados.';
  }

  const elFalla = document.getElementById('dashEquipoMasFalla');
  const elFallaDet = document.getElementById('dashEquipoMasFallaDetalle');
  if (stats.equipoMasFalla) {
    if (elFalla) elFalla.textContent = stats.equipoMasFalla.nombre;
    if (elFallaDet) {
      elFallaDet.innerHTML =
        `<b>${stats.equipoMasFalla.cantidad} mantenimiento(s) correctivo(s)</b> generado(s) — el más alto del parque de equipos.<br>` +
        `Tiempo acumulado invertido en repararlo: <b>${formatearDuracion(stats.equipoMasFalla.horas)}</b>.`;
    }
  } else {
    if (elFalla) elFalla.textContent = 'Sin datos';
    if (elFallaDet) elFallaDet.textContent = 'Todavía no hay reportes correctivos registrados.';
  }

  const elEfiResumen = document.getElementById('dashEficienciaResumen');
  if (elEfiResumen) {
    elEfiResumen.textContent = stats.correctivo.cantidad ? `${stats.correctivo.cantidad} correctivo(s)` : '';
  }

  const elParada = document.getElementById('dashParadaProduccion');
  const elParadaDet = document.getElementById('dashParadaProduccionDetalle');
  if (elParada) elParada.textContent = formatearDuracion(stats.parada.horasTotal);
  if (elParadaDet) {
    elParadaDet.textContent = stats.parada.cantidad
      ? `Tiempo acumulado en que la producción estuvo detenida por mantenimiento, en ${stats.parada.cantidad} intervención(es).`
      : 'Todavía no se ha reportado ninguna intervención que detenga la producción.';
  }
}

function renderTablaEficienciaEquipo(stats) {
  const tbody = document.getElementById('dashTablaEficienciaEquipo');
  if (!tbody) return;
  const filas = [...stats.porEquipoEficiencia.entries()].sort((a, b) => b[1].horas - a[1].horas);
  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="lista-vacia">Todavía no hay mantenimientos correctivos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(([codigo, v]) =>
    `<tr><td>${escaparHtml(v.nombre)} <small style="color:var(--text-muted)">(${escaparHtml(codigo)})</small></td>` +
    `<td>${v.cantidad}</td><td>${formatearDuracion(v.horas)}</td><td>${formatearDuracion(v.horas / v.cantidad)}</td></tr>`
  ).join('');
}

function renderTablaEficienciaArea(stats) {
  const tbody = document.getElementById('dashTablaEficienciaArea');
  if (!tbody) return;
  const filas = [...stats.porAreaEficiencia.entries()].sort((a, b) => b[1].horas - a[1].horas);
  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="lista-vacia">Todavía no hay mantenimientos correctivos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(([area, v]) =>
    `<tr><td>${escaparHtml(area)}</td><td>${v.cantidad}</td><td>${formatearDuracion(v.horas)}</td></tr>`
  ).join('');
}

function renderHistorialDashboard(reportes) {
  const tbody = document.getElementById('dashTablaHistorial');
  if (!tbody) return;

  const ordenados = [...reportes]
    .sort((a, b) => (b.fechaHora?.toMillis?.() || 0) - (a.fechaHora?.toMillis?.() || 0))
    .slice(0, 30);

  const elHistResumen = document.getElementById('dashHistorialResumen');
  if (elHistResumen) {
    elHistResumen.textContent = reportes.length
      ? (reportes.length > ordenados.length ? `${ordenados.length} recientes de ${reportes.length}` : `${reportes.length} reporte(s)`)
      : '';
  }

  if (!ordenados.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="lista-vacia">Todavía no hay reportes registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  ordenados.forEach(d => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML =
      `<td>${escaparHtml(d.equipoNombre || '—')}</td>` +
      `<td>${escaparHtml(d.tipo || '—')}</td>` +
      `<td>${escaparHtml(formatearFechaLarga(d.fecha))}</td>` +
      `<td>${formatearDuracion(calcularDuracionHoras(d.horaInicio, d.horaFin))}</td>` +
      `<td>${escaparHtml(d.realizaNombre || '—')}</td>` +
      `<td>${d.paradaProduccion ? '<span class="estado vencida">Sí</span>' : 'No'}</td>`;
    tr.addEventListener('click', () => abrirModalDetalleReporte(d));
    tbody.appendChild(tr);
  });
}

/* ---------- Repuestos utilizados por equipo (dashboard) ---------- */

let reportesDashboardActual = [];
const equiposRepuestosAbiertos = new Set(); // equipos que la persona dejó desplegados

const REPUESTOS_SIN_USO = new Set(['ninguno', 'ninguna', 'ningun', 'no', 'n/a', 'na', 'no aplica', 'sin repuestos', '-', '.']);

// ¿El campo "Repuestos utilizados" trae algo real (no vacío ni "Ninguno")?
function textoRepuestosValido(texto) {
  const t = String(texto || '').trim();
  return !!t && !REPUESTOS_SIN_USO.has(normalizarClave(t));
}

// Agrupa por equipo los reportes que registraron repuestos (filtrando por
// periodo y, opcionalmente, por un término de búsqueda sobre el equipo o el
// texto de repuestos). Devuelve los equipos con su último uso más reciente primero.
function agruparRepuestosPorEquipo(reportes, periodo, termino) {
  const hoy = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.HOY) ? APP_CONFIG.HOY : new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const mapa = new Map();
  reportes.forEach(d => {
    if (!d.fecha || !textoRepuestosValido(d.repuestos)) return;
    const [anio, mes] = d.fecha.split('-').map(Number);
    if (periodo === 'anio' && anio !== anioActual) return;
    if (periodo === 'mes' && !(anio === anioActual && mes === mesActual)) return;
    if (termino && !normalizarClave(`${d.equipoNombre || ''} ${d.equipoCodigo || ''} ${d.repuestos}`).includes(termino)) return;

    const clave = d.equipoCodigo || d.equipoNombre || '—';
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, nombre: d.equipoNombre || clave, codigo: d.equipoCodigo || '', reportes: [] });
    }
    mapa.get(clave).reportes.push(d);
  });

  const grupos = [...mapa.values()];
  grupos.forEach(g => {
    g.reportes.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') ||
      ((b.fechaHora?.toMillis?.() || 0) - (a.fechaHora?.toMillis?.() || 0)));
    g.ultimaFecha = g.reportes[0].fecha;
  });
  return grupos.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha) || a.nombre.localeCompare(b.nombre, 'es'));
}

function renderRepuestosDashboard() {
  const cont = document.getElementById('dashListaRepuestos');
  if (!cont) return;
  const selPeriodo = document.getElementById('dashRepuestosPeriodo');
  const inputBuscar = document.getElementById('dashRepuestosBuscar');
  const resumen = document.getElementById('dashRepuestosResumen');

  const periodo = selPeriodo ? selPeriodo.value : 'todo';
  const termino = normalizarClave(inputBuscar ? inputBuscar.value : '');

  const todos = agruparRepuestosPorEquipo(reportesDashboardActual, periodo, '');
  const grupos = termino ? agruparRepuestosPorEquipo(reportesDashboardActual, periodo, termino) : todos;

  if (resumen) {
    const totalReportes = todos.reduce((acc, g) => acc + g.reportes.length, 0);
    resumen.textContent = todos.length ? `${todos.length} equipo(s) · ${totalReportes} reporte(s)` : '';
  }

  cont.innerHTML = '';
  if (!grupos.length) {
    const vacio = document.createElement('p');
    vacio.className = 'lista-vacia';
    vacio.textContent = termino
      ? 'Ningún equipo ni repuesto coincide con la búsqueda.'
      : 'No hay repuestos registrados en este periodo.';
    cont.appendChild(vacio);
    return;
  }

  grupos.forEach(g => {
    const det = document.createElement('details');
    det.className = 'equipo-repuestos';
    det.open = equiposRepuestosAbiertos.has(g.clave);
    det.addEventListener('toggle', () => {
      if (det.open) equiposRepuestosAbiertos.add(g.clave);
      else equiposRepuestosAbiertos.delete(g.clave);
    });

    const sum = document.createElement('summary');
    sum.innerHTML =
      `<span class="equipo-repuestos-nombre">${escaparHtml(g.nombre)}` +
      `${g.codigo ? ` <small>(${escaparHtml(g.codigo)})</small>` : ''}</span>` +
      `<span class="resumen-colapsable">${g.reportes.length} reporte(s) · último: ${escaparHtml(formatearFechaLarga(g.ultimaFecha))}</span>`;
    det.appendChild(sum);

    const ul = document.createElement('ul');
    ul.className = 'equipo-repuestos-detalle';
    g.reportes.forEach(d => {
      const li = document.createElement('li');

      const cab = document.createElement('div');
      cab.className = 'repuesto-cabecera';
      cab.innerHTML =
        `<span class="repuesto-fecha">${escaparHtml(formatearFechaLarga(d.fecha))}` +
        `${d.tipo ? ` <span>· ${escaparHtml(d.tipo)}</span>` : ''}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'repuesto-ver';
      btn.textContent = 'Ver reporte';
      btn.addEventListener('click', () => abrirModalDetalleReporte(d));
      cab.appendChild(btn);

      const texto = document.createElement('p');
      texto.className = 'repuesto-texto';
      texto.textContent = d.repuestos.trim(); // tal como se escribió en el reporte

      li.append(cab, texto);
      ul.appendChild(li);
    });
    det.appendChild(ul);
    cont.appendChild(det);
  });
}

// Recuerda qué paneles colapsables dejó abiertos la persona.
function initPanelesColapsables() {
  document.querySelectorAll('#dashboard details[data-persist]').forEach(det => {
    const clave = `dashPanel:${det.dataset.persist}`;
    try { if (localStorage.getItem(clave) === '1') det.open = true; } catch (e) { /* sin almacenamiento */ }
    det.addEventListener('toggle', () => {
      try { localStorage.setItem(clave, det.open ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    });
  });
}

function abrirModalDesglose(tipo) {
  if (!modalDesglose || !statsDashboardActual) return;
  const datos = statsDashboardActual.porTipo[tipo];
  const filas = datos
    ? [...datos.porEquipo.entries()].map(([codigo, v]) => ({ codigo, ...v })).sort((a, b) => b.cantidad - a.cantidad)
    : [];

  if (desgloseTitulo) desgloseTitulo.textContent = `${tipo} — desglose por equipo`;
  if (desgloseResumen) {
    desgloseResumen.textContent = filas.length
      ? `${filas.reduce((acc, f) => acc + f.cantidad, 0)} registro(s) en total, distribuidos en ${filas.length} equipo(s)/área(s).`
      : `Todavía no hay registros de tipo "${tipo}".`;
  }

  if (desgloseGrafica) {
    desgloseGrafica.innerHTML = construirGraficaBarras(
      filas.slice(0, 10).map(f => ({ etiqueta: f.nombre || f.codigo, cantidad: f.cantidad })),
      COLOR_POR_TIPO_DASHBOARD[tipo] || '#1d4ed8'
    );
  }

  if (desgloseTablaBody) {
    desgloseTablaBody.innerHTML = filas.length
      ? filas.map(f =>
          `<tr><td>${escaparHtml(f.nombre)} <small style="color:var(--text-muted)">(${escaparHtml(f.codigo)})</small></td>` +
          `<td>${escaparHtml(f.ubicacion || '—')}</td><td>${f.cantidad}</td><td>${formatearDuracion(f.horas)}</td></tr>`
        ).join('')
      : '<tr><td colspan="4" class="lista-vacia">Sin datos.</td></tr>';
  }

  modalDesglose.hidden = false;
}

function cerrarModalDesglose() {
  if (modalDesglose) modalDesglose.hidden = true;
}

function initEscuchaReportesDashboard() {
  if (typeof db === 'undefined' || !APP_CONFIG || !APP_CONFIG.COLECCIONES) return;
  db.collection(APP_CONFIG.COLECCIONES.reportes).onSnapshot(
    snapshot => {
      const reportes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      statsDashboardActual = calcularEstadisticasDashboard(reportes);
      renderResumenDashboard(statsDashboardActual);
      renderTablaEficienciaEquipo(statsDashboardActual);
      renderTablaEficienciaArea(statsDashboardActual);
      renderHistorialDashboard(reportes);
      reportesDashboardActual = reportes;
      renderRepuestosDashboard();
    },
    err => {
      console.error('Error al cargar los datos del dashboard:', err);
    }
  );
}

function initDashboard() {
  modalDesglose = document.getElementById('modalDesgloseDashboard');
  desgloseTitulo = document.getElementById('desgloseTitulo');
  desgloseResumen = document.getElementById('desgloseResumen');
  desgloseGrafica = document.getElementById('desgloseGrafica');
  desgloseTablaBody = document.getElementById('desgloseTablaBody');

  document.querySelectorAll('#dashboard .tarjeta[data-tipo]').forEach(tarjeta => {
    tarjeta.style.cursor = 'pointer';
    tarjeta.setAttribute('tabindex', '0');
    tarjeta.setAttribute('role', 'button');
    tarjeta.setAttribute('aria-haspopup', 'dialog');
    const abrir = () => abrirModalDesglose(tarjeta.dataset.tipo);
    tarjeta.addEventListener('click', abrir);
    tarjeta.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrir();
      }
    });
  });

  if (modalDesglose) {
    modalDesglose.querySelectorAll('[data-cerrar-modal]').forEach(el => el.addEventListener('click', cerrarModalDesglose));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modalDesglose.hidden) cerrarModalDesglose();
    });
  }

  // La pestaña "Por equipo" / "Por área" de Eficiencia desglosada ya
  // queda funcionando automáticamente: initPestanas() (llamada antes,
  // en la inicialización general) maneja cualquier [role="tablist"]
  // con botones .tab, incluida esta.

  initPanelesColapsables();

  const selPeriodoRep = document.getElementById('dashRepuestosPeriodo');
  const inputBuscarRep = document.getElementById('dashRepuestosBuscar');
  if (selPeriodoRep) selPeriodoRep.addEventListener('change', renderRepuestosDashboard);
  if (inputBuscarRep) inputBuscarRep.addEventListener('input', renderRepuestosDashboard);

  initEscuchaReportesDashboard();
}

/* ==============================================================
   12. INICIALIZACIÓN
   ============================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initNavegacion();
  initMenuMovil();
  initPestanas();
  initDashboard();
  initCalendario();
  initLogo();
  initTecnicos();
  initEquiposLista();
  initCronograma();
  initSelectsEquipos();
  initHojaDeVida();
  initGenerarReporte();
  initModalDetalleReporte();
  initModalMesCalendario();

  // TODO: aquí es donde puedes ir conectando el resto de la lógica
  // de negocio pendiente, por ejemplo:
  //   initGenerarOT();     -> formulario para crear órdenes de trabajo
  //   initEjecutarOT();    -> flujo de ejecución de OT
  //   (logo, técnicos, lista de equipos, hoja de vida —selector +
  //    historial—, generar reporte y dashboard ya están conectados
  //    arriba; Gestión documental, ficha técnica/instructivos de
  //    hoja de vida y "Generar Orden" quedan pendientes de lógica)
});
