const STORAGE_KEY = "doc-mgmt-state-v2";
const THEME_KEY = "doc-mgmt-theme";

const initialState = {
  users: [
    { id: crypto.randomUUID(), name: "Default Admin", userId: "admin", password: "admin123", role: "admin" },
    { id: crypto.randomUUID(), name: "Sample User", userId: "user1", password: "user123", role: "user" }
  ],
  documents: []
};

let state = loadState();
let session = { userId: null, role: null };
let documentEditorContext = { mode: "create", documentId: null, ownerId: null };
let userEditorContext = { mode: "create", userInternalId: null };

const views = {
  login: document.getElementById("loginView"),
  admin: document.getElementById("adminView"),
  user: document.getElementById("userView"),
  documentEditor: document.getElementById("documentEditorView"),
  userEditor: document.getElementById("userEditorView")
};

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const adminDocumentList = document.getElementById("adminDocumentList");
const userDocumentList = document.getElementById("userDocumentList");
const adminUserList = document.getElementById("adminUserList");
const docForm = document.getElementById("documentForm");
const userForm = document.getElementById("userForm");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeLabel = document.getElementById("themeLabel");
const themeIcon = document.getElementById("themeIcon");
const adminActionsCard = document.getElementById("adminActionsCard");
const adminDocumentsCard = document.getElementById("adminDocumentsCard");
const adminUsersCard = document.getElementById("adminUsersCard");
const userActionsCard = document.getElementById("userActionsCard");
const userDocumentsCard = document.getElementById("userDocumentsCard");

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
    return structuredClone(initialState);
  }

  try {
    return JSON.parse(saved);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentUser() {
  return state.users.find((user) => user.userId === session.userId) || null;
}

function setVisibleView(viewName) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    themeLabel.textContent = "Light";
    themeIcon.textContent = "☀️";
  } else {
    root.classList.remove("dark");
    themeLabel.textContent = "Dark";
    themeIcon.textContent = "🌙";
  }
}

function initializeTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (systemDark ? "dark" : "light"));
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  const nextTheme = isDark ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}

function animateView(viewName) {
  const view = views[viewName];
  view.classList.remove("animate-fadeUp");
  void view.offsetWidth;
  view.classList.add("animate-fadeUp");
}

async function generateSummaryEmbedding(summary) {
  const response = await fetch("/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Unable to generate summary embedding.");
  }

  return {
    vector: result.embedding,
    model: result.model
  };
}

function setMenuActive(target) {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    const isActive = btn.dataset.nav === target;
    btn.classList.toggle("menu-link-active", isActive);
  });
}

function hideCard(card) {
  if (card) card.classList.add("hidden");
}

function showCard(card) {
  if (card) card.classList.remove("hidden");
}

function applyAdminMenuSection(target) {
  showCard(adminActionsCard);
  showCard(adminDocumentsCard);
  showCard(adminUsersCard);

  if (target === "documents") {
    hideCard(adminUsersCard);
  } else if (target === "users") {
    hideCard(adminDocumentsCard);
  }
}

function applyUserMenuSection(target) {
  showCard(userActionsCard);
  showCard(userDocumentsCard);

  if (target === "dashboard") return;

  if (target === "documents") {
    showCard(userDocumentsCard);
    hideCard(userActionsCard);
    return;
  }

  alert("Users page is available only for admins.");
}

function renderApp() {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    session = { userId: null, role: null };
    logoutBtn.hidden = true;
    setVisibleView("login");
    animateView("login");
    return;
  }

  logoutBtn.hidden = false;
  if (currentUser.role === "admin") {
    renderAdminDashboard();
    setMenuActive("dashboard");
    applyAdminMenuSection("dashboard");
    setVisibleView("admin");
    animateView("admin");
    return;
  }

  renderUserDashboard();
  setMenuActive("dashboard");
  applyUserMenuSection("dashboard");
  setVisibleView("user");
  animateView("user");
}

