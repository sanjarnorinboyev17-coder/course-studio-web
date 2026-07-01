const state = {
  token: localStorage.getItem("courseStudioToken"),
  user: null,
  dashboard: null,
  users: [],
  courses: [],
  tab: "dashboard",
  theme: localStorage.getItem("courseStudioTheme") || "light",
  sidebarCollapsed: localStorage.getItem("courseStudioSidebarCollapsed") === "true",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const api = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["content-type"] = "application/json";
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Backend ishlamayapti. Ilovani `npm run dev` bilan oching yoki Vercel'da API deployment borligini tekshiring.");
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
  if (!response.ok) throw new Error(data.error || "So'rov bajarilmadi.");
  return data;
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

const eyeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeOffIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3.1 4.1"></path><path d="M6.6 6.6C3.6 8.6 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.2-.8"></path></svg>`;
const sunIcon = `<svg class="theme-icon--sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
const moonIcon = `<svg class="theme-icon--moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 13.5A8.5 8.5 0 0 1 10.5 3.1 8.5 8.5 0 1 0 20.9 13.5Z"></path></svg>`;

function applyTheme() {
  document.documentElement.dataset.theme = state.theme === "dark" ? "dark" : "light";
  const icons = $$('[data-theme-icon]');
  const button = $("#themeToggle");
  if (!button || !icons.length) return;
  const dark = state.theme === "dark";
  icons[0].outerHTML = dark ? sunIcon : moonIcon;
  icons[1].outerHTML = dark ? moonIcon : sunIcon;
  button.setAttribute("aria-label", dark ? "Yorug' rejimni yoqish" : "Qorong'u rejimni yoqish");
}

function canManageCourse(user, course) {
  return user?.role === "admin" || (user?.role === "teacher" && course?.teacher_id === user?.id);
}

function canManageStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  return student.teacher_id === user.id;
}

function applySidebarState() {
  const shell = $("#shellView");
  const sidebar = $(".sidebar");
  const toggle = $("#sidebarToggle");
  if (!shell || !sidebar || !toggle) return;
  sidebar.classList.toggle("is-collapsed", state.sidebarCollapsed);
  shell.style.setProperty("--sidebar-width", state.sidebarCollapsed ? "88px" : "280px");
  const icon = toggle.querySelector(".sidebar-toggle__icon");
  if (icon) icon.textContent = state.sidebarCollapsed ? "›" : "‹";
  toggle.setAttribute("aria-label", state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
  toggle.setAttribute("title", state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
  $$(".nav-btn").forEach((btn) => {
    const label = btn.dataset.navLabel || btn.textContent.trim();
    btn.title = state.sidebarCollapsed ? label : "";
    btn.classList.toggle("is-collapsed", state.sidebarCollapsed);
  });
}

function syncPasswordToggle(button, input) {
  const showing = input.type === "text";
  button.innerHTML = showing ? eyeOffIcon : eyeIcon;
  button.setAttribute("aria-label", showing ? "Parolni yashirish" : "Parolni ko'rsatish");
}

function initPasswordToggles() {
  $$("[data-password-toggle]").forEach((button) => {
    const input = button.closest(".password-control")?.querySelector("input");
    if (input) syncPasswordToggle(button, input);
  });
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 2600);
}

function setBusy(isBusy) {
  $("#loadingState").classList.toggle("hidden", !isBusy);
}

function showError(error) {
  const node = $("#errorState");
  node.textContent = error.message || error;
  node.classList.remove("hidden");
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
    await loadAll();
    renderShell();
  } catch {
    localStorage.removeItem("courseStudioToken");
    state.token = null;
    renderAuth();
  }
}

function renderAuth() {
  applyTheme();
  $("#loginView").classList.remove("hidden");
  $("#shellView").classList.add("hidden");
}

function renderShell() {
  applyTheme();
  applySidebarState();
  $("#loginView").classList.add("hidden");
  $("#shellView").classList.remove("hidden");
  $("#roleLabel").textContent = `${state.user.name} · ${state.user.role}`;
  $("#userMeta").textContent = `${state.user.username} sifatida tizimga kirilgan`;
  $("#sidebarUserName").textContent = state.user.name;
  $("#sidebarUserRole").textContent = state.user.role;
  $("#sidebarAvatar").innerHTML = avatarMarkup(state.user);
  applyRoleVisibility();
  renderTabs();
}

function applyRoleVisibility() {
  const isAdmin = state.user.role === "admin";
  const isTeacher = state.user.role === "teacher";
  const isStudent = state.user.role === "student";
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", !isAdmin));
  $$(".admin-teacher").forEach((node) => node.classList.toggle("hidden", !(isAdmin || isTeacher)));
  $$(".student-action").forEach((node) => node.classList.toggle("hidden", !isStudent));
  $$(".admin-only-form").forEach((node) => node.classList.toggle("hidden", !isAdmin));
}

async function loadAll() {
  setBusy(true);
  $("#errorState").classList.add("hidden");
  try {
    const [dashboard, courses] = await Promise.all([api("/api/dashboard"), api("/api/courses")]);
    state.dashboard = dashboard;
    state.courses = courses.courses;
    if (state.user.role !== "student") state.users = (await api("/api/users")).users;
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

function renderTabs() {
  $$(".tab-panel").forEach((node) => node.classList.add("hidden"));
  $(`#${state.tab}Tab`).classList.remove("hidden");
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === state.tab));
  $("#pageTitle").textContent = { dashboard: "Dashboard", users: "Foydalanuvchilar", courses: "Kurslar", settings: "Settings" }[state.tab];
  renderDashboard();
  renderUsers();
  renderCourses();
  renderSettings();
  applyRoleVisibility();
}

