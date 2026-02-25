const THEME_KEY = "doc-mgmt-theme";

let state = { users: [], documents: [] };
let session = { userId: null, role: null, id: null, name: null };
let documentEditorContext = { mode: "create", documentId: null, ownerId: null };
let userEditorContext = { mode: "create", userInternalId: null };

const views = {
  login: document.getElementById("loginView"),
  signup: document.getElementById("signupView"),
  admin: document.getElementById("adminView"),
  user: document.getElementById("userView"),
  documentEditor: document.getElementById("documentEditorView"),
  userEditor: document.getElementById("userEditorView")
};

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const logoutBtn = document.getElementById("logoutBtn");
const backBtn = document.getElementById("backBtn");
const adminDocumentList = document.getElementById("adminDocumentList");
const userDocumentList = document.getElementById("userDocumentList");
const adminUserList = document.getElementById("adminUserList");
const docForm = document.getElementById("documentForm");
const userForm = document.getElementById("userForm");
const lightModeBtn = document.getElementById("lightModeBtn");
const darkModeBtn = document.getElementById("darkModeBtn");
const openSignupBtn = document.getElementById("openSignupBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const adminActionsCard = document.getElementById("adminActionsCard");
const adminDocumentsCard = document.getElementById("adminDocumentsCard");
const adminUsersCard = document.getElementById("adminUsersCard");
const userActionsCard = document.getElementById("userActionsCard");
const userDocumentsCard = document.getElementById("userDocumentsCard");

const adminSearchInput = document.getElementById("adminSearchInput");
const userSearchInput = document.getElementById("userSearchInput");
let activeSearch = { admin: null, user: null };
let currentSection = "dashboard";
let previousRoute = null;

const LOCAL_FALLBACK_KEY = "docu-local-fallback-v1";
let useLocalFallback = false;
let fallbackWarned = false;

function fallbackSeed() {
  return {
    users: [
      { id: crypto.randomUUID(), name: "Default Admin", userId: "admin", password: "admin123", role: "admin" },
      { id: crypto.randomUUID(), name: "Sample User", userId: "user1", password: "user123", role: "user" }
    ],
    documents: []
  };
}

function getFallbackStore() {
  const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
  if (!raw) {
    const seeded = fallbackSeed();
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const seeded = fallbackSeed();
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function setFallbackStore(data) {
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(data));
}

function parsePath(path) {
  const u = new URL(path, window.location.origin);
  return { pathname: u.pathname, search: u.searchParams };
}

function fakeEmbedding(text) {
  const v = new Array(64).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % 64] += text.charCodeAt(i) / 255;
  }
  return v;
}

