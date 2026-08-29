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
    configuracion: 'configuracion',
    equipos: 'equipos',
    reportes: 'reportes'
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

  /* ---------- Formato oficial del PDF de reporte de mantenimiento ----------
     Datos fijos que aparecen en el encabezado del PDF (esquina superior
     derecha). Si cambia la versión del formato, actualízalos aquí. */
  FORMATO_REPORTE: {
    titulo: 'FORMATO DE REPORTE DE MANTENIMIENTO',
    codigo: 'MN-FOR-2',
    version: '2',
    fechaEmision: '20 Agosto 2026'
  },


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
