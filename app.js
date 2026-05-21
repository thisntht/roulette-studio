const STORAGE_KEY = "roulette-studio-personal-v2";
const LEGACY_STORAGE_KEY = "roulette-studio-projects-v1";
const SHARED_INDEX_KEY = "roulette-studio-shared-index-v1";
const PENDING_SHARE_KEY = "roulette-studio-pending-share-v1";
const SHARE_ID_LENGTH = 6;
const palette = ["#ff8fa3", "#ffbf69", "#ffe066", "#8ce99a", "#74c0fc", "#b197fc", "#66d9e8", "#ffa8d3"];

const projectList = document.querySelector("#projectList");
const sharedProjectList = document.querySelector("#sharedProjectList");
const addProjectButton = document.querySelector("#addProjectButton");
const joinSharedButton = document.querySelector("#joinSharedButton");
const projectNameInput = document.querySelector("#projectNameInput");
const workspaceTypeLabel = document.querySelector("#workspaceTypeLabel");
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
const moreActionsButton = document.querySelector("#moreActionsButton");
const moreActionsPanel = document.querySelector("#moreActionsPanel");
const shareProjectButton = document.querySelector("#shareProjectButton");
const accountMenuButton = document.querySelector("#accountMenuButton");
const accountPopover = document.querySelector("#accountPopover");
const accountSummary = document.querySelector(".account-summary");
const accountSummaryText = document.querySelector("#accountSummaryText");
const appShell = document.querySelector(".app-shell");
const sidebarResizer = document.querySelector("#sidebarResizer");
const mobileMenuButton = document.querySelector("#mobileSidebarToggle") || document.querySelector("#mobileMenuButton");
const mobileSidebarBackdrop = document.querySelector("#sidebarBackdrop") || document.querySelector("#mobileSidebarBackdrop");
const sidebarCloseButton = document.querySelector("#sidebarCloseButton");
const syncStatus = document.querySelector("#syncStatus");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const userEmail = document.querySelector("#userEmail");
const shareDialog = document.querySelector("#shareDialog");
const shareForm = document.querySelector("#shareForm");
const shareDialogTitle = document.querySelector("#shareDialogTitle");
const sharePasswordInput = document.querySelector("#sharePasswordInput");
const sharePasswordField = sharePasswordInput.closest("label");
const shareLinkField = document.querySelector("#shareLinkField");
const shareLinkInput = document.querySelector("#shareLinkInput");
const copyShareLinkButton = document.querySelector("#copyShareLinkButton");
const shareIdField = document.querySelector("#shareIdField");
const shareIdInput = document.querySelector("#shareIdInput");
const copyShareIdButton = document.querySelector("#copyShareIdButton");
const confirmShareButton = document.querySelector("#confirmShareButton");
const cancelShareButton = document.querySelector("#cancelShareButton");
const deleteDialog = document.querySelector("#deleteDialog");
const deleteDialogMessage = document.querySelector("#deleteDialogMessage");
const sharedDeleteOptions = document.querySelector("#sharedDeleteOptions");
const deleteForMeButton = document.querySelector("#deleteForMeButton");
const deleteForEveryoneButton = document.querySelector("#deleteForEveryoneButton");
const cancelDeleteButton = document.querySelector("#cancelDeleteButton");
const confirmPersonalDeleteButton = document.querySelector("#confirmPersonalDeleteButton");

const ctx = wheelCanvas.getContext("2d");
let personalState = loadPersonalState();
let activeWorkspace = { type: "personal" };
let state = personalState;
let sharedIndex = loadSharedIndex();
let activeProjectId = state.activeProjectId;
let activeRouletteId = getActiveProject().activeRouletteId;
let currentRotation = 0;
let isSpinning = false;
let firebaseApi = null;
let firebaseAuth = null;
let currentUser = null;
let authUnsubscribe = null;
let activeDocRef = null;
let unsubscribeCloud = null;
let saveTimer = null;
let isApplyingRemoteState = false;
let shareDialogMode = "create";
let pendingShareId = null;

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRoulette(title = "새 룰렛", items = []) {
  return {
    id: uid("roulette"),
    title,
    items,
    rotation: 0,
  };
}

function createProject(name = "새 프로젝트") {
  const roulette = createRoulette("오늘의 선택", ["커피", "산책", "독서", "청소"]);
  return {
    id: uid("project"),
    name,
    activeRouletteId: roulette.id,
    roulettes: [roulette],
  };
}