function renderDashboard() {
  if (!state.dashboard) return;
  $("#statTeachers").textContent = state.dashboard.stats.teachers;
  $("#statStudents").textContent = state.dashboard.stats.students;
  $("#statCourses").textContent = state.dashboard.stats.courses;
  $("#statLessons").textContent = state.dashboard.stats.lessons;
  $("#auditList").innerHTML = state.dashboard.audit?.length
    ? state.dashboard.audit.map((item) => `<article class="list-row"><div><h3>${escapeHtml(item.action)} · ${escapeHtml(item.entity)}</h3><p>${new Date(item.created_at).toLocaleString()} · ${escapeHtml(item.entity_id)}</p></div></article>`).join("")
    : "Audit yozuvlari yo'q.";
  if (state.user.role === "admin") {
    const adminStats = $("#adminStats");
    if (adminStats) adminStats.classList.remove("hidden");
    const signupSeries = $("#signupSeries");
    const courseStudents = $("#courseStudents");
    const roleDistribution = $("#roleDistribution");
    const ratingDistribution = $("#ratingDistribution");
    const stats = state.dashboard.adminStats;
    if (stats) {
      const max = Math.max(1, ...stats.series.map((point) => point.count));
      signupSeries.innerHTML = stats.series.map((point) => `<div class="bar"><span style="height:${Math.max(14, (point.count / max) * 100)}px"></span><small>${point.label}</small></div>`).join("");
      courseStudents.innerHTML = stats.studentsPerCourse.map((item) => `<div class="row"><span>${escapeHtml(item.course)}</span><strong>${item.students}</strong></div>`).join("");
      roleDistribution.innerHTML = stats.roleDistribution.map((item) => `<div class="row"><span>${escapeHtml(item.role)}</span><strong>${item.count}</strong></div>`).join("");
      ratingDistribution.innerHTML = stats.ratingDistribution.map((item) => `<div class="row"><span>${item.score}★</span><strong>${item.count}</strong></div>`).join("");
    }
  }
}

