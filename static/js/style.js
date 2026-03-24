// Elements
const views = {
  generator: document.getElementById('view-generator'),
  auth: document.getElementById('view-auth'),
  history: document.getElementById('view-history')
};

const nav = {
  loginBtn: document.getElementById('show-login-btn'),
  registerBtn: document.getElementById('show-register-btn'),
  historyBtn: document.getElementById('show-history-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  authStatus: document.getElementById('auth-status'),
  userStatus: document.getElementById('user-status'),
  usernameDisplay: document.getElementById('username-display')
};

const auth = {
  title: document.getElementById('auth-title'),
  groupUsername: document.getElementById('group-username'),
  username: document.getElementById('auth-username'),
  email: document.getElementById('auth-email'),
  password: document.getElementById('auth-password'),
  submitBtn: document.getElementById('auth-submit'),
  switchText: document.getElementById('auth-switch-text'),
  switchLink: document.getElementById('auth-switch-link'),
  error: document.getElementById('auth-error'),
  backBtn: document.getElementById('back-to-gen')
};

const gen = {
  input: document.getElementById('qr-input'),
  color: document.getElementById('qr-color'),
  bg: document.getElementById('qr-bg'),
  sizeSlider: document.getElementById('size-slider'),
  sizeLabel: document.getElementById('size-label'),
  logoUpload: document.getElementById('logo-upload'),
  uploadText: document.getElementById('upload-text'),
  removeLogoBtn: document.getElementById('remove-logo'),
  generateBtn: document.getElementById('generate-btn'),
  errorMsg: document.getElementById('qr-error')
};

const preview = {
  emptyState: document.getElementById('empty-state'),
  loader: document.getElementById('loader'),
  result: document.getElementById('qr-result'),
  canvas: document.getElementById('qr-canvas'),
  downloadBtn: document.getElementById('download-btn'),
  copyBtn: document.getElementById('copy-btn'),
  shareBtn: document.getElementById('share-btn')
};

const historyUI = {
  list: document.getElementById('history-list'),
  clearBtn: document.getElementById('clear-history-btn'),
  backBtn: document.getElementById('back-to-gen-history')
};

// State
let authMode = 'login';
let currentUser = null;
let logoDataUrl = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});

// View Navigation
function showView(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
}

nav.loginBtn.onclick = () => { authMode = 'login'; updateAuthUI(); showView('auth'); };
nav.registerBtn.onclick = () => { authMode = 'register'; updateAuthUI(); showView('auth'); };
nav.historyBtn.onclick = () => { loadHistory(); showView('history'); };
auth.backBtn.onclick = () => showView('generator');
historyUI.backBtn.onclick = () => showView('generator');

function updateAuthUI() {
  auth.error.style.display = 'none';
  if (authMode === 'login') {
    auth.title.innerText = 'Log In';
    auth.groupUsername.style.display = 'none';
    auth.submitBtn.innerText = 'Log In';
    auth.switchText.innerHTML = `Don't have an account? <a href="#" id="auth-switch-link">Sign Up</a>`;
  } else {
    auth.title.innerText = 'Sign Up';
    auth.groupUsername.style.display = 'flex';
    auth.submitBtn.innerText = 'Create Account';
    auth.switchText.innerHTML = `Already have an account? <a href="#" id="auth-switch-link">Log In</a>`;
  }
  document.getElementById('auth-switch-link').onclick = (e) => {
    e.preventDefault();
    authMode = authMode === 'login' ? 'register' : 'login';
    updateAuthUI();
  };
}

// Authentication API
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setCurrentUser(data.user);
    }
  } catch (e) { console.error(e); }
}

function setCurrentUser(user) {
  currentUser = user;
  if (user) {
    nav.authStatus.classList.add('hidden');
    nav.userStatus.classList.remove('hidden');
    nav.usernameDisplay.innerText = user.username;
    showView('generator');
  } else {
    nav.authStatus.classList.remove('hidden');
    nav.userStatus.classList.add('hidden');
    nav.usernameDisplay.innerText = '';
  }
}

auth.submitBtn.onclick = async () => {
  const email = auth.email.value.trim();
  const password = auth.password.value;
  const username = auth.username.value.trim();

  if (!email || !password || (authMode === 'register' && !username)) {
    auth.error.innerText = 'Please fill all fields.';
    auth.error.style.display = 'block';
    return;
  }

  auth.submitBtn.innerText = 'Processing...';
  const url = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const payload = { email, password };
  if (authMode === 'register') payload.username = username;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      auth.error.innerText = data.error || 'Authentication failed.';
      auth.error.style.display = 'block';
    } else {
      auth.email.value = ''; auth.password.value = ''; auth.username.value = '';
      setCurrentUser(data.user);
      showToast(authMode === 'login' ? 'Welcome back!' : 'Account created!');
    }
  } catch (e) {
    auth.error.innerText = 'Server error. Try again.';
    auth.error.style.display = 'block';
  }
  auth.submitBtn.innerText = authMode === 'login' ? 'Log In' : 'Create Account';
};

nav.logoutBtn.onclick = async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    showToast('Logged out successfully.');
    showView('generator');
  } catch (e) { console.error(e); }
};