function createInitialState() {
  const firstProject = createProject("나의 첫 프로젝트");
  return {
    activeProjectId: firstProject.id,
    projects: [firstProject],
  };
}

function loadPersonalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
    if (saved?.projects?.length) {
      return saved;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createInitialState();
}

function loadSharedIndex() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHARED_INDEX_KEY));
    if (Array.isArray(saved)) {
      return saved;
    }
  } catch {
    localStorage.removeItem(SHARED_INDEX_KEY);
  }
  return [];
}

function saveSharedIndex() {
  localStorage.setItem(SHARED_INDEX_KEY, JSON.stringify(sharedIndex));
}

function getBundledFirebaseConfig() {
  return window.ROULETTE_FIREBASE_CONFIG || null;
}

function saveState(options = {}) {
  state.activeProjectId = activeProjectId;
  getActiveProject().activeRouletteId = activeRouletteId;

  if (activeWorkspace.type === "personal") {
    personalState = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(personalState));
  }

  if (!options.skipCloud && currentUser && activeDocRef && !isApplyingRemoteState) {
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

function getRouletteRotation(roulette) {
  const rotation = Number(roulette.rotation);
  return Number.isFinite(rotation) ? rotation : 0;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

async function setActiveProject(projectId) {
  const wasSharedWorkspace = activeWorkspace.type === "shared";
  if (wasSharedWorkspace) {
    stopCloudSync();
  }

  activeWorkspace = { type: "personal" };
  state = personalState;
  activeProjectId = projectId;
  const project = getActiveProject();
  activeRouletteId = project.activeRouletteId || project.roulettes[0].id;
  currentRotation = getRouletteRotation(getActiveRoulette());
  saveState({ skipCloud: wasSharedWorkspace });
  render();
  setMobileSidebarOpen(false);

  if (wasSharedWorkspace && currentUser) {
    activeDocRef = await getDocRefForWorkspace(activeWorkspace);
    await uploadCloudState();
    await subscribeToActiveWorkspace();
  }
}

function setActiveRoulette(rouletteId) {
  activeRouletteId = rouletteId;
  currentRotation = getRouletteRotation(getActiveRoulette());
  saveState();
  render();
}

function render() {
  const project = getActiveProject();
  const roulette = getActiveRoulette();

  workspaceTypeLabel.textContent = activeWorkspace.type === "shared" ? "공동작업 프로젝트" : "내 프로젝트";
  projectNameInput.value = project.name;
  rouletteTitleInput.value = roulette.title;
  userEmail.textContent = currentUser?.email || "로그인하지 않음";
  accountMenuButton.textContent = currentUser?.email?.slice(0, 1).toUpperCase() || "?";
  accountSummaryText.textContent = currentUser?.email || "로그인 필요";
  signOutButton.disabled = !currentUser;
  shareProjectButton.disabled = false;
  renderProjects();
  renderSharedProjects();
  renderTabs(project);
  renderItems(roulette);
  currentRotation = getRouletteRotation(roulette);
  drawWheel(roulette.items, currentRotation);
  resultBox.textContent = roulette.lastResult ? `결과: ${roulette.lastResult}` : "항목을 넣고 룰렛을 돌려보세요.";
  spinButton.disabled = isSpinning || roulette.items.length < 2;
  deleteRouletteButton.disabled = project.roulettes.length <= 1;
}

function renderProjects() {
  projectList.innerHTML = "";
  personalState.projects.forEach((project) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `project-button${activeWorkspace.type === "personal" && project.id === activeProjectId ? " active" : ""}`;
    button.textContent = project.name;
    button.addEventListener("click", () => {
      setActiveProject(project.id);
      setMobileSidebarOpen(false);
    });
    projectList.append(button);
  });
}

function renderSharedProjects() {
  sharedProjectList.innerHTML = "";
  if (!sharedIndex.length) {
    const empty = document.createElement("p");
    empty.className = "shared-empty";
    empty.textContent = "공유받은 룰렛이 없습니다.";
    sharedProjectList.append(empty);
    return;
  }

  sharedIndex.forEach((shared) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `project-button shared${activeWorkspace.type === "shared" && activeWorkspace.id === shared.id ? " active" : ""}`;
    button.textContent = shared.name || "공유 룰렛";
    button.addEventListener("click", () => {
      openSharedWorkspace(shared.id);
      setMobileSidebarOpen(false);
    });
    sharedProjectList.append(button);
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
      saveState({ skipCloud: true });
      drawWheel(roulette.items, currentRotation);
    });
    input.addEventListener("blur", () => {
      saveState();
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
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function shortenText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function addProject() {
  stopCloudSync();
  activeWorkspace = { type: "personal" };
  state = personalState;
  const project = createProject(`프로젝트 ${personalState.projects.length + 1}`);
  personalState.projects.push(project);
  activeProjectId = project.id;
  activeRouletteId = project.activeRouletteId;
  saveState({ skipCloud: true });
  render();
  if (currentUser) {
    activeDocRef = await getDocRefForWorkspace(activeWorkspace);
    await uploadCloudState();
    await subscribeToActiveWorkspace();
  }
  projectNameInput.focus();
  projectNameInput.select();
}

function addRoulette() {
  const project = getActiveProject();
  const roulette = createRoulette(`룰렛 ${project.roulettes.length + 1}`, []);
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
  const startRotation = getRouletteRotation(roulette);
  const targetRotation = normalizeDegrees(-winnerCenter);
  const spinDelta = normalizeDegrees(targetRotation - startRotation);
  const extraTurns = 5 + Math.floor(Math.random() * 3);
  const animationRotation = extraTurns * 360 + spinDelta;

  currentRotation = startRotation;
  drawWheel(items, startRotation);
  wheelCanvas.style.transition = "none";
  wheelCanvas.style.transform = "rotate(0deg)";
  wheelCanvas.offsetHeight;
  wheelCanvas.style.transition = "";
  requestAnimationFrame(() => {
    wheelCanvas.style.transform = `rotate(${animationRotation}deg)`;
  });

  window.setTimeout(() => {
    isSpinning = false;
    const activeRoulette = getActiveRoulette();
    const result = items[winnerIndex];
    activeRoulette.rotation = targetRotation;
    activeRoulette.lastResult = result;
    currentRotation = targetRotation;

    wheelCanvas.style.transition = "none";
    drawWheel(activeRoulette.items, targetRotation);
    wheelCanvas.style.transform = "rotate(0deg)";
    requestAnimationFrame(() => {
      wheelCanvas.style.transition = "";
    });
    saveState();
    resultBox.textContent = `결과: ${result}`;
    spinButton.disabled = activeRoulette.items.length < 2;
  }, 4400);
}

function getPointedItem(items, rotationDegrees) {
  const sliceDegrees = 360 / items.length;
  const pointerDegrees = -90;
  const wheelStartDegrees = -90;
  const wheelAngleAtPointer = ((pointerDegrees - rotationDegrees - wheelStartDegrees) % 360 + 360) % 360;
  const index = Math.floor(wheelAngleAtPointer / sliceDegrees) % items.length;
  return items[index];
}

function setSyncStatus(message, mode = "idle") {
  syncStatus.textContent = message;
  syncStatus.dataset.mode = mode;
}

function isBlockedInAppBrowser() {
  const ua = navigator.userAgent.toLowerCase();
  return [
    "kakaotalk",
    "fbav",
    "fban",
    "instagram",
    "line/",
    "naver",
    "daumapps",
  ].some((token) => ua.includes(token));
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
    deleteDoc: firestoreModule.deleteDoc,
    onSnapshot: firestoreModule.onSnapshot,
  };
  return firebaseApi;
}

function parseFirebaseConfig() {
  const config = getBundledFirebaseConfig();
  if (!config?.apiKey || !config?.projectId || !config?.appId) {
    throw new Error("firebase-config.js에 Firebase 설정이 필요합니다.");
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
      if (currentUser) {
        setSyncStatus("로그인됨. 자동 동기화 중...", "working");
        subscribeToActiveWorkspace();
        handleIncomingShareLink();
      } else {
        stopCloudSync();
        setSyncStatus("로그인하면 자동 동기화됩니다.");
      }
    });
  }

  return { api, app, auth: firebaseAuth };
}