function renderUsers() {
  const node = $("#usersList");
  if (state.user.role === "student") return;
  if (!state.users.length) {
    node.innerHTML = `<section class="state">Foydalanuvchilar yo'q.</section>`;
    return;
  }
  node.innerHTML = state.users.map((user) => {
    const canManageTarget = canManageStudent(state.user, user);
    return `
      <article class="list-row">
        <div class="sidebar-user" style="margin:0;">
          <div class="avatar avatar-inline">${avatarMarkup(user)}</div>
          <div>
            <h3>${escapeHtml(user.name)} <span class="badge">${escapeHtml(user.role)}</span></h3>
            <p>${escapeHtml(user.username)} · ID: ${escapeHtml(user.id)} ${user.teacher_id ? `· Teacher: ${escapeHtml(user.teacher_id)}` : ""}</p>
          </div>
        </div>
        <div class="row-actions">
          ${canManageTarget ? `<button class="secondary" data-user-credentials="${user.id}">Login-parol</button>` : ""}
          ${state.user.role === "admin" ? `<button class="secondary" data-user-edit="${user.id}">Tahrirlash</button>` : ""}
          ${state.user.role === "admin" ? `<button class="secondary" data-user-toggle="${user.id}" data-active="${!user.is_active}">${user.is_active ? "Faolsizlantirish" : "Faollashtirish"}</button>` : ""}
          ${state.user.role === "admin" ? `<button class="danger" data-user-delete="${user.id}">O'chirish</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderCourses() {
  const node = $("#coursesList");
  if (!state.courses.length) {
    node.innerHTML = `<section class="state">Hali kurs yo'q.</section>`;
    return;
  }
  node.innerHTML = state.courses.map(courseTemplate).join("");
}

function courseTemplate(course) {
  const progress = course.enrollment?.progress ?? 0;
  const ratingCount = course.ratings?.length || 0;
  const avg = Number(course.averageRating || 0).toFixed(1);
  const canManage = canManageCourse(state.user, course);
  return `
    <article class="course-card">
      <h3>${escapeHtml(course.title)}</h3>
      <p>${escapeHtml(course.description)}</p>
      <p class="muted">O'qituvchi: <span class="sidebar-user" style="display:inline-flex; margin:0;">${avatarMarkup(course.teacher)} <span>${escapeHtml(course.teacher?.name || "Biriktirilmagan")}</span></span> · ${avg} ⭐ (${ratingCount} baho)</p>
      ${state.user.role === "student" ? `<div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div><p class="muted">Progress: ${progress}%</p>` : ""}
      ${state.user.role === "student" ? `<form class="settings-row" data-course-rating-form="${course.id}">
        <input type="hidden" name="course_id" value="${course.id}" />
        <input type="hidden" name="teacher_id" value="${course.teacher?.id || ""}" />
        <input type="hidden" name="score" value="5" />
        <div class="rating-row">${[1,2,3,4,5].map((score) => `<button type="button" class="star-btn active" data-rate-score="${score}" data-course-rating-form="${course.id}">★</button>`).join("")}</div>
        <textarea name="comment" rows="2" placeholder="Izoh (ixtiyoriy)"></textarea>
        <button class="secondary" type="submit">Baholash</button>
      </form>` : ""}
      ${canManage ? `<div class="course-actions">
        <button class="secondary" data-edit-course="${course.id}">Tahrirlash</button>
        <button class="secondary" data-new-lesson="${course.id}">+ Dars</button>
        <button class="secondary" data-enroll="${course.id}">O'quvchi biriktirish</button>
        <button class="danger" data-delete-course="${course.id}">Kursni o'chirish</button>
      </div>` : ""}
      <div class="lesson-list">
        ${course.lessons.length ? course.lessons.map((lesson) => lessonTemplate(lesson, course)).join("") : `<div class="state">Bu kursda dars yo'q.</div>`}
      </div>
    </article>
  `;
}

function lessonTemplate(lesson, course) {
  const done = course.enrollment?.completed_lessons?.includes(lesson.id);
  const contents = [...(lesson.contents || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const canManage = canManageCourse(state.user, course);
  return `
    <section class="lesson">
      <div class="lesson-head">
        <h4>${lesson.order}. ${escapeHtml(lesson.title)}</h4>
        <div class="lesson-actions">
          ${canManage ? `<button class="secondary" data-edit-lesson="${lesson.id}">Tahrirlash</button>` : ""}
          ${canManage ? `<button class="secondary" data-add-content="${lesson.id}">+ Kontent</button>` : ""}
          ${canManage ? `<button class="danger" data-delete-lesson="${lesson.id}">O'chirish</button>` : ""}
          ${state.user.role === "student" ? `<button class="secondary" data-submit="${lesson.id}">Topshiriq</button>` : ""}
          ${state.user.role === "student" ? `<label class="student-action badge"><input type="checkbox" data-progress="${lesson.id}" ${done ? "checked" : ""} /> O'qildi</label>` : ""}
        </div>
      </div>
      <div class="content-list">${contentListTemplate(lesson.id, contents, course)}</div>
      ${lesson.submissions?.length ? `<div class="student-work"><strong>Topshiriqlar:</strong>${lesson.submissions.map((s) => `<p>${escapeHtml(s.content || "Fayl yuborilgan")} ${s.file_url ? `<a href="${s.file_url}" target="_blank">Fayl</a>` : ""} ${s.grade ? `<span class="badge">Baho: ${escapeHtml(s.grade)}</span>` : ""}</p>`).join("")}</div>` : ""}
    </section>
  `;
}

function contentListTemplate(lessonId, contents, course) {
  if (!contents.length) {
    return `${insertSlotTemplate(lessonId, 1, course)}<p class="muted">Kontent yo'q.</p>`;
  }
  return [
    insertSlotTemplate(lessonId, Number(contents[0].order || 1) - 1, course),
    ...contents.flatMap((item, index) => {
      const next = contents[index + 1];
      const nextOrder = next ? (Number(item.order || index + 1) + Number(next.order || index + 2)) / 2 : Number(item.order || index + 1) + 1;
      return [contentTemplate(item, index, contents.length, course), insertSlotTemplate(lessonId, nextOrder, course)];
    })
  ].join("");
}

function insertSlotTemplate(lessonId, order, course) {
  const canManage = canManageCourse(state.user, course);
  return `<div class="insert-slot">${canManage ? `<button class="secondary" data-add-content="${lessonId}" data-content-order="${order}">+ shu yerga qo'shish</button>` : ""}</div>`;
}

function contentTemplate(item, index, total, course) {
  const canManage = canManageCourse(state.user, course);
  const controls = canManage ? `
    <div class="content-head">
      <p class="muted">Tartib: ${Number(item.order || index + 1).toFixed(2)}</p>
      <div class="content-reorder">
        <button class="secondary" data-move-content="${item.id}" data-direction="up" ${index === 0 ? "disabled" : ""} aria-label="Yuqoriga">▲</button>
        <button class="secondary" data-move-content="${item.id}" data-direction="down" ${index === total - 1 ? "disabled" : ""} aria-label="Pastga">▼</button>
      </div>
    </div>
  ` : "";
  if (item.type === "text") return `<article class="content-item">${controls}<div class="content-card">${item.content}</div></article>`;
  if (item.type === "link") {
    const youtube = youtubeEmbed(item.content);
    return `<article class="content-item">${controls}<div class="content-card">${youtube ? `<iframe src="${youtube}" allowfullscreen title="Video"></iframe>` : `<a class="content-link" href="#" data-open-link="${escapeHtml(item.content)}">${escapeHtml(item.content)}</a>`}</div></article>`;
  }
  return `<article class="content-item">${controls}${filePreview(item, canManage)}</article>`;
}

function filePreview(item, canManage) {
  const url = item.file_url;
  const mime = item.mime_type || "";
  const sizeLabel = formatFileSize(item.file_size || 0);
  const fileName = escapeHtml(item.file_name || "Fayl");
  const previewActions = canManage ? `
    <div class="preview-actions">
      <button type="button" data-replace-content="${item.id}">Replace</button>
      <button type="button" class="danger" data-delete-content="${item.id}">Delete</button>
    </div>` : "";
  if (mime.includes("pdf")) return `<div class="content-card content-file-card"><div class="preview-shell">${previewActions}<iframe src="${url}" title="${fileName}"></iframe></div><div class="file-pill">📄 ${fileName}</div><div class="file-meta">${mime.split("/").pop()} · ${sizeLabel}</div></div>`;
  if (mime.startsWith("image/")) return `<div class="content-card content-file-card"><div class="preview-shell">${previewActions}<img src="${url}" alt="${fileName}" /></div><div class="file-pill">🖼️ ${fileName}</div><div class="file-meta">${mime.split("/").pop()} · ${sizeLabel}</div></div>`;
  if (mime.startsWith("video/")) return `<div class="content-card content-file-card"><div class="preview-shell">${previewActions}<video src="${url}" controls></video></div><div class="file-pill">🎥 ${fileName}</div><div class="file-meta">${mime.split("/").pop()} · ${sizeLabel}</div></div>`;
  return `<div class="content-card content-file-card"><div class="preview-shell">${previewActions}<div class="file-pill">📎 ${fileName}</div></div><div class="file-meta">${mime.split("/").pop() || "file"} · ${sizeLabel}</div></div>`;
}

function formatFileSize(bytes) {
  if (!Number(bytes)) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex += 1; }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function avatarMarkup(user) {
  if (user?.avatar_url) return `<img src="${user.avatar_url}" alt="avatar" />`;
  const initials = (user?.name || "SA").split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SA";
  return initials;
}

function renderSettings() {
  const panel = $("#settingsPanel");
  const tab = state.settingsTab || "profile";
  const registrationDate = state.user?.created_at ? new Date(state.user.created_at).toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" }) : "-";
  const panels = {
    profile: `
      <div class="settings-card">
        <div class="settings-card-head">
          <div>
            <h3>Profile</h3>
            <p>Update your public identity and avatar.</p>
          </div>
          <span class="badge">Personal</span>
        </div>
        <form id="settingsProfileForm" class="settings-form">
          <div class="settings-split">
            <div class="settings-form-grid">
              <label class="field">
                <span class="field-label">Display name</span>
                <input name="name" value="${escapeHtml(state.user?.name || "")}" />
              </label>
              <label class="field">
                <span class="field-label">Telefon raqami</span>
                <input name="phone" value="${escapeHtml(state.user?.phone || "")}" placeholder="+998 90 123 45 67" />
              </label>
              <label class="field">
                <span class="field-label">Ro'yxatdan o'tgan sana</span>
                <input value="${escapeHtml(registrationDate)}" readonly />
              </label>
            </div>
            <div class="avatar-upload-card">
              <div class="avatar-preview-shell">
                <div class="avatar avatar-preview" id="settingsAvatarPreview">${avatarMarkup(state.user)}</div>
              </div>
              <label class="dropzone">
                <input name="avatar" type="file" accept="image/*" hidden />
                <span class="dropzone-title">Choose avatar</span>
                <span class="dropzone-hint">PNG, JPG, WEBP · Square images work best</span>
              </label>
            </div>
          </div>
          <div class="form-feedback hidden" id="settingsProfileFeedback"></div>
          <div class="dialog-actions"><button class="primary" type="submit">Save profile</button></div>
        </form>
      </div>
    `,
    account: `
      <div class="settings-card">
        <div class="settings-card-head">
          <div>
            <h3>Account</h3>
            <p>Update your username separately from security settings.</p>
          </div>
          <span class="badge">Account</span>
        </div>
        <form id="settingsAccountForm" class="settings-form">
            <label class="field">
              <span class="field-label">Username</span>
              <input name="username" value="${escapeHtml(state.user?.username || "")}" required />
            </label>
          <div class="form-feedback hidden" id="settingsAccountFeedback"></div>
          <div class="dialog-actions"><button class="primary" type="submit">Save profile</button></div>
        </form>
      </div>
    `,
    security: `
      <div class="settings-card">
        <div class="settings-card-head">
          <div>
            <h3>Xavfsizlik</h3>
            <p>Joriy parolni tasdiqlab, yangi parol o'rnating.</p>
          </div>
          <span class="badge">Security</span>
        </div>
        <form id="settingsSecurityForm" class="settings-form">
          <label class="field password-field"><span class="field-label">Joriy parol</span><span class="password-control"><input name="current_password" type="password" autocomplete="current-password" required /><button type="button" class="password-toggle" data-password-toggle aria-label="Parolni ko'rsatish"></button></span></label>
          <label class="field password-field"><span class="field-label">Yangi parol</span><span class="password-control"><input name="new_password" type="password" autocomplete="new-password" required /><button type="button" class="password-toggle" data-password-toggle aria-label="Parolni ko'rsatish"></button></span></label>
          <label class="field password-field"><span class="field-label">Yangi parolni tasdiqlash</span><span class="password-control"><input name="confirm_password" type="password" autocomplete="new-password" required /><button type="button" class="password-toggle" data-password-toggle aria-label="Parolni ko'rsatish"></button></span></label>
          <div class="form-feedback hidden" id="settingsSecurityFeedback"></div>
          <div class="dialog-actions"><button class="primary" type="submit">Parolni yangilash</button></div>
        </form>
      </div>
    `,
    notifications: `
      <div class="settings-card">
        <div class="settings-card-head">
          <div>
            <h3>Bildirishnomalar</h3>
            <p>Qaysi kanallar orqali xabarnoma olishni tanlang.</p>
          </div>
          <span class="badge">Prefs</span>
        </div>
        <form id="settingsNotificationsForm" class="settings-form">
          <label class="switch-card">
            <div>
              <strong>Telegram-bot xabarnomalari</strong>
              <p>Telegram bot orqali tezkor bildirishnoma olish.</p>
            </div>
            <span class="switch">
              <input type="checkbox" name="telegram_notify" ${state.user?.telegram_notify !== false ? "checked" : ""} />
              <span class="switch-ui"></span>
            </span>
          </label>
          <label class="switch-card">
            <div>
              <strong>SMS xabarnomalar</strong>
              <p>Muhim o'zgarishlar haqida SMS eslatmalari.</p>
            </div>
            <span class="switch">
              <input type="checkbox" name="sms_notify" ${state.user?.sms_notify !== false ? "checked" : ""} />
              <span class="switch-ui"></span>
            </span>
          </label>
          <label class="switch-card">
            <div>
              <strong>Email xabarnomalar</strong>
              <p>Topshiriqlar va kurs yangiliklari email orqali yuboriladi.</p>
            </div>
            <span class="switch">
              <input type="checkbox" name="email_notify" ${state.user?.email_notify !== false ? "checked" : ""} />
              <span class="switch-ui"></span>
            </span>
          </label>
          <div class="form-feedback hidden" id="settingsNotificationsFeedback"></div>
          <div class="dialog-actions"><button class="primary" type="submit">Sozlamalarni saqlash</button></div>
        </form>
      </div>
    `,
    reviews: state.user?.role === "teacher" ? `
      <div class="settings-card">
        <div class="settings-card-head">
          <div>
            <h3>Reviews</h3>
            <p>See feedback left for your course.</p>
          </div>
          <span class="badge">Feedback</span>
        </div>
        <div id="reviewsList" class="list"></div>
      </div>
    ` : `<div class="settings-card"><div class="settings-card-head"><div><h3>Reviews</h3><p>Only teachers can see received reviews.</p></div><span class="badge">Feedback</span></div><div class="state">Only teachers can see received reviews.</div></div>`
  };
  panel.innerHTML = panels[tab] || panels.profile;
  if (tab === "reviews") loadReviews();
  initPasswordToggles();
  if (tab === "profile") {
    const input = $("#settingsProfileForm input[name='avatar']");
    const preview = $("#settingsAvatarPreview");
    input?.addEventListener("change", () => {
      const [file] = input.files || [];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        preview.innerHTML = `<img src="${reader.result}" alt="avatar preview" />`;
      };
      reader.readAsDataURL(file);
    });
  }
}