// Generator Logic
gen.sizeSlider.oninput = (e) => gen.sizeLabel.innerText = `${e.target.value}px`;

gen.logoUpload.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    logoDataUrl = evt.target.result;
    gen.uploadText.innerText = file.name;
    gen.removeLogoBtn.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};
gen.removeLogoBtn.onclick = () => {
  logoDataUrl = null;
  gen.logoUpload.value = '';
  gen.uploadText.innerText = 'Click to browse or drop an image';
  gen.removeLogoBtn.classList.add('hidden');
};

gen.input.oninput = () => {
  gen.errorMsg.style.display = 'none';
};

gen.generateBtn.onclick = async () => {
  const text = gen.input.value.trim();
  if (!text) {
    gen.errorMsg.style.display = 'block';
    return;
  }

  preview.emptyState.classList.add('hidden');
  preview.result.classList.add('hidden');
  preview.loader.classList.remove('hidden');

  // Trigger Backend save if logged in
  if (currentUser) {
    try {
      await fetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          color: gen.color.value,
          bg_color: gen.bg.value,
          size: gen.sizeSlider.value
        })
      });
    } catch(e) { console.error('Failed to save history', e); }
  }

  // Generate Locally
  setTimeout(() => renderQRLocally(text), 600);
};

function renderQRLocally(text) {
  const size = parseInt(gen.sizeSlider.value);
  const color = gen.color.value;
  const bgColor = gen.bg.value;

  const tempDiv = document.createElement('div');
  const qr = new QRCode(tempDiv, {
    text: text, width: size, height: size,
    colorDark: color, colorLight: bgColor,
    correctLevel: QRCode.CorrectLevel.H
  });

  setTimeout(() => {
    const qrInnerCanvas = tempDiv.querySelector('canvas');
    if (!qrInnerCanvas) {
        console.error('Failed to generate QR');
        return;
    }

    preview.canvas.width = size;
    preview.canvas.height = size;
    const ctx = preview.canvas.getContext('2d');
    ctx.drawImage(qrInnerCanvas, 0, 0, size, size);

    if (logoDataUrl) {
      const img = new Image();
      img.onload = () => {
        const logoSize = size * 0.2;
        const logoPos = (size - logoSize) / 2;
        const pad = 6;
        
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(logoPos - pad, logoPos - pad, logoSize + pad * 2, logoSize + pad * 2, 8);
        ctx.fill();
        ctx.drawImage(img, logoPos, logoPos, logoSize, logoSize);
        showQRResult();
      };
      img.onerror = () => showQRResult();
      img.src = logoDataUrl;
    } else {
      showQRResult();
    }
  }, 200);
}

function showQRResult() {
  preview.loader.classList.add('hidden');
  preview.result.classList.remove('hidden');
}

// History API
async function loadHistory() {
  historyUI.list.innerHTML = '<div style="text-align:center; padding: 2rem;">Loading your history...</div>';
  try {
    const res = await fetch('/api/qr/history');
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderHistory(data.history);
  } catch(e) {
    historyUI.list.innerHTML = '<p class="error-msg" style="display:block;">Failed to load history.</p>';
  }
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    historyUI.list.innerHTML = '<div class="empty-state" style="margin-top: 2rem;">No QR codes generated yet.</div>';
    return;
  }

  historyUI.list.innerHTML = '';
  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-item-details">
        <strong>${item.text.length > 30 ? item.text.substring(0,30) + '...' : item.text}</strong>
        <span>${item.created_at}</span>
      </div>
      <img src="${item.qr_url}" class="history-item-img" crossorigin="anonymous"/>
    `;
    div.onclick = () => {
      gen.input.value = item.text;
      gen.color.value = '#' + item.color;
      gen.bg.value = '#' + item.bg_color;
      gen.sizeSlider.value = item.size;
      gen.sizeLabel.innerText = `${item.size}px`;
      showView('generator');
      showToast('Loaded from history');
    };
    historyUI.list.appendChild(div);
  });
}

historyUI.clearBtn.onclick = async () => {
  if(!confirm("Clear all history?")) return;
  try {
    await fetch('/api/qr/history/clear', { method: 'DELETE' });
    loadHistory();
    showToast('History cleared.');
  } catch(e) { console.error(e); }
};

// Actions
preview.downloadBtn.onclick = () => {
  preview.canvas.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'QRcraft-Pro.png';
    link.click();
    showToast('Downloaded!');
  });
};

preview.copyBtn.onclick = () => {
  navigator.clipboard.writeText(gen.input.value).then(() => showToast('Link copied!'));
};

preview.shareBtn.onclick = () => {
  preview.canvas.toBlob(async (blob) => {
    const file = new File([blob], 'qrcode.png', { type: 'image/png' });
    if(navigator.share) {
      try {
        await navigator.share({ title: 'My QR Code', files: [file] });
      } catch(e) {}
    } else {
      showToast('Sharing not supported on this device.');
    }
  });
};

// Toast
const toast = document.getElementById('toast');
let toastTimeout;
function showToast(msg) {
  toast.innerText = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 3000);
}