const CREW_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby-WZvipp8q3UzZ_ErTVmSxGFVJ6RTCwBnyv8-sPihCyj_nK99P8RgvCIiGwoCGN7qy/exec';
window.APP_CONFIG = window.APP_CONFIG || {
  app: 'tripulante',
  httpEndpoint: CREW_WEB_APP_URL
};

const crewState = {
  view: 'login',
  isLoading: false,
  user: null,
  dniStatus: null,
  regStep: 1,
  form: {
    dni: '',
    nombres: '',
    apellidos: '',
    cargo: '',
    empresa: ''
  },
  summary: {
    totalDocs: 0,
    validatedDocs: 0,
    compliance: 0
  },
  documents: []
};

document.addEventListener('DOMContentLoaded', function() {
  lucide.createIcons();
});

async function crewRpc(action, payload) {
  const request = {
    app: 'tripulante',
    action: action,
    payload: payload || {}
  };

  if (typeof google !== 'undefined' && google.script && google.script.run) {
    return new Promise(function(resolve, reject) {
      google.script.run
        .withSuccessHandler(function(response) {
          if (response && response.ok) {
            resolve(response.data);
            return;
          }
          reject(new Error(response && response.error ? response.error.message : 'Respuesta inválida del backend.'));
        })
        .withFailureHandler(function(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        })
        .dispatchRpc(request);
    });
  }

  if (window.APP_CONFIG && window.APP_CONFIG.httpEndpoint) {
    const response = await fetch(window.APP_CONFIG.httpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    const json = await response.json();
    if (!json.ok) {
      throw new Error(json.error && json.error.message ? json.error.message : 'Error del backend.');
    }
    return json.data;
  }

  throw new Error('No se pudo conectar con el backend unificado.');
}

function switchView(viewName) {
  ['login', 'dni-check', 'register', 'dashboard'].forEach(function(view) {
    const element = document.getElementById('view-' + view);
    if (!element) return;
    element.classList.add('view-hidden');
    element.classList.remove('view-active');
  });

  const target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.remove('view-hidden');
    target.classList.add('view-active');
  }

  crewState.view = viewName;
  lucide.createIcons();
}

function setIsLoading(loading) {
  crewState.isLoading = loading;
  const loader = document.getElementById('global-loader');
  if (!loader) return;
  loader.classList.toggle('hidden', !loading);
}

async function handleLogin() {
  const dni = document.getElementById('login-dni').value.trim();
  const password = document.getElementById('login-pass').value.trim();

  if (!dni || !password) {
    alert('Ingresa tu DNI y tu contraseña.');
    return;
  }

  setIsLoading(true);

  try {
    const auth = await crewRpc('auth.login', {
      dni: dni,
      password: password,
      portal: 'TRIPULANTE'
    });

    crewState.user = auth.user;
    await loadCrewDashboard();
    switchView('dashboard');
  } catch (error) {
    alert(error.message || 'No se pudo iniciar sesión.');
  } finally {
    setIsLoading(false);
  }
}

async function handleCheckDni() {
  const dni = document.getElementById('check-dni-input').value.trim();
  if (!dni || dni.length < 8) {
    alert('Ingresa un DNI válido.');
    return;
  }

  setIsLoading(true);

  try {
    const response = await crewRpc('tripulante.checkDni', { dni: dni });
    crewState.dniStatus = response.status;
    document.getElementById('alert-exists').classList.add('hidden');

    if (response.status === 'EXISTS') {
      document.getElementById('alert-exists').classList.remove('hidden');
      return;
    }

    crewState.form.dni = dni;
    crewState.form.nombres = response.data ? response.data.nombres : '';
    crewState.form.apellidos = response.data ? response.data.apellidos : '';
    crewState.form.cargo = response.data ? response.data.cargo : '';
    crewState.form.empresa = response.data ? response.data.empresa : '';

    setupRegisterWizard(response.status);
    switchView('register');
  } catch (error) {
    alert(error.message || 'No se pudo validar el DNI.');
  } finally {
    setIsLoading(false);
  }
}

function setupRegisterWizard(status) {
  const isPreload = status === 'PRELOAD';
  document.getElementById('reg-type-label').innerText = isPreload ? 'Complementar Perfil' : 'Nuevo Ingreso';
  document.getElementById('reg-step-1-desc').innerText = isPreload
    ? 'Tus datos fueron precargados por la operación. Solo confirma y finaliza el alta.'
    : 'Completa tu información para habilitar tu perfil operativo.';

  ['nombres', 'apellidos', 'cargo', 'empresa'].forEach(function(field) {
    const input = document.getElementById('reg-' + field);
    input.value = crewState.form[field];
    input.readOnly = isPreload;
    input.classList.toggle('bg-slate-50', isPreload);
    input.classList.toggle('text-slate-500', isPreload);
    input.classList.toggle('cursor-not-allowed', isPreload);
  });

  document.getElementById('badge-nombres').classList.toggle('hidden', !isPreload);
  document.getElementById('badge-apellidos').classList.toggle('hidden', !isPreload);
  document.getElementById('reg-pass-container').classList.toggle('hidden', isPreload);

  goToRegStep(1);
}

