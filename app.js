const STORAGE_KEY = "roulette-studio-projects-v1";
const SYNC_SETTINGS_KEY = "roulette-studio-sync-settings-v1";
const palette = ["#2d6cdf", "#17a7a2", "#f4a62a", "#dc4768", "#4cba74", "#7a5ce1", "#ef6f3e", "#2f9bde"];

const projectList = document.querySelector("#projectList");
const addProjectButton = document.querySelector("#addProjectButton");
const projectNameInput = document.querySelector("#projectNameInput");
const rouletteTabs = document.querySelector("#rouletteTabs");
const rouletteTitleInput = document.querySelector("#rouletteTitleInput");
const spinButton = document.querySelector("#spinButton");
const wheelCanvas = document.querySelector("#wheelCanvas");
const resultBox = document.querySelector("#resultBox");
const addItemForm = document.querySelector("#addItemForm");
const itemInput = document.querySelector("#itemInput");
const itemList = document.querySelector("#itemList");
const deleteRouletteButton = document.querySelector("#deleteRouletteButton");
const deleteProjectButton = document.querySelector("#deleteProjectButton");
const exportButton = document.querySelector("#exportButton");
const importInput = document.querySelector("#importInput");
const syncToggle = document.querySelector("#syncToggle");
const syncIdInput = document.querySelector("#syncIdInput");
const firebaseConfigInput = document.querySelector("#firebaseConfigInput");
const firebaseConfigField = document.querySelector(".config-field");
const saveSyncButton = document.querySelector("#saveSyncButton");
const syncNowButton = document.querySelector("#syncNowButton");
const syncStatus = document.querySelector("#syncStatus");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const userEmail = document.querySelector("#userEmail");

const ctx = wheelCanvas.getContext("2d");
let state = loadState();
let syncSettings = loadSyncSettings();
let activeProjectId = state.activeProjectId;
let activeRouletteId = getActiveProject().activeRouletteId;
let currentRotation = 0;
let isSpinning = false;
let firebaseApi = null;
let firebaseAuth = null;
let currentUser = null;
let authUnsubscribe = null;
let syncDocRef = null;
let unsubscribeCloud = null;
let syncSaveTimer = null;
let isApplyingRemoteState = false;
let lastCloudUpdatedAt = 0;

function getBundledFirebaseConfig() {
  return window.ROULETTE_FIREBASE_CONFIG || null;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRoulette(title = "새 룰렛") {
  return {
    id: uid("roulette"),
    title,
    items: ["커피", "산책", "독서", "청소"],
  };
}

function createProject(name = "새 프로젝트") {
  const roulette = createRoulette("오늘의 선택");
  return {
    id: uid("project"),
    name,
    activeRouletteId: roulette.id,
    roulettes: [roulette],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.projects?.length) {
      return saved;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const firstProject = createProject("나의 첫 프로젝트");
  return {
    activeProjectId: firstProject.id,
    projects: [firstProject],
  };
}

function loadSyncSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_SETTINGS_KEY));
    if (saved) {
      return saved;
    }
  } catch {
    localStorage.removeItem(SYNC_SETTINGS_KEY);
  }

  return {
    enabled: false,
    syncId: "my-roulette",
    firebaseConfigText: "",
  };
}

function saveSyncSettings() {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(syncSettings));
}

function saveState(options = {}) {
  state.activeProjectId = activeProjectId;
  getActiveProject().activeRouletteId = activeRouletteId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (!options.skipCloud && syncSettings.enabled && syncDocRef && !isApplyingRemoteState) {
    scheduleCloudSave();
  }
}

function getActiveProject() {
  const project = state.projects.find((entry) => entry.id === activeProjectId) || state.projects[0];
  activeProjectId = project.id;
  return project;
}

function getActiveRoulette() {
  const project = getActiveProject();
  const roulette = project.roulettes.find((entry) => entry.id === activeRouletteId) || project.roulettes[0];
  activeRouletteId = roulette.id;
  return roulette;
}