function setFormFeedback(id, message, type = "success") {
  const node = $(id);
  if (!node) return;
  node.textContent = message;
  node.classList.remove("hidden", "is-error", "is-success");
  node.classList.add(type === "error" ? "is-error" : "is-success");
}

async function loadReviews() {
  const list = $("#reviewsList");
  try {
    const data = await api("/api/ratings");
    list.innerHTML = data.ratings?.length ? data.ratings.map((item) => `<article class="list-row"><div><h3>${escapeHtml(item.comment || "No comment")}</h3><p>Course: ${escapeHtml(item.course_id)} · Score: ${item.score}</p></div></article>`).join("") : `<div class="state">No reviews yet.</div>`;
  } catch (error) {
    list.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function youtubeEmbed(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    if (parsed.hostname.includes("youtube.com")) return `https://www.youtube.com/embed/${parsed.searchParams.get("v")}`;
  } catch {}
  return "";
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").classList.add("hidden");
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: $("#loginUsername").value, password: $("#loginPassword").value }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("courseStudioToken", state.token);
    await loadAll();
    renderShell();
  } catch (error) {
    $("#loginError").textContent = error.message;
    $("#loginError").classList.remove("hidden");
  }
});

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("courseStudioToken");
  location.reload();
});

$$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => {
  state.tab = btn.dataset.tab;
  renderTabs();
}));