function cosine(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function localApi(path, options = {}) {
  const { pathname, search } = parsePath(path);
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const db = getFallbackStore();

  if (pathname === "/api/login" && method === "POST") {
    const user = db.users.find((u) => u.userId === body.userId && u.password === body.password) || null;
    return { user };
  }

  if (pathname === "/api/users" && method === "GET") return { users: db.users };
  if (pathname === "/api/users" && method === "POST") {
    const user = { id: crypto.randomUUID(), ...body };
    db.users.push(user);
    setFallbackStore(db);
    return { user };
  }

  if (pathname.startsWith('/api/users/') && method === 'PUT') {
    const id = pathname.split('/').pop();
    db.users = db.users.map((u) => u.id === id ? { ...u, ...body, id } : u);
    setFallbackStore(db);
    return { user: db.users.find((u) => u.id === id) || null };
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const id = pathname.split('/').pop();
    db.users = db.users.filter((u) => u.id !== id);
    db.documents = db.documents.filter((d) => d.ownerId !== id);
    setFallbackStore(db);
    return { ok: true };
  }

  if (pathname === '/api/documents' && method === 'GET') {
    const ownerId = search.get('ownerId');
    return { documents: ownerId ? db.documents.filter((d) => d.ownerId === ownerId) : db.documents };
  }

  if (pathname === '/api/documents' && method === 'POST') {
    const now = new Date().toISOString();
    const document = { id: crypto.randomUUID(), ...body, createdAt: now, updatedAt: now };
    db.documents.push(document);
    setFallbackStore(db);
    return { document };
  }

  if (pathname.startsWith('/api/documents/') && method === 'PUT') {
    const id = pathname.split('/').pop();
    db.documents = db.documents.map((d) => d.id === id ? { ...d, ...body, id, updatedAt: new Date().toISOString() } : d);
    setFallbackStore(db);
    return { document: db.documents.find((d) => d.id === id) || null };
  }

  if (pathname.startsWith('/api/documents/') && method === 'DELETE') {
    const id = pathname.split('/').pop();
    db.documents = db.documents.filter((d) => d.id !== id);
    setFallbackStore(db);
    return { ok: true };
  }

  if (pathname === '/api/embeddings' && method === 'POST') {
    const summary = String(body.summary || '').trim();
    if (!summary) throw new Error('summary is required.');
    return { embedding: fakeEmbedding(summary), model: 'local-fallback-embedding' };
  }

  if (pathname === '/api/search' && method === 'POST') {
    const query = String(body.query || '').trim();
    if (!query) throw new Error('query is required.');
    const qv = fakeEmbedding(query);
    const docs = body.role === 'admin' ? db.documents : db.documents.filter((d) => d.ownerId === body.ownerId);
    const scored = docs.map((d) => ({
      ...d,
      score: cosine(qv, d.summaryEmbedding?.vector || fakeEmbedding(d.summary || ''))
    })).sort((a, b) => b.score - a.score);
    return { documents: scored };
  }

  throw new Error(`Unsupported local API route: ${method} ${pathname}`);
}

async function api(path, options = {}) {
  if (useLocalFallback) return localApi(path, options);

  try {
    const res = await fetch(path, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text || '{}');
    } catch {
      throw new Error('API returned non-JSON response.');
    }

    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (error) {
    useLocalFallback = true;
    if (!fallbackWarned) {
      fallbackWarned = true;
      alert('Backend API is unavailable on this host. Running in local fallback mode (data saved in browser).');
    }
    return localApi(path, options);
  }
}

function getCurrentUser() {
  return state.users.find((user) => user.userId === session.userId) || null;
}

function setVisibleView(viewName) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
}

function setupPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? '🙈' : '👁';
    });
  });
}

function currentVisibleView() {
  return Object.entries(views).find(([, el]) => !el.classList.contains("hidden"))?.[0] || "login";
}

function updateBackButton() {
  const visible = currentVisibleView();
  const show = Boolean(session.userId && previousRoute && (visible === "documentEditor" || visible === "userEditor"));
  backBtn.hidden = !show;
}

function navigateTo(route) {
  if (!route) return;
  currentSection = route.section || "dashboard";

  if (route.view === "admin") {
    renderAdminDashboard();
    setMenuActive(currentSection);
    applyAdminMenuSection(currentSection);
    setVisibleView("admin");
    animateView("admin");
  } else if (route.view === "user") {
    renderUserDashboard();
    setMenuActive(currentSection);
    applyUserMenuSection(currentSection);
    setVisibleView("user");
    animateView("user");
    updateBackButton();
  } else {
    setVisibleView(route.view || "login");
    animateView(route.view || "login");
  }

  updateBackButton();
}

function savePreviousRoute() {
  const v = currentVisibleView();
  if (v === "admin" || v === "user") {
    previousRoute = { view: v, section: currentSection };
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const body = document.body;
  const isDark = theme === "dark";

  root.classList.toggle("dark", isDark);
  body.classList.toggle("dark", isDark);
  body.classList.toggle("light", !isDark);

  lightModeBtn.classList.toggle("theme-btn-active", !isDark);
  darkModeBtn.classList.toggle("theme-btn-active", isDark);
}

function initializeTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (systemDark ? "dark" : "light"));
}

function setTheme(theme) {
  const resolvedTheme = theme === "dark" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, resolvedTheme);
  applyTheme(resolvedTheme);
}

function animateView(viewName) {
  const view = views[viewName];
  view.classList.remove("animate-fadeUp");
  void view.offsetWidth;
  view.classList.add("animate-fadeUp");
}

async function generateSummaryEmbedding(summary) {
  const result = await api("/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary })
  });
  return { vector: result.embedding, model: result.model };
}

