/* ==============================================================
   MaintenancePRO · documentos.js
   ------------------------------------------------------------
   Subir y visualizar los documentos "reales" (PDF, Word, imagen)
   del módulo de Equipos. Ya NO se crean documentos dentro de la
   app: solo se suben archivos elaborados fuera del sistema y se
   pueden ver/reemplazar/eliminar desde aquí.

   Cubre dos pestañas de la sección "Equipos":

   A) Gestión documental (documentos generales de la empresa,
      NO ligados a un equipo puntual):
        - Programa de mantenimiento de equipos e instalaciones
        - Programa de capacitaciones
        - Cronograma de capacitaciones
      (El "Cronograma de mantenimiento" de esa misma pestaña es
      aparte: se sigue generando automáticamente, no se sube.)

   B) Hoja de vida (documentos propios de CADA equipo/área
      seleccionado en el selector "hv-equipo"):
        - Ficha técnica            (1 archivo)
        - Instructivo de limpieza y desinfección (1 archivo)
        - Manual de operación      (1 archivo)
        - Actas de capacitación    (varios archivos)
        - Certificados de metrología (varios archivos)
      Estos documentos, junto con el historial de reportes, solo
      se muestran cuando hay un equipo seleccionado.

   ------------------------------------------------------------
   Por qué Storage y no base64 (a diferencia del logo):
   Un documento real (PDF de un manual, ficha técnica, etc.) fácilmente
   supera el límite de 1 MB por documento de Firestore, así que aquí
   SÍ usamos Firebase Storage para el archivo. En Firestore solo se
   guarda la metadata (nombre, URL de descarga, ruta en Storage,
   tamaño, fecha).

   ⚠️ IMPORTANTE — Reglas de Firebase Storage:
   Por defecto, Firebase Storage niega todo. Debes ir a Firebase
   Console > Storage > Rules y permitir lectura/escritura a usuarios
   autenticados, por ejemplo:

     rules_version = '2';
     service firebase.storage {
       match /b/{bucket}/o {
         match /{allPaths=**} {
           allow read, write: if request.auth != null;
         }
       }
     }

   Depende de `db`, `storage`, `firebase` y `APP_CONFIG` (definidos
   en config.js), así que config.js debe cargarse antes.
   ============================================================== */

/* ==============================================================
   Qué documentos existen y cómo se guardan
   ============================================================== */

// Documentos generales de la empresa (pestaña "Gestión documental").
// Un solo archivo por clave. El doc de Firestore ES la metadata.
const DOCUMENTOS_GENERALES = ['programa_mantenimiento', 'programa_capacitaciones', 'cronograma_capacitaciones'];

// Documentos de un solo archivo por equipo (pestaña "Hoja de vida").
// Se guardan como campos dentro de documentos_equipo/{codigoEquipo}.
const DOCUMENTOS_EQUIPO_SIMPLE = ['fichaTecnica', 'instructivo', 'manual'];

// Documentos de varios archivos por equipo (pestaña "Hoja de vida").
// Se guardan como subcolecciones de documentos_equipo/{codigoEquipo}.
const DOCUMENTOS_EQUIPO_LISTA = ['actas', 'metrologia'];

/* ==============================================================
   Utilidades comunes
   ============================================================== */
