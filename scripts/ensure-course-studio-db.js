require("dotenv/config");
const { Client } = require("pg");

const sql = `
CREATE SCHEMA IF NOT EXISTS course_studio;

CREATE TABLE IF NOT EXISTS course_studio.course_studio_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_by TEXT,
  teacher_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  phone TEXT NOT NULL DEFAULT '',
  telegram_notify BOOLEAN NOT NULL DEFAULT true,
  sms_notify BOOLEAN NOT NULL DEFAULT true,
  email_notify BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  teacher_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_lesson_content (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  "order" DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_enrollments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed_lessons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS course_studio_enrollments_course_id_student_id_key
  ON course_studio.course_studio_enrollments(course_id, student_id);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_submissions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  grade TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_ratings (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS course_studio_ratings_student_teacher_course_key
  ON course_studio.course_studio_ratings(student_id, teacher_id, course_id);

CREATE TABLE IF NOT EXISTS course_studio.course_studio_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE course_studio.course_studio_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE course_studio.course_studio_users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE course_studio.course_studio_users ADD COLUMN IF NOT EXISTS telegram_notify BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE course_studio.course_studio_users ADD COLUMN IF NOT EXISTS sms_notify BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE course_studio.course_studio_users ADD COLUMN IF NOT EXISTS email_notify BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE course_studio.course_studio_lesson_content ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE course_studio.course_studio_lesson_content ADD COLUMN IF NOT EXISTS "order" DOUBLE PRECISION NOT NULL DEFAULT 1;
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Course Studio tables are ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