async function signIn() {
  try {
    if (isBlockedInAppBrowser()) {
      setSyncStatus("앱 내 브라우저에서는 Google 로그인이 제한됩니다. 외부 브라우저에서 다시 열어주세요.", "error");
      window.alert("앱 내 브라우저에서는 Google 로그인이 제한됩니다.\n\n링크를 복사해 Chrome 또는 Safari 같은 외부 브라우저에서 다시 열어주세요.");
      return;
    }
    rememberPendingShareFromUrl();
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
  setSyncStatus("로그아웃했습니다. 이 기기에는 로컬 저장됩니다.");
}

async function getDocRefForWorkspace(workspace) {
  if (!currentUser) {
    return null;
  }

  const { api, app } = await setupFirebase();
  const db = api.getFirestore(app);
  if (workspace.type === "shared") {
    return api.doc(db, "sharedWorkspaces", workspace.id);
  }
  return api.doc(db, "users", currentUser.uid, "workspaces", "default");
}

async function subscribeToActiveWorkspace() {
  stopCloudSync();
  if (!currentUser) {
    return;
  }

  try {
    activeDocRef = await getDocRefForWorkspace(activeWorkspace);
    const snapshot = await firebaseApi.getDoc(activeDocRef);
    if (snapshot.exists()) {
      applyRemotePayload(snapshot.data());
    } else {
      await uploadCloudState();
    }

    unsubscribeCloud = firebaseApi.onSnapshot(
      activeDocRef,
      (remoteSnapshot) => {
        if (remoteSnapshot.exists()) {
          applyRemotePayload(remoteSnapshot.data());
        }
        setSyncStatus(activeWorkspace.type === "shared" ? "공동작업 룰렛 동기화됨" : "내 룰렛 동기화됨", "ok");
      },
      () => setSyncStatus("Firestore 권한 또는 Firebase 설정을 확인해 주세요.", "error"),
    );
  } catch (error) {
    setSyncStatus(error.message || "동기화 연결에 실패했습니다.", "error");
  }
}

function stopCloudSync() {
  if (unsubscribeCloud) {
    unsubscribeCloud();
  }
  unsubscribeCloud = null;
  activeDocRef = null;
  clearTimeout(saveTimer);
}

function applyRemotePayload(payload) {
  if (!payload?.state?.projects?.length) {
    return;
  }

  isApplyingRemoteState = true;
  state = payload.state;
  activeProjectId = state.activeProjectId || state.projects[0].id;
  activeRouletteId = getActiveProject().activeRouletteId || getActiveProject().roulettes[0].id;
  currentRotation = 0;

  if (activeWorkspace.type === "personal") {
    personalState = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(personalState));
  }

  updateSharedNameFromState();
  render();
  isApplyingRemoteState = false;
}