function setActiveProject(projectId) {
  activeProjectId = projectId;
  const project = getActiveProject();
  activeRouletteId = project.activeRouletteId || project.roulettes[0].id;
  currentRotation = 0;
  saveState();
  render();
}

function setActiveRoulette(rouletteId) {
  activeRouletteId = rouletteId;
  currentRotation = 0;
  saveState();
  render();
}

function render() {
  const project = getActiveProject();
  const roulette = getActiveRoulette();

  projectNameInput.value = project.name;
  rouletteTitleInput.value = roulette.title;
  syncToggle.checked = syncSettings.enabled;
  syncIdInput.value = syncSettings.syncId;
  firebaseConfigInput.value = syncSettings.firebaseConfigText;
  firebaseConfigInput.disabled = Boolean(getBundledFirebaseConfig());
  firebaseConfigInput.placeholder = getBundledFirebaseConfig()
    ? "앱에 Firebase 설정이 포함되어 있습니다."
    : '{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}';
  firebaseConfigField.hidden = Boolean(getBundledFirebaseConfig());
  userEmail.textContent = currentUser?.email || "로그인하지 않음";
  signOutButton.disabled = !currentUser;
  syncNowButton.disabled = !syncSettings.enabled || !currentUser;
  renderProjects();
  renderTabs(project);
  renderItems(roulette);
  drawWheel(roulette.items, currentRotation);
  spinButton.disabled = isSpinning || roulette.items.length < 2;
  deleteRouletteButton.disabled = project.roulettes.length <= 1;
}

function renderProjects() {
  projectList.innerHTML = "";
  state.projects.forEach((project) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `project-button${project.id === activeProjectId ? " active" : ""}`;
    button.textContent = project.name;
    button.addEventListener("click", () => setActiveProject(project.id));
    projectList.append(button);
  });
}

