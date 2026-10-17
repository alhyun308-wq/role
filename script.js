/**
 * ==========================================================================
 * 우당탕탕 우리 반 1인 1역할 배정기 - script.js
 * 1:1 무작위 배정, 역할 고정(Lock), 1:1 맞교환(Swap), 두근두근 순차 공개,
 * 고해상도 PNG 이미지 저장, 사운드 On/Off, 구글 시트 연동 및 A4 인쇄
 * ==========================================================================
 */

// 1. 기본 제공 예시 데이터 (학생 12명 & 학급 역할 12개)
const DEFAULT_STUDENTS = [
  "김민준", "이서연", "박도윤", "최지우",
  "정예준", "강서아", "조은우", "윤하은",
  "장시우", "임지아", "한유준", "오수아"
];

const DEFAULT_ROLES = [
  { id: 1, name: "칠판 도우미", emoji: "🧼", duty: "칠판과 분필받침대를 반짝반짝 닦아요", theme: "blue" },
  { id: 2, name: "줄서기 반장", emoji: "🚶", duty: "급식실과 특별실 이동 시 바르게 두 줄을 서요", theme: "yellow" },
  { id: 3, name: "에너지 지킴이", emoji: "💡", duty: "쉬는 시간 교실 전등과 에어컨·선풍기를 살펴요", theme: "green" },
  { id: 4, name: "우유 도우미", emoji: "🥛", duty: "아침 우유를 배부하고 빈 우유갑을 납작하게 모아요", theme: "pink" },
  { id: 5, name: "학급 문고 도우미", emoji: "📚", duty: "학급 책장의 동화책과 도서를 가지런히 정리해요", theme: "purple" },
  { id: 6, name: "분리수거 도우미", emoji: "♻️", duty: "종이와 플라스틱 분리수거통을 깔끔하게 관리해요", theme: "orange" },
  { id: 7, name: "식물 돌보미", emoji: "🌱", duty: "교실 화분에 촉촉하게 물을 주고 햇빛을 쬐어줘요", theme: "green" },
  { id: 8, name: "알림장 도우미", emoji: "📢", duty: "오늘의 알림장과 준비물을 칠판 한켠에 또박또박 적어요", theme: "yellow" },
  { id: 9, name: "보건 도우미", emoji: "🩹", duty: "다친 친구를 보건실로 안내하고 체온계를 챙겨요", theme: "pink" },
  { id: 10, name: "창문 환기 도우미", emoji: "🪟", duty: "쉬는 시간마다 창문을 활짝 열어 맑은 공기를 채워요", theme: "blue" },
  { id: 11, name: "체육 용품 도우미", emoji: "⚽", duty: "체육 시간에 축구공, 줄넘기 등 교구를 챙기고 정리해요", theme: "orange" },
  { id: 12, name: "미소 비타민", emoji: "😊", duty: "친구들에게 먼저 반갑게 인사하고 칭찬을 배달해요", theme: "purple" }
];

// 2. 애플리케이션 상태 (localStorage 연동)
const STORAGE_KEY = "classroom_role_assigner_v2";

let state = {
  className: "3학년 2반",
  students: [...DEFAULT_STUDENTS],
  roles: JSON.parse(JSON.stringify(DEFAULT_ROLES)),
  assignments: [], // { student, role }
  lockedRoleIds: [], // 고정된 역할 ID 목록
  isMuted: false,
  gasUrl: "",
  assignedDate: ""
};

// 시트 응답은 문자열 배열 또는 {name: "홍길동"} 형태일 수 있습니다.
// 화면과 배정 로직에서는 학생 이름을 항상 문자열로 사용합니다.
function normalizeStudentName(value) {
  if (typeof value === "string" || typeof value === "number") {
    const name = String(value).trim();
    return name === "[object Object]" ? "" : name;
  }
  if (Array.isArray(value)) {
    return normalizeStudentName(value.find(item => normalizeStudentName(item)));
  }
  if (value && typeof value === "object") {
    for (const key of ["name", "이름", "studentName", "student_name", "student", "학생명", "성명", "value", "text"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const name = normalizeStudentName(value[key]);
        if (name) return name;
      }
    }
  }
  // 시트 응답에 예측하지 못한 키가 사용된 경우에도 이름을 추출합니다.
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/^(id|번호|number|index|row|role|역할)$/i.test(key)) continue;
      const name = normalizeStudentName(item);
      if (name) return name;
    }
  }
  return "";
}

function normalizeStudents(students) {
  return Array.isArray(students)
    ? students.map(normalizeStudentName).filter(Boolean)
    : [];
}

// 역할의 이름이 없는 시트 데이터는 배정 화면에 넣지 않습니다.
function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  const themes = ["blue", "yellow", "green", "pink", "purple", "orange"];
  return roles.map((role, index) => {
    if (typeof role === "string") role = { name: role };
    if (!role || typeof role !== "object") return null;
    const name = normalizeStudentName(role.name ?? role["역할"] ?? role["역할명"] ??
      role.roleName ?? role.role ?? role.title ?? role["이름"]);
    if (!name) return null;
    const emoji = normalizeStudentName(role.emoji ?? role["이모지"] ?? role.icon) || "💼";
    const duty = normalizeStudentName(role.duty ?? role["임무"] ?? role["주요 임무"] ??
      role.description ?? role.task) || "";
    return {
      id: role.id ?? index + 1,
      name, emoji, duty,
      theme: themes.includes(role.theme) ? role.theme : themes[index % themes.length]
    };
  }).filter(Boolean);
}