function formatearFechaCortaDocumento(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '';
  return timestamp.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatearTamanoDocumento(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Arma una ruta de Storage segura a partir del nombre real del
// archivo (sin tildes, espacios ni caracteres especiales). El
// nombre "bonito" original se conserva aparte, en Firestore.
function sanitizarNombreParaStorage(nombre) {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function validarArchivoDocumento(archivo) {
  if (!APP_CONFIG.DOCUMENTO_TIPOS_PERMITIDOS.includes(archivo.type)) {
    return 'Formato no permitido. Sube un PDF, Word, JPG o PNG.';
  }
  if (archivo.size > APP_CONFIG.DOCUMENTO_MAX_BYTES) {
    return `El archivo no debe superar ${formatearTamanoDocumento(APP_CONFIG.DOCUMENTO_MAX_BYTES)}.`;
  }
  return null;
}

// Sube un archivo a Storage y devuelve la metadata lista para
// guardar en Firestore.
async function subirArchivoDocumento(archivo, carpeta) {
  const ruta = `${carpeta}/${Date.now()}_${sanitizarNombreParaStorage(archivo.name)}`;
  const ref = storage.ref(ruta);
  await ref.put(archivo);
  const url = await ref.getDownloadURL();
  return {
    nombreArchivo: archivo.name,
    url,
    storagePath: ruta,
    tamanoBytes: archivo.size,
    tipoArchivo: archivo.type,
    subidoEn: firebase.firestore.FieldValue.serverTimestamp()
  };
}

// Borra un archivo de Storage. Si la ruta viene vacía o el archivo
// ya no existe, no truena: simplemente lo registra en consola.
async function borrarArchivoDocumentoDeStorage(storagePath) {
  if (!storagePath) return;
  try {
    await storage.ref(storagePath).delete();
  } catch (err) {
    console.error('No se pudo borrar el archivo de Storage (se ignora):', storagePath, err);
  }
}

/* ==============================================================
   Documento de UN SOLO archivo
   ------------------------------------------------------------
   Usa <span data-doc-estado="clave"> y <div data-doc-acciones="clave">
   ya presentes en el HTML como puntos de enganche.
   ============================================================== */
function renderizarDocumentoSimple(raiz, clave, datos, onSeleccionArchivo, onEliminar) {
  const estadoEl = raiz.querySelector(`[data-doc-estado="${clave}"]`);
  const accionesEl = raiz.querySelector(`[data-doc-acciones="${clave}"]`);
  if (!estadoEl || !accionesEl) return;

  estadoEl.textContent = datos
    ? `Cargado${datos.subidoEn ? ' · ' + formatearFechaCortaDocumento(datos.subidoEn) : ''}`
    : 'Sin cargar';

  accionesEl.innerHTML = '';

  if (datos && datos.url) {
    const btnVer = document.createElement('button');
    btnVer.type = 'button';
    btnVer.className = 'btn secundario btn-chico';
    btnVer.textContent = 'Ver documento';
    btnVer.addEventListener('click', () => window.open(datos.url, '_blank', 'noopener'));
    accionesEl.appendChild(btnVer);
  }

  const idInput = `doc-input-${clave}-${Math.random().toString(36).slice(2, 8)}`;
  const inputFile = document.createElement('input');
  inputFile.type = 'file';
  inputFile.id = idInput;
  inputFile.accept = APP_CONFIG.DOCUMENTO_EXTENSIONES_ACEPTADAS;
  inputFile.className = 'sr-only';
  inputFile.addEventListener('change', e => {
    const archivo = e.target.files[0];
    if (archivo) onSeleccionArchivo(archivo);
    inputFile.value = '';
  });

  const labelSubir = document.createElement('label');
  labelSubir.setAttribute('for', idInput);
  labelSubir.className = 'btn btn-chico';
  labelSubir.style.cursor = 'pointer';
  labelSubir.textContent = datos ? 'Reemplazar' : 'Subir archivo';

  accionesEl.appendChild(inputFile);
  accionesEl.appendChild(labelSubir);

  if (datos) {
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn peligro btn-chico';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', onEliminar);
    accionesEl.appendChild(btnEliminar);
  }
}

// Sube el archivo elegido y guarda su metadata mediante `guardar`.
// Si había un archivo anterior (reemplazo), lo borra de Storage
// después de que el nuevo haya quedado guardado.
async function manejarSubidaDocumentoSimple({ archivo, carpeta, estadoEl, guardar, datosAnteriores }) {
  const error = validarArchivoDocumento(archivo);
  if (error) { alert(error); return; }

  const textoOriginal = estadoEl.textContent;
  estadoEl.textContent = 'Subiendo…';
  try {
    const metadata = await subirArchivoDocumento(archivo, carpeta);
    await guardar(metadata);
    if (datosAnteriores && datosAnteriores.storagePath) {
      await borrarArchivoDocumentoDeStorage(datosAnteriores.storagePath);
    }
  } catch (err) {
    console.error('Error al subir el documento:', err);
    estadoEl.textContent = textoOriginal;
    alert('No se pudo subir el documento. Inténtalo de nuevo.');
  }
}

/* ==============================================================
   Documento de VARIOS archivos (actas, certificados de metrología)
   ------------------------------------------------------------
   Usa <span data-doc-estado-lista="clave">, <ul data-doc-lista="clave">
   y <div data-doc-acciones-lista="clave"> ya presentes en el HTML.
   ============================================================== */
function renderizarDocumentoLista(raiz, clave, docs, onSeleccionArchivos, onEliminarItem) {
  const estadoEl = raiz.querySelector(`[data-doc-estado-lista="${clave}"]`);
  const listaEl = raiz.querySelector(`[data-doc-lista="${clave}"]`);
  const accionesEl = raiz.querySelector(`[data-doc-acciones-lista="${clave}"]`);
  if (!estadoEl || !listaEl || !accionesEl) return;

  estadoEl.textContent = docs.length === 0
    ? 'Sin documentos'
    : `${docs.length} documento${docs.length === 1 ? '' : 's'} cargado${docs.length === 1 ? '' : 's'}`;

  listaEl.innerHTML = '';

  if (docs.length === 0) {
    const li = document.createElement('li');
    li.className = 'lista-vacia';
    li.textContent = 'Todavía no hay documentos cargados.';
    listaEl.appendChild(li);
  }

  docs.forEach(doc => {
    const li = document.createElement('li');

    const span = document.createElement('span');
    span.textContent = `${doc.nombreArchivo}${doc.subidoEn ? ' · ' + formatearFechaCortaDocumento(doc.subidoEn) : ''}`;

    const acciones = document.createElement('div');
    acciones.style.cssText = 'display:flex;gap:var(--s2);flex-shrink:0';

    const btnVer = document.createElement('button');
    btnVer.type = 'button';
    btnVer.className = 'btn secundario btn-chico';
    btnVer.textContent = 'Ver';
    btnVer.addEventListener('click', () => window.open(doc.url, '_blank', 'noopener'));

    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn peligro btn-chico';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', () => onEliminarItem(doc));

    acciones.appendChild(btnVer);
    acciones.appendChild(btnEliminar);
    li.appendChild(span);
    li.appendChild(acciones);
    listaEl.appendChild(li);
  });

  accionesEl.innerHTML = '';

  const idInput = `doc-input-lista-${clave}-${Math.random().toString(36).slice(2, 8)}`;
  const inputFile = document.createElement('input');
  inputFile.type = 'file';
  inputFile.id = idInput;
  inputFile.accept = APP_CONFIG.DOCUMENTO_EXTENSIONES_ACEPTADAS;
  inputFile.multiple = true;
  inputFile.className = 'sr-only';
  inputFile.addEventListener('change', e => {
    const archivos = [...e.target.files];
    if (archivos.length) onSeleccionArchivos(archivos);
    inputFile.value = '';
  });

  const labelSubir = document.createElement('label');
  labelSubir.setAttribute('for', idInput);
  labelSubir.className = 'btn btn-chico';
  labelSubir.style.cursor = 'pointer';
  labelSubir.textContent = 'Subir archivo';

  accionesEl.appendChild(inputFile);
  accionesEl.appendChild(labelSubir);
}

// Sube uno o varios archivos y agrega cada uno como un documento
// nuevo en la subcolección (no reemplaza a los anteriores).
async function manejarSubidaDocumentosLista({ archivos, carpeta, coleccionRef, estadoEl }) {
  const textoOriginal = estadoEl.textContent;

  for (const archivo of archivos) {
    const error = validarArchivoDocumento(archivo);
    if (error) { alert(`"${archivo.name}": ${error}`); continue; }

    estadoEl.textContent = `Subiendo "${archivo.name}"…`;
    try {
      const metadata = await subirArchivoDocumento(archivo, carpeta);
      await coleccionRef.add(metadata);
    } catch (err) {
      console.error('Error al subir el documento:', err);
      alert(`No se pudo subir "${archivo.name}". Inténtalo de nuevo.`);
    }
  }

  estadoEl.textContent = textoOriginal; // el onSnapshot de la lista lo actualiza con el conteo real de inmediato
}

/* ==============================================================
   A. GESTIÓN DOCUMENTAL — documentos generales de la empresa
   (No dependen de ningún equipo. Colección "documentos_generales",
   un documento por clave.)
   ============================================================== */
function initDocumentosGenerales() {
  const raiz = document.getElementById('panel-doc');
  if (!raiz) return;

  DOCUMENTOS_GENERALES.forEach(clave => {
    const ref = db.collection(APP_CONFIG.COLECCIONES.documentosGenerales).doc(clave);

    ref.onSnapshot(
      snap => {
        const datos = snap.exists ? snap.data() : null;
        const estadoEl = raiz.querySelector(`[data-doc-estado="${clave}"]`);

        renderizarDocumentoSimple(
          raiz, clave, datos,
          archivo => manejarSubidaDocumentoSimple({
            archivo,
            carpeta: `documentos_generales/${clave}`,
            estadoEl,
            datosAnteriores: datos,
            guardar: metadata => ref.set(metadata)
          }),
          async () => {
            if (!confirm('¿Eliminar este documento? Podrás volver a subir uno nuevo cuando quieras.')) return;
            try {
              await borrarArchivoDocumentoDeStorage(datos.storagePath);
              await ref.delete();
            } catch (err) {
              console.error('Error al eliminar el documento general:', err);
              alert('No se pudo eliminar el documento. Inténtalo de nuevo.');
            }
          }
        );
      },
      err => console.error(`Error al escuchar el documento general "${clave}":`, err)
    );
  });
}

/* ==============================================================
   B. HOJA DE VIDA — documentos propios de cada equipo
   ------------------------------------------------------------
   Solo se muestran (y se escuchan en Firestore) cuando hay un
   equipo seleccionado en "hv-equipo". Colección "documentos_equipo",
   un documento por código de equipo; "actas" y "metrologia" son
   subcolecciones de ese documento.
   ============================================================== */
let hvSinEquipoEl, hvContenidoEquipoEl;
let cancelarEscuchasDocEquipo = []; // listeners activos del equipo actualmente mostrado

function detenerEscuchasDocEquipo() {
  cancelarEscuchasDocEquipo.forEach(cancelar => cancelar());
  cancelarEscuchasDocEquipo = [];
}

function escucharDocumentosSimplesEquipo(codigo) {
  const raiz = document.getElementById('panel-hv');
  const ref = db.collection(APP_CONFIG.COLECCIONES.documentosEquipo).doc(codigo);

  const cancelar = ref.onSnapshot(
    snap => {
      const datosDoc = snap.exists ? snap.data() : {};

      DOCUMENTOS_EQUIPO_SIMPLE.forEach(clave => {
        const datos = datosDoc[clave] || null;
        const estadoEl = raiz.querySelector(`[data-doc-estado="${clave}"]`);

        renderizarDocumentoSimple(
          raiz, clave, datos,
          archivo => manejarSubidaDocumentoSimple({
            archivo,
            carpeta: `documentos_equipo/${codigo}/${clave}`,
            estadoEl,
            datosAnteriores: datos,
            guardar: metadata => ref.set({ [clave]: metadata }, { merge: true })
          }),
          async () => {
            if (!confirm('¿Eliminar este documento? Podrás volver a subir uno nuevo cuando quieras.')) return;
            try {
              await borrarArchivoDocumentoDeStorage(datos.storagePath);
              await ref.set({ [clave]: firebase.firestore.FieldValue.delete() }, { merge: true });
            } catch (err) {
              console.error('Error al eliminar el documento del equipo:', err);
              alert('No se pudo eliminar el documento. Inténtalo de nuevo.');
            }
          }
        );
      });
    },
    err => console.error('Error al escuchar los documentos del equipo:', err)
  );

  cancelarEscuchasDocEquipo.push(cancelar);
}

function escucharDocumentosListaEquipo(codigo) {
  const raiz = document.getElementById('panel-hv');

  DOCUMENTOS_EQUIPO_LISTA.forEach(clave => {
    const coleccionRef = db.collection(APP_CONFIG.COLECCIONES.documentosEquipo)
      .doc(codigo).collection(clave);

    const cancelar = coleccionRef.orderBy('subidoEn', 'desc').onSnapshot(
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const estadoEl = raiz.querySelector(`[data-doc-estado-lista="${clave}"]`);

        renderizarDocumentoLista(
          raiz, clave, docs,
          archivos => manejarSubidaDocumentosLista({
            archivos,
            carpeta: `documentos_equipo/${codigo}/${clave}`,
            coleccionRef,
            estadoEl
          }),
          async doc => {
            if (!confirm(`¿Eliminar "${doc.nombreArchivo}"?`)) return;
            try {
              await borrarArchivoDocumentoDeStorage(doc.storagePath);
              await coleccionRef.doc(doc.id).delete();
            } catch (err) {
              console.error('Error al eliminar el documento del equipo:', err);
              alert('No se pudo eliminar el documento. Inténtalo de nuevo.');
            }
          }
        );
      },
      err => console.error(`Error al escuchar la lista "${clave}" del equipo:`, err)
    );

    cancelarEscuchasDocEquipo.push(cancelar);
  });
}