function renderTabs(project) {
  rouletteTabs.innerHTML = "";
  project.roulettes.forEach((roulette) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${roulette.id === activeRouletteId ? " active" : ""}`;
    button.textContent = roulette.title;
    button.addEventListener("click", () => setActiveRoulette(roulette.id));
    rouletteTabs.append(button);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "add-tab-button";
  addButton.title = "룰렛 추가";
  addButton.setAttribute("aria-label", "룰렛 추가");
  addButton.textContent = "+";
  addButton.addEventListener("click", addRoulette);
  rouletteTabs.append(addButton);
}

function renderItems(roulette) {
  itemList.innerHTML = "";

  if (!roulette.items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 항목이 없습니다. 새 항목을 추가해 주세요.";
    itemList.append(empty);
    return;
  }

  roulette.items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item-row";

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.backgroundColor = palette[index % palette.length];

    const input = document.createElement("input");
    input.className = "item-input";
    input.value = item;
    input.setAttribute("aria-label", `${index + 1}번 항목`);
    input.addEventListener("input", () => {
      roulette.items[index] = input.value.trimStart();
      saveState();
      drawWheel(roulette.items, currentRotation);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-item";
    remove.textContent = "×";
    remove.title = "항목 삭제";
    remove.addEventListener("click", () => {
      roulette.items.splice(index, 1);
      saveState();
      render();
    });

    row.append(dot, input, remove);
    itemList.append(row);
  });
}

function drawWheel(items, rotationDegrees = 0) {
  const size = wheelCanvas.width;
  const center = size / 2;
  const radius = center - 12;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate((rotationDegrees * Math.PI) / 180);

  if (!items.length) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#e5eaf3";
    ctx.fill();
    ctx.fillStyle = "#6d778b";
    ctx.font = "700 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("항목 없음", 0, 8);
    ctx.restore();
    return;
  }

  const slice = (Math.PI * 2) / items.length;
  items.forEach((item, index) => {
    const start = index * slice - Math.PI / 2;
    const end = start + slice;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = palette[index % palette.length];
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + slice / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 21px sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
    ctx.shadowBlur = 3;
    ctx.fillText(shortenText(item || "빈 항목", 16), radius - 24, 8);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

function shortenText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function addProject() {
  const project = createProject(`프로젝트 ${state.projects.length + 1}`);
  state.projects.push(project);
  activeProjectId = project.id;
  activeRouletteId = project.activeRouletteId;
  saveState();
  render();
  projectNameInput.focus();
  projectNameInput.select();
}

function addRoulette() {
  const project = getActiveProject();
  const roulette = createRoulette(`룰렛 ${project.roulettes.length + 1}`);
  project.roulettes.push(roulette);
  activeRouletteId = roulette.id;
  saveState();
  render();
  rouletteTitleInput.focus();
  rouletteTitleInput.select();
}

function spinRoulette() {
  const roulette = getActiveRoulette();
  const items = roulette.items.map((item) => item.trim()).filter(Boolean);
  if (isSpinning || items.length < 2) {
    resultBox.textContent = "룰렛을 돌리려면 항목이 2개 이상 필요합니다.";
    return;
  }

  isSpinning = true;
  spinButton.disabled = true;
  resultBox.textContent = "돌아가는 중...";

  const winnerIndex = Math.floor(Math.random() * items.length);
  const sliceDegrees = 360 / items.length;
  const winnerCenter = winnerIndex * sliceDegrees + sliceDegrees / 2;
  const pointerDegrees = 270;
  const extraTurns = 5 + Math.floor(Math.random() * 3);
  const targetRotation = extraTurns * 360 + pointerDegrees - winnerCenter;

  currentRotation += targetRotation;
  wheelCanvas.style.transform = `rotate(${currentRotation}deg)`;

  window.setTimeout(() => {
    isSpinning = false;
    const normalizedRotation = ((currentRotation % 360) + 360) % 360;
    drawWheel(getActiveRoulette().items, normalizedRotation);
    wheelCanvas.style.transition = "none";
    wheelCanvas.style.transform = "rotate(0deg)";
    requestAnimationFrame(() => {
      wheelCanvas.style.transition = "";
    });
    currentRotation = normalizedRotation;
    resultBox.textContent = `결과: ${items[winnerIndex]}`;
    render();
  }, 4400);
}

function setSyncStatus(message, mode = "idle") {
  syncStatus.textContent = message;
  syncStatus.dataset.mode = mode;
}

async function loadFirebaseApi() {
  if (firebaseApi) {
    return firebaseApi;
  }

  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  firebaseApi = {
    initializeApp: appModule.initializeApp,
    getApps: appModule.getApps,
    getAuth: authModule.getAuth,
    GoogleAuthProvider: authModule.GoogleAuthProvider,
    signInWithPopup: authModule.signInWithPopup,
    signInWithRedirect: authModule.signInWithRedirect,
    getRedirectResult: authModule.getRedirectResult,
    signOut: authModule.signOut,
    onAuthStateChanged: authModule.onAuthStateChanged,
    getFirestore: firestoreModule.getFirestore,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    onSnapshot: firestoreModule.onSnapshot,
  };
  return firebaseApi;
}

function parseFirebaseConfig() {
  const config = getBundledFirebaseConfig() || JSON.parse(syncSettings.firebaseConfigText);
  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error("Firebase 설정 JSON에 apiKey, projectId, appId가 필요합니다.");
  }
  return config;
}

async function setupFirebase() {
  const api = await loadFirebaseApi();
  const app = api.getApps()[0] || api.initializeApp(parseFirebaseConfig());
  firebaseAuth = api.getAuth(app);

  if (!authUnsubscribe) {
    api.getRedirectResult(firebaseAuth).catch(() => {
      setSyncStatus("로그인 결과를 확인하지 못했습니다. 승인된 도메인을 확인해 주세요.", "error");
    });

    authUnsubscribe = api.onAuthStateChanged(firebaseAuth, (user) => {
      currentUser = user;
      render();
      if (syncSettings.enabled && currentUser) {
        startCloudSync({ uploadCurrentIfEmpty: true });
      } else {
        stopCloudSync();
        setSyncStatus(syncSettings.enabled ? "로그인하면 동기화됩니다." : "로컬 저장 중");
      }
    });
  }

  return { api, app, auth: firebaseAuth };
}

async function signIn() {
  try {
    syncSettings = {
      enabled: syncToggle.checked,
      syncId: syncIdInput.value.trim() || "my-roulette",
      firebaseConfigText: firebaseConfigInput.value.trim(),
    };
    saveSyncSettings();
    const { api, auth } = await setupFirebase();
    const provider = new api.GoogleAuthProvider();
    try {
      await api.signInWithPopup(auth, provider);
    } catch (error) {
      const popupBlocked = ["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error.code);
      if (popupBlocked) {
        setSyncStatus("팝업이 막혀서 페이지 이동 로그인으로 전환합니다.", "working");
        await api.signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  } catch (error) {
    setSyncStatus(error.message || "로그인에 실패했습니다.", "error");
  }
}

async function signOutUser() {
  if (!firebaseAuth || !firebaseApi) {
    return;
  }

  await firebaseApi.signOut(firebaseAuth);
  currentUser = null;
  stopCloudSync();
  render();
  setSyncStatus("로그아웃했습니다. 로컬 저장 중입니다.");
}

async function startCloudSync({ uploadCurrentIfEmpty = false } = {}) {
  stopCloudSync();

  if (!syncSettings.enabled) {
    setSyncStatus("로컬 저장 중");
    return;
  }

  if (!syncSettings.syncId.trim() || (!getBundledFirebaseConfig() && !syncSettings.firebaseConfigText.trim())) {
    setSyncStatus("동기화 ID와 Firebase 설정을 입력해 주세요.", "error");
    return;
  }

  try {
    setSyncStatus("클라우드 연결 중...", "working");
    const { api, app } = await setupFirebase();

    if (!currentUser) {
      setSyncStatus("Google 로그인 후 동기화됩니다.", "working");
      return;
    }

    const db = api.getFirestore(app);
    syncDocRef = api.doc(db, "users", currentUser.uid, "workspaces", syncSettings.syncId.trim());

    const snapshot = await api.getDoc(syncDocRef);
    if (snapshot.exists()) {
      applyRemotePayload(snapshot.data());
    } else if (uploadCurrentIfEmpty) {
      await uploadCloudState();
    }

    unsubscribeCloud = api.onSnapshot(
      syncDocRef,
      (remoteSnapshot) => {
        if (remoteSnapshot.exists()) {
          applyRemotePayload(remoteSnapshot.data());
        }
        setSyncStatus("계정에 동기화됨", "ok");
      },
      () => setSyncStatus("Firestore 권한 또는 Firebase 설정을 확인해 주세요.", "error"),
    );
  } catch (error) {
    setSyncStatus(error.message || "클라우드 연결에 실패했습니다.", "error");
  }
}

function stopCloudSync() {
  if (unsubscribeCloud) {
    unsubscribeCloud();
  }
  unsubscribeCloud = null;
  syncDocRef = null;
  clearTimeout(syncSaveTimer);
}

function applyRemotePayload(payload) {
  if (!payload?.state?.projects?.length) {
    return;
  }

  const remoteUpdatedAt = Number(payload.updatedAt || 0);
  if (remoteUpdatedAt && remoteUpdatedAt < lastCloudUpdatedAt) {
    return;
  }

  lastCloudUpdatedAt = remoteUpdatedAt;
  isApplyingRemoteState = true;
  state = payload.state;
  activeProjectId = state.activeProjectId || state.projects[0].id;
  activeRouletteId = getActiveProject().activeRouletteId || getActiveProject().roulettes[0].id;
  currentRotation = 0;
  saveState({ skipCloud: true });
  render();
  isApplyingRemoteState = false;
}

function scheduleCloudSave() {
  clearTimeout(syncSaveTimer);
  syncSaveTimer = window.setTimeout(uploadCloudState, 550);
  setSyncStatus("변경 사항 업로드 대기 중...", "working");
}

async function uploadCloudState() {
  if (!syncDocRef || !firebaseApi || !currentUser) {
    setSyncStatus("로그인 후 업로드할 수 있습니다.", "error");
    return;
  }

  try {
    const updatedAt = Date.now();
    lastCloudUpdatedAt = updatedAt;
    await firebaseApi.setDoc(syncDocRef, {
      ownerId: currentUser.uid,
      state,
      updatedAt,
      schemaVersion: 1,
    });
    setSyncStatus("계정에 동기화됨", "ok");
  } catch {
    setSyncStatus("업로드 실패: Firestore 권한을 확인해 주세요.", "error");
  }
}

addProjectButton.addEventListener("click", addProject);
spinButton.addEventListener("click", spinRoulette);
signInButton.addEventListener("click", signIn);
signOutButton.addEventListener("click", signOutUser);

projectNameInput.addEventListener("input", () => {
  getActiveProject().name = projectNameInput.value.trimStart() || "이름 없는 프로젝트";
  saveState();
  renderProjects();
});

rouletteTitleInput.addEventListener("input", () => {
  getActiveRoulette().title = rouletteTitleInput.value.trimStart() || "이름 없는 룰렛";
  saveState();
  renderTabs(getActiveProject());
});

addItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = itemInput.value.trim();
  if (!value) {
    itemInput.focus();
    return;
  }
  getActiveRoulette().items.push(value);
  itemInput.value = "";
  saveState();
  render();
  itemInput.focus();
});

deleteRouletteButton.addEventListener("click", () => {
  const project = getActiveProject();
  if (project.roulettes.length <= 1) {
    return;
  }
  project.roulettes = project.roulettes.filter((roulette) => roulette.id !== activeRouletteId);
  activeRouletteId = project.roulettes[0].id;
  saveState();
  render();
});

deleteProjectButton.addEventListener("click", () => {
  if (state.projects.length <= 1) {
    const fresh = createProject("나의 첫 프로젝트");
    state = { activeProjectId: fresh.id, projects: [fresh] };
    activeProjectId = fresh.id;
  } else {
    state.projects = state.projects.filter((project) => project.id !== activeProjectId);
    activeProjectId = state.projects[0].id;
  }
  activeRouletteId = getActiveProject().activeRouletteId;
  saveState();
  render();
});

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "roulette-projects.json";
  link.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    const imported = JSON.parse(await file.text());
    if (!imported?.projects?.length) {
      throw new Error("Invalid file");
    }
    state = imported;
    activeProjectId = state.activeProjectId || state.projects[0].id;
    activeRouletteId = getActiveProject().activeRouletteId || getActiveProject().roulettes[0].id;
    saveState();
    render();
  } catch {
    resultBox.textContent = "가져오기 파일을 확인해 주세요.";
  } finally {
    importInput.value = "";
  }
});

saveSyncButton.addEventListener("click", async () => {
  syncSettings = {
    enabled: syncToggle.checked,
    syncId: syncIdInput.value.trim() || "my-roulette",
    firebaseConfigText: firebaseConfigInput.value.trim(),
  };
  saveSyncSettings();
  render();
  await startCloudSync({ uploadCurrentIfEmpty: true });
});

syncNowButton.addEventListener("click", async () => {
  if (!syncSettings.enabled) {
    setSyncStatus("동기화를 먼저 켜 주세요.", "error");
    return;
  }
  await uploadCloudState();
});

render();
startCloudSync();
