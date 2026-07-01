const state = {
  token: localStorage.getItem("courseStudioToken"),
  user: null,
  dashboard: null,
  users: [],
  courses: [],
  tab: "dashboard",
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
  $("#loginView").classList.remove("hidden");
  $("#shellView").classList.add("hidden");
}

function renderShell() {
  $("#loginView").classList.add("hidden");
  $("#shellView").classList.remove("hidden");
  $("#roleLabel").textContent = `${state.user.name} · ${state.user.role}`;
  $("#userMeta").textContent = `${state.user.username} sifatida tizimga kirilgan`;
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
  $("#pageTitle").textContent = { dashboard: "Dashboard", users: "Foydalanuvchilar", courses: "Kurslar" }[state.tab];
  renderDashboard();
  renderUsers();
  renderCourses();
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
}

function renderUsers() {
  const node = $("#usersList");
  if (state.user.role === "student") return;
  if (!state.users.length) {
    node.innerHTML = `<section class="state">Foydalanuvchilar yo'q.</section>`;
    return;
  }
  node.innerHTML = state.users.map((user) => `
    <article class="list-row">
      <div>
        <h3>${escapeHtml(user.name)} <span class="badge">${escapeHtml(user.role)}</span></h3>
        <p>${escapeHtml(user.username)} · ID: ${escapeHtml(user.id)} ${user.teacher_id ? `· Teacher: ${escapeHtml(user.teacher_id)}` : ""}</p>
      </div>
      <div class="row-actions admin-only">
        <button class="secondary" data-user-edit="${user.id}">Tahrirlash</button>
        <button class="secondary" data-user-toggle="${user.id}" data-active="${!user.is_active}">${user.is_active ? "Faolsizlantirish" : "Faollashtirish"}</button>
        <button class="danger" data-user-delete="${user.id}">O'chirish</button>
      </div>
    </article>
  `).join("");
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
  return `
    <article class="course-card">
      <h3>${escapeHtml(course.title)}</h3>
      <p>${escapeHtml(course.description)}</p>
      <p class="muted">O'qituvchi: ${escapeHtml(course.teacher?.name || "Biriktirilmagan")} · ID: ${escapeHtml(course.id)}</p>
      ${state.user.role === "student" ? `<div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div><p class="muted">Progress: ${progress}%</p>` : ""}
      <div class="course-actions admin-teacher">
        <button class="secondary" data-edit-course="${course.id}">Tahrirlash</button>
        <button class="secondary" data-new-lesson="${course.id}">+ Dars</button>
        <button class="secondary" data-enroll="${course.id}">O'quvchi biriktirish</button>
        <button class="danger" data-delete-course="${course.id}">Kursni o'chirish</button>
      </div>
      <div class="lesson-list">
        ${course.lessons.length ? course.lessons.map((lesson) => lessonTemplate(lesson, course)).join("") : `<div class="state">Bu kursda dars yo'q.</div>`}
      </div>
    </article>
  `;
}

function lessonTemplate(lesson, course) {
  const done = course.enrollment?.completed_lessons?.includes(lesson.id);
  return `
    <section class="lesson">
      <div class="lesson-head">
        <h4>${lesson.order}. ${escapeHtml(lesson.title)}</h4>
        <div class="lesson-actions">
          <button class="secondary admin-teacher" data-edit-lesson="${lesson.id}">Tahrirlash</button>
          <button class="secondary admin-teacher" data-add-content="${lesson.id}">+ Kontent</button>
          <button class="danger admin-teacher" data-delete-lesson="${lesson.id}">O'chirish</button>
          <button class="secondary student-action" data-submit="${lesson.id}">Topshiriq</button>
          <label class="student-action badge"><input type="checkbox" data-progress="${lesson.id}" ${done ? "checked" : ""} /> O'qildi</label>
        </div>
      </div>
      <div class="content-list">${lesson.contents.map(contentTemplate).join("") || `<p class="muted">Kontent yo'q.</p>`}</div>
      ${lesson.submissions?.length ? `<div class="student-work"><strong>Topshiriqlar:</strong>${lesson.submissions.map((s) => `<p>${escapeHtml(s.content || "Fayl yuborilgan")} ${s.file_url ? `<a href="${s.file_url}" target="_blank">Fayl</a>` : ""} ${s.grade ? `<span class="badge">Baho: ${escapeHtml(s.grade)}</span>` : ""}</p>`).join("")}</div>` : ""}
    </section>
  `;
}

function contentTemplate(item) {
  if (item.type === "text") return `<article class="content-item">${item.content}</article>`;
  if (item.type === "link") {
    const youtube = youtubeEmbed(item.content);
    return `<article class="content-item">${youtube ? `<iframe src="${youtube}" allowfullscreen title="Video"></iframe>` : `<a href="${escapeHtml(item.content)}" target="_blank">${escapeHtml(item.content)}</a>`}</article>`;
  }
  return `<article class="content-item">${filePreview(item)}</article>`;
}

function filePreview(item) {
  const url = item.file_url;
  const mime = item.mime_type || "";
  if (mime.includes("pdf")) return `<iframe src="${url}" title="${escapeHtml(item.file_name)}"></iframe><p><a href="${url}" target="_blank">Yangi oynada ochish</a> · <a href="${url}" download>Yuklab olish</a></p>`;
  if (mime.startsWith("image/")) return `<img src="${url}" alt="${escapeHtml(item.file_name)}" /><p><a href="${url}" download>Yuklab olish</a></p>`;
  if (mime.startsWith("video/")) return `<video src="${url}" controls></video><p><a href="${url}" download>Yuklab olish</a></p>`;
  return `<p>${escapeHtml(item.file_name)}</p><a href="${url}" target="_blank">Yangi oynada ochish</a> · <a href="${url}" download>Yuklab olish</a>`;
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
  const target = event.target.closest("button, [data-close], [data-progress]");
  if (!target) return;
  try {
    if (target.matches("[data-close]")) target.closest("dialog").close();
    if (target.id === "newUserBtn") $("#userDialog").showModal();
    if (target.id === "newCourseBtn") $("#courseDialog").showModal();
    if (target.dataset.newLesson) {
      $("#lessonForm").course_id.value = target.dataset.newLesson;
      $("#lessonDialog").showModal();
    }
    if (target.dataset.addContent) {
      $("#contentForm").lesson_id.value = target.dataset.addContent;
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

$$("[data-command]").forEach((button) => button.addEventListener("click", () => document.execCommand(button.dataset.command)));
$("[data-heading]").addEventListener("click", () => document.execCommand("formatBlock", false, "h3"));

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

boot();
