const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

let PrismaClient;
try {
  ({ PrismaClient } = require("@prisma/client"));
} catch {
  PrismaClient = null;
}

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const runtimeDir = process.env.VERCEL ? path.join("/tmp", "course-studio") : __dirname;
const dataDir = path.join(runtimeDir, "data");
const uploadDir = path.join(runtimeDir, "uploads");
const envFile = path.join(root, ".env");

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || "dev-only-change-me";
const prisma = PrismaClient ? (globalThis.__courseStudioPrisma || new PrismaClient()) : null;

if (prisma && !globalThis.__courseStudioPrisma) {
  globalThis.__courseStudioPrisma = prisma;
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const roles = ["admin", "teacher", "student"];
const contentTypes = ["text", "link", "file"];

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, original] = stored.split(":");
  const candidate = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(original, "hex"));
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }));
  const sig = crypto.createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) return null;
  const expected = crypto.createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function seedDb() {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
  const adminId = id("usr");
  const teacherId = id("usr");
  const studentId = id("usr");
  const courseId = id("crs");
  const lessonId = id("les");
  return {
    users: [
      { id: adminId, name: "Platform Admin", username: process.env.ADMIN_USERNAME || "admin", password_hash: hashPassword(adminPassword), role: "admin", created_by: null, teacher_id: null, is_active: true, created_at: now() },
      { id: teacherId, name: "Demo O'qituvchi", username: "teacher", password_hash: hashPassword("teacher123"), role: "teacher", created_by: adminId, teacher_id: null, is_active: true, created_at: now() },
      { id: studentId, name: "Demo O'quvchi", username: "student", password_hash: hashPassword("student123"), role: "student", created_by: adminId, teacher_id: teacherId, is_active: true, created_at: now() }
    ],
    courses: [{ id: courseId, title: "Frontend asoslari", description: "HTML, CSS va JavaScript bo'yicha amaliy kurs.", teacher_id: teacherId, created_at: now() }],
    lessons: [{ id: lessonId, course_id: courseId, title: "HTML tuzilmasi", order: 1, created_at: now() }],
    lesson_content: [{ id: id("cnt"), lesson_id: lessonId, type: "text", content: "<h2>HTML skeleti</h2><p>Semantik teglar bilan oddiy sahifa tuzing.</p>", file_url: null, file_name: null, mime_type: null, created_at: now() }],
    enrollments: [{ id: id("enr"), course_id: courseId, student_id: studentId, progress: 0, completed_lessons: [], created_at: now() }],
    submissions: [],
    audit_logs: []
  };
}

function toDate(value) {
  return value ? new Date(value) : null;
}

function mapUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    password_hash: user.passwordHash,
    role: user.role,
    created_by: user.createdBy,
    teacher_id: user.teacherId,
    is_active: user.isActive,
    created_at: user.createdAt.toISOString()
  };
}

function mapCourse(course) {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    teacher_id: course.teacherId,
    created_at: course.createdAt.toISOString()
  };
}

function mapLesson(lesson) {
  return {
    id: lesson.id,
    course_id: lesson.courseId,
    title: lesson.title,
    order: lesson.order,
    created_at: lesson.createdAt.toISOString()
  };
}

function mapLessonContent(content) {
  return {
    id: content.id,
    lesson_id: content.lessonId,
    type: content.type,
    content: content.content,
    file_url: content.fileUrl,
    file_name: content.fileName,
    mime_type: content.mimeType,
    created_at: content.createdAt.toISOString()
  };
}

function mapEnrollment(enrollment) {
  return {
    id: enrollment.id,
    course_id: enrollment.courseId,
    student_id: enrollment.studentId,
    progress: enrollment.progress,
    completed_lessons: enrollment.completedLessons || [],
    created_at: enrollment.createdAt.toISOString()
  };
}

function mapSubmission(submission) {
  return {
    id: submission.id,
    lesson_id: submission.lessonId,
    student_id: submission.studentId,
    content: submission.content,
    file_url: submission.fileUrl,
    grade: submission.grade,
    created_at: submission.createdAt.toISOString()
  };
}