document.body.addEventListener("click", async (event) => {
  const target = event.target.closest("button, [data-close], [data-progress], [data-open-link], [data-delete-content], [data-replace-content], .star-btn");
  if (!target) return;
  try {
    if (target.matches("[data-password-toggle]")) {
      const input = target.closest(".password-control")?.querySelector("input");
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
        syncPasswordToggle(target, input);
      }
      return;
    }
    if (target.matches("[data-close]")) target.closest("dialog").close();
    if (target.id === "themeToggle") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("courseStudioTheme", state.theme);
      applyTheme();
    }
    if (target.id === "profileBtn") {
      state.tab = "settings";
      state.settingsTab = "profile";
      renderTabs();
    }
    if (target.id === "sidebarToggle") {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem("courseStudioSidebarCollapsed", String(state.sidebarCollapsed));
      applySidebarState();
    }
    if (target.id === "newUserBtn") $("#userDialog").showModal();
    if (target.id === "newCourseBtn") $("#courseDialog").showModal();
    if (target.dataset.newLesson) {
      $("#lessonForm").course_id.value = target.dataset.newLesson;
      $("#lessonDialog").showModal();
    }
    if (target.dataset.addContent) {
      $("#contentForm").lesson_id.value = target.dataset.addContent;
      $("#contentForm").order.value = target.dataset.contentOrder || "";
      $("#contentDialog").showModal();
    }
    if (target.dataset.submit) {
      $("#submissionForm").lesson_id.value = target.dataset.submit;
      $("#submissionDialog").showModal();
    }
    if (target.dataset.deleteCourse && confirm("Kurs o'chirilsinmi?")) {
      await api(`/api/courses/${target.dataset.deleteCourse}`, { method: "DELETE" });
      await refresh("Kurs o'chirildi.");
    }
    if (target.dataset.editCourse) {
      const course = state.courses.find((item) => item.id === target.dataset.editCourse);
      const title = prompt("Kurs nomi:", course?.title || "");
      if (title !== null) {
        const description = prompt("Kurs tavsifi:", course?.description || "") ?? course?.description;
        await api(`/api/courses/${target.dataset.editCourse}`, { method: "PATCH", body: JSON.stringify({ title, description }) });
        await refresh("Kurs yangilandi.");
      }
    }
    if (target.dataset.editLesson) {
      const lesson = state.courses.flatMap((course) => course.lessons).find((item) => item.id === target.dataset.editLesson);
      const title = prompt("Dars nomi:", lesson?.title || "");
      if (title !== null) {
        await api(`/api/lessons/${target.dataset.editLesson}`, { method: "PATCH", body: JSON.stringify({ title }) });
        await refresh("Dars yangilandi.");
      }
    }
    if (target.dataset.deleteLesson && confirm("Dars o'chirilsinmi?")) {
      await api(`/api/lessons/${target.dataset.deleteLesson}`, { method: "DELETE" });
      await refresh("Dars o'chirildi.");
    }
    if (target.dataset.enroll) {
      const studentId = prompt("O'quvchi ID kiriting:");
      if (studentId) {
        await api(`/api/courses/${target.dataset.enroll}/enrollments`, { method: "POST", body: JSON.stringify({ student_id: studentId.trim() }) });
        await refresh("O'quvchi kursga biriktirildi.");
      }
    }
    if (target.dataset.userDelete && confirm("Foydalanuvchi o'chirilsinmi?")) {
      await api(`/api/users/${target.dataset.userDelete}`, { method: "DELETE" });
      await refresh("Foydalanuvchi o'chirildi.");
    }
    if (target.dataset.userCredentials) {
      const edited = state.users.find((item) => item.id === target.dataset.userCredentials);
      if (edited) {
        $("#credentialForm").user_id.value = edited.id;
        $("#credentialForm").username.value = edited.username;
        $("#credentialForm").password.value = "";
        $("#credentialDialog h3").textContent = `${edited.name} login-paroli`;
        $("#credentialDialog").showModal();
      }
    }
    if (target.dataset.userEdit) {
      const edited = state.users.find((item) => item.id === target.dataset.userEdit);
      const name = prompt("Ism:", edited?.name || "");
      if (name !== null) {
        const password = prompt("Yangi parol (bo'sh qoldiring - o'zgarmaydi):", "");
        await api(`/api/users/${target.dataset.userEdit}`, { method: "PATCH", body: JSON.stringify({ name, ...(password ? { password } : {}) }) });
        await refresh("Foydalanuvchi yangilandi.");
      }
    }
    if (target.dataset.userToggle) {
      await api(`/api/users/${target.dataset.userToggle}`, { method: "PATCH", body: JSON.stringify({ is_active: target.dataset.active === "true" }) });
      await refresh("Foydalanuvchi holati yangilandi.");
    }
    if (target.dataset.moveContent) {
      await api(`/api/content/${target.dataset.moveContent}/order`, { method: "PATCH", body: JSON.stringify({ direction: target.dataset.direction }) });
      await refresh("Kontent tartibi yangilandi.");
    }
    if (target.matches(".star-btn")) {
      const form = target.closest("form[data-course-rating-form]");
      const hidden = form?.querySelector("input[name='score']");
      if (hidden) hidden.value = target.dataset.rateScore;
      form?.querySelectorAll(".star-btn").forEach((star) => star.classList.toggle("active", Number(star.dataset.rateScore) <= Number(hidden?.value || 0)));
    }
    if (target.dataset.openLink) {
      event.preventDefault();
      openLinkModal(target.dataset.openLink);
    }
    if (target.dataset.deleteContent && confirm("Ushbu fayl o'chirilsinmi?")) {
      await api(`/api/content/${target.dataset.deleteContent}`, { method: "DELETE" });
      await refresh("Kontent o'chirildi.");
    }
    if (target.dataset.replaceContent) {
      const contentId = target.dataset.replaceContent;
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "*/*";
      picker.onchange = async () => {
        const file = picker.files?.[0];
        if (!file) return;
        const form = new FormData();
        form.append("type", "file");
        form.append("file", file);
        await api(`/api/content/${contentId}`, { method: "PATCH", body: form, headers: {} });
        await refresh("Fayl almashtirildi.");
      };
      picker.click();
    }
    if (target.dataset.settingsTab) {
      state.settingsTab = target.dataset.settingsTab;
      renderSettings();
      $$(".settings-nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.settingsTab === state.settingsTab));
    }
  } catch (error) {
    showError(error);
  }
});

