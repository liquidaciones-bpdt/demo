/**
 * HT-BPDT Crew Portal - Logic Bridge for GitHub Pages
 * Versión: 1.2.0
 */

// --- CONFIGURACIÓN TÉCNICA ---
// IMPORTANTE: Pega aquí la URL que te dio Google Apps Script al publicar como Aplicación Web
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwjLw7r2CTsqIDUEsScWwRI1MdPN9nAAXelyeBUGqqGenrz-h6ULrQvC1P548taZsT2/exec';

// --- ESTADO GLOBAL ---
let currentState = {
  view: 'login',
  isLoading: false,
  user: null,
  dniStatus: null,
  regStep: 1,
  form: {
    dni: '',
    pass: '',
    nombres: '',
    apellidos: '',
    cargo: '',
    empresa: ''
  }
};

// --- INICIALIZACIÓN ---
window.onload = () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

/**
 * CORE: Comunicación con el Backend (Apps Script)
 */
async function callServer(action, payload = {}) {
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'cors', 
      body: JSON.stringify({ action, payload })
    });
    
    if (!response.ok) throw new Error('Error en la red');
    
    const result = await response.json();
    return result;
  } catch (err) {
    console.error("Error de conexión:", err);
    return { success: false, message: "No se pudo conectar con el servidor" };
  }
}

/**
 * NAVEGACIÓN Y UI HELPERS (Sin cambios visuales)
 */
function switchView(viewName) {
  const views = ['login', 'dni-check', 'register', 'dashboard'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      el.classList.add('view-hidden');
      el.classList.remove('view-active');
    }
  });

  const targetEl = document.getElementById(`view-${viewName}`);
  if (targetEl) {
    targetEl.classList.remove('view-hidden');
    targetEl.classList.add('view-active');
  }
  
  currentState.view = viewName;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function setIsLoading(loading) {
  currentState.isLoading = loading;
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = loading ? 'flex' : 'none';
  }
}

function goToRegStep(step) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`reg-step-${i}`);
    const dot = document.getElementById(`reg-dot-${i}`);
    if (el) el.classList.toggle('hidden', i !== step);
    if (dot) dot.className = `w-${i === step ? '8' : '2'} h-1.5 rounded-full transition-all ${i <= step ? 'bg-[#E30613]' : 'bg-slate-200'}`;
  }
  currentState.regStep = step;
}

/**
 * MANEJADORES DE NEGOCIO (Adaptados a Fetch)
 */

async function handleDniCheck() {
  const dni = document.getElementById('input-dni').value;
  if (!dni || dni.length < 5) {
    alert("Por favor, ingrese un DNI válido");
    return;
  }

  setIsLoading(true);
  const response = await callServer('checkDniStatus', { dni });
  setIsLoading(false);

  if (response.success) {
    currentState.form.dni = dni;
    currentState.dniStatus = response.data.status;

    if (response.data.status === 'EXISTS') {
      document.getElementById('display-dni-login').innerText = `DNI: ${dni}`;
      switchView('dni-check');
    } else {
      // Si es NEW o PRELOAD, cargamos datos si existen
      if (response.data.preloadedData) {
        document.getElementById('reg-nombres').value = response.data.preloadedData.nombre || '';
        document.getElementById('reg-apellidos').value = response.data.preloadedData.apellidos || '';
      }
      switchView('register');
      goToRegStep(1);
    }
  } else {
    alert("Error: " + response.message);
  }
}

async function handleLogin() {
  const dni = currentState.form.dni;
  const pass = document.getElementById('login-pass').value;

  if (!pass) return;

  setIsLoading(true);
  const response = await callServer('loginUser', { dni, pass });
  setIsLoading(false);

  if (response.success) {
    currentState.user = response.data;
    renderDashboard();
    switchView('dashboard');
  } else {
    alert("Contraseña incorrecta o usuario no activo");
  }
}