function updateSharedNameFromState() {
  if (activeWorkspace.type !== "shared") {
    return;
  }
  const project = state.projects[0];
  const entry = sharedIndex.find((item) => item.id === activeWorkspace.id);
  if (entry && project?.name) {
    entry.name = project.name;
    saveSharedIndex();
  }
}

function scheduleCloudSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(uploadCloudState, 550);
  setSyncStatus("변경 사항 업로드 대기 중...", "working");
}

async function uploadCloudState() {
  if (!activeDocRef || !firebaseApi || !currentUser) {
    return;
  }

  try {
    const payload = {
      updatedBy: currentUser.uid,
      name: state.projects[0]?.name || "공유 룰렛",
      state,
      updatedAt: Date.now(),
      schemaVersion: 2,
    };
    if (activeWorkspace.type === "personal") {
      payload.ownerId = currentUser.uid;
    }
    await firebaseApi.setDoc(activeDocRef, payload, { merge: true });
    setSyncStatus(activeWorkspace.type === "shared" ? "공동작업 룰렛 동기화됨" : "내 룰렛 동기화됨", "ok");
  } catch {
    setSyncStatus("업로드 실패: Firestore 권한을 확인해 주세요.", "error");
  }
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createShareId() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint8Array(SHARE_ID_LENGTH));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function isShortShareId(shareId) {
  return typeof shareId === "string" && shareId.length <= SHARE_ID_LENGTH;
}

function buildShareUrl(shareId) {
  const url = new URL(window.location.href);
  url.searchParams.set("share", shareId);
  return url.toString();
}

function buildShareMessage(shareId) {
  return `공유 ID: ${shareId}\n공유 링크: ${buildShareUrl(shareId)}`;
}

function showShareInfo(shareId) {
  pendingShareId = shareId;
  shareDialogTitle.textContent = "공유 정보";
  confirmShareButton.hidden = true;
  sharePasswordField.hidden = true;
  sharePasswordInput.required = false;
  sharePasswordInput.value = "";
  shareLinkInput.value = buildShareUrl(shareId);
  shareIdInput.value = shareId;
  shareLinkField.hidden = false;
  shareIdField.hidden = false;
}