// 3. 로컬 스토리지 불러오기 및 저장
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
      state.students = normalizeStudents(state.students);
      // 과거에 저장된 빈 역할 이름을 복구합니다.
      const validRoles = normalizeRoles(state.roles);
      state.roles = validRoles.length ? validRoles : JSON.parse(JSON.stringify(DEFAULT_ROLES));
      if (Array.isArray(state.assignments)) {
        state.assignments = state.assignments.map(a => ({
          ...a,
          student: normalizeStudentName(a.student) || "(공석)"
        }));
      }
      if (!Array.isArray(state.lockedRoleIds)) {
        state.lockedRoleIds = [];
      }
    }
  } catch (e) {
    console.warn("로컬 데이터 로드 실패, 기본값 사용", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("로컬 저장 오류", e);
  }
}

// 4. Web Audio API를 활용한 효과음 합성
class SoundFx {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playTick() {
    if (state.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440 + Math.random() * 200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (_) {}
  }

  playChime() {
    if (state.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch (_) {}
  }

  playFanfare() {
    if (state.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = this.ctx.currentTime + idx * 0.09;
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    } catch (_) {}
  }
}

const sound = new SoundFx();

// 5. 폭죽(Confetti) 파티클 시스템 (HTML5 Canvas)
class ConfettiCannon {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.particles = [];
    this.animationFrame = null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  launch() {
    if (!this.canvas || !this.ctx) return;
    this.resize();
    const colors = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#A8D8EA", "#AA96DA", "#FCBAD7", "#6EE7B7"];
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: this.canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: this.canvas.height * 0.45,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 18,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    if (!this.animationFrame) {
      this.loop();
    }
  }

  loop() {
    if (this.particles.length === 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.animationFrame = null;
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // 중력
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.012;

      if (p.opacity <= 0 || p.y > this.canvas.height) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.opacity);
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.3);
      this.ctx.restore();
    }

    this.animationFrame = requestAnimationFrame(() => this.loop());
  }
}

let confetti;

// 6. 무작위 셔플 (Fisher-Yates Shuffle 알고리즘)
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 7. 역할 배정 실행 로직 (고정된 역할 보존 + 순차 공개 연출)
let isRolling = false;

function assignRoles() {
  if (isRolling) return;
  if (swapSourceRoleId !== null) cancelSwap();

  if (state.students.length === 0 || state.roles.length === 0) {
    showToast("⚠️ 학생 또는 역할 목록이 비어 있습니다!");
    return;
  }

  // 모든 역할이 잠겨있는 경우 체크
  if (state.lockedRoleIds.length >= state.roles.length && state.assignments.length > 0) {
    showToast("🔒 모든 역할이 고정되어 있습니다. 고정을 해제해 주세요.");
    return;
  }

  isRolling = true;
  sound.init();
  const rollBtn = document.getElementById("btn-roll-roles");
  if (rollBtn) {
    rollBtn.classList.add("is-rolling");
    rollBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      배정하는 중...
    `;
  }

  // 카드 펄스 효과
  const cardElements = document.querySelectorAll(".shadcn-card");
  cardElements.forEach(card => card.classList.add("shuffling"));

  // 롤링 애니메이션
  let tickCount = 0;
  const maxTicks = 10;
  const interval = setInterval(() => {
    sound.playTick();
    renderShufflingPreview();
    tickCount++;
    if (tickCount >= maxTicks) {
      clearInterval(interval);
      finalizeAssignment();
    }
  }, 65);
}

// 롤링 중 임의로 이름이 돌아가는 시각적 재미
function renderShufflingPreview() {
  const nameSpans = document.querySelectorAll(".card-student-name");
  nameSpans.forEach(el => {
    const randName = state.students[Math.floor(Math.random() * state.students.length)] || "???";
    el.textContent = randName;
  });
}

// 최종 배정 확정 (고정된 역할 보존 알고리즘)
function finalizeAssignment() {
  // 1. 고정된 역할과 해당 학생 파악
  const lockedAssignmentsMap = new Map();
  if (state.assignments.length > 0) {
    state.assignments.forEach(a => {
      if (state.lockedRoleIds.includes(a.role.id)) {
        lockedAssignmentsMap.set(a.role.id, a.student);
      }
    });
  }

  // 2. 이미 고정된 학생들은 셔플 대상에서 제외
  const lockedStudents = Array.from(lockedAssignmentsMap.values());
  const availableStudents = state.students.filter(name => !lockedStudents.includes(name));
  const shuffledAvailableStudents = shuffleArray(availableStudents);

  // 3. 고정되지 않은 역할들에 셔플된 학생들을 1:1 매칭
  const newAssignments = [];
  let availableIdx = 0;

  state.roles.forEach(role => {
    if (lockedAssignmentsMap.has(role.id)) {
      // 고정된 역할 유지
      newAssignments.push({
        student: lockedAssignmentsMap.get(role.id),
        role: role
      });
    } else {
      // 새로운 학생 배정
      const student = shuffledAvailableStudents[availableIdx] || "(공석)";
      availableIdx++;
      newAssignments.push({
        student: student,
        role: role
      });
    }
  });

  // 초과 인원 보충 (공동 역할)
  if (availableIdx < shuffledAvailableStudents.length) {
    for (let i = availableIdx; i < shuffledAvailableStudents.length; i++) {
      const extraStudent = shuffledAvailableStudents[i];
      const unlockedRoles = state.roles.filter(r => !lockedAssignmentsMap.has(r.id));
      if (unlockedRoles.length > 0) {
        const targetRole = unlockedRoles[i % unlockedRoles.length];
        const targetAssignment = newAssignments.find(a => a.role.id === targetRole.id);
        if (targetAssignment) {
          targetAssignment.student += `, ${extraStudent}`;
        }
      }
    }
  }

  state.assignments = newAssignments;
  state.assignedDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  saveState();

  // 순차 공개 모드 확인
  const isSequential = document.getElementById("check-sequential-reveal")?.checked ?? true;

  if (isSequential) {
    runSequentialReveal();
  } else {
    renderAllViews();
    finishRollingUI();
    sound.playFanfare();
    confetti.launch();
    showToast("🎉 1인 1역할 배정이 완료되었습니다!");
  }
}

// 두근두근 순차 공개 (Slot/Flip 애니메이션 연출)
function runSequentialReveal() {
  renderCards(true); // 우선 빈 상태로 렌더
  renderTable();
  updateStatusSummary();
  updatePrintHeader();

  const cards = document.querySelectorAll(".shadcn-card");
  let currentCardIdx = 0;

  const revealInterval = setInterval(() => {
    if (currentCardIdx >= cards.length) {
      clearInterval(revealInterval);
      finishRollingUI();
      sound.playFanfare();
      confetti.launch();
      showToast("🎉 모든 역할 배정이 멋지게 공개되었습니다!");
      return;
    }

    const card = cards[currentCardIdx];
    const roleId = Number(card.getAttribute("data-role-id"));
    const assigned = state.assignments.find(a => a.role.id === roleId);

    if (assigned) {
      const studentNameEl = card.querySelector(".card-student-name");
      const badgeEl = card.querySelector(".card-top-row .badge");
      if (studentNameEl) {
        studentNameEl.textContent = assigned.student;
        studentNameEl.classList.remove("waiting");
      }
      if (badgeEl) {
        badgeEl.className = "badge badge-success";
        badgeEl.textContent = "임명완료";
      }
    }

    card.classList.remove("shuffling");
    card.classList.add("flip-reveal");
    sound.playTick();

    currentCardIdx++;
  }, 160);
}

function finishRollingUI() {
  isRolling = false;
  const rollBtn = document.getElementById("btn-roll-roles");
  if (rollBtn) {
    rollBtn.classList.remove("is-rolling");
    rollBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
        <path d="M16 8h.01"/>
        <path d="M8 8h.01"/>
        <path d="M8 16h.01"/>
        <path d="M16 16h.01"/>
        <path d="M12 12h.01"/>
      </svg>
      역할 배정하기
    `;
  }
  const cards = document.querySelectorAll(".shadcn-card");
  cards.forEach(c => c.classList.remove("shuffling"));
}