async function handleRegister() {
  const pass = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-pass-confirm').value;

  if (pass.length < 4) { alert("La contraseña es muy corta"); return; }
  if (pass !== confirm) { alert("Las contraseñas no coinciden"); return; }

  const userData = {
    dni: currentState.form.dni,
    nombres: document.getElementById('reg-nombres').value,
    apellidos: document.getElementById('reg-apellidos').value,
    password: pass
  };

  setIsLoading(true);
  const response = await callServer('registerUser', userData);
  setIsLoading(false);

  if (response.success) {
    goToRegStep(3);
  } else {
    alert(response.message);
  }
}

/**
 * RENDERIZADO DE DASHBOARD (UI/UX Preservada)
 */
function renderDashboard() {
  const user = currentState.user;
  if (!user) return;

  // Datos de Usuario
  document.getElementById('dash-user-name').innerHTML = `${user.nombre}<br/>${user.apellidos}`;
  document.getElementById('dash-user-cargo').innerText = user.cargo || 'TRIPULANTE';
  document.getElementById('dash-user-dni').innerText = `DNI ${user.dni}`;

  // Cálculo de Círculo de Cumplimiento (Basado en r=34 del index)
  const compliance = user.compliance || 0;
  const circumference = 2 * Math.PI * 34; // aprox 213.6
  const offset = circumference - (compliance / 100) * circumference;
  
  const circle = document.getElementById('dash-compl-circle');
  if (circle) {
    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = offset;
  }

  document.getElementById('dash-compl-text').innerText = `${compliance}%`;
  const label = document.getElementById('dash-compl-label');
  label.innerText = compliance >= 90 ? 'ÓPTIMO' : (compliance >= 70 ? 'ACEPTABLE' : 'DEFICIENTE');
  label.className = `text-[11px] font-black uppercase tracking-widest ${compliance >= 70 ? 'text-green-500' : 'text-red-500'}`;

  // Render de Documentos
  renderDocuments(user.documents || []);
}

function renderDocuments(docs) {
  const container = document.getElementById('docs-container');
  const countEl = document.getElementById('doc-count');
  
  countEl.innerText = docs.length;

  if (docs.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 py-8 text-sm">No hay documentos registrados</p>`;
    return;
  }

  container.innerHTML = docs.map(d => {
    const statusMap = {
      'VALIDADO': { color: 'text-green-600 bg-green-50 border-green-100', icon: 'check-circle' },
      'PENDIENTE_VALIDACION': { color: 'text-amber-600 bg-amber-50 border-amber-100', icon: 'clock' },
      'OBSERVADO': { color: 'text-red-600 bg-red-50 border-red-100', icon: 'alert-circle' }
    };

    const style = statusMap[d.estado_validacion] || statusMap['PENDIENTE_VALIDACION'];

    return `
      <div class="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
              <div class="space-y-1">
                  <h4 class="font-bold text-slate-900 leading-none">${d.tipo_documento}</h4>
                  <div class="flex items-center gap-1.5 text-slate-400">
                      <i data-lucide="calendar" size="14"></i>
                      <p class="text-[12px] font-medium uppercase tracking-wide">Vence: ${d.fecha_vencimiento || 'N/A'}</p>
                  </div>
              </div>
              <div class="px-3 py-1.5 rounded-full border ${style.color} flex items-center gap-1.5 shrink-0">
                  <i data-lucide="${style.icon}" size="14"></i>
                  <span class="text-[10px] font-black uppercase tracking-widest leading-none">${d.estado_validacion.replace('_', ' ')}</span>
              </div>
          </div>
          ${d.observaciones ? `
            <div class="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                <p class="text-[12px] font-medium text-amber-800 leading-relaxed">${d.observaciones}</p>
            </div>
          ` : ''}
      </div>
    `;
  }).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * LOGOUT Y REFRESH
 */
async function handleRefresh() {
  if (!currentState.user) return;
  setIsLoading(true);
  const response = await callServer('getDashboardData', { dni: currentState.user.dni });
  setIsLoading(false);
  if (response.success) {
    currentState.user = response.data;
    renderDashboard();
  }
}

function handleLogout() {
  currentState.user = null;
  switchView('login');
  document.getElementById('input-dni').value = '';
  document.getElementById('login-pass').value = '';
}
