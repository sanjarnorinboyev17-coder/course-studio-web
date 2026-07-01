const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { Pool } = require("pg");

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
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
      { id: adminId, name: "Platform Admin", username: process.env.ADMIN_USERNAME || "admin", password_hash: hashPassword(adminPassword), role: "admin", created_by: null, teacher_id: null, is_active: true, avatar_url: null, phone: "", telegram_notify: true, sms_notify: true, email_notify: true, created_at: now() },
      { id: teacherId, name: "Demo O'qituvchi", username: "teacher", password_hash: hashPassword("teacher123"), role: "teacher", created_by: adminId, teacher_id: null, is_active: true, avatar_url: null, phone: "", telegram_notify: true, sms_notify: true, email_notify: true, created_at: now() },
      { id: studentId, name: "Demo O'quvchi", username: "student", password_hash: hashPassword("student123"), role: "student", created_by: adminId, teacher_id: teacherId, is_active: true, avatar_url: null, phone: "", telegram_notify: true, sms_notify: true, email_notify: true, created_at: now() }
    ],
    courses: [{ id: courseId, title: "Frontend asoslari", description: "HTML, CSS va JavaScript bo'yicha amaliy kurs.", teacher_id: teacherId, created_at: now() }],
    lessons: [{ id: lessonId, course_id: courseId, title: "HTML tuzilmasi", order: 1, created_at: now() }],
    lesson_content: [{ id: id("cnt"), lesson_id: lessonId, type: "text", content: "<h2>HTML skeleti</h2><p>Semantik teglar bilan oddiy sahifa tuzing.</p>", file_url: null, file_name: null, mime_type: null, order: 1, created_at: now() }],
    enrollments: [{ id: id("enr"), course_id: courseId, student_id: studentId, progress: 0, completed_lessons: [], created_at: now() }],
    submissions: [],
    ratings: [],
    audit_logs: []
  };
}

function ensureSeedUsers(dbState) {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
  const admin = dbState.users.find((item) => item.username === (process.env.ADMIN_USERNAME || "admin")) || dbState.users.find((item) => item.role === "admin");
  if (admin) {
    admin.name = admin.name || "Platform Admin";
    admin.role = "admin";
    admin.is_active = true;
    admin.password_hash = admin.password_hash || hashPassword(adminPassword);
    admin.phone = admin.phone || "";
    admin.telegram_notify ??= true;
    admin.sms_notify ??= true;
    admin.email_notify ??= true;
  } else {
    dbState.users.unshift({ id: id("usr"), name: "Platform Admin", username: process.env.ADMIN_USERNAME || "admin", password_hash: hashPassword(adminPassword), role: "admin", created_by: null, teacher_id: null, is_active: true, avatar_url: null, phone: "", telegram_notify: true, sms_notify: true, email_notify: true, created_at: now() });
  }

  const teacher = dbState.users.find((item) => item.username === "teacher");
  if (teacher) {
    teacher.name = teacher.name || "Demo O'qituvchi";
    teacher.role = "teacher";
    teacher.is_active = true;
    teacher.password_hash = teacher.password_hash || hashPassword("teacher123");
    teacher.phone = teacher.phone || "";
    teacher.telegram_notify ??= true;
    teacher.sms_notify ??= true;
    teacher.email_notify ??= true;
  } else {
    dbState.users.push({ id: id("usr"), name: "Demo O'qituvchi", username: "teacher", password_hash: hashPassword("teacher123"), role: "teacher", created_by: admin?.id || null, teacher_id: null, is_active: true, avatar_url: null, phone: "", telegram_notify: true, sms_notify: true, email_notify: true, created_at: now() });
  }

  const student = dbState.users.find((item) => item.username === "student");
  if (student) {
    student.name = student.name || "Demo O'quvchi";
    student.role = "student";
    student.is_active = true;
    student.password_hash = student.password_hash || hashPassword("student123");
    student.phone = student.phone || "";
    student.telegram_notify ??= true;
    student.sms_notify ??= true;
    student.email_notify ??= true;
  } else {
    dbState.users.push({ id: id("usr"), name: "Demo O'quvchi", username: "student", password_hash: hashPassword("student123"), role: "student", created_by: admin?.id || null, teacher_id: dbState.users.find((item) => item.username === "teacher")?.id || null, is_active: true, avatar_url: null, phone: "", telegram_notify: true, sms_notify: true, email_notify: true, created_at: now() });
  }
}

