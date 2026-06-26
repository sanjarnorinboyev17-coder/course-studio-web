const storageKey = "course_studio_html_v1";

const sampleData = {
  activeCourseId: "course-1",
  adminMode: true,
  courses: [
    {
      id: "course-1",
      title: "Frontend asoslari",
      description: "HTML, CSS va JavaScript bo'yicha amaliy kurs.",
      lessons: [
        {
          id: "lesson-1",
          title: "HTML tuzilmasi",
          description: "Sahifa skeleti, semantik teglar va matn bloklari.",
          note: "Darsdan keyin oddiy portfolio sahifasini yarating.",
          youtubeUrl: "https://www.youtube.com/watch?v=UB1O30fR-EE",
          files: [],
          read: false,
        },
      ],
    },
  ],
};

let state = loadState();
let editingCourseId = null;
let editingLessonId = null;
let draftFiles = [];

const els = {
  body: document.body,
  modeToggle: document.querySelector("#modeToggle"),
  themeToggle: document.querySelector("#themeToggle"),
  exportBtn: document.querySelector("#exportBtn"),
  searchInput: document.querySelector("#searchInput"),
  newCourseBtn: document.querySelector("#newCourseBtn"),
  courseList: document.querySelector("#courseList"),
  emptyState: document.querySelector("#emptyState"),
  coursePanel: document.querySelector("#coursePanel"),
  activeModeLabel: document.querySelector("#activeModeLabel"),
  courseTitle: document.querySelector("#courseTitle"),
  courseDescription: document.querySelector("#courseDescription"),
  editCourseBtn: document.querySelector("#editCourseBtn"),
  deleteCourseBtn: document.querySelector("#deleteCourseBtn"),
  newLessonBtn: document.querySelector("#newLessonBtn"),
  lessonList: document.querySelector("#lessonList"),
  courseDialog: document.querySelector("#courseDialog"),
  courseForm: document.querySelector("#courseForm"),
  courseDialogTitle: document.querySelector("#courseDialogTitle"),
  courseNameInput: document.querySelector("#courseNameInput"),
  courseDescInput: document.querySelector("#courseDescInput"),
  lessonDialog: document.querySelector("#lessonDialog"),
  lessonForm: document.querySelector("#lessonForm"),
  lessonDialogTitle: document.querySelector("#lessonDialogTitle"),
  lessonTitleInput: document.querySelector("#lessonTitleInput"),
  lessonYoutubeInput: document.querySelector("#lessonYoutubeInput"),
  lessonDescInput: document.querySelector("#lessonDescInput"),
  lessonNoteInput: document.querySelector("#lessonNoteInput"),
  lessonFilesInput: document.querySelector("#lessonFilesInput"),
  attachedFiles: document.querySelector("#attachedFiles"),
  toast: document.querySelector("#toast"),
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  return saved ? JSON.parse(saved) : structuredClone(sampleData);
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeCourse() {
  return state.courses.find((course) => course.id === state.activeCourseId) || null;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function youtubeId(url) {
  if (!url.trim()) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
  return "";
}

function render() {
  saveState();
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = state.courses.filter((course) => {
    const lessonMatch = course.lessons.some((lesson) =>
      `${lesson.title} ${lesson.description}`.toLowerCase().includes(query),
    );
    return `${course.title} ${course.description}`.toLowerCase().includes(query) || lessonMatch;
  });

  els.body.classList.toggle("dark", localStorage.getItem("theme") === "dark");
  els.modeToggle.textContent = state.adminMode ? "🛠" : "🎓";
  els.activeModeLabel.textContent = state.adminMode ? "Admin rejimi" : "O'quvchi rejimi";
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !state.adminMode);
  });

  renderCourses(filtered);
  renderActiveCourse();
}

function renderCourses(courses) {
  els.courseList.innerHTML = "";
  if (!courses.length) {
    els.courseList.innerHTML = `<div class="course-card"><h3>Kurs topilmadi</h3><p>Qidiruvni o'zgartiring yoki yangi kurs yarating.</p></div>`;
    return;
  }

  courses.forEach((course) => {
    const card = document.createElement("button");
    card.className = `course-card ${course.id === state.activeCourseId ? "active" : ""}`;
    card.innerHTML = `
      <h3>${escapeHtml(course.title)}</h3>
      <p>${escapeHtml(course.description)}</p>
      <p>${course.lessons.length} ta mavzu</p>
    `;
    card.addEventListener("click", () => {
      state.activeCourseId = course.id;
      render();
    });
    els.courseList.append(card);
  });
}