function setMenuActive(target) {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.classList.toggle("menu-link-active", btn.dataset.nav === target);
  });
}

function hideCard(card) { if (card) card.classList.add("hidden"); }
function showCard(card) { if (card) card.classList.remove("hidden"); }

function applyAdminMenuSection(target) {
  showCard(adminActionsCard);
  showCard(adminDocumentsCard);
  showCard(adminUsersCard);
  if (target === "documents") hideCard(adminUsersCard);
  else if (target === "users") hideCard(adminDocumentsCard);
}

function applyUserMenuSection(target) {
  showCard(userActionsCard);
  showCard(userDocumentsCard);
  if (target === "documents") hideCard(userActionsCard);
  if (target === "users") alert("Users page is available only for admins.");
}

async function refreshState() {
  if (!session.userId) return;
  const current = session.role === "admin" ? await api("/api/documents") : await api(`/api/documents?ownerId=${session.id}`);
  state.documents = current.documents;
  if (session.role === "admin") {
    state.users = (await api("/api/users")).users;
  } else {
    const me = await api("/api/users");
    state.users = me.users;
  }
}

async function renderApp() {
  if (!session.userId) {
    logoutBtn.hidden = true;
    backBtn.hidden = true;
    if (currentVisibleView() !== "signup") {
      setVisibleView("login");
      animateView("login");
    }
    return;
  }

  await refreshState();
  logoutBtn.hidden = false;

  if (session.role === "admin") {
    currentSection = "dashboard";
    renderAdminDashboard();
    setMenuActive("dashboard");
    applyAdminMenuSection("dashboard");
    setVisibleView("admin");
    animateView("admin");
    updateBackButton();
    return;
  }

  currentSection = "dashboard";
  renderUserDashboard();
  setMenuActive("dashboard");
  applyUserMenuSection("dashboard");
  setVisibleView("user");
  animateView("user");
  updateBackButton();
}

function emptyMessage(text) {
  return `<div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-500 dark:text-slate-400">${text}</div>`;
}