// 8. 역할 고정 (Lock) 기능
function toggleLockRole(roleId) {
  const isAssigned = state.assignments.some(a => a.role.id === roleId && a.student !== "배정 대기중");
  if (!isAssigned) {
    showToast("⚠️ 배정된 이후에 역할을 고정할 수 있습니다.");
    return;
  }

  const idx = state.lockedRoleIds.indexOf(roleId);
  if (idx > -1) {
    state.lockedRoleIds.splice(idx, 1);
    showToast("🔓 역할 고정이 해제되었습니다.");
  } else {
    state.lockedRoleIds.push(roleId);
    showToast("🔒 역할이 고정되었습니다. 다음 셔플 시 유지됩니다.");
  }

  sound.playChime();
  saveState();
  renderCards();
  updateStatusSummary();
}

// 9. 1:1 역할 맞교환 (Swap) 기능
let swapSourceRoleId = null;

function handleCardClickForSwap(roleId) {
  if (swapSourceRoleId === null) return;

  if (swapSourceRoleId === roleId) {
    cancelSwap();
    return;
  }

  // 맞교환 실행
  completeSwap(roleId);
}

function startSwap(roleId, e) {
  if (e) e.stopPropagation();

  if (state.assignments.length === 0) {
    showToast("⚠️ 먼저 역할을 배정해주세요.");
    return;
  }

  swapSourceRoleId = roleId;
  const sourceAssignment = state.assignments.find(a => a.role.id === roleId);
  const sourceName = sourceAssignment ? sourceAssignment.student : "담당자";
  const sourceRoleName = sourceAssignment ? sourceAssignment.role.name : "역할";

  const banner = document.getElementById("swap-banner");
  const bannerText = document.getElementById("swap-banner-text");
  if (banner && bannerText) {
    bannerText.innerHTML = `<strong>🔄 [${escapeHtml(sourceName)} - ${escapeHtml(sourceRoleName)}]</strong> 과 맞교환할 다른 카드를 클릭하세요.`;
    banner.classList.add("active");
  }

  renderCards();
  showToast("🔄 교환할 다른 카드를 클릭해 주세요.");
}

function completeSwap(targetRoleId) {
  const sourceAssignment = state.assignments.find(a => a.role.id === swapSourceRoleId);
  const targetAssignment = state.assignments.find(a => a.role.id === targetRoleId);

  if (sourceAssignment && targetAssignment) {
    const tempStudent = sourceAssignment.student;
    sourceAssignment.student = targetAssignment.student;
    targetAssignment.student = tempStudent;

    saveState();
    sound.playChime();
    showToast(`✨ [${sourceAssignment.role.name}]과 [${targetAssignment.role.name}]의 담당 학생이 맞교환되었습니다!`);
  }

  cancelSwap();
  renderAllViews();
}

function cancelSwap() {
  swapSourceRoleId = null;
  const banner = document.getElementById("swap-banner");
  if (banner) banner.classList.remove("active");
  renderCards();
}