document.body.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.name === "type") syncContentFields();
  if (target.dataset.progress) {
    await api(`/api/lessons/${target.dataset.progress}/progress`, { method: "POST", body: JSON.stringify({ done: target.checked }) });
    await refresh("Progress yangilandi.");
  }
});

document.body.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.matches("form[data-course-rating-form]")) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const data = await api("/api/ratings", { method: "POST", body: JSON.stringify(payload) });
    toast(data.message || "Baholash saqlandi.");
  }
});

$$("[data-command]").forEach((button) => button.addEventListener("click", () => document.execCommand(button.dataset.command)));
$("[data-heading]").addEventListener("click", () => document.execCommand("formatBlock", false, "h3"));

function openLinkModal(url) {
  const body = $("#linkModalBody");
  const modal = $("#linkModal");
  const isYoutube = /youtube\.com|youtu\.be/i.test(url);
  const isDrive = /drive\.google\.com/i.test(url);
  if (isYoutube) {
    body.innerHTML = `<iframe src="${youtubeEmbed(url) || url}" allowfullscreen title="Video preview"></iframe>`;
  } else if (isDrive) {
    body.innerHTML = `<div class="state"><p>Google Drive fayli oldindan ko'rish uchun ochildi.</p><a class="primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Faylni ochish</a></div>`;
  } else {
    body.innerHTML = `<div class="state"><p>Bu sayt ichki oynada ochilmaydi.</p><a class="primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Yangi tabda ochish</a></div>`;
  }
  modal.classList.add("open");
}