function renderAdminDashboard() {
  adminDocumentList.innerHTML = "";
  adminUserList.innerHTML = "";

  const docs = activeSearch.admin || state.documents;
  document.getElementById("adminDocCount").textContent = docs.length;
  document.getElementById("adminUserCount").textContent = state.users.length;

  if (!docs.length) adminDocumentList.innerHTML = emptyMessage("No documents found yet.");

  docs.forEach((doc) => {
    const row = document.getElementById("documentRowTemplate").content.firstElementChild.cloneNode(true);
    const owner = state.users.find((user) => user.id === doc.ownerId);
    row.querySelector(".row-title").textContent = doc.title;
    row.querySelector(".row-meta").textContent = `Owner: ${owner?.name || "Unknown"} (${owner?.userId || "n/a"})`;
    row.querySelector(".row-body").textContent = `Description: ${doc.description}\nSummary: ${doc.summary}\nEmbedding size: ${doc.summaryEmbedding?.vector?.length || 0}${doc.score != null ? `\nRelevance: ${doc.score.toFixed(3)}` : ''}`;

    const actions = row.querySelector(".row-actions");
    actions.append(
      createActionButton("Edit", false, () => openDocumentEditor("edit", doc.id)),
      createActionButton("Delete", true, () => deleteDocument(doc.id, true))
    );
    adminDocumentList.appendChild(row);
  });

  state.users.forEach((user) => {
    const row = document.getElementById("userRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".row-title").textContent = `${user.name} (${user.userId})`;
    row.querySelector(".row-meta").textContent = `Role: ${user.role}`;
    const actions = row.querySelector(".row-actions");
    actions.append(createActionButton("Edit", false, () => openUserEditor("edit", user.id)));
    if (user.role !== "admin") actions.append(createActionButton("Delete", true, () => deleteUser(user.id)));
    adminUserList.appendChild(row);
  });
}

function renderUserDashboard() {
  userDocumentList.innerHTML = "";
  const docs = activeSearch.user || state.documents;
  document.getElementById("userDocCount").textContent = docs.length;

  if (!docs.length) {
    userDocumentList.innerHTML = emptyMessage("You have no documents yet. Create your first one.");
    return;
  }

  docs.forEach((doc) => {
    const row = document.getElementById("documentRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".row-title").textContent = doc.title;
    row.querySelector(".row-meta").textContent = `Last updated: ${new Date(doc.updatedAt).toLocaleString()}`;
    row.querySelector(".row-body").textContent = `Description: ${doc.description}\nSummary: ${doc.summary}\nEmbedding size: ${doc.summaryEmbedding?.vector?.length || 0}${doc.score != null ? `\nRelevance: ${doc.score.toFixed(3)}` : ''}`;

    const actions = row.querySelector(".row-actions");
    actions.append(
      createActionButton("Edit", false, () => openDocumentEditor("edit", doc.id)),
      createActionButton("Delete", true, () => deleteDocument(doc.id, false))
    );

    userDocumentList.appendChild(row);
  });
}

function createActionButton(label, isDelete, onClick) {
  const button = document.createElement("button");
  button.textContent = label;
  button.type = "button";
  if (isDelete) button.classList.add("delete");
  button.addEventListener("click", onClick);
  return button;
}

function openDocumentEditor(mode, documentId = null) {
  savePreviousRoute();
  documentEditorContext = { mode, documentId, ownerId: session.id };
  const editorTitle = document.getElementById("documentEditorTitle");
  const ownerLabel = document.getElementById("documentOwnerLabel");

  if (mode === "edit") {
    const doc = state.documents.find((item) => item.id === documentId);
    if (!doc) return;
    if (session.role !== "admin" && doc.ownerId !== session.id) return alert("You can edit only your own documents.");

    documentEditorContext.ownerId = doc.ownerId;
    editorTitle.textContent = "Edit Document";
    ownerLabel.textContent = session.role === "admin"
      ? `Editing owner: ${state.users.find((u) => u.id === doc.ownerId)?.name || "Unknown"}`
      : "Editing your document";

    docForm.title.value = doc.title;
    docForm.description.value = doc.description;
    docForm.summary.value = doc.summary;
  } else {
    editorTitle.textContent = "Create Document";
    ownerLabel.textContent = session.role === "admin" ? "New document will be assigned to your account." : "Create a new document for your account.";
    docForm.reset();
  }

  setVisibleView("documentEditor");
  animateView("documentEditor");
  updateBackButton();
}

function openUserEditor(mode, userInternalId = null) {
  savePreviousRoute();
  userEditorContext = { mode, userInternalId };
  const title = document.getElementById("userEditorTitle");

  if (mode === "edit") {
    const user = state.users.find((item) => item.id === userInternalId);
    if (!user) return;
    title.textContent = "Edit User";
    userForm.name.value = user.name;
    userForm.userId.value = user.userId;
    userForm.password.value = user.password;
    userForm.role.value = user.role;
  } else {
    title.textContent = "Create User";
    userForm.reset();
    userForm.role.value = "user";
  }

  setVisibleView("userEditor");
  animateView("userEditor");
  updateBackButton();
}

async function deleteDocument(documentId, isAdminFlow) {
  const doc = state.documents.find((item) => item.id === documentId);
  if (!doc) return;
  if (!isAdminFlow && doc.ownerId !== session.id) return alert("You can only delete your own document.");

  await api(`/api/documents/${documentId}`, { method: "DELETE" });
  await renderApp();
}

async function deleteUser(userInternalId) {
  await api(`/api/users/${userInternalId}`, { method: "DELETE" });
  await renderApp();
}

async function semanticSearch(query) {
  const result = await api('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, role: session.role, ownerId: session.id })
  });
  return result.documents || [];
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const userId = formData.get("userId").toString().trim();
  const password = formData.get("password").toString();

  try {
    const { user } = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password })
    });
    if (!user) return alert('Invalid credentials.');

    session = { userId: user.userId, role: user.role, id: user.id, name: user.name };
    loginForm.reset();
    activeSearch = { admin: null, user: null };
    previousRoute = null;
    await renderApp();
  } catch (e) {
    alert(e.message);
  }
});