// 10. 뷰 렌더링
function renderAllViews() {
  renderCards();
  renderTable();
  updateStatusSummary();
  updatePrintHeader();
}

function renderCards(isWaitingState = false) {
  const container = document.getElementById("cards-grid");
  if (!container) return;

  container.innerHTML = "";

  state.roles.forEach((role, idx) => {
    const assigned = state.assignments.find(a => a.role.id === role.id);
    const isAssigned = Boolean(assigned && assigned.student && assigned.student !== "(공석)");
    const studentName = isWaitingState ? "???" : (isAssigned ? assigned.student : "배정 대기중");
    const isLocked = state.lockedRoleIds.includes(role.id);
    const isSwapSource = swapSourceRoleId === role.id;
    const isSwapCandidate = swapSourceRoleId !== null && !isSwapSource;

    const card = document.createElement("div");
    card.className = [
      "shadcn-card",
      isLocked ? "locked-card" : "",
      isSwapSource ? "swap-source" : "",
      isSwapCandidate ? "swap-target-candidate" : ""
    ].filter(Boolean).join(" ");

    card.setAttribute("data-theme", role.theme || "yellow");
    card.setAttribute("data-role-id", role.id);

    // 맞교환 모드일 때 카드 클릭 이벤트
    if (swapSourceRoleId !== null) {
      card.onclick = () => handleCardClickForSwap(role.id);
    }

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-index">
          <span style="font-size: 0.75rem; color: hsl(var(--muted-foreground));">#</span>
          <span>${idx + 1}</span>
          ${isLocked ? '<span style="font-size:0.75rem; color:#D97706; font-weight:700; margin-left:3px;">[고정]</span>' : ""}
        </div>
        <div class="card-top-actions">
          <span class="badge ${isAssigned && !isWaitingState ? "badge-success" : "badge-muted"}">
            ${isAssigned && !isWaitingState ? "임명완료" : "대기"}
          </span>
          <button type="button" class="card-action-btn ${isLocked ? "is-locked" : ""}" onclick="toggleLockRole(${role.id})" title="${isLocked ? "고정 해제" : "이 역할 고정하기"}">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${isLocked 
                ? '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' 
                : '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'}
            </svg>
          </button>
          <button type="button" class="card-action-btn" onclick="startSwap(${role.id}, event)" title="다른 역할과 맞교환">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="card-role-header">
        <div class="card-role-avatar" title="${escapeHtml(role.name)}">
          ${role.emoji || "⭐"}
        </div>
        <div class="card-role-info">
          <div class="card-role-name">${escapeHtml(role.name)}</div>
          <div class="card-student-box">
            <span class="student-tag-label">담당:</span>
            <span class="card-student-name ${isAssigned && !isWaitingState ? "" : "waiting"}">${escapeHtml(studentName)}</span>
          </div>
        </div>
      </div>
      <div class="card-duty-box">
        <strong>임무:</strong> ${escapeHtml(role.duty || "교실을 위해 솔선수범해요.")}
      </div>
    `;

    container.appendChild(card);
  });
}

function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  state.roles.forEach((role, idx) => {
    const assigned = state.assignments.find(a => a.role.id === role.id);
    const studentName = assigned ? assigned.student : "-";
    const isLocked = state.lockedRoleIds.includes(role.id);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 600; color: hsl(var(--muted-foreground));">${idx + 1}</td>
      <td>
        <div class="table-role-inline">
          <span style="font-size: 1.15rem;">${role.emoji || "⭐"}</span>
          <span>${escapeHtml(role.name)}</span>
          ${isLocked ? '<span style="font-size:0.75rem; color:#D97706;">🔒</span>' : ""}
        </div>
      </td>
      <td style="font-weight: 700; color: hsl(var(--foreground)); font-size: 0.95rem;">${escapeHtml(studentName)}</td>
      <td style="color: hsl(var(--muted-foreground)); font-size: 0.8125rem;">${escapeHtml(role.duty || "")}</td>
      <td>
        <span class="badge ${assigned ? "badge-success" : "badge-muted"}">
          ${assigned ? "배정완료" : "미배정"}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateStatusSummary() {
  const studentCountEl = document.getElementById("stat-student-count");
  const roleCountEl = document.getElementById("stat-role-count");
  const assignedStatusEl = document.getElementById("stat-assigned-status");
  const lockedBox = document.getElementById("stat-locked-box");
  const lockedCountEl = document.getElementById("stat-locked-count");

  if (studentCountEl) studentCountEl.textContent = `${state.students.length}명`;
  if (roleCountEl) roleCountEl.textContent = `${state.roles.length}개`;

  if (lockedBox && lockedCountEl) {
    if (state.lockedRoleIds.length > 0) {
      lockedBox.style.display = "flex";
      lockedCountEl.textContent = `${state.lockedRoleIds.length}개`;
    } else {
      lockedBox.style.display = "none";
    }
  }

  if (assignedStatusEl) {
    if (state.assignments.length > 0) {
      assignedStatusEl.className = "badge badge-success";
      assignedStatusEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        배정 완료 (${state.assignedDate})
      `;
    } else {
      assignedStatusEl.className = "badge badge-secondary";
      assignedStatusEl.textContent = "배정 대기중";
    }
  }

  // 상단 학급 태그 반영
  const classTagEl = document.getElementById("class-name-tag");
  if (classTagEl) {
    classTagEl.innerHTML = `
      ${escapeHtml(state.className || "3학년 2반")}
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      </svg>
    `;
  }
}