function mapAuditLog(log) {
  return {
    id: log.id,
    actor_id: log.actorId,
    action: log.action,
    entity: log.entity,
    entity_id: log.entityId,
    details: log.details || {},
    created_at: log.createdAt.toISOString()
  };
}

function dbToPrisma(dbState) {
  return {
    users: dbState.users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      passwordHash: user.password_hash,
      role: user.role,
      createdBy: user.created_by,
      teacherId: user.teacher_id,
      isActive: user.is_active,
      createdAt: toDate(user.created_at) || new Date()
    })),
    courses: dbState.courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      teacherId: course.teacher_id,
      createdAt: toDate(course.created_at) || new Date()
    })),
    lessons: dbState.lessons.map((lesson) => ({
      id: lesson.id,
      courseId: lesson.course_id,
      title: lesson.title,
      order: lesson.order,
      createdAt: toDate(lesson.created_at) || new Date()
    })),
    lessonContents: dbState.lesson_content.map((content) => ({
      id: content.id,
      lessonId: content.lesson_id,
      type: content.type,
      content: content.content,
      fileUrl: content.file_url,
      fileName: content.file_name,
      mimeType: content.mime_type,
      createdAt: toDate(content.created_at) || new Date()
    })),
    enrollments: dbState.enrollments.map((enrollment) => ({
      id: enrollment.id,
      courseId: enrollment.course_id,
      studentId: enrollment.student_id,
      progress: enrollment.progress,
      completedLessons: enrollment.completed_lessons || [],
      createdAt: toDate(enrollment.created_at) || new Date()
    })),
    submissions: dbState.submissions.map((submission) => ({
      id: submission.id,
      lessonId: submission.lesson_id,
      studentId: submission.student_id,
      content: submission.content,
      fileUrl: submission.file_url,
      grade: submission.grade,
      createdAt: toDate(submission.created_at) || new Date()
    })),
    auditLogs: dbState.audit_logs.map((log) => ({
      id: log.id,
      actorId: log.actor_id,
      action: log.action,
      entity: log.entity,
      entityId: log.entity_id,
      details: log.details || {},
      createdAt: toDate(log.created_at) || new Date()
    }))
  };
}

async function loadDb() {
  if (!prisma) {
    throw new Error("Prisma client topilmadi. `npm install` ni bajaring.");
  }

  const userCount = await prisma.user.count();
  if (!userCount) {
    db = seedDb();
    await saveDb();
    return db;
  }

  const [users, courses, lessons, lessonContents, enrollments, submissions, auditLogs] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.course.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.lesson.findMany({ orderBy: [{ courseId: "asc" }, { order: "asc" }] }),
    prisma.lessonContent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.enrollment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.submission.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } })
  ]);

  return {
    users: users.map(mapUser),
    courses: courses.map(mapCourse),
    lessons: lessons.map(mapLesson),
    lesson_content: lessonContents.map(mapLessonContent),
    enrollments: enrollments.map(mapEnrollment),
    submissions: submissions.map(mapSubmission),
    audit_logs: auditLogs.map(mapAuditLog)
  };
}

let db = null;

async function saveDb() {
  if (!prisma) {
    throw new Error("Prisma client topilmadi. `npm install` ni bajaring.");
  }

  const snapshot = dbToPrisma(db);
  await prisma.$transaction([
    prisma.submission.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.lessonContent.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.course.deleteMany(),
    prisma.user.deleteMany()
  ]);

  if (snapshot.users.length) await prisma.user.createMany({ data: snapshot.users });
  if (snapshot.courses.length) await prisma.course.createMany({ data: snapshot.courses });
  if (snapshot.lessons.length) await prisma.lesson.createMany({ data: snapshot.lessons });
  if (snapshot.lessonContents.length) await prisma.lessonContent.createMany({ data: snapshot.lessonContents });
  if (snapshot.enrollments.length) await prisma.enrollment.createMany({ data: snapshot.enrollments });
  if (snapshot.submissions.length) await prisma.submission.createMany({ data: snapshot.submissions });
  if (snapshot.auditLogs.length) await prisma.auditLog.createMany({ data: snapshot.auditLogs });
}