async function migrateShareIdIfNeeded(shareId) {
  if (!shareId || isShortShareId(shareId)) {
    return shareId;
  }

  const { api, app } = await setupFirebase();
  const db = api.getFirestore(app);
  const oldDocRef = api.doc(db, "sharedWorkspaces", shareId);
  const oldSnapshot = await api.getDoc(oldDocRef);
  if (!oldSnapshot.exists()) {
    throw new Error("기존 공유 정보를 찾을 수 없어 공유 ID를 교체하지 못했습니다.");
  }

  const payload = oldSnapshot.data();
  let newShareId = createShareId();
  let newDocRef = api.doc(db, "sharedWorkspaces", newShareId);
  let newSnapshot = await api.getDoc(newDocRef);
  while (newSnapshot.exists()) {
    newShareId = createShareId();
    newDocRef = api.doc(db, "sharedWorkspaces", newShareId);
    newSnapshot = await api.getDoc(newDocRef);
  }

  const currentProject = getActiveProject();
  const migratedProject = activeWorkspace.type === "personal" ? cloneProject(currentProject) : payload.state.projects[0];
  if (migratedProject) {
    migratedProject.sharedWorkspaceId = newShareId;
  }
  const migratedState = migratedProject ? {
    activeProjectId: migratedProject.id,
    projects: [migratedProject],
  } : payload.state;

  await api.setDoc(newDocRef, {
    ...payload,
    updatedBy: currentUser.uid,
    name: migratedProject?.name || payload.name,
    state: migratedState,
    updatedAt: Date.now(),
  });

  if (activeWorkspace.type === "personal") {
    const project = getActiveProject();
    project.sharedWorkspaceId = newShareId;
    saveState();
    activeDocRef = activeDocRef || await getDocRefForWorkspace(activeWorkspace);
    await uploadCloudState();
  } else if (activeWorkspace.type === "shared" && activeWorkspace.id === shareId) {
    stopCloudSync();
    activeWorkspace = { type: "shared", id: newShareId };
    activeDocRef = newDocRef;
    await subscribeToActiveWorkspace();
  }

  sharedIndex = sharedIndex.filter((entry) => entry.id !== shareId);
  rememberSharedWorkspace(newShareId, migratedProject?.name || payload.name || getActiveProject().name || "공유 룰렛");
  return newShareId;
}

async function openCreateShareDialog() {
  if (!currentUser) {
    setSyncStatus("공유하려면 먼저 로그인해 주세요.", "error");
    return;
  }
  let existingShareId = activeWorkspace.type === "shared" ? activeWorkspace.id : getActiveProject().sharedWorkspaceId;
  if (existingShareId) {
    shareDialogMode = "info";
    const originalShareId = existingShareId;
    setSyncStatus("공유 정보를 불러오는 중...", "working");
    try {
      existingShareId = await migrateShareIdIfNeeded(existingShareId);
    } catch (error) {
      const message = error.message || "공유 ID를 짧게 바꾸지 못했습니다.";
      setSyncStatus(message, "error");
      window.alert(`${message}\n\n로그인 상태와 Firestore 권한을 확인한 뒤 다시 눌러주세요.`);
      return;
    }
    showShareInfo(existingShareId);
    shareDialog.showModal();
    shareLinkInput.focus();
    shareLinkInput.select();
    if (isShortShareId(existingShareId)) {
      setSyncStatus(originalShareId === existingShareId ? "공유 정보를 불러왔습니다." : "공유 ID를 6자리로 교체했습니다.", "ok");
    }
    return;
  }

  shareDialogMode = "create";
  pendingShareId = null;
  shareDialogTitle.textContent = "룰렛 공유";
  confirmShareButton.textContent = "공유 만들기";
  confirmShareButton.hidden = false;
  sharePasswordField.hidden = false;
  sharePasswordInput.required = true;
  sharePasswordInput.value = "";
  shareLinkInput.value = "";
  shareIdInput.value = "";
  shareLinkField.hidden = true;
  shareIdField.hidden = true;
  shareDialog.showModal();
  sharePasswordInput.focus();
}

function openJoinShareDialog(shareId = "") {
  if (!currentUser) {
    setSyncStatus("공유 룰렛에 입장하려면 먼저 로그인해 주세요.", "error");
    signIn();
    return;
  }
  shareDialogMode = "join";
  pendingShareId = shareId || prompt("공유 링크나 공유 ID를 입력하세요.") || "";
  pendingShareId = extractShareId(pendingShareId);
  if (!pendingShareId) {
    return;
  }
  shareDialogTitle.textContent = "공유 룰렛 입장";
  confirmShareButton.textContent = "입장";
  confirmShareButton.hidden = false;
  sharePasswordField.hidden = false;
  sharePasswordInput.required = true;
  sharePasswordInput.value = "";
  shareLinkInput.value = "";
  shareIdInput.value = "";
  shareLinkField.hidden = true;
  shareIdField.hidden = true;
  shareDialog.showModal();
  sharePasswordInput.focus();
}