function renderActiveCourse() {
  const course = activeCourse();
  els.emptyState.classList.toggle("hidden", Boolean(course));
  els.coursePanel.classList.toggle("hidden", !course);
  if (!course) return;

  els.courseTitle.textContent = course.title;
  els.courseDescription.textContent = course.description;
  els.lessonList.innerHTML = "";

  if (!course.lessons.length) {
    els.lessonList.innerHTML = `<section class="empty-state"><h2>Mavzular yo'q</h2><p>Admin rejimida birinchi dars mavzusini qo'shing.</p></section>`;
    return;
  }

  course.lessons.forEach((lesson, index) => {
    const card = document.createElement("article");
    card.className = "lesson-card";
    card.draggable = state.adminMode;
    card.dataset.lessonId = lesson.id;
    const id = youtubeId(lesson.youtubeUrl || "");
    card.innerHTML = `
      <div class="lesson-top">
        <button class="drag-handle admin-only" title="Tartibni o'zgartirish">⋮⋮</button>
        <div>
          <div class="lesson-title-row">
            <input class="read-check" type="checkbox" ${lesson.read ? "checked" : ""} ${state.adminMode ? "disabled" : ""} />
            <h3>${index + 1}. ${escapeHtml(lesson.title)}</h3>
          </div>
          <p class="lesson-meta">${escapeHtml(lesson.description)}</p>
        </div>
        <div class="actions admin-only">
          <button class="secondary edit-lesson">Tahrirlash</button>
          <button class="danger delete-lesson">O'chirish</button>
        </div>
      </div>
      <div class="lesson-body">
        ${lesson.note ? `<p>${escapeHtml(lesson.note)}</p>` : ""}
        ${id ? `<iframe class="video-frame" src="https://www.youtube.com/embed/${id}" allowfullscreen title="${escapeHtml(lesson.title)}"></iframe>` : ""}
        ${lesson.files.map(fileTemplate).join("")}
      </div>
    `;

    card.querySelector(".read-check").addEventListener("change", (event) => {
      lesson.read = event.target.checked;
      render();
    });
    card.querySelector(".edit-lesson")?.addEventListener("click", () => openLessonDialog(lesson.id));
    card.querySelector(".delete-lesson")?.addEventListener("click", () => deleteLesson(lesson.id));
    attachDragHandlers(card);
    els.lessonList.append(card);
  });

  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !state.adminMode);
  });
}

function fileTemplate(file) {
  return `
    <div class="file-row">
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.type || "fayl")} · ${Math.ceil(file.size / 1024)} KB</span>
      </div>
      <a href="${file.url}" download="${escapeHtml(file.name)}" target="_blank">Ochish</a>
    </div>
  `;
}

function openCourseDialog(courseId = null) {
  editingCourseId = courseId;
  const course = state.courses.find((item) => item.id === courseId);
  els.courseDialogTitle.textContent = course ? "Kursni tahrirlash" : "Yangi kurs";
  els.courseNameInput.value = course?.title || "";
  els.courseDescInput.value = course?.description || "";
  els.courseDialog.showModal();
}

function openLessonDialog(lessonId = null) {
  const course = activeCourse();
  if (!course) return;
  editingLessonId = lessonId;
  const lesson = course.lessons.find((item) => item.id === lessonId);
  draftFiles = lesson ? structuredClone(lesson.files) : [];
  els.lessonDialogTitle.textContent = lesson ? "Mavzuni tahrirlash" : "Yangi mavzu";
  els.lessonTitleInput.value = lesson?.title || "";
  els.lessonYoutubeInput.value = lesson?.youtubeUrl || "";
  els.lessonDescInput.value = lesson?.description || "";
  els.lessonNoteInput.value = lesson?.note || "";
  els.lessonFilesInput.value = "";
  renderDraftFiles();
  els.lessonDialog.showModal();
}