function updatePrintHeader() {
  const printClassEl = document.getElementById("print-class-name");
  const printDateEl = document.getElementById("print-date");

  if (printClassEl) {
    printClassEl.textContent = state.className ? `[${state.className}] 1인 1역할 배정표` : "우리 반 1인 1역할 배정표";
  }
  if (printDateEl) {
    printDateEl.textContent = state.assignedDate ? `배정일: ${state.assignedDate}` : `작성일: ${new Date().toLocaleDateString("ko-KR")}`;
  }
}

// 11. 교실 게시판 부착용 A4 인쇄
function handlePrint() {
  if (state.assignments.length === 0) {
    const proceed = confirm("아직 역할 배정이 되지 않았습니다. 빈 양식 그대로 인쇄하시겠습니까?");
    if (!proceed) return;
  }
  updatePrintHeader();
  window.print();
}

// 12. 고해상도 PNG 이미지 다운로드 (알림장, 하이클래스, 클래스팅 게시용)
function exportToPng() {
  if (state.assignments.length === 0) {
    showToast("⚠️ 먼저 역할을 배정해주세요.");
    return;
  }

  showToast("🖼️ 고화질 이미지 생성 중...");

  const width = 1600;
  const height = 1180;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // 배경 칠하기
  ctx.fillStyle = "#FAFAFA";
  ctx.fillRect(0, 0, width, height);

  // 안쪽 화이트 보드 프레임
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, 40, 40, width - 80, height - 80, 24);
  ctx.fill();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 3;
  ctx.stroke();

  // 상단 헤더
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 44px 'Pretendard', sans-serif";
  ctx.textAlign = "center";
  const titleText = `${state.className || "우리 반"} 1인 1역할 배정표`;
  ctx.fillText(titleText, width / 2, 115);

  ctx.fillStyle = "#64748B";
  ctx.font = "20px 'Pretendard', sans-serif";
  const dateText = `배정일: ${state.assignedDate || new Date().toLocaleDateString("ko-KR")} | 행복한 우리 교실, 서로 돕고 배려해요 🌱`;
  ctx.fillText(dateText, width / 2, 155);

  // 구분선
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 185);
  ctx.lineTo(width - 80, 185);
  ctx.stroke();

  // 12개 카드 그리기 (3열 x 4행)
  const cols = 3;
  const cardWidth = 460;
  const cardHeight = 185;
  const startX = 80;
  const startY = 215;
  const gapX = 30;
  const gapY = 25;

  const pastelColors = {
    yellow: "#FEF9C3",
    blue: "#E0F2FE",
    green: "#DCFCE7",
    pink: "#FCE7F3",
    purple: "#F3E8FF",
    orange: "#FFEDD5"
  };

  state.roles.slice(0, 12).forEach((role, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = startX + col * (cardWidth + gapX);
    const y = startY + row * (cardHeight + gapY);

    const assigned = state.assignments.find(a => a.role.id === role.id);
    const studentName = assigned ? assigned.student : "-";

    // 카드 배경
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, cardWidth, cardHeight, 16);
    ctx.fill();
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 상단 번호 & 이모지 박스
    const avatarColor = pastelColors[role.theme] || "#F1F5F9";
    ctx.fillStyle = avatarColor;
    roundRect(ctx, x + 16, y + 16, 56, 56, 12);
    ctx.fill();

    ctx.font = "30px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(role.emoji || "⭐", x + 44, y + 55);

    // 역할명
    ctx.textAlign = "left";
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 22px 'Pretendard', sans-serif";
    ctx.fillText(`${idx + 1}. ${role.name}`, x + 86, y + 42);

    // 담당 학생
    ctx.fillStyle = "#475569";
    ctx.font = "16px 'Pretendard', sans-serif";
    ctx.fillText("담당:", x + 86, y + 68);

    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 22px 'Pretendard', sans-serif";
    ctx.fillText(studentName, x + 130, y + 68);

    // 임무 설명 박스
    ctx.fillStyle = "#F8FAFC";
    roundRect(ctx, x + 16, y + 88, cardWidth - 32, 80, 8);
    ctx.fill();
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#64748B";
    ctx.font = "15px 'Pretendard', sans-serif";
    ctx.fillText("임무: " + (role.duty || ""), x + 26, y + 132);
  });

  // 하단 안내 & 확인 문구
  ctx.fillStyle = "#64748B";
  ctx.font = "17px 'Pretendard', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("우리가 함께 가꾸는 행복한 교실! 맡은 책임을 성실히 실천해요 💛  담임교사 확인: ________________ (인)", width / 2, height - 70);

  // 다운로드 트리거
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (state.className || "우리반").replace(/\s+/g, "_");
    link.download = `${safeName}_1인1역할_배정표.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showToast("✅ 고화질 이미지가 다운로드되었습니다!");
  });
}

// 둥근 사각형 캔버스 그리기 유틸리티
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// 13. 사운드 켜기/끄기 토글
function toggleSound() {
  state.isMuted = !state.isMuted;
  saveState();
  updateSoundUI();
  showToast(state.isMuted ? "🔇 효과음이 꺼졌습니다." : "🔊 효과음이 켜졌습니다.");
  if (!state.isMuted) sound.playTick();
}

function updateSoundUI() {
  const iconOn = document.getElementById("sound-icon-on");
  const iconOff = document.getElementById("sound-icon-off");
  const label = document.getElementById("sound-label");

  if (state.isMuted) {
    if (iconOn) iconOn.style.display = "none";
    if (iconOff) iconOff.style.display = "inline-block";
    if (label) label.textContent = "음소거";
  } else {
    if (iconOn) iconOn.style.display = "inline-block";
    if (iconOff) iconOff.style.display = "none";
    if (label) label.textContent = "소리 켬";
  }
}

// 14. 구글 스프레드시트 (Apps Script) 연동 모달 & 기능
function openGasModal(mode = "load") {
  const modal = document.getElementById("gas-modal");
  const urlInput = document.getElementById("gas-url-input");
  const modalTitle = document.getElementById("gas-modal-title");

  if (modalTitle) {
    modalTitle.innerHTML = mode === "load" ? "구글 시트에서 불러오기" : "구글 시트에 배정 결과 저장";
  }
  if (urlInput) {
    urlInput.value = state.gasUrl || "";
  }

  modal.setAttribute("data-action-mode", mode);
  modal.classList.add("open");
}

function closeGasModal() {
  const modal = document.getElementById("gas-modal");
  if (modal) modal.classList.remove("open");
}

async function handleGasAction() {
  const modal = document.getElementById("gas-modal");
  const mode = modal.getAttribute("data-action-mode") || "load";
  const urlInput = document.getElementById("gas-url-input");
  const url = (urlInput ? urlInput.value.trim() : "");

  state.gasUrl = url;
  saveState();

  if (!url) {
    showToast("⚠️ 구글 Apps Script 웹 앱 URL을 먼저 입력해 주세요!");
    return;
  }

  const actionBtn = document.getElementById("btn-gas-submit");
  if (actionBtn) {
    actionBtn.disabled = true;
    actionBtn.textContent = "처리 중...";
  }

  try {
    if (mode === "load") {
      const res = await fetch(`${url}?action=getData`, {
        method: "GET",
        mode: "cors"
      });
      const data = await res.json();
      if (data && data.status === "success") {
        if (Array.isArray(data.students)) {
          const students = normalizeStudents(data.students);
          if (students.length > 0) {
            state.students = students;
            // 새로운 명단으로 가져오면 이전 배정 결과는 무효화합니다.
            state.assignments = [];
            state.lockedRoleIds = [];
            state.assignedDate = "";
          }
        }
        if (Array.isArray(data.roles) && data.roles.length > 0) {
          const roles = normalizeRoles(data.roles);
          // 유효한 역할 이름이 없는 시트 데이터로 기존 역할을 덮어쓰지 않습니다.
          if (roles.length > 0) {
            state.roles = roles;
          } else {
            console.warn("시트 역할 데이터의 이름 필드를 확인해 주세요.", data.roles);
            const existingRoles = normalizeRoles(state.roles);
            state.roles = existingRoles.length ? existingRoles : JSON.parse(JSON.stringify(DEFAULT_ROLES));
          }
        }
        if (data.className) {
          state.className = data.className;
        }
        saveState();
        renderAllViews();
        closeGasModal();
        showToast("✅ 시트 데이터를 성공적으로 불러왔습니다!");
      } else {
        throw new Error(data.message || "시트 데이터 형식 불일치");
      }
    } else {
      const payload = {
        action: "saveAssignments",
        className: state.className,
        assignedDate: state.assignedDate || new Date().toISOString().split("T")[0],
        assignments: state.assignments
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.status === "success") {
        closeGasModal();
        showToast("✅ 구글 스프레드시트에 안전하게 저장되었습니다!");
      } else {
        throw new Error(data.message || "저장 응답 확인 필요");
      }
    }
  } catch (err) {
    console.warn("GAS 통신 알림:", err);
    closeGasModal();
    if (mode === "load") {
      showToast("💡 시트 연결 주소가 저장되었습니다. (추후 배포 후 자동 연동)");
    } else {
      showToast("💡 시트 저장 요청이 전송되었습니다.");
    }
  } finally {
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = "실행하기";
    }
  }
}

// 15. 학생 및 역할 편집 모달
function openEditModal(defaultTab = "students") {
  const modal = document.getElementById("edit-modal");
  renderEditModalTabs(defaultTab);
  renderStudentEditor();
  renderRoleEditor();
  modal.classList.add("open");
}

function closeEditModal() {
  const modal = document.getElementById("edit-modal");
  if (modal) modal.classList.remove("open");
}

function renderEditModalTabs(tabName) {
  const tabStudents = document.getElementById("tab-edit-students");
  const tabRoles = document.getElementById("tab-edit-roles");
  const panelStudents = document.getElementById("panel-students");
  const panelRoles = document.getElementById("panel-roles");

  if (tabName === "students") {
    tabStudents.classList.add("active");
    tabRoles.classList.remove("active");
    panelStudents.style.display = "block";
    panelRoles.style.display = "none";
  } else {
    tabRoles.classList.add("active");
    tabStudents.classList.remove("active");
    panelRoles.style.display = "block";
    panelStudents.style.display = "none";
  }
}

function renderStudentEditor() {
  const tagList = document.getElementById("student-tag-list");
  if (!tagList) return;

  tagList.innerHTML = "";
  state.students.forEach((name, idx) => {
    const chip = document.createElement("div");
    chip.className = "tag-item";
    chip.innerHTML = `
      <span>${idx + 1}. ${escapeHtml(name)}</span>
      <button type="button" onclick="removeStudent(${idx})" title="삭제" aria-label="삭제">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    `;
    tagList.appendChild(chip);
  });
}

function addStudentFromInput() {
  const input = document.getElementById("new-student-input");
  const rawValue = input ? input.value.trim() : "";
  if (!rawValue) return;

  const names = rawValue.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (names.length > 0) {
    state.students.push(...names);
    saveState();
    renderStudentEditor();
    renderAllViews();
    input.value = "";
    showToast(`학생 ${names.length}명이 추가되었습니다.`);
  }
}

function removeStudent(index) {
  if (index >= 0 && index < state.students.length) {
    state.students.splice(index, 1);
    saveState();
    renderStudentEditor();
    renderAllViews();
  }
}

function resetDefaultStudents() {
  if (confirm("학생 목록을 기본 12명 예시로 되돌리시겠습니까?")) {
    state.students = [...DEFAULT_STUDENTS];
    saveState();
    renderStudentEditor();
    renderAllViews();
    showToast("학생 목록이 기본 12명으로 재설정되었습니다.");
  }
}

function renderRoleEditor() {
  const roleList = document.getElementById("role-editor-list");
  if (!roleList) return;

  roleList.innerHTML = "";
  const validRoles = normalizeRoles(state.roles);
  state.roles = validRoles.length ? validRoles : JSON.parse(JSON.stringify(DEFAULT_ROLES));
  state.roles.forEach((role, idx) => {
    const item = document.createElement("div");
    item.className = "tag-item";
    item.style.width = "100%";
    item.style.justifyContent = "space-between";
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.15rem;">${role.emoji || "💼"}</span>
        <strong>${escapeHtml(role.name)}</strong>
        <span style="font-size: 0.75rem; color: hsl(var(--muted-foreground));">(${escapeHtml(role.duty || "")})</span>
      </div>
      <button type="button" onclick="removeRole(${idx})" title="역할 삭제" aria-label="삭제">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    `;
    roleList.appendChild(item);
  });
}