// Muestra u oculta la documentación del equipo (+ historial de
// reportes) según si hay o no un equipo seleccionado en "hv-equipo".
function actualizarVistaSegunEquipoSeleccionado() {
  const equipoSelect = document.getElementById('hv-equipo');
  const codigo = equipoSelect ? equipoSelect.value : '';

  detenerEscuchasDocEquipo();

  if (!codigo) {
    if (hvSinEquipoEl) hvSinEquipoEl.hidden = false;
    if (hvContenidoEquipoEl) hvContenidoEquipoEl.hidden = true;
    return;
  }

  if (hvSinEquipoEl) hvSinEquipoEl.hidden = true;
  if (hvContenidoEquipoEl) hvContenidoEquipoEl.hidden = false;

  escucharDocumentosSimplesEquipo(codigo);
  escucharDocumentosListaEquipo(codigo);
}

function initDocumentosEquipo() {
  hvSinEquipoEl = document.getElementById('hvSinEquipo');
  hvContenidoEquipoEl = document.getElementById('hvContenidoEquipo');

  const equipoSelect = document.getElementById('hv-equipo');
  const tipoEquipoSelect = document.getElementById('hv-tipo-equipo');

  if (equipoSelect) {
    equipoSelect.addEventListener('change', actualizarVistaSegunEquipoSeleccionado);
  }
  if (tipoEquipoSelect) {
    // Cambiar el tipo reinicia "hv-equipo" a vacío (ver script.js,
    // actualizarOpcionesHvEquipo), pero eso no dispara el evento
    // "change" de "hv-equipo". El setTimeout(0) deja que ese reinicio
    // ya haya ocurrido antes de revisar el valor actual del select.
    tipoEquipoSelect.addEventListener('change', () => setTimeout(actualizarVistaSegunEquipoSeleccionado, 0));
  }

  actualizarVistaSegunEquipoSeleccionado(); // estado inicial: sin equipo seleccionado
}

/* ==============================================================
   INICIALIZACIÓN
   ============================================================== */
function initDocumentos() {
  initDocumentosGenerales();
  initDocumentosEquipo();
}

document.addEventListener('DOMContentLoaded', initDocumentos);
