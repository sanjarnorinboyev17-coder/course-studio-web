const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'server', 'server.js');
const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${pathname}`,
      {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {})
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : {} }));
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin12345' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await wait(1000);
    const login = await request('POST', '/api/auth/login', { username: 'student', password: 'student123' });
    assert.equal(login.statusCode, 200, `Login failed: ${JSON.stringify(login.body)}`);

    const dashboard = await request('GET', '/api/dashboard', null, login.body.token);
    assert.equal(dashboard.statusCode, 200);
    assert.ok(dashboard.body.attendance, 'attendance data should be included in dashboard payload');
    assert.ok(dashboard.body.quizzes, 'quiz data should be included in dashboard payload');

    const profile = await request('PATCH', '/api/profile', { current_password: 'student123', password: 'newpass123', telegram_notify: true, sms_notify: false, email_notify: true }, login.body.token);
    assert.equal(profile.statusCode, 200, `profile update failed: ${JSON.stringify(profile.body)}`);
    assert.equal(profile.body.user.telegram_notify, true);
    assert.equal(profile.body.user.sms_notify, false);
    assert.equal(profile.body.user.email_notify, true);

    const relogin = await request('POST', '/api/auth/login', { username: 'student', password: 'newpass123' });
    assert.equal(relogin.statusCode, 200, 'password update should allow login with the new password');
  } finally {
    child.kill('SIGTERM');
    await wait(300);
  }
})();