function audit(actor, action, entity, entityId, details = {}) {
  db.audit_logs.unshift({ id: id("aud"), actor_id: actor?.id || null, action, entity, entity_id: entityId, details, created_at: now() });
  db.audit_logs = db.audit_logs.slice(0, 200);
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

function send(res, status, data, headers = {}) {
  const body = data === null ? "" : JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(body);
}

function fail(res, status, message) {
  send(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function requireAuth(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = token ? verifyJwt(token) : null;
  if (!payload) {
    fail(res, 401, "Login talab qilinadi.");
    return null;
  }
  const user = db.users.find((item) => item.id === payload.sub && item.is_active);
  if (!user) {
    fail(res, 401, "Foydalanuvchi topilmadi yoki faolsiz.");
    return null;
  }
  return user;
}

function requireRole(res, user, allowed) {
  if (!allowed.includes(user.role)) {
    fail(res, 403, "Bu amal uchun ruxsat yo'q.");
    return false;
  }
  return true;
}

function canManageCourse(user, course) {
  return user.role === "admin" || (user.role === "teacher" && course.teacher_id === user.id);
}

function visibleCourses(user) {
  if (user.role === "admin") return db.courses;
  if (user.role === "teacher") return db.courses.filter((course) => course.teacher_id === user.id);
  const allowed = new Set(db.enrollments.filter((item) => item.student_id === user.id).map((item) => item.course_id));
  return db.courses.filter((course) => allowed.has(course.id));
}

function hydrateCourse(course, user) {
  const lessons = db.lessons
    .filter((lesson) => lesson.course_id === course.id)
    .sort((a, b) => a.order - b.order)
    .map((lesson) => ({
      ...lesson,
      contents: db.lesson_content.filter((content) => content.lesson_id === lesson.id),
      submissions: user.role === "student" ? db.submissions.filter((item) => item.lesson_id === lesson.id && item.student_id === user.id) : db.submissions.filter((item) => item.lesson_id === lesson.id)
    }));
  const enrollment = user.role === "student" ? db.enrollments.find((item) => item.course_id === course.id && item.student_id === user.id) : null;
  return { ...course, teacher: publicUser(db.users.find((item) => item.id === course.teacher_id)), lessons, enrollment };
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) return { fields: {}, files: [] };
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const fields = {};
  const files = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    start += boundary.length + 2;
    const end = buffer.indexOf(boundary, start);
    if (end === -1) break;
    const part = buffer.subarray(start, end - 2);
    const sep = part.indexOf(Buffer.from("\r\n\r\n"));
    if (sep === -1) {
      start = end;
      continue;
    }
    const rawHeaders = part.subarray(0, sep).toString("utf8");
    const data = part.subarray(sep + 4);
    const name = /name="([^"]+)"/.exec(rawHeaders)?.[1];
    const filename = /filename="([^"]*)"/.exec(rawHeaders)?.[1];
    const mime = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1] || "application/octet-stream";
    if (name && filename) files.push({ field: name, filename: path.basename(filename), mime, data });
    else if (name) fields[name] = data.toString("utf8");
    start = end;
  }
  return { fields, files };
}