$('[data-close-link]').addEventListener('click', () => {
  $('#linkModal').classList.remove('open');
});
$('#linkModal').addEventListener('click', (event) => {
  if (event.target.id === 'linkModal') event.target.classList.remove('open');
});

function syncContentFields() {
  const type = $("#contentForm").type.value;
  $("#textFields").classList.toggle("hidden", type !== "text");
  $("#linkField").classList.toggle("hidden", type !== "link");
  $("#fileField").classList.toggle("hidden", type !== "file");
}

$("#userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = Object.fromEntries(form.entries());
  const data = await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  $("#userDialog").close();
  await refresh(`Foydalanuvchi yaratildi. Parol: ${data.password}`);
});

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  if (!payload.password) delete payload.password;
  const data = await api("/api/profile", { method: "PATCH", body: JSON.stringify(payload) });
  state.user = data.user;
  event.target.reset();
  $("#profileDialog").close();
  await refresh(data.message || "Profil yangilandi.");
});

$("#settingsPanel").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === "settingsProfileForm") {
      const formData = new FormData(event.target);
      const data = await api("/api/profile", { method: "PATCH", body: formData, headers: {} });
      state.user = data.user;
      await refresh(data.message || "Profil yangilandi.");
      return;
    }
    if (event.target.id === "settingsAccountForm") {
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const data = await api("/api/profile", { method: "PATCH", body: JSON.stringify(payload) });
      state.user = data.user;
      await refresh(data.message || "Profil yangilandi.");
      return;
    }
    if (event.target.id === "settingsSecurityForm") {
      const payload = Object.fromEntries(new FormData(event.target).entries());
      if (payload.new_password !== payload.confirm_password) {
        setFormFeedback("#settingsSecurityFeedback", "Yangi parollar mos kelmadi.", "error");
        return;
      }
      const data = await api("/api/profile/password", { method: "PATCH", body: JSON.stringify(payload) });
      event.target.reset();
      setFormFeedback("#settingsSecurityFeedback", data.message || "Parol yangilandi.");
      toast(data.message || "Parol yangilandi.");
      return;
    }
    if (event.target.id === "settingsNotificationsForm") {
      const formData = new FormData(event.target);
      const payload = {
        telegram_notify: formData.get("telegram_notify") === "on",
        sms_notify: formData.get("sms_notify") === "on",
        email_notify: formData.get("email_notify") === "on"
      };
      const data = await api("/api/profile/notifications", { method: "PATCH", body: JSON.stringify(payload) });
      state.user = data.user;
      await refresh(data.message || "Bildirishnomalar saqlandi.");
    }
  } catch (error) {
    if (event.target.id === "settingsSecurityForm") {
      setFormFeedback("#settingsSecurityFeedback", error.message || "So'rov bajarilmadi.", "error");
      return;
    }
    if (event.target.id === "settingsNotificationsForm") {
      setFormFeedback("#settingsNotificationsFeedback", error.message || "So'rov bajarilmadi.", "error");
      return;
    }
    if (event.target.id === "settingsAccountForm") {
      setFormFeedback("#settingsAccountFeedback", error.message || "So'rov bajarilmadi.", "error");
      return;
    }
    if (event.target.id === "settingsProfileForm") {
      setFormFeedback("#settingsProfileFeedback", error.message || "So'rov bajarilmadi.", "error");
    }
  }
});

