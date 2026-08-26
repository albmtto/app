/* ---------------------------------------------------------------------------
   0. CONFIGURACIÓN DE FIREBASE
--------------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyByPrkw0zSItmFWmzxIIOyTdrbOJhKiAAI",
  authDomain: "gestionmtto-d78c0.firebaseapp.com",
  projectId: "gestionmtto-d78c0",
  storageBucket: "gestionmtto-d78c0.firebasestorage.app",
  messagingSenderId: "459356242474",
  appId: "1:459356242474:web:609fde9d6e73565b50f953",
};

// Inicializa Firebase y deja `auth` y `db` disponibles como variables
// globales para el resto de los archivos (auth.js, script.js).
// Requiere que los <script> del SDK de Firebase (compat) se hayan
// cargado ANTES que este archivo — ver index.html.
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const APP_CONFIG = {

  /* ---------- Colecciones de Firestore ----------
     usuarioEmail: mapeo público "usuario" -> correo real. Se usa
                   SOLO para encontrar el correo antes de iniciar
                   sesión; nunca contiene contraseñas ni otros datos.
     usuarios:     perfil privado del usuario (nombre, rol...),
                   indexado por UID de Firebase Auth. */
  COLECCIONES: {
    usuarioEmail: 'usuario_email',
    usuarios: 'usuarios',
    tecnicos: 'tecnicos',
    configuracion: 'configuracion'
  },

  /* ---------- Límites para la subida del logo ----------
     Se validan en el navegador antes de convertir el archivo
     a base64 y guardarlo en Firestore (doc configuracion/empresa). */
  LOGO_MAX_BYTES: 2 * 1024 * 1024, // 2 MB
  LOGO_TIPOS_PERMITIDOS: ['image/png', 'image/svg+xml'],

  /* ---------- Dominio para correos internos ----------
     Como Firebase Auth exige un correo, generamos uno sintético
     para cada nuevo usuario: "<usuario>@DOMINIO_CORREO_INTERNO".
     Nunca se muestra en la interfaz ni se usa para enviar nada.
     ⚠️ Debe ser EXACTAMENTE el mismo dominio que usaste al crear
     tu usuario semilla (anderalb@...) en Firebase Authentication. */
  DOMINIO_CORREO_INTERNO: 'gestionmtto.app',

  /* ---------- Fecha de referencia ----------
     Se usa para resaltar el mes actual en el calendario y para
     calcular vencimientos. En producción, reemplázalo por
     `new Date()`. */
  HOY: new Date(2026, 7, 25), // 25 de agosto de 2026

  /* ---------- Nombres de los meses (calendario) ---------- */
  MESES: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ],

  /* ---------- Etiquetas de tipo de mantenimiento ---------- */
  TIPO_LABEL: {
    preventivo: 'Preventivo',
    correctivo: 'Correctivo',
    metrologia: 'Metrología'
  },

  /* ---------- Selectores usados por script.js ----------
     Centralizarlos aquí facilita actualizar el HTML sin tener
     que perseguir "querySelector" por todo el script. */
  SELECTORES: {
    enlacesNav: '.sidebar nav a',
    secciones: '.modulos section',
    tablist: '[role="tablist"]',
    tab: '.tab',
    btnMenu: '#btnMenu',
    overlay: '#overlay',
    calGrid: '#calGrid',
    calTitulo: '#calTitulo',
    calPrev: '#calPrev',
    calNext: '#calNext'
  }
};

/* ==============================================================
   Datos de ejemplo (mock) del cronograma anual de mantenimiento.
   Clave: 'año-mes' (mes de 1 a 12) -> arreglo de eventos.
   Cada evento: { d: día, t: nombre del equipo, c: clase/tipo }
   c puede ser: 'preventivo' | 'correctivo' | 'metrologia'

   ⚠️ Esto es solo información de ejemplo para el frontend.
   Cuando conectes la lógica real (script.js), lo natural es
   reemplazar EVENTOS_MOCK por datos que vengan de tu API/BD,
   por ejemplo dentro de una función `cargarEventosCalendario()`.
   ============================================================== */
const EVENTOS_MOCK = {
  '2026-1': [
    { d: 14, t: 'Compresor A-12', c: 'preventivo' },
    { d: 28, t: 'Motor M-33', c: 'preventivo' }
  ],
  '2026-2': [
    { d: 11, t: 'Bomba B-04', c: 'correctivo' },
    { d: 20, t: 'Caldera C-01', c: 'preventivo' },
    { d: 26, t: 'Bomba B-04', c: 'metrologia' }
  ],
  '2026-3': [
    { d: 6, t: 'Compresor A-12', c: 'preventivo' },
    { d: 19, t: 'Bomba B-04', c: 'preventivo' }
  ],
  '2026-4': [
    { d: 9, t: 'Motor M-33', c: 'preventivo' },
    { d: 24, t: 'Compresor A-12', c: 'metrologia' }
  ],
  '2026-5': [
    { d: 7, t: 'Compresor A-12', c: 'preventivo' },
    { d: 21, t: 'Caldera C-01', c: 'preventivo' }
  ],
  '2026-6': [
    { d: 4, t: 'Bomba B-04', c: 'preventivo' },
    { d: 16, t: 'Compresor A-12', c: 'correctivo' }
  ],
  '2026-7': [
    { d: 10, t: 'Bomba B-04', c: 'preventivo' },
    { d: 22, t: 'Compresor A-12', c: 'preventivo' },
    { d: 30, t: 'Motor M-33', c: 'metrologia' }
  ],
  '2026-8': [
    { d: 4, t: 'Compresor A-12', c: 'preventivo' },
    { d: 6, t: 'Motor M-33', c: 'preventivo' },
    { d: 12, t: 'Caldera C-01', c: 'preventivo' },
    { d: 12, t: 'Bomba B-04', c: 'correctivo' },
    { d: 18, t: 'Bomba B-04', c: 'preventivo' },
    { d: 25, t: 'Compresor A-12', c: 'preventivo' }
  ],
  '2026-9': [
    { d: 2, t: 'Motor M-33', c: 'preventivo' },
    { d: 15, t: 'Caldera C-01', c: 'preventivo' },
    { d: 22, t: 'Caldera C-01', c: 'metrologia' }
  ],
  '2026-10': [
    { d: 8, t: 'Compresor A-12', c: 'preventivo' }
  ],
  '2026-11': [
    { d: 5, t: 'Bomba B-04', c: 'preventivo' },
    { d: 17, t: 'Motor M-33', c: 'correctivo' }
  ],
  '2026-12': [
    { d: 3, t: 'Compresor A-12', c: 'preventivo' },
    { d: 10, t: 'Caldera C-01', c: 'preventivo' }
  ],
  '2025-12': [
    { d: 12, t: 'Compresor A-12', c: 'preventivo' }
  ],
  '2027-1': [
    { d: 8, t: 'Compresor A-12', c: 'preventivo' },
    { d: 20, t: 'Bomba B-04', c: 'metrologia' }
  ]
};