function renderDraftFiles() {
  els.attachedFiles.innerHTML = draftFiles
    .map(
      (file, index) => `
      <div class="file-row">
        <div><strong>${escapeHtml(file.name)}</strong><span>${Math.ceil(file.size / 1024)} KB</span></div>
        <button type="button" class="danger" data-remove-file="${index}">O'chirish</button>
      </div>
    `,
    )
    .join("");
  els.attachedFiles.querySelectorAll("[data-remove-file]").forEach((button) => {
    button.addEventListener("click", () => {
      draftFiles.splice(Number(button.dataset.removeFile), 1);
      renderDraftFiles();
    });
  });
}

function deleteLesson(lessonId) {
  const course = activeCourse();
  if (!course || !confirm("Mavzu o'chirilsinmi?")) return;
  course.lessons = course.lessons.filter((lesson) => lesson.id !== lessonId);
  render();
  toast("Mavzu o'chirildi");
}

function attachDragHandlers(card) {
  card.addEventListener("dragstart", () => card.classList.add("dragging"));
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    syncLessonOrderFromDom();
  });
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging || dragging === card) return;
    const box = card.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    els.lessonList.insertBefore(dragging, after ? card.nextSibling : card);
  });
}

function syncLessonOrderFromDom() {
  const course = activeCourse();
  if (!course) return;
  const ids = [...els.lessonList.querySelectorAll(".lesson-card")].map((node) => node.dataset.lessonId);
  course.lessons = ids.map((id) => course.lessons.find((lesson) => lesson.id === id)).filter(Boolean);
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.newCourseBtn.addEventListener("click", () => openCourseDialog());
els.editCourseBtn.addEventListener("click", () => openCourseDialog(state.activeCourseId));
els.newLessonBtn.addEventListener("click", () => openLessonDialog());
els.searchInput.addEventListener("input", render);

els.deleteCourseBtn.addEventListener("click", () => {
  const course = activeCourse();
  if (!course || !confirm("Kurs o'chirilsinmi?")) return;
  state.courses = state.courses.filter((item) => item.id !== course.id);
  state.activeCourseId = state.courses[0]?.id || null;
  render();
  toast("Kurs o'chirildi");
});

els.modeToggle.addEventListener("click", () => {
  state.adminMode = !state.adminMode;
  render();
});

els.themeToggle.addEventListener("click", () => {
  const next = localStorage.getItem("theme") === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  render();
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "course-studio-data.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
});

els.courseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = els.courseNameInput.value.trim();
  const description = els.courseDescInput.value.trim();
  if (!title || !description) return toast("Kurs nomi va tavsifini kiriting");

  if (editingCourseId) {
    const course = state.courses.find((item) => item.id === editingCourseId);
    course.title = title;
    course.description = description;
  } else {
    const course = { id: uid("course"), title, description, lessons: [] };
    state.courses.unshift(course);
    state.activeCourseId = course.id;
  }
  els.courseDialog.close();
  render();
  toast("Kurs saqlandi");
});

els.lessonFilesInput.addEventListener("change", () => {
  [...els.lessonFilesInput.files].forEach((file) => {
    draftFiles.push({
      id: uid("file"),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      url: URL.createObjectURL(file),
    });
  });
  renderDraftFiles();
});

els.lessonForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const course = activeCourse();
  if (!course) return;

  const youtubeUrl = els.lessonYoutubeInput.value.trim();
  if (youtubeUrl && !youtubeId(youtubeUrl)) {
    toast("To'g'ri YouTube link kiriting");
    return;
  }

  const payload = {
    title: els.lessonTitleInput.value.trim(),
    description: els.lessonDescInput.value.trim(),
    note: els.lessonNoteInput.value.trim(),
    youtubeUrl,
    files: draftFiles,
  };

  if (!payload.title || !payload.description) {
    toast("Mavzu nomi va tavsifini kiriting");
    return;
  }

  if (editingLessonId) {
    const lesson = course.lessons.find((item) => item.id === editingLessonId);
    Object.assign(lesson, payload);
  } else {
    course.lessons.push({ id: uid("lesson"), read: false, ...payload });
  }

  els.lessonDialog.close();
  render();
  toast("Mavzu saqlandi");
});

render();