let db = null;

function normalizeDb(dbState) {
  dbState.users = dbState.users || [];
  dbState.courses = dbState.courses || [];
  dbState.lessons = dbState.lessons || [];
  dbState.lesson_content = dbState.lesson_content || [];
  dbState.enrollments = dbState.enrollments || [];
  dbState.submissions = dbState.submissions || [];
  dbState.ratings = dbState.ratings || [];
  dbState.audit_logs = dbState.audit_logs || [];
  dbState.users.forEach((user) => {
    user.phone = user.phone || "";
    user.telegram_notify ??= true;
    user.sms_notify ??= true;
    user.email_notify ??= true;
  });
  for (const lesson of dbState.lessons || []) {
    const contents = (dbState.lesson_content || [])
      .filter((content) => content.lesson_id === lesson.id)
      .sort((a, b) => {
        const left = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
        const right = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
        return left - right || new Date(a.created_at || 0) - new Date(b.created_at || 0);
      });
    contents.forEach((content, index) => {
      if (!Number.isFinite(Number(content.order))) content.order = index + 1;
      else content.order = Number(content.order);
    });
  }
  return dbState;
}

async function ensureDbSchema() {
  const sql = fs.readFileSync(path.join(root, "scripts", "ensure-course-studio-db.js"), "utf8");
  const match = sql.match(/const sql = `([\s\S]*?)`;/);
  if (!match) throw new Error("DB schema SQL topilmadi.");
  await pool.query(match[1]);
}

async function loadDb() {
  await ensureDbSchema();
  const [usersRes, coursesRes, lessonsRes, contentRes, enrollmentsRes, submissionsRes, ratingsRes, auditRes] = await Promise.all([
    pool.query("SELECT * FROM course_studio.course_studio_users ORDER BY created_at ASC"),
    pool.query("SELECT * FROM course_studio.course_studio_courses ORDER BY created_at ASC"),
    pool.query('SELECT * FROM course_studio.course_studio_lessons ORDER BY course_id ASC, "order" ASC'),
    pool.query('SELECT * FROM course_studio.course_studio_lesson_content ORDER BY lesson_id ASC, "order" ASC, created_at ASC'),
    pool.query("SELECT * FROM course_studio.course_studio_enrollments ORDER BY created_at ASC"),
    pool.query("SELECT * FROM course_studio.course_studio_submissions ORDER BY created_at ASC"),
    pool.query("SELECT * FROM course_studio.course_studio_ratings ORDER BY created_at DESC"),
    pool.query("SELECT * FROM course_studio.course_studio_audit_logs ORDER BY created_at DESC")
  ]);

  const state = normalizeDb({
    users: usersRes.rows.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      password_hash: user.password_hash,
      role: user.role,
      created_by: user.created_by,
      teacher_id: user.teacher_id,
      is_active: user.is_active,
      avatar_url: user.avatar_url,
      phone: user.phone || "",
      telegram_notify: user.telegram_notify,
      sms_notify: user.sms_notify,
      email_notify: user.email_notify,
      created_at: user.created_at.toISOString()
    })),
    courses: coursesRes.rows.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      teacher_id: course.teacher_id,
      created_at: course.created_at.toISOString()
    })),
    lessons: lessonsRes.rows.map((lesson) => ({
      id: lesson.id,
      course_id: lesson.course_id,
      title: lesson.title,
      order: lesson.order,
      created_at: lesson.created_at.toISOString()
    })),
    lesson_content: contentRes.rows.map((content) => ({
      id: content.id,
      lesson_id: content.lesson_id,
      type: content.type,
      content: content.content,
      file_url: content.file_url,
      file_name: content.file_name,
      mime_type: content.mime_type,
      file_size: content.file_size,
      order: Number(content.order || 1),
      created_at: content.created_at.toISOString()
    })),
    enrollments: enrollmentsRes.rows.map((enrollment) => ({
      id: enrollment.id,
      course_id: enrollment.course_id,
      student_id: enrollment.student_id,
      progress: enrollment.progress,
      completed_lessons: enrollment.completed_lessons || [],
      created_at: enrollment.created_at.toISOString()
    })),
    submissions: submissionsRes.rows.map((submission) => ({
      id: submission.id,
      lesson_id: submission.lesson_id,
      student_id: submission.student_id,
      content: submission.content,
      file_url: submission.file_url,
      grade: submission.grade,
      created_at: submission.created_at.toISOString()
    })),
    ratings: ratingsRes.rows.map((rating) => ({
      id: rating.id,
      student_id: rating.student_id,
      teacher_id: rating.teacher_id,
      course_id: rating.course_id,
      score: rating.score,
      comment: rating.comment,
      created_at: rating.created_at.toISOString()
    })),
    audit_logs: auditRes.rows.map((log) => ({
      id: log.id,
      actor_id: log.actor_id,
      action: log.action,
      entity: log.entity,
      entity_id: log.entity_id,
      details: log.details || {},
      created_at: log.created_at.toISOString()
    }))
  });

  ensureSeedUsers(state);
  if (!usersRes.rowCount) await saveDb(state);
  return state;
}