function addRoleFromInput() {
  const nameInput = document.getElementById("new-role-name");
  const emojiInput = document.getElementById("new-role-emoji");
  const dutyInput = document.getElementById("new-role-duty");

  const name = nameInput ? nameInput.value.trim() : "";
  const emoji = emojiInput ? emojiInput.value.trim() || "⭐" : "⭐";
  const duty = dutyInput ? dutyInput.value.trim() : "학급을 위해 솔선수범해요";

  if (!name) {
    showToast("역할 이름을 입력해주세요!");
    return;
  }

  const themes = ["yellow", "blue", "green", "pink", "purple", "orange"];
  const newRole = {
    id: Date.now(),
    name: name,
    emoji: emoji,
    duty: duty,
    theme: themes[state.roles.length % themes.length]
  };

  state.roles.push(newRole);
  saveState();
  renderRoleEditor();
  renderAllViews();

  nameInput.value = "";
  emojiInput.value = "";
  dutyInput.value = "";
  showToast(`💼 새 역할 '${name}'이 추가되었습니다.`);
}

function removeRole(index) {
  if (index >= 0 && index < state.roles.length) {
    state.roles.splice(index, 1);
    saveState();
    renderRoleEditor();
    renderAllViews();
  }
}

function resetDefaultRoles() {
  if (confirm("역할 목록을 기본 12개 예시로 되돌리시겠습니까?")) {
    state.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    saveState();
    renderRoleEditor();
    renderAllViews();
    showToast("역할 목록이 기본 12개로 재설정되었습니다.");
  }
}