function sanitize(input = "") {
  return String(input).replace(/[<>]/g, "").trim();
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return fail(res, 403, "Forbidden");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return fail(res, 404, "Topilmadi");
  const ext = path.extname(filePath).toLowerCase();
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

async function api(req, res, pathname, method) {
  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await readJson(req);
    const user = db.users.find((item) => item.username === body.username);
    if (!user || !user.is_active || !verifyPassword(body.password || "", user.password_hash)) return fail(res, 401, "Login yoki parol noto'g'ri.");
    return send(res, 200, { token: signJwt({ sub: user.id, role: user.role }), user: publicUser(user) });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (pathname === "/api/auth/me" && method === "GET") return send(res, 200, { user: publicUser(user) });

  if (pathname === "/api/dashboard" && method === "GET") {
    const courses = visibleCourses(user);
    return send(res, 200, {
      stats: {
        teachers: db.users.filter((item) => item.role === "teacher" && item.is_active).length,
        students: db.users.filter((item) => item.role === "student" && item.is_active).length,
        courses: courses.length,
        lessons: db.lessons.filter((lesson) => courses.some((course) => course.id === lesson.course_id)).length
      },
      audit: user.role === "admin" ? db.audit_logs.slice(0, 20) : []
    });
  }

  if (pathname === "/api/users" && method === "GET") {
    if (!requireRole(res, user, ["admin", "teacher"])) return;
    let users = db.users;
    if (user.role === "teacher") users = users.filter((item) => item.role === "student" && item.teacher_id === user.id);
    return send(res, 200, { users: users.map(publicUser) });
  }

  if (pathname === "/api/users" && method === "POST") {
    if (!requireRole(res, user, ["admin"])) return;
    const body = await readJson(req);
    if (!roles.includes(body.role) || body.role === "admin") return fail(res, 400, "Faqat teacher yoki student yaratiladi.");
    if (!body.username || db.users.some((item) => item.username === body.username)) return fail(res, 400, "Username band yoki bo'sh.");
    const password = body.password || crypto.randomBytes(5).toString("base64url");
    const created = { id: id("usr"), name: sanitize(body.name), username: sanitize(body.username), password_hash: hashPassword(password), role: body.role, created_by: user.id, teacher_id: body.role === "student" ? body.teacher_id || null : null, is_active: true, created_at: now() };
    db.users.push(created);
    audit(user, "create", "user", created.id, { username: created.username, role: created.role });
    saveDb();
    return send(res, 201, { user: publicUser(created), password });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && ["PATCH", "DELETE"].includes(method)) {
    if (!requireRole(res, user, ["admin"])) return;
    const target = db.users.find((item) => item.id === userMatch[1]);
    if (!target || target.role === "admin") return fail(res, 404, "Foydalanuvchi topilmadi.");
    if (method === "DELETE") db.users = db.users.filter((item) => item.id !== target.id);
    else {
      const body = await readJson(req);
      target.name = sanitize(body.name ?? target.name);
      target.is_active = body.is_active ?? target.is_active;
      target.teacher_id = body.teacher_id ?? target.teacher_id;
      if (body.password) target.password_hash = hashPassword(body.password);
    }
    audit(user, method === "DELETE" ? "delete" : "update", "user", target.id);
    saveDb();
    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/courses" && method === "GET") return send(res, 200, { courses: visibleCourses(user).map((course) => hydrateCourse(course, user)) });

  if (pathname === "/api/courses" && method === "POST") {
    if (!requireRole(res, user, ["admin", "teacher"])) return;
    const body = await readJson(req);
    const teacherId = user.role === "teacher" ? user.id : body.teacher_id;
    if (!db.users.some((item) => item.id === teacherId && item.role === "teacher")) return fail(res, 400, "O'qituvchi tanlang.");
    const course = { id: id("crs"), title: sanitize(body.title), description: sanitize(body.description), teacher_id: teacherId, created_at: now() };
    db.courses.push(course);
    audit(user, "create", "course", course.id);
    saveDb();
    return send(res, 201, { course: hydrateCourse(course, user) });
  }

  const courseMatch = pathname.match(/^\/api\/courses\/([^/]+)$/);
  if (courseMatch && ["PATCH", "DELETE"].includes(method)) {
    const course = db.courses.find((item) => item.id === courseMatch[1]);
    if (!course || !canManageCourse(user, course)) return fail(res, 404, "Kurs topilmadi.");
    if (method === "DELETE") {
      db.courses = db.courses.filter((item) => item.id !== course.id);
      const lessonIds = db.lessons.filter((item) => item.course_id === course.id).map((item) => item.id);
      db.lessons = db.lessons.filter((item) => item.course_id !== course.id);
      db.lesson_content = db.lesson_content.filter((item) => !lessonIds.includes(item.lesson_id));
      db.enrollments = db.enrollments.filter((item) => item.course_id !== course.id);
    } else {
      const body = await readJson(req);
      course.title = sanitize(body.title ?? course.title);
      course.description = sanitize(body.description ?? course.description);
      if (user.role === "admin" && body.teacher_id) course.teacher_id = body.teacher_id;
    }
    audit(user, method === "DELETE" ? "delete" : "update", "course", course.id);
    saveDb();
    return send(res, 200, { ok: true });
  }

  const lessonsMatch = pathname.match(/^\/api\/courses\/([^/]+)\/lessons$/);
  if (lessonsMatch && method === "POST") {
    const course = db.courses.find((item) => item.id === lessonsMatch[1]);
    if (!course || !canManageCourse(user, course)) return fail(res, 404, "Kurs topilmadi.");
    const body = await readJson(req);
    const order = db.lessons.filter((item) => item.course_id === course.id).length + 1;
    const lesson = { id: id("les"), course_id: course.id, title: sanitize(body.title), order, created_at: now() };
    db.lessons.push(lesson);
    audit(user, "create", "lesson", lesson.id);
    saveDb();
    return send(res, 201, { lesson });
  }

  const lessonMatch = pathname.match(/^\/api\/lessons\/([^/]+)$/);
  if (lessonMatch && ["PATCH", "DELETE"].includes(method)) {
    const lesson = db.lessons.find((item) => item.id === lessonMatch[1]);
    const course = lesson && db.courses.find((item) => item.id === lesson.course_id);
    if (!lesson || !course || !canManageCourse(user, course)) return fail(res, 404, "Dars topilmadi.");
    if (method === "DELETE") {
      db.lessons = db.lessons.filter((item) => item.id !== lesson.id);
      db.lesson_content = db.lesson_content.filter((item) => item.lesson_id !== lesson.id);
    } else {
      const body = await readJson(req);
      lesson.title = sanitize(body.title ?? lesson.title);
      lesson.order = Number(body.order ?? lesson.order);
    }
    audit(user, method === "DELETE" ? "delete" : "update", "lesson", lesson.id);
    saveDb();
    return send(res, 200, { ok: true });
  }

  const contentMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/content$/);
  if (contentMatch && method === "POST") {
    const lesson = db.lessons.find((item) => item.id === contentMatch[1]);
    const course = lesson && db.courses.find((item) => item.id === lesson.course_id);
    if (!lesson || !course || !canManageCourse(user, course)) return fail(res, 404, "Dars topilmadi.");
    const contentType = req.headers["content-type"] || "";
    let fields = {};
    let files = [];
    if (contentType.includes("multipart/form-data")) ({ fields, files } = parseMultipart(await readBody(req), contentType));
    else fields = await readJson(req);
    const type = fields.type;
    if (!contentTypes.includes(type)) return fail(res, 400, "Content turi noto'g'ri.");
    let record = { id: id("cnt"), lesson_id: lesson.id, type, content: fields.content || "", file_url: null, file_name: null, mime_type: null, created_at: now() };
    if (type === "file") {
      const file = files[0];
      if (!file) return fail(res, 400, "Fayl tanlanmagan.");
      const fileId = id("file");
      const storedName = `${fileId}_${file.filename}`;
      fs.writeFileSync(path.join(uploadDir, storedName), file.data);
      record = { ...record, content: fields.content || "", file_url: `/uploads/${storedName}`, file_name: file.filename, mime_type: file.mime };
    }
    db.lesson_content.push(record);
    audit(user, "create", "lesson_content", record.id, { type });
    saveDb();
    return send(res, 201, { content: record });
  }

  const enrollMatch = pathname.match(/^\/api\/courses\/([^/]+)\/enrollments$/);
  if (enrollMatch && method === "POST") {
    if (!requireRole(res, user, ["admin", "teacher"])) return;
    const course = db.courses.find((item) => item.id === enrollMatch[1]);
    if (!course || !canManageCourse(user, course)) return fail(res, 404, "Kurs topilmadi.");
    const body = await readJson(req);
    const student = db.users.find((item) => item.id === body.student_id && item.role === "student");
    if (!student || (user.role === "teacher" && student.teacher_id !== user.id)) return fail(res, 400, "O'quvchi tanlang.");
    if (!db.enrollments.some((item) => item.course_id === course.id && item.student_id === student.id)) {
      db.enrollments.push({ id: id("enr"), course_id: course.id, student_id: student.id, progress: 0, completed_lessons: [], created_at: now() });
    }
    audit(user, "enroll", "course", course.id, { student_id: student.id });
    saveDb();
    return send(res, 200, { ok: true });
  }

  const progressMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/progress$/);
  if (progressMatch && method === "POST") {
    if (!requireRole(res, user, ["student"])) return;
    const lesson = db.lessons.find((item) => item.id === progressMatch[1]);
    if (!lesson) return fail(res, 404, "Dars topilmadi.");
    const enrollment = db.enrollments.find((item) => item.course_id === lesson.course_id && item.student_id === user.id);
    if (!enrollment) return fail(res, 403, "Kurs sizga ochilmagan.");
    const body = await readJson(req);
    const done = Boolean(body.done);
    const set = new Set(enrollment.completed_lessons || []);
    if (done) set.add(lesson.id);
    else set.delete(lesson.id);
    enrollment.completed_lessons = [...set];
    const total = db.lessons.filter((item) => item.course_id === lesson.course_id).length || 1;
    enrollment.progress = Math.round((enrollment.completed_lessons.length / total) * 100);
    saveDb();
    return send(res, 200, { enrollment });
  }

  const submitMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/submissions$/);
  if (submitMatch && method === "POST") {
    if (!requireRole(res, user, ["student"])) return;
    const lesson = db.lessons.find((item) => item.id === submitMatch[1]);
    if (!lesson || !db.enrollments.some((item) => item.course_id === lesson.course_id && item.student_id === user.id)) return fail(res, 403, "Dars sizga ochilmagan.");
    const contentType = req.headers["content-type"] || "";
    let fields = {};
    let files = [];
    if (contentType.includes("multipart/form-data")) ({ fields, files } = parseMultipart(await readBody(req), contentType));
    else fields = await readJson(req);
    let file_url = null;
    if (files[0]) {
      const storedName = `${id("subfile")}_${files[0].filename}`;
      fs.writeFileSync(path.join(uploadDir, storedName), files[0].data);
      file_url = `/uploads/${storedName}`;
    }
    const submission = { id: id("sub"), lesson_id: lesson.id, student_id: user.id, content: fields.content || "", file_url, grade: null, created_at: now() };
    db.submissions.push(submission);
    saveDb();
    return send(res, 201, { submission });
  }

  const gradeMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/grade$/);
  if (gradeMatch && method === "POST") {
    if (!requireRole(res, user, ["admin", "teacher"])) return;
    const submission = db.submissions.find((item) => item.id === gradeMatch[1]);
    const lesson = submission && db.lessons.find((item) => item.id === submission.lesson_id);
    const course = lesson && db.courses.find((item) => item.id === lesson.course_id);
    if (!submission || !course || !canManageCourse(user, course)) return fail(res, 404, "Topshiriq topilmadi.");
    const body = await readJson(req);
    submission.grade = sanitize(body.grade || "");
    saveDb();
    return send(res, 200, { submission });
  }

  fail(res, 404, "API endpoint topilmadi.");
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) return api(req, res, pathname, req.method);
    if (pathname.startsWith("/uploads/")) {
      const filePath = path.normalize(path.join(uploadDir, pathname.replace("/uploads/", "")));
      if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) return fail(res, 404, "Fayl topilmadi.");
      res.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": "inline" });
      return fs.createReadStream(filePath).pipe(res);
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    fail(res, 500, "Server xatosi.");
  }
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Course Studio running at http://localhost:${port}`);
  });
}

module.exports = { handleRequest };