$("#credentialForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  const userId = payload.user_id;
  delete payload.user_id;
  if (!payload.password) delete payload.password;
  await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
  event.target.reset();
  $("#credentialDialog").close();
  await refresh("Login-parol yangilandi.");
});

$("#courseForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  await api("/api/courses", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  $("#courseDialog").close();
  await refresh("Kurs yaratildi.");
});

$("#lessonForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  await api(`/api/courses/${payload.course_id}/lessons`, { method: "POST", body: JSON.stringify({ title: payload.title }) });
  event.target.reset();
  $("#lessonDialog").close();
  await refresh("Dars yaratildi.");
});

$("#contentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const lessonId = form.get("lesson_id");
  const type = form.get("type");
  if (type === "text") form.set("content", $("#richEditor").innerHTML);
  if (type === "link") form.set("content", form.get("link"));
  await api(`/api/lessons/${lessonId}/content`, { method: "POST", body: form, headers: {} });
  event.target.reset();
  event.target.order.value = "";
  $("#contentDialog").close();
  syncContentFields();
  await refresh("Kontent qo'shildi.");
});

$("#submissionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const lessonId = form.get("lesson_id");
  await api(`/api/lessons/${lessonId}/submissions`, { method: "POST", body: form, headers: {} });
  event.target.reset();
  $("#submissionDialog").close();
  await refresh("Topshiriq yuborildi.");
});

async function refresh(message) {
  await loadAll();
  renderShell();
  toast(message);
}

state.settingsTab = "profile";

applyTheme();
initPasswordToggles();
boot();