function extractShareId(value) {
  const text = value.trim();
  const shareParam = text.match(/[?&]share=([^&\s]+)/);
  if (shareParam?.[1]) {
    return decodeURIComponent(shareParam[1]);
  }

  const labelledId = text.match(/공유\s*ID\s*:\s*([a-z0-9-]+)/i);
  if (labelledId?.[1]) {
    return labelledId[1].trim();
  }

  try {
    const url = new URL(text);
    return url.searchParams.get("share") || text;
  } catch {
    return text;
  }
}

async function createSharedWorkspace(password) {
  const currentProject = getActiveProject();
  const shareId = activeWorkspace.type === "shared" ? activeWorkspace.id : currentProject.sharedWorkspaceId || createShareId();
  const passwordHash = await hashPassword(password);
  const project = cloneProject(currentProject);
  const sharedState = {
    activeProjectId: project.id,
    projects: [project],
  };
  const { api, app } = await setupFirebase();
  const db = api.getFirestore(app);
  const docRef = api.doc(db, "sharedWorkspaces", shareId);
  await api.setDoc(docRef, {
    ownerId: currentUser.uid,
    updatedBy: currentUser.uid,
    passwordHash,
    name: project.name,
    state: sharedState,
    updatedAt: Date.now(),
    schemaVersion: 2,
  });
  if (activeWorkspace.type === "personal") {
    currentProject.sharedWorkspaceId = shareId;
    saveState();
  }
  rememberSharedWorkspace(shareId, project.name);
  shareLinkInput.value = buildShareUrl(shareId);
  shareIdInput.value = shareId;
  shareLinkField.hidden = false;
  shareIdField.hidden = false;
  await navigator.clipboard?.writeText(shareLinkInput.value).catch(() => {});
  setSyncStatus("공유 링크를 만들었습니다. 링크가 복사되었습니다.", "ok");
}

async function joinSharedWorkspace(shareId, password) {
  const { api, app } = await setupFirebase();
  const db = api.getFirestore(app);
  const docRef = api.doc(db, "sharedWorkspaces", shareId);
  const snapshot = await api.getDoc(docRef);
  if (!snapshot.exists()) {
    throw new Error("공유 룰렛을 찾을 수 없습니다. 공유 ID나 링크를 다시 확인해 주세요.");
  }
  const payload = snapshot.data();
  if (payload.passwordHash !== await hashPassword(password)) {
    throw new Error("비밀번호가 맞지 않습니다.");
  }
  rememberSharedWorkspace(shareId, payload.name || "공유 룰렛");
  await openSharedWorkspace(shareId);
  window.history.replaceState({}, "", window.location.pathname);
}

function rememberSharedWorkspace(id, name) {
  const existing = sharedIndex.find((entry) => entry.id === id);
  if (existing) {
    existing.name = name || existing.name;
  } else {
    sharedIndex.push({ id, name: name || "공유 룰렛" });
  }
  saveSharedIndex();
  renderSharedProjects();
}

function leaveSharedWorkspace() {
  if (activeWorkspace.type !== "shared") {
    return;
  }
  const leavingId = activeWorkspace.id;
  sharedIndex = sharedIndex.filter((entry) => entry.id !== leavingId);
  saveSharedIndex();
  stopCloudSync();
  activeWorkspace = { type: "personal" };
  state = personalState;
  activeProjectId = personalState.activeProjectId || personalState.projects[0].id;
  activeRouletteId = getActiveProject().activeRouletteId;
  setSyncStatus("공유 룰렛을 내 목록에서 삭제했습니다.", "ok");
  subscribeToActiveWorkspace();
  render();
}