// 16. 학급 이름 변경 프롬프트
function promptClassName() {
  const current = state.className || "3학년 2반";
  const updated = prompt("학급 이름을 입력해 주세요 (예: 4학년 1반, 슬기반):", current);
  if (updated && updated.trim()) {
    state.className = updated.trim();
    saveState();
    updateStatusSummary();
    updatePrintHeader();
    showToast(`🏫 학급 이름이 '${state.className}'(으)로 변경되었습니다.`);
  }
}

// 17. 토스트 알림 헬퍼
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// 18. HTML 이스케이프
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 19. Google Apps Script 템플릿 코드 복사
function copyAppsScriptTemplate() {
  const code = `// Google Apps Script (도구 > 스크립트 편집기에 붙여넣고 웹 앱으로 배포)
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var students = [];
  var roles = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) students.push(data[i][0]);
    if (data[i][1]) {
      roles.push({
        id: i,
        name: data[i][1],
        emoji: data[i][2] || '⭐',
        duty: data[i][3] || '',
        theme: 'yellow'
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    className: sheet.getName(),
    students: students,
    roles: roles
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var contents = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultSheet = ss.getSheetByName('배정결과') || ss.insertSheet('배정결과');
  resultSheet.clear();
  resultSheet.appendRow(['번호', '역할', '이모지', '담당 학생', '임무', '배정일자']);
  var assignments = contents.assignments || [];
  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    resultSheet.appendRow([
      i + 1,
      a.role.name,
      a.role.emoji,
      a.student,
      a.role.duty,
      contents.assignedDate
    ]);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  navigator.clipboard.writeText(code).then(() => {
    showToast("📋 구글 Apps Script 템플릿 코드가 클립보드에 복사되었습니다!");
  }).catch(() => {
    alert("코드 복사에 실패했습니다. 수동으로 복사해 주세요.");
  });
}

// 20. 초기화 및 이벤트 리스너 등록
document.addEventListener("DOMContentLoaded", () => {
  loadState();

  confetti = new ConfettiCannon("confetti-canvas");

  renderAllViews();
  updateSoundUI();

  // 메인 액션 버튼
  const rollBtn = document.getElementById("btn-roll-roles");
  if (rollBtn) rollBtn.addEventListener("click", assignRoles);

  const resetBtn = document.getElementById("btn-reset-assignments");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("현재 배정된 결과를 초기화하시겠습니까? (고정된 역할 설정도 해제됩니다)")) {
        state.assignments = [];
        state.lockedRoleIds = [];
        state.assignedDate = "";
        saveState();
        renderAllViews();
        showToast("배정 결과가 초기화되었습니다.");
      }
    });
  }

  // 상단 툴바 버튼
  const btnSheetLoad = document.getElementById("btn-sheet-load");
  if (btnSheetLoad) btnSheetLoad.addEventListener("click", () => openGasModal("load"));

  const btnSheetSave = document.getElementById("btn-sheet-save");
  if (btnSheetSave) btnSheetSave.addEventListener("click", () => openGasModal("save"));

  const btnEditList = document.getElementById("btn-edit-list");
  if (btnEditList) btnEditList.addEventListener("click", () => openEditModal("students"));

  const btnSoundToggle = document.getElementById("btn-sound-toggle");
  if (btnSoundToggle) btnSoundToggle.addEventListener("click", toggleSound);

  const btnSaveImage = document.getElementById("btn-save-image");
  if (btnSaveImage) btnSaveImage.addEventListener("click", exportToPng);

  const btnPrintA4 = document.getElementById("btn-print-a4");
  if (btnPrintA4) btnPrintA4.addEventListener("click", handlePrint);

  const classTag = document.getElementById("class-name-tag");
  if (classTag) classTag.addEventListener("click", promptClassName);

  const btnCancelSwap = document.getElementById("btn-cancel-swap");
  if (btnCancelSwap) btnCancelSwap.addEventListener("click", cancelSwap);

  // 뷰 전환 탭
  const tabCards = document.getElementById("tab-cards-view");
  const tabTable = document.getElementById("tab-table-view");
  const cardsGrid = document.getElementById("cards-grid");
  const tableContainer = document.getElementById("table-container");

  if (tabCards && tabTable && cardsGrid && tableContainer) {
    tabCards.addEventListener("click", () => {
      tabCards.classList.add("active");
      tabTable.classList.remove("active");
      cardsGrid.classList.remove("hidden");
      tableContainer.classList.remove("active");
    });

    tabTable.addEventListener("click", () => {
      tabTable.classList.add("active");
      tabCards.classList.remove("active");
      cardsGrid.classList.add("hidden");
      tableContainer.classList.add("active");
    });
  }

  // 구글 시트 모달 이벤트
  const gasClose = document.getElementById("gas-modal-close");
  if (gasClose) gasClose.addEventListener("click", closeGasModal);

  const gasCancel = document.getElementById("btn-gas-cancel");
  if (gasCancel) gasCancel.addEventListener("click", closeGasModal);

  const gasSubmit = document.getElementById("btn-gas-submit");
  if (gasSubmit) gasSubmit.addEventListener("click", handleGasAction);

  const copyScriptBtn = document.getElementById("btn-copy-gas-script");
  if (copyScriptBtn) copyScriptBtn.addEventListener("click", copyAppsScriptTemplate);

  // 편집 모달 이벤트
  const editClose = document.getElementById("edit-modal-close");
  if (editClose) editClose.addEventListener("click", closeEditModal);

  const tabEditStudents = document.getElementById("tab-edit-students");
  if (tabEditStudents) {
    tabEditStudents.addEventListener("click", () => renderEditModalTabs("students"));
  }

  const tabEditRoles = document.getElementById("tab-edit-roles");
  if (tabEditRoles) {
    tabEditRoles.addEventListener("click", () => renderEditModalTabs("roles"));
  }

  const btnAddStudent = document.getElementById("btn-add-student");
  if (btnAddStudent) btnAddStudent.addEventListener("click", addStudentFromInput);

  const newStudentInput = document.getElementById("new-student-input");
  if (newStudentInput) {
    newStudentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addStudentFromInput();
    });
  }

  const btnResetStudents = document.getElementById("btn-reset-students");
  if (btnResetStudents) btnResetStudents.addEventListener("click", resetDefaultStudents);

  const btnAddRole = document.getElementById("btn-add-role");
  if (btnAddRole) btnAddRole.addEventListener("click", addRoleFromInput);

  const btnResetRoles = document.getElementById("btn-reset-roles");
  if (btnResetRoles) btnResetRoles.addEventListener("click", resetDefaultRoles);

  // 키보드 단축키 지원 (Space: 배정, Esc: 맞교환 취소 / 모달 닫기)
  window.addEventListener("keydown", (e) => {
    const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (e.key === "Escape") {
      if (swapSourceRoleId !== null) cancelSwap();
      closeGasModal();
      closeEditModal();
    } else if (e.key === " " && !isTyping && !isRolling) {
      const gasModal = document.getElementById("gas-modal");
      const editModal = document.getElementById("edit-modal");
      if (!gasModal?.classList.contains("open") && !editModal?.classList.contains("open")) {
        e.preventDefault();
        assignRoles();
      }
    }
  });

  // 전역 함수 노출
  window.removeStudent = removeStudent;
  window.removeRole = removeRole;
  window.closeEditModal = closeEditModal;
  window.closeGasModal = closeGasModal;
  window.promptClassName = promptClassName;
  window.toggleLockRole = toggleLockRole;
  window.startSwap = startSwap;
  window.cancelSwap = cancelSwap;

  // 모달 바깥 배경 클릭 시 닫기
  window.addEventListener("click", (e) => {
    const gasModal = document.getElementById("gas-modal");
    const editModal = document.getElementById("edit-modal");
    if (e.target === gasModal) closeGasModal();
    if (e.target === editModal) closeEditModal();
  });
});
