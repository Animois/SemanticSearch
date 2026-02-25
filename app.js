const STORAGE_KEY = "doc-mgmt-state-v1";

const initialState = {
  users: [
    { id: crypto.randomUUID(), name: "Default Admin", userId: "admin", password: "admin123", role: "admin" },
    { id: crypto.randomUUID(), name: "Sample User", userId: "user1", password: "user123", role: "user" }
  ],
  documents: []
};

let state = loadState();
let session = {
  userId: null,
  role: null
};

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

function renderApp() {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    session = { userId: null, role: null };
    logoutBtn.hidden = true;
    setVisibleView("login");
    return;
  }

  logoutBtn.hidden = false;
  if (currentUser.role === "admin") {
    renderAdminDashboard();
    setVisibleView("admin");
    return;
  }

  renderUserDashboard();
  setVisibleView("user");
}

function renderAdminDashboard() {
  adminDocumentList.innerHTML = "";
  adminUserList.innerHTML = "";

  if (!state.documents.length) {
    adminDocumentList.innerHTML = `<p class="muted">No documents found.</p>`;
  }

  state.documents.forEach((doc) => {
    const row = document.getElementById("documentRowTemplate").content.firstElementChild.cloneNode(true);
    const owner = state.users.find((user) => user.id === doc.ownerId);
    row.querySelector(".row-title").textContent = doc.title;
    row.querySelector(".row-meta").textContent = `Owner: ${owner?.name || "Unknown"} (${owner?.userId || "n/a"})`;
    row.querySelector(".row-body").textContent = `Description: ${doc.description}\nSummary: ${doc.summary}`;

    const actions = row.querySelector(".row-actions");
    actions.append(
      createActionButton("Edit", "secondary compact", () => openDocumentEditor("edit", doc.id)),
      createActionButton("Delete", "delete compact", () => deleteDocument(doc.id, true))
    );

    adminDocumentList.appendChild(row);
  });

  state.users.forEach((user) => {
    const row = document.getElementById("userRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".row-title").textContent = `${user.name} (${user.userId})`;
    row.querySelector(".row-meta").textContent = `Role: ${user.role}`;

    const actions = row.querySelector(".row-actions");
    actions.append(createActionButton("Edit", "secondary compact", () => openUserEditor("edit", user.id)));

    if (user.role !== "admin") {
      actions.append(createActionButton("Delete", "delete compact", () => deleteUser(user.id)));
    }

    adminUserList.appendChild(row);
  });
}

function renderUserDashboard() {
  userDocumentList.innerHTML = "";
  const currentUser = getCurrentUser();
  const docs = state.documents.filter((doc) => doc.ownerId === currentUser.id);

  if (!docs.length) {
    userDocumentList.innerHTML = `<p class="muted">You have no documents yet.</p>`;
    return;
  }

  docs.forEach((doc) => {
    const row = document.getElementById("documentRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".row-title").textContent = doc.title;
    row.querySelector(".row-meta").textContent = `Last updated: ${new Date(doc.updatedAt).toLocaleString()}`;
    row.querySelector(".row-body").textContent = `Description: ${doc.description}\nSummary: ${doc.summary}`;

    const actions = row.querySelector(".row-actions");
    actions.append(
      createActionButton("Edit", "secondary compact", () => openDocumentEditor("edit", doc.id)),
      createActionButton("Delete", "delete compact", () => deleteDocument(doc.id, false))
    );

    userDocumentList.appendChild(row);
  });
}

function createActionButton(label, classes, onClick) {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = classes;
  button.type = "button";
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
      ? "This new document will be assigned to your account."
      : "Create a new document for your account.";
    docForm.reset();
  }

  setVisibleView("documentEditor");
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

document.getElementById("cancelDocumentBtn").addEventListener("click", () => {
  renderApp();
});

docForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const currentUser = getCurrentUser();
  const title = docForm.title.value.trim();
  const description = docForm.description.value.trim();
  const summary = docForm.summary.value.trim();

  if (!title || !description || !summary) {
    alert("All document fields are required.");
    return;
  }

  if (documentEditorContext.mode === "edit") {
    state.documents = state.documents.map((doc) => {
      if (doc.id !== documentEditorContext.documentId) return doc;
      if (currentUser.role !== "admin" && doc.ownerId !== currentUser.id) return doc;
      return {
        ...doc,
        title,
        description,
        summary,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  saveState();
  renderApp();
});

document.getElementById("adminCreateUserBtn").addEventListener("click", () => openUserEditor("create"));
document.getElementById("cancelUserBtn").addEventListener("click", () => {
  renderApp();
});

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
    state.users.push({
      id: crypto.randomUUID(),
      name,
      userId,
      password,
      role
    });
  }

  saveState();
  renderApp();
});

renderApp();
