// ============================================================
// tests/auth.test.js — Authentication Test Suite
// ============================================================

const request = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

// Use a separate test database so tests don't pollute production data
const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);
});

afterAll(async () => {
  // Drop the test database and close connection after all tests
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ── REGISTER ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validUser = {
    name:     'Test User',
    email:    'test@example.com',
    password: 'SecurePass123',
  };

  test('registers a new user and returns 201 with token', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
  });

  test('does NOT return the password in the response', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Pass Test', email: 'pass@test.com', password: 'hidden123'
    });
    expect(res.body.user?.password).toBeUndefined();
  });

  test('persists onboarding profile fields during registration', async () => {
    const profile = {
      name: 'Onboarding User',
      email: 'onboarding@test.com',
      password: 'SecurePass123',
      role: 'student',
      college: 'G.L. Bajaj Institute of Technology and Management',
      branch: 'Computer Science and Engineering',
      yearOfStudy: '3rd',
      skills: ['Flutter', 'Firebase', 'flutter'],
    };
    const registered = await request(app).post('/api/auth/register').send(profile);
    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({
      role: profile.role,
      college: profile.college,
      branch: profile.branch,
      yearOfStudy: profile.yearOfStudy,
      skills: ['Flutter', 'Firebase'],
    });

    const persisted = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${registered.body.token}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body).toMatchObject({
      college: profile.college,
      branch: profile.branch,
      yearOfStudy: profile.yearOfStudy,
      skills: ['Flutter', 'Firebase'],
    });
  });

  test('rejects duplicate email with 400', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(400);
  });

  test('rejects missing name with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'noname@test.com', password: 'pass123'
    });
    expect(res.status).toBe(400);
  });

  test('rejects name shorter than 2 chars with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'X', email: 'short@test.com', password: 'pass123'
    });
    expect(res.status).toBe(400);
  });

  test('rejects missing password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'No Password', email: 'nopass@test.com'
    });
    expect(res.status).toBe(400);
  });

  test('rejects empty body with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
  });
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login Test', email: 'login@test.com', password: 'MyPass123'
    });
  });

  test('logs in with correct credentials and returns token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com', password: 'MyPass123'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
  });

  test('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com', password: 'WrongPass'
    });
    expect(res.status).toBe(401);
  });

  // SECURITY: Non-existent email must return 401 (same as wrong password),
  // NOT 404. Returning 404 would tell attackers which emails are registered.
  test('rejects non-existent email with 401 (not 404 — prevents email enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@nowhere.com', password: 'pass'
    });
    expect(res.status).toBe(401);
  });

  test('rejects NoSQL injection in email with non-200 status', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: { $gt: '' }, password: { $gt: '' }
    });
    expect(res.status).not.toBe(200);
  });

  // BUG-12 REGRESSION TEST: login must work with mixed-case email.
  // registerUser lowercases email before storing (User schema lowercase:true).
  // loginUser was NOT normalizing the query email, causing a miss.
  test('BUG-12: logs in successfully with mixed-case email (case-insensitive)', async () => {
    // The user was registered as 'login@test.com' (all lowercase)
    // Sending 'LOGIN@TEST.COM' must match the same user.
    const res = await request(app).post('/api/auth/login').send({
      email: 'LOGIN@TEST.COM', password: 'MyPass123'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com'); // Always stored lowercase
  });
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────

describe('Authentication Middleware (protect)', () => {
  test('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  test('returns 401 with wrong format (no Bearer prefix)', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Token mytoken');
    expect(res.status).toBe(401);
  });

  test('returns 200 with valid token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'login@test.com', password: 'MyPass123'
    });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