async function deleteSharedWorkspaceForEveryone() {
  if (activeWorkspace.type !== "shared") {
    return;
  }
  const deletingId = activeWorkspace.id;

  try {
    const docRef = activeDocRef || await getDocRefForWorkspace(activeWorkspace);
    if (docRef && firebaseApi) {
      await firebaseApi.deleteDoc(docRef);
    }
    sharedIndex = sharedIndex.filter((entry) => entry.id !== deletingId);
    saveSharedIndex();
    stopCloudSync();
    activeWorkspace = { type: "personal" };
    state = personalState;
    activeProjectId = personalState.activeProjectId || personalState.projects[0].id;
    activeRouletteId = getActiveProject().activeRouletteId;
    setSyncStatus("공유 룰렛을 모두에게서 삭제했습니다.", "ok");
    subscribeToActiveWorkspace();
    render();
  } catch {
    setSyncStatus("공유 룰렛 삭제에 실패했습니다. Firestore 권한을 확인해 주세요.", "error");
  }
}

function openDeleteDialog() {
  if (activeWorkspace.type === "shared") {
    deleteDialogMessage.textContent = "공유 룰렛 삭제 방식을 선택하세요. 모두에게서 삭제하면 공유 링크를 가진 사람도 더 이상 접근할 수 없습니다.";
    sharedDeleteOptions.hidden = false;
    confirmPersonalDeleteButton.hidden = true;
  } else {
    deleteDialogMessage.textContent = "내 프로젝트를 삭제할까요? 삭제하면 이 계정의 룰렛 목록에서 제거됩니다.";
    sharedDeleteOptions.hidden = true;
    confirmPersonalDeleteButton.hidden = false;
  }
  deleteDialog.showModal();
}

function confirmDanger(message) {
  return window.confirm(message);
}

async function openSharedWorkspace(id) {
  activeWorkspace = { type: "shared", id };
  const fallback = createProject("공유 룰렛");
  state = { activeProjectId: fallback.id, projects: [fallback] };
  activeProjectId = state.activeProjectId;
  activeRouletteId = getActiveProject().activeRouletteId;
  currentRotation = 0;
  render();
  setMobileSidebarOpen(false);
  await subscribeToActiveWorkspace();
}

function handleIncomingShareLink() {
  const url = new URL(window.location.href);
  const shareId = url.searchParams.get("share") || sessionStorage.getItem(PENDING_SHARE_KEY);
  if (shareId && currentUser) {
    sessionStorage.removeItem(PENDING_SHARE_KEY);
    openJoinShareDialog(shareId);
  }
}

function rememberPendingShareFromUrl() {
  const shareId = new URL(window.location.href).searchParams.get("share");
  if (shareId) {
    sessionStorage.setItem(PENDING_SHARE_KEY, shareId);
  }
}

addProjectButton.addEventListener("click", (event) => {
  event.preventDefault();
  addProject();
});
joinSharedButton.addEventListener("click", () => openJoinShareDialog());
spinButton.addEventListener("click", spinRoulette);
signInButton.addEventListener("click", signIn);
signOutButton.addEventListener("click", signOutUser);
shareProjectButton.addEventListener("click", openCreateShareDialog);
cancelShareButton.addEventListener("click", () => shareDialog.close());
deleteProjectButton.addEventListener("click", openDeleteDialog);
moreActionsButton.addEventListener("click", () => {
  const nextOpen = moreActionsPanel.hidden;
  moreActionsPanel.hidden = !nextOpen;
  moreActionsButton.setAttribute("aria-expanded", String(nextOpen));
});
function toggleAccountPopover() {
  const nextOpen = accountPopover.hidden;
  accountPopover.hidden = !nextOpen;
  accountMenuButton.setAttribute("aria-expanded", String(nextOpen));
}

accountMenuButton.addEventListener("click", toggleAccountPopover);
accountSummary.addEventListener("click", toggleAccountPopover);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".more-menu")) {
    moreActionsPanel.hidden = true;
    moreActionsButton.setAttribute("aria-expanded", "false");
  }
  if (!event.target.closest(".account-compact")) {
    accountPopover.hidden = true;
    accountMenuButton.setAttribute("aria-expanded", "false");
  }
});
cancelDeleteButton.addEventListener("click", () => deleteDialog.close());
deleteForMeButton.addEventListener("click", () => {
  if (confirmDanger("이 공유 룰렛을 내 목록에서만 삭제할까요? 다른 사람에게는 그대로 남습니다.")) {
    deleteDialog.close();
    leaveSharedWorkspace();
  }
});
deleteForEveryoneButton.addEventListener("click", () => {
  if (confirmDanger("정말 모두에게서 삭제할까요? 공유 링크를 가진 사람도 더 이상 접근할 수 없습니다.")) {
    deleteDialog.close();
    deleteSharedWorkspaceForEveryone();
  }
});
confirmPersonalDeleteButton.addEventListener("click", () => {
  if (confirmDanger("정말 이 프로젝트를 삭제할까요?")) {
    deleteDialog.close();
    deletePersonalProject();
  }
});
copyShareLinkButton.addEventListener("click", async () => {
  if (!shareLinkInput.value) {
    return;
  }
  await navigator.clipboard?.writeText(shareLinkInput.value).catch(() => {});
  shareLinkInput.select();
  setSyncStatus("공유 링크를 복사했습니다.", "ok");
});