openSignupBtn?.addEventListener('click', () => {
  if (!views.signup) return;
  setVisibleView('signup');
  animateView('signup');
});

backToLoginBtn?.addEventListener('click', () => {
  signupForm?.reset();
  setVisibleView('login');
  animateView('login');
});

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(signupForm || undefined);
  const name = String(formData.get('name') || '').trim();
  const userId = String(formData.get('userId') || '').trim();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (!name || !userId || !password) {
    alert('All signup fields are required.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  try {
    await api('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, userId, password, role: 'user' })
    });
    alert('Signup successful. Please login with your new account.');
    signupForm?.reset();
    setVisibleView('login');
    animateView('login');
  } catch (error) {
    alert(`Signup failed: ${error.message}`);
  }
});

logoutBtn.addEventListener("click", async () => {
  session = { userId: null, role: null, id: null, name: null };
  activeSearch = { admin: null, user: null };
  previousRoute = null;
  await renderApp();
});

document.getElementById("adminCreateDocBtn").addEventListener("click", () => openDocumentEditor("create"));
document.getElementById("userCreateDocBtn").addEventListener("click", () => openDocumentEditor("create"));
document.getElementById("cancelDocumentBtn").addEventListener("click", async () => renderApp());

docForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = docForm.title.value.trim();
  const description = docForm.description.value.trim();
  const summary = docForm.summary.value.trim();

  if (!title || !description || !summary) return alert("All document fields are required.");

  const submitButton = docForm.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving + Embedding...";

  try {
    const summaryEmbedding = await generateSummaryEmbedding(summary);
    if (documentEditorContext.mode === "edit") {
      await api(`/api/documents/${documentEditorContext.documentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, summary, summaryEmbedding })
      });
    } else {
      await api('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: documentEditorContext.ownerId, title, description, summary, summaryEmbedding })
      });
    }
    await renderApp();
  } catch (error) {
    alert(`Document could not be saved: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});

document.getElementById("adminCreateUserBtn").addEventListener("click", () => openUserEditor("create"));
document.getElementById("cancelUserBtn").addEventListener("click", async () => renderApp());

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = userForm.name.value.trim();
  const userId = userForm.userId.value.trim();
  const password = userForm.password.value;
  const role = userForm.role.value;

  if (!name || !userId || !password || !role) return alert("All user fields are required.");

  try {
    if (userEditorContext.mode === "edit") {
      await api(`/api/users/${userEditorContext.userInternalId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userId, password, role })
      });
    } else {
      await api('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userId, password, role })
      });
    }
    await renderApp();
  } catch (e) {
    alert(e.message);
  }
});

document.querySelectorAll("[data-nav]").forEach((navBtn) => {
  navBtn.addEventListener("click", async () => {
    if (!session.userId) return;
    const target = navBtn.dataset.nav || "dashboard";
    currentSection = target;
    setMenuActive(target);

    if (session.role === "admin") {
      renderAdminDashboard();
      applyAdminMenuSection(target);
      setVisibleView("admin");
      animateView("admin");
      updateBackButton();
      return;
    }

    renderUserDashboard();
    applyUserMenuSection(target);
    setVisibleView("user");
    animateView("user");
    updateBackButton();
  });
});

adminSearchInput?.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = adminSearchInput.value.trim();
  if (!q) { activeSearch.admin = null; return renderAdminDashboard(); }
  activeSearch.admin = await semanticSearch(q);
  renderAdminDashboard();
});

userSearchInput?.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = userSearchInput.value.trim();
  if (!q) { activeSearch.user = null; return renderUserDashboard(); }
  activeSearch.user = await semanticSearch(q);
  renderUserDashboard();
});

backBtn.addEventListener("click", () => {
  navigateTo(previousRoute);
  previousRoute = null;
  updateBackButton();
});

lightModeBtn.addEventListener("click", () => setTheme("light"));
darkModeBtn.addEventListener("click", () => setTheme("dark"));
document.getElementById("year").textContent = new Date().getFullYear();

if (!openSignupBtn || !signupForm || !views.signup) {
  console.warn('Signup UI elements are missing. Ensure latest index.html is deployed with app.js.');
}

setupPasswordToggles();
initializeTheme();
renderApp();