function goToRegStep(step) {
  crewState.regStep = step;

  document.getElementById('step-1-bar').className = 'h-1.5 rounded-full transition-all duration-500 ' + (step >= 1 ? 'bg-red-600' : 'bg-slate-200');
  document.getElementById('step-2-bar').className = 'h-1.5 rounded-full transition-all duration-500 ' + (step >= 2 ? 'bg-red-600' : 'bg-slate-200');
  document.getElementById('step-3-bar').className = 'h-1.5 rounded-full transition-all duration-500 ' + (step >= 3 ? 'bg-red-600' : 'bg-slate-200');

  document.getElementById('reg-step-1').classList.toggle('hidden', step !== 1);
  document.getElementById('reg-step-2').classList.toggle('hidden', step !== 2);
  document.getElementById('reg-step-3').classList.toggle('hidden', step !== 3);

  lucide.createIcons();
}

async function handleRegister() {
  const password = crewState.dniStatus === 'PRELOAD'
    ? promptDefaultPassword_()
    : document.getElementById('reg-pass').value.trim();

  const payload = {
    dni: crewState.form.dni,
    nombres: document.getElementById('reg-nombres').value.trim(),
    apellidos: document.getElementById('reg-apellidos').value.trim(),
    cargo: document.getElementById('reg-cargo').value.trim(),
    empresa: document.getElementById('reg-empresa').value.trim(),
    password: password
  };

  if (!payload.nombres || !payload.apellidos || !payload.cargo || !payload.empresa || !payload.password) {
    alert('Completa todos los campos obligatorios.');
    return;
  }

  setIsLoading(true);

  try {
    await crewRpc('tripulante.register', payload);
    goToRegStep(3);
  } catch (error) {
    alert(error.message || 'No se pudo registrar el tripulante.');
  } finally {
    setIsLoading(false);
  }
}

async function loadCrewDashboard() {
  if (!crewState.user) return;
  const payload = await crewRpc('tripulante.bootstrap', { dni: crewState.user.dni });
  crewState.user = payload.user;
  crewState.documents = payload.documents || [];
  crewState.summary = payload.summary || { totalDocs: 0, validatedDocs: 0, compliance: 0 };
  renderDashboard();
}

function renderDashboard() {
  const user = crewState.user;
  if (!user) return;

  const names = (user.nombres || '').split(' ');
  const lastNames = (user.apellidos || '').split(' ');

  document.getElementById('dash-user-name').innerHTML = (names[0] || '') + '<br/>' + (lastNames[0] || '');
  document.getElementById('dash-user-cargo').innerText = user.cargo || 'SIN CARGO';
  document.getElementById('dash-user-dni').innerText = 'DNI ' + user.dni;

  const compliance = crewState.summary.compliance || 0;
  document.getElementById('dash-compl-text').innerText = compliance + '%';
  document.getElementById('dash-compl-label').innerText = compliance >= 80 ? 'EXCELENTE' : (compliance > 0 ? 'EN PROCESO' : 'SIN CALIFICAR');

  const circle = document.getElementById('dash-compl-circle');
  const offset = 263.89 * (1 - compliance / 100);
  setTimeout(function() {
    circle.style.strokeDashoffset = offset;
  }, 100);

  document.getElementById('dash-doc-count').innerText = crewState.summary.validatedDocs + '/' + crewState.summary.totalDocs;

  const list = document.getElementById('dash-document-list');
  list.innerHTML = crewState.documents.map(function(doc) {
    return '' +
      '<div class="bg-white p-5 rounded-[32px] border border-slate-100/50 flex items-center gap-5 shadow-sm">' +
        '<div class="p-4 rounded-2xl flex items-center justify-center ' + getCrewDocIconClass_(doc.status) + '">' +
          '<i data-lucide="id-card" size="24"></i>' +
        '</div>' +
        '<div class="space-y-1 flex-1">' +
          '<p class="text-[16px] font-bold text-[#101828]">' + doc.type + '</p>' +
          '<p class="text-[11px] font-black uppercase tracking-wider ' + getCrewDocTextClass_(doc.status) + '">' + formatCrewStatus_(doc.status) + ' • Vence: ' + (doc.expiryDate || 'Sin fecha') + '</p>' +
          (doc.observations ? '<p class="text-[11px] text-amber-700 font-medium">' + doc.observations + '</p>' : '') +
        '</div>' +
      '</div>';
  }).join('');

  lucide.createIcons();
}

async function handleRefresh() {
  if (!crewState.user) return;
  setIsLoading(true);
  try {
    await loadCrewDashboard();
  } catch (error) {
    alert(error.message || 'No se pudo refrescar el tablero.');
  } finally {
    setIsLoading(false);
  }
}

function handleLogout() {
  setIsLoading(true);
  setTimeout(function() {
    crewState.user = null;
    window.location.reload();
  }, 500);
}

function promptDefaultPassword_() {
  return 'HTBPDT-' + crewState.form.dni.slice(-4);
}

function getCrewDocIconClass_(status) {
  if (status === 'VALIDADO' || status === 'VIGENTE') return 'bg-emerald-50 text-emerald-600';
  if (status === 'OBSERVADO' || status === 'POR_VENCER') return 'bg-amber-50 text-amber-600';
  if (status === 'RECHAZADO' || status === 'VENCIDO' || status === 'FALTANTE') return 'bg-red-50 text-red-600';
  return 'bg-slate-100 text-slate-500';
}

function getCrewDocTextClass_(status) {
  if (status === 'VALIDADO' || status === 'VIGENTE') return 'text-emerald-600';
  if (status === 'OBSERVADO' || status === 'POR_VENCER') return 'text-amber-600';
  if (status === 'RECHAZADO' || status === 'VENCIDO' || status === 'FALTANTE') return 'text-red-600';
  return 'text-slate-500';
}

function formatCrewStatus_(status) {
  return status.replace(/_/g, ' ');
}