copyShareIdButton.addEventListener("click", async () => {
  if (!shareIdInput.value) {
    return;
  }
  await navigator.clipboard?.writeText(buildShareMessage(shareIdInput.value)).catch(() => {});
  shareIdInput.select();
  setSyncStatus("공유 ID와 링크를 복사했습니다.", "ok");
});

projectNameInput.addEventListener("input", () => {
  getActiveProject().name = projectNameInput.value.trimStart();
  saveState();
  renderProjects();
  updateSharedNameFromState();
});

projectNameInput.addEventListener("blur", () => {
  const project = getActiveProject();
  if (!project.name.trim()) {
    project.name = "이름 없는 프로젝트";
    saveState();
    render();
    updateSharedNameFromState();
  }
});

rouletteTitleInput.addEventListener("input", () => {
  getActiveRoulette().title = rouletteTitleInput.value.trimStart();
  saveState({ skipCloud: true });
  renderTabs(getActiveProject());
});

rouletteTitleInput.addEventListener("blur", () => {
  const roulette = getActiveRoulette();
  if (!roulette.title.trim()) {
    roulette.title = "이름 없는 룰렛";
    render();
  }
  saveState();
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

function deletePersonalProject() {
  if (activeWorkspace.type === "shared") {
    return;
  }
  if (personalState.projects.length <= 1) {
    personalState = createInitialState();
  } else {
    personalState.projects = personalState.projects.filter((project) => project.id !== activeProjectId);
  }
  state = personalState;
  activeProjectId = personalState.projects[0].id;
  activeRouletteId = getActiveProject().activeRouletteId;
  saveState();
  render();
}

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

shareForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (shareDialogMode === "info") {
    shareDialog.close();
    return;
  }

  const password = sharePasswordInput.value.trim();
  if (!password) {
    sharePasswordInput.focus();
    return;
  }

  try {
    confirmShareButton.disabled = true;
    if (shareDialogMode === "create") {
      await createSharedWorkspace(password);
    } else {
      await joinSharedWorkspace(pendingShareId, password);
      shareDialog.close();
    }
  } catch (error) {
    const message = error.message || "공유 처리에 실패했습니다.";
    setSyncStatus(message, "error");
    if (shareDialogMode === "join") {
      window.alert(message);
    }
  } finally {
    confirmShareButton.disabled = false;
  }
});

render();
setupFirebase().catch((error) => setSyncStatus(error.message, "error"));

let isResizingSidebar = false;

function setMobileSidebarOpen(open) {
  appShell.classList.toggle("sidebar-open", open);
  document.body.classList.toggle("mobile-sidebar-open", open);
  if (mobileMenuButton) {
    mobileMenuButton.setAttribute("aria-expanded", String(open));
    mobileMenuButton.setAttribute("aria-label", open ? "사이드바 닫기" : "사이드바 열기");
  }
}

setMobileSidebarOpen(true);

if (mobileMenuButton) {
  mobileMenuButton.addEventListener("click", () => {
    setMobileSidebarOpen(!appShell.classList.contains("sidebar-open"));
  });
}

if (mobileSidebarBackdrop) {
  mobileSidebarBackdrop.addEventListener("click", () => {
    setMobileSidebarOpen(false);
  });
}

if (sidebarCloseButton) {
  sidebarCloseButton.addEventListener("click", () => setMobileSidebarOpen(false));
}

sidebarResizer.addEventListener("pointerdown", (event) => {
  isResizingSidebar = true;
  appShell.classList.add("resizing");
  sidebarResizer.setPointerCapture(event.pointerId);
});

sidebarResizer.addEventListener("pointermove", (event) => {
  if (!isResizingSidebar) {
    return;
  }
  const width = Math.min(420, Math.max(220, event.clientX));
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
});

sidebarResizer.addEventListener("pointerup", () => {
  isResizingSidebar = false;
  appShell.classList.remove("resizing");
});