async function saveDb(nextDb = db) {
  normalizeDb(nextDb);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE course_studio.course_studio_audit_logs, course_studio.course_studio_ratings, course_studio.course_studio_submissions, course_studio.course_studio_enrollments, course_studio.course_studio_lesson_content, course_studio.course_studio_lessons, course_studio.course_studio_courses, course_studio.course_studio_users");

    for (const user of nextDb.users) {
      await client.query(
        `INSERT INTO course_studio.course_studio_users (id, name, username, password_hash, role, created_by, teacher_id, is_active, avatar_url, phone, telegram_notify, sms_notify, email_notify, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [user.id, user.name, user.username, user.password_hash, user.role, user.created_by, user.teacher_id, user.is_active, user.avatar_url || null, user.phone || "", user.telegram_notify ?? true, user.sms_notify ?? true, user.email_notify ?? true, user.created_at]
      );
    }
    for (const course of nextDb.courses) {
      await client.query(
        `INSERT INTO course_studio.course_studio_courses (id, title, description, teacher_id, created_at) VALUES ($1,$2,$3,$4,$5)`,
        [course.id, course.title, course.description, course.teacher_id, course.created_at]
      );
    }
    for (const lesson of nextDb.lessons) {
      await client.query(
        `INSERT INTO course_studio.course_studio_lessons (id, course_id, title, "order", created_at) VALUES ($1,$2,$3,$4,$5)`,
        [lesson.id, lesson.course_id, lesson.title, lesson.order, lesson.created_at]
      );
    }
    for (const content of nextDb.lesson_content) {
      await client.query(
        `INSERT INTO course_studio.course_studio_lesson_content (id, lesson_id, type, content, file_url, file_name, mime_type, file_size, "order", created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [content.id, content.lesson_id, content.type, content.content, content.file_url, content.file_name, content.mime_type, content.file_size || null, Number(content.order || 1), content.created_at]
      );
    }
    for (const enrollment of nextDb.enrollments) {
      await client.query(
        `INSERT INTO course_studio.course_studio_enrollments (id, course_id, student_id, progress, completed_lessons, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [enrollment.id, enrollment.course_id, enrollment.student_id, enrollment.progress, enrollment.completed_lessons || [], enrollment.created_at]
      );
    }
    for (const submission of nextDb.submissions) {
      await client.query(
        `INSERT INTO course_studio.course_studio_submissions (id, lesson_id, student_id, content, file_url, grade, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [submission.id, submission.lesson_id, submission.student_id, submission.content, submission.file_url, submission.grade, submission.created_at]
      );
    }
    for (const rating of nextDb.ratings) {
      await client.query(
        `INSERT INTO course_studio.course_studio_ratings (id, student_id, teacher_id, course_id, score, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [rating.id, rating.student_id, rating.teacher_id, rating.course_id, rating.score, rating.comment, rating.created_at]
      );
    }
    for (const log of nextDb.audit_logs) {
      await client.query(
        `INSERT INTO course_studio.course_studio_audit_logs (id, actor_id, action, entity, entity_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [log.id, log.actor_id, log.action, log.entity, log.entity_id, JSON.stringify(log.details || {}), log.created_at]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

function usernameTaken(username, exceptUserId = null) {
  return db.users.some((item) => item.username === username && item.id !== exceptUserId);
}

function teacherCanManageStudent(teacher, student) {
  if (teacher.role !== "teacher" || student.role !== "student") return false;
  if (student.teacher_id === teacher.id) return true;
  const teacherCourseIds = new Set(db.courses.filter((course) => course.teacher_id === teacher.id).map((course) => course.id));
  return db.enrollments.some((enrollment) => enrollment.student_id === student.id && teacherCourseIds.has(enrollment.course_id));
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
      contents: db.lesson_content.filter((content) => content.lesson_id === lesson.id).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
      submissions: user.role === "student" ? db.submissions.filter((item) => item.lesson_id === lesson.id && item.student_id === user.id) : db.submissions.filter((item) => item.lesson_id === lesson.id)
    }));
  const enrollment = user.role === "student" ? db.enrollments.find((item) => item.course_id === course.id && item.student_id === user.id) : null;
  const ratings = db.ratings.filter((item) => item.course_id === course.id);
  const averageRating = ratings.length ? ratings.reduce((sum, item) => sum + Number(item.score || 0), 0) / ratings.length : 0;
  return { ...course, teacher: publicUser(db.users.find((item) => item.id === course.teacher_id)), lessons, enrollment, ratings, averageRating };
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

function saveUploadedFile(file, folder) {
  const safeFolder = String(folder || "").replace(/^\/+|\/+$/g, "");
  const targetDir = safeFolder ? path.join(uploadDir, safeFolder) : uploadDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const safeName = String(file.filename || "file").replace(/[^\w.-]/g, "_");
  const storedName = `${id("file")}_${safeName}`;
  fs.writeFileSync(path.join(targetDir, storedName), file.data);
  const relative = safeFolder ? `${safeFolder}/${storedName}` : storedName;
  return `/uploads/${relative}`;
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

  if (pathname === "/api/profile" && method === "PATCH") {
    const contentType = req.headers["content-type"] || "";
    let fields = {};
    let files = [];
    if (contentType.includes("multipart/form-data")) ({ fields, files } = parseMultipart(await readBody(req), contentType));
    else fields = await readJson(req);
    const nextUsername = sanitize(fields.username ?? user.username);
    if (!nextUsername) return fail(res, 400, "Login bo'sh bo'lmasin.");
    if (usernameTaken(nextUsername, user.id)) return fail(res, 409, "Bu login band. Boshqa login tanlang.");
    user.username = nextUsername;
    if (fields.name) user.name = sanitize(fields.name);
    if (fields.phone !== undefined) user.phone = sanitize(fields.phone);
    if (fields.password) user.password_hash = hashPassword(fields.password);
    if (files[0]) {
      const file = files[0];
      const avatarUrl = saveUploadedFile(file, "avatars");
      user.avatar_url = avatarUrl;
    }
    audit(user, "update", "profile", user.id, { username: user.username });
    await saveDb();
    return send(res, 200, { user: publicUser(user), message: "Profil yangilandi." });
  }

  if (pathname === "/api/profile/password" && method === "PATCH") {
    const body = await readJson(req);
    if (!verifyPassword(body.current_password || "", user.password_hash)) return fail(res, 400, "Joriy parol noto'g'ri.");
    if (!body.new_password) return fail(res, 400, "Yangi parolni kiriting.");
    if (body.new_password !== body.confirm_password) return fail(res, 400, "Yangi parollar mos kelmadi.");
    user.password_hash = hashPassword(body.new_password);
    audit(user, "update", "password", user.id);
    await saveDb();
    return send(res, 200, { message: "Parol muvaffaqiyatli yangilandi." });
  }

  if (pathname === "/api/profile/notifications" && method === "PATCH") {
    const body = await readJson(req);
    user.telegram_notify = body.telegram_notify ?? user.telegram_notify;
    user.sms_notify = body.sms_notify ?? user.sms_notify;
    user.email_notify = body.email_notify ?? user.email_notify;
    audit(user, "update", "notifications", user.id, {
      telegram_notify: user.telegram_notify,
      sms_notify: user.sms_notify,
      email_notify: user.email_notify
    });
    await saveDb();
    return send(res, 200, { user: publicUser(user), message: "Bildirishnoma sozlamalari saqlandi." });
  }

  if (pathname === "/api/dashboard" && method === "GET") {
    const courses = visibleCourses(user);
    const adminStats = user.role === "admin" ? {
      series: [],
      studentsPerCourse: db.courses.map((course) => ({ course: course.title, students: db.enrollments.filter((item) => item.course_id === course.id).length })),
      roleDistribution: ["admin", "teacher", "student"].map((role) => ({ role, count: db.users.filter((item) => item.role === role).length })),
      ratingDistribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: db.ratings.filter((item) => Number(item.score) === score).length }))
    } : null;
    return send(res, 200, {
      stats: {
        teachers: db.users.filter((item) => item.role === "teacher" && item.is_active).length,
        students: db.users.filter((item) => item.role === "student" && item.is_active).length,
        courses: courses.length,
        lessons: db.lessons.filter((lesson) => courses.some((course) => course.id === lesson.course_id)).length
      },
      audit: user.role === "admin" ? db.audit_logs.slice(0, 20) : [],
      adminStats
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
    if (body.role === "student" && body.teacher_id) {
      const teacher = db.users.find((item) => item.id === body.teacher_id && item.role === "teacher");
      if (!teacher) return fail(res, 400, "O'qituvchi topilmadi.");
      if (user.role === "teacher" && teacher.id !== user.id) return fail(res, 403, "Siz boshqa o'qituvchining o'quvchilarini boshqara olmaysiz.");
    }
    const username = sanitize(body.username);
    if (!username || usernameTaken(username)) return fail(res, 400, "Username band yoki bo'sh.");
    const password = body.password || crypto.randomBytes(5).toString("base64url");
    const created = { id: id("usr"), name: sanitize(body.name), username, password_hash: hashPassword(password), role: body.role, created_by: user.id, teacher_id: body.role === "student" ? body.teacher_id || null : null, is_active: true, created_at: now() };
    db.users.push(created);
    audit(user, "create", "user", created.id, { username: created.username, role: created.role });
    await saveDb();
    return send(res, 201, { user: publicUser(created), password });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && ["PATCH", "DELETE"].includes(method)) {
    const target = db.users.find((item) => item.id === userMatch[1]);
    if (!target || target.role === "admin") return fail(res, 404, "Foydalanuvchi topilmadi.");
    const canEditCredentials = user.role === "admin" || teacherCanManageStudent(user, target);
    if (method === "DELETE") {
      if (!requireRole(res, user, ["admin"])) return;
      db.users = db.users.filter((item) => item.id !== target.id);
    }
    else {
      if (!canEditCredentials) return fail(res, 403, "Bu foydalanuvchining login-parolini o'zgartirishga ruxsat yo'q.");
      const body = await readJson(req);
      const nextUsername = body.username === undefined ? target.username : sanitize(body.username);
      if (!nextUsername) return fail(res, 400, "Login bo'sh bo'lmasin.");
      if (usernameTaken(nextUsername, target.id)) return fail(res, 409, "Bu login band. Boshqa login tanlang.");
      target.username = nextUsername;
      if (body.password) target.password_hash = hashPassword(body.password);
      if (user.role === "admin") {
        target.name = sanitize(body.name ?? target.name);
        target.is_active = body.is_active ?? target.is_active;
        target.teacher_id = body.teacher_id ?? target.teacher_id;
      }
    }
    audit(user, method === "DELETE" ? "delete" : "update", "user", target.id);
    await saveDb();
    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/courses" && method === "GET") return send(res, 200, { courses: visibleCourses(user).map((course) => hydrateCourse(course, user)) });

  if (pathname === "/api/courses" && method === "POST") {
    if (!requireRole(res, user, ["admin", "teacher"])) return;
    const body = await readJson(req);
    const teacherId = user.role === "teacher" ? user.id : body.teacher_id;
    if (!db.users.some((item) => item.id === teacherId && item.role === "teacher")) return fail(res, 400, "O'qituvchi tanlang.");
    if (user.role === "teacher" && teacherId !== user.id) return fail(res, 403, "Siz boshqa o'qituvchining kursini yaratolmaysiz.");
    const course = { id: id("crs"), title: sanitize(body.title), description: sanitize(body.description), teacher_id: teacherId, created_at: now() };
    db.courses.push(course);
    audit(user, "create", "course", course.id);
    await saveDb();
    return send(res, 201, { course: hydrateCourse(course, user) });
  }

  const courseMatch = pathname.match(/^\/api\/courses\/([^/]+)$/);
  if (courseMatch && ["PATCH", "DELETE"].includes(method)) {
    const course = db.courses.find((item) => item.id === courseMatch[1]);
    if (!course || !canManageCourse(user, course)) return fail(res, 404, "Kurs topilmadi.");
    if (user.role === "teacher" && course.teacher_id !== user.id) return fail(res, 403, "Bu kursni boshqara olmaysiz.");
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
    await saveDb();
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
    await saveDb();
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
    await saveDb();
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
    const siblings = db.lesson_content.filter((content) => content.lesson_id === lesson.id);
    const requestedOrder = Number(fields.order);
    const nextOrder = Number.isFinite(requestedOrder) ? requestedOrder : Math.max(0, ...siblings.map((content) => Number(content.order || 0))) + 1;
    let record = { id: id("cnt"), lesson_id: lesson.id, type, content: fields.content || "", file_url: null, file_name: null, mime_type: null, order: nextOrder, created_at: now() };
    if (type === "file") {
      const file = files[0];
      if (!file) return fail(res, 400, "Fayl tanlanmagan.");
      const fileId = id("file");
      const storedName = `${fileId}_${file.filename}`;
      fs.writeFileSync(path.join(uploadDir, storedName), file.data);
      record = { ...record, content: fields.content || "", file_url: `/uploads/${storedName}`, file_name: file.filename, mime_type: file.mime, file_size: file.data.length };
    }
    db.lesson_content.push(record);
    audit(user, "create", "lesson_content", record.id, { type });
    await saveDb();
    return send(res, 201, { content: record });
  }

  const contentOrderMatch = pathname.match(/^\/api\/content\/([^/]+)\/order$/);
  if (contentOrderMatch && method === "PATCH") {
    const content = db.lesson_content.find((item) => item.id === contentOrderMatch[1]);
    const lesson = content && db.lessons.find((item) => item.id === content.lesson_id);
    const course = lesson && db.courses.find((item) => item.id === lesson.course_id);
    if (!content || !lesson || !course || !canManageCourse(user, course)) return fail(res, 404, "Kontent topilmadi.");

    const body = await readJson(req);
    const siblings = db.lesson_content
      .filter((item) => item.lesson_id === lesson.id)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const currentIndex = siblings.findIndex((item) => item.id === content.id);

    if (Number.isFinite(Number(body.order))) {
      content.order = Number(body.order);
    } else if (body.direction === "up" || body.direction === "down") {
      const nextIndex = body.direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= siblings.length) return send(res, 200, { ok: true, content });
      const other = siblings[nextIndex];
      const previousOrder = content.order;
      content.order = other.order;
      other.order = previousOrder;
    } else {
      return fail(res, 400, "Tartib yo'nalishi noto'g'ri.");
    }

    audit(user, "reorder", "lesson_content", content.id, { lesson_id: lesson.id });
    await saveDb();
    return send(res, 200, { ok: true, content });
  }

  const contentItemMatch = pathname.match(/^\/api\/content\/([^/]+)$/);
  if (contentItemMatch && method === "DELETE") {
    const content = db.lesson_content.find((item) => item.id === contentItemMatch[1]);
    const lesson = content && db.lessons.find((item) => item.id === content.lesson_id);
    const course = lesson && db.courses.find((item) => item.id === lesson.course_id);
    if (!content || !lesson || !course || !canManageCourse(user, course)) return fail(res, 404, "Kontent topilmadi.");
    if (content.file_url) {
      const assetPath = path.normalize(path.join(uploadDir, content.file_url.replace(/^\/uploads\//, "")));
      if (assetPath.startsWith(uploadDir) && fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
    }
    db.lesson_content = db.lesson_content.filter((item) => item.id !== content.id);
    audit(user, "delete", "lesson_content", content.id, { lesson_id: lesson.id });
    await saveDb();
    return send(res, 200, { ok: true });
  }

  if (contentItemMatch && method === "PATCH") {
    const content = db.lesson_content.find((item) => item.id === contentItemMatch[1]);
    const lesson = content && db.lessons.find((item) => item.id === content.lesson_id);
    const course = lesson && db.courses.find((item) => item.id === lesson.course_id);
    if (!content || !lesson || !course || !canManageCourse(user, course)) return fail(res, 404, "Kontent topilmadi.");
    const contentType = req.headers["content-type"] || "";
    let fields = {};
    let files = [];
    if (contentType.includes("multipart/form-data")) ({ fields, files } = parseMultipart(await readBody(req), contentType));
    else fields = await readJson(req);
    const nextType = fields.type || content.type;
    if (nextType === "file") {
      const file = files[0];
      if (file) {
        if (content.file_url) {
          const assetPath = path.normalize(path.join(uploadDir, content.file_url.replace(/^\/uploads\//, "")));
          if (assetPath.startsWith(uploadDir) && fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
        }
        const storedUrl = saveUploadedFile(file, "");
        content.file_url = storedUrl;
        content.file_name = file.filename;
        content.mime_type = file.mime;
        content.file_size = file.data.length;
      }
      content.content = fields.content || "";
      content.type = "file";
    } else if (nextType === "text") {
      content.type = "text";
      content.content = sanitize(fields.content || "");
      content.file_url = null;
      content.file_name = null;
      content.mime_type = null;
    } else if (nextType === "link") {
      content.type = "link";
      content.content = sanitize(fields.content || fields.link || "");
      content.file_url = null;
      content.file_name = null;
      content.mime_type = null;
    }
    if (Number.isFinite(Number(fields.order))) content.order = Number(fields.order);
    audit(user, "update", "lesson_content", content.id, { lesson_id: lesson.id });
    await saveDb();
    return send(res, 200, { ok: true, content });
  }

  if (pathname === "/api/ratings" && method === "GET") {
    const visibleRatings = user.role === "admin"
      ? db.ratings
      : user.role === "teacher"
        ? db.ratings.filter((item) => item.teacher_id === user.id)
        : db.ratings.filter((item) => item.student_id === user.id);
    return send(res, 200, { ratings: visibleRatings });
  }

  if (pathname === "/api/ratings" && method === "POST") {
    if (!requireRole(res, user, ["student"])) return;
    const body = await readJson(req);
    const teacherId = body.teacher_id;
    const courseId = body.course_id;
    if (!teacherId || !courseId || !body.score) return fail(res, 400, "Barcha maydonlar to'ldirilishi kerak.");
    const teacher = db.users.find((item) => item.id === teacherId && item.role === "teacher");
    const course = db.courses.find((item) => item.id === courseId);
    if (!teacher || !course) return fail(res, 404, "O'qituvchi yoki kurs topilmadi.");
    const existing = db.ratings.find((item) => item.student_id === user.id && item.teacher_id === teacherId && item.course_id === courseId);
    const payload = {
      id: existing?.id || id("rat"),
      student_id: user.id,
      teacher_id: teacherId,
      course_id: courseId,
      score: Number(body.score),
      comment: sanitize(body.comment || ""),
      created_at: now()
    };
    if (existing) Object.assign(existing, payload);
    else db.ratings.push(payload);
    await saveDb();
    return send(res, 200, { rating: payload, message: existing ? "Baholangandan so'ng yangilandi." : "Baholash saqlandi." });
  }

  if (pathname === "/api/admin/stats" && method === "GET") {
    if (!requireRole(res, user, ["admin"])) return;
    const nowDate = new Date();
    const series = [];
    for (let index = 29; index >= 0; index -= 1) {
      const date = new Date(nowDate);
      date.setDate(nowDate.getDate() - index);
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      const count = db.users.filter((item) => {
        const created = new Date(item.created_at || 0);
        return created >= start && created <= end;
      }).length;
      series.push({ label: `${date.getDate()}/${date.getMonth() + 1}`, count });
    }
    const studentsPerCourse = db.courses.map((course) => ({
      course: course.title,
      students: db.enrollments.filter((item) => item.course_id === course.id).length
    }));
    const roleDistribution = ["admin", "teacher", "student"].map((role) => ({
      role,
      count: db.users.filter((item) => item.role === role).length
    }));
    const ratingDistribution = [1, 2, 3, 4, 5].map((score) => ({ score, count: db.ratings.filter((item) => Number(item.score) === score).length }));
    return send(res, 200, { series, studentsPerCourse, roleDistribution, ratingDistribution });
  }

  const enrollMatch = pathname.match(/^\/api\/courses\/([^/]+)\/enrollments$/);
  if (enrollMatch && method === "POST") {
    if (!requireRole(res, user, ["admin", "teacher"])) return;
    const course = db.courses.find((item) => item.id === enrollMatch[1]);
    if (user.role === "teacher" && course?.teacher_id !== user.id) return fail(res, 403, "Bu kursga o'quvchi qo'sha olmaysiz.");
    if (!course || !canManageCourse(user, course)) return fail(res, 404, "Kurs topilmadi.");
    const body = await readJson(req);
    const student = db.users.find((item) => item.id === body.student_id && item.role === "student");
    if (!student || (user.role === "teacher" && student.teacher_id !== user.id)) return fail(res, 400, "O'quvchi tanlang.");
    if (!db.enrollments.some((item) => item.course_id === course.id && item.student_id === student.id)) {
      db.enrollments.push({ id: id("enr"), course_id: course.id, student_id: student.id, progress: 0, completed_lessons: [], created_at: now() });
    }
    audit(user, "enroll", "course", course.id, { student_id: student.id });
    await saveDb();
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
    await saveDb();
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
    await saveDb();
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
    await saveDb();
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
  (async () => {
    try {
      db = await loadDb();
      const server = http.createServer(handleRequest);
      server.listen(port, () => {
        console.log(`Course Studio running at http://localhost:${port}`);
      });
    } catch (error) {
      console.error("Startup error:", error);
      process.exit(1);
    }
  })();
}

module.exports = { handleRequest };