function emptyMessage(text) {
  return `<div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-500 dark:text-slate-400">${text}</div>`;
}

function renderAdminDashboard() {
  adminDocumentList.innerHTML = "";
  adminUserList.innerHTML = "";
  document.getElementById("adminDocCount").textContent = state.documents.length;
  document.getElementById("adminUserCount").textContent = state.users.length;

  if (!state.documents.length) {
    adminDocumentList.innerHTML = emptyMessage("No documents found yet.");
  }

  state.documents.forEach((doc) => {
    const row = document.getElementById("documentRowTemplate").content.firstElementChild.cloneNode(true);
    const owner = state.users.find((user) => user.id === doc.ownerId);
    row.querySelector(".row-title").textContent = doc.title;
    row.querySelector(".row-meta").textContent = `Owner: ${owner?.name || "Unknown"} (${owner?.userId || "n/a"})`;
    row.querySelector(".row-body").textContent = `Description: ${doc.description}\nSummary: ${doc.summary}\nEmbedding size: ${doc.summaryEmbedding?.vector?.length || 0}`;

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
    if (user.role !== "admin") {
      actions.append(createActionButton("Delete", true, () => deleteUser(user.id)));
    }

    adminUserList.appendChild(row);
  });
}

function renderUserDashboard() {
  userDocumentList.innerHTML = "";
  const currentUser = getCurrentUser();
  const docs = state.documents.filter((doc) => doc.ownerId === currentUser.id);
  document.getElementById("userDocCount").textContent = docs.length;

  if (!docs.length) {
    userDocumentList.innerHTML = emptyMessage("You have no documents yet. Create your first one.");
    return;
  }

  docs.forEach((doc) => {
    const row = document.getElementById("documentRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".row-title").textContent = doc.title;
    row.querySelector(".row-meta").textContent = `Last updated: ${new Date(doc.updatedAt).toLocaleString()}`;
    row.querySelector(".row-body").textContent = `Description: ${doc.description}\nSummary: ${doc.summary}\nEmbedding size: ${doc.summaryEmbedding?.vector?.length || 0}`;

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
  if (isDelete) {
    button.classList.add("delete");
  }
  button.addEventListener("click", onClick);
  return button;
}

function openDocumentEditor(mode, documentId = null) {
  const currentUser = getCurrentUser();
  documentEditorContext = { mode, documentId, ownerId: currentUser.id };
  const editorTitle = document.getElementById("documentEditorTitle");
  const ownerLabel = document.getElementById("documentOwnerLabel");

  if (mode === "edit") {
    const doc = state.documents.find((item) => item.id === documentId);
    if (!doc) return;

    if (currentUser.role !== "admin" && doc.ownerId !== currentUser.id) {
      alert("You can edit only your own documents.");
      return;
    }

    documentEditorContext.ownerId = doc.ownerId;
    editorTitle.textContent = "Edit Document";
    ownerLabel.textContent = currentUser.role === "admin"
      ? `Editing owner: ${state.users.find((u) => u.id === doc.ownerId)?.name || "Unknown"}`
      : "Editing your document";

    docForm.title.value = doc.title;
    docForm.description.value = doc.description;
    docForm.summary.value = doc.summary;
  } else {
    editorTitle.textContent = "Create Document";
    ownerLabel.textContent = currentUser.role === "admin"
      ? "New document will be assigned to your account."
      : "Create a new document for your account.";
    docForm.reset();
  }

  setVisibleView("documentEditor");
  animateView("documentEditor");
}

function openUserEditor(mode, userInternalId = null) {
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
}

function deleteDocument(documentId, isAdminFlow) {
  const currentUser = getCurrentUser();
  const doc = state.documents.find((item) => item.id === documentId);
  if (!doc) return;

  if (!isAdminFlow && doc.ownerId !== currentUser.id) {
    alert("You can only delete your own document.");
    return;
  }

  state.documents = state.documents.filter((item) => item.id !== documentId);
  saveState();
  renderApp();
}

function deleteUser(userInternalId) {
  const user = state.users.find((item) => item.id === userInternalId);
  if (!user) return;

  state.users = state.users.filter((item) => item.id !== userInternalId);
  state.documents = state.documents.filter((doc) => doc.ownerId !== userInternalId);
  saveState();
  renderApp();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const userId = formData.get("userId").toString().trim();
  const password = formData.get("password").toString();

  const user = state.users.find((u) => u.userId === userId && u.password === password);
  if (!user) {
    alert("Invalid credentials.");
    return;
  }

  session = { userId: user.userId, role: user.role };
  loginForm.reset();
  renderApp();
});

logoutBtn.addEventListener("click", () => {
  session = { userId: null, role: null };
  renderApp();
});

document.getElementById("adminCreateDocBtn").addEventListener("click", () => openDocumentEditor("create"));
document.getElementById("userCreateDocBtn").addEventListener("click", () => openDocumentEditor("create"));
document.getElementById("cancelDocumentBtn").addEventListener("click", () => renderApp());

docForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const title = docForm.title.value.trim();
  const description = docForm.description.value.trim();
  const summary = docForm.summary.value.trim();

  if (!title || !description || !summary) {
    alert("All document fields are required.");
    return;
  }

  const submitButton = docForm.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving + Embedding...";

  try {
    const summaryEmbedding = await generateSummaryEmbedding(summary);

    if (documentEditorContext.mode === "edit") {
      state.documents = state.documents.map((doc) => {
        if (doc.id !== documentEditorContext.documentId) return doc;
        if (currentUser.role !== "admin" && doc.ownerId !== currentUser.id) return doc;
        return {
          ...doc,
          title,
          description,
          summary,
          summaryEmbedding,
          updatedAt: new Date().toISOString()
        };
      });
    } else {
      state.documents.push({
        id: crypto.randomUUID(),
        ownerId: documentEditorContext.ownerId,
        title,
        description,
        summary,
        summaryEmbedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    saveState();
    renderApp();
  } catch (error) {
    alert(`Document could not be saved: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});

document.getElementById("adminCreateUserBtn").addEventListener("click", () => openUserEditor("create"));
document.getElementById("cancelUserBtn").addEventListener("click", () => renderApp());

userForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = userForm.name.value.trim();
  const userId = userForm.userId.value.trim();
  const password = userForm.password.value;
  const role = userForm.role.value;

  if (!name || !userId || !password || !role) {
    alert("All user fields are required.");
    return;
  }

  const conflict = state.users.find((user) => user.userId === userId && user.id !== userEditorContext.userInternalId);
  if (conflict) {
    alert("User ID already exists.");
    return;
  }

  if (userEditorContext.mode === "edit") {
    state.users = state.users.map((user) => user.id === userEditorContext.userInternalId
      ? { ...user, name, userId, password, role }
      : user
    );

    if (session.userId && state.users.every((u) => u.userId !== session.userId)) {
      session = { userId: null, role: null };
    }
  } else {
    state.users.push({ id: crypto.randomUUID(), name, userId, password, role });
  }

  saveState();
  renderApp();
});

document.querySelectorAll("[data-nav]").forEach((navBtn) => {
  navBtn.addEventListener("click", () => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const target = navBtn.dataset.nav || "dashboard";
    setMenuActive(target);

    if (currentUser.role === "admin") {
      renderAdminDashboard();
      applyAdminMenuSection(target);
      setVisibleView("admin");
      animateView("admin");
      return;
    }

    renderUserDashboard();
    applyUserMenuSection(target);
    setVisibleView("user");
    animateView("user");
  });
});

themeToggleBtn.addEventListener("click", toggleTheme);
document.getElementById("year").textContent = new Date().getFullYear();

initializeTheme();
renderApp();
