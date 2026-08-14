// ============================================================
// tests/users.test.js — User Profile Test Suite
// ============================================================

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

let token  = '';
let userId = '';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);

  const res = await request(app).post('/api/auth/register').send({
    name: 'Profile User', email: `profile_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  token  = res.body.token;
  userId = res.body.user._id;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ── OWN PROFILE ───────────────────────────────────────────────────────────────

describe('GET /api/users/me', () => {
  test('returns own profile with 200', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(userId);
  });

  test('never exposes password field', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.password).toBeUndefined();
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/users/me', () => {
  test('updates bio and college', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ bio: 'I build things', college: 'IIT Bombay' });
    expect(res.status).toBe(200);
    expect(res.body.bio).toBe('I build things');
    expect(res.body.college).toBe('IIT Bombay');
  });

  test('updates skills array', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ skills: ['JavaScript', 'Python'] });
    expect(res.status).toBe(200);
    expect(res.body.skills).toEqual(['JavaScript', 'Python']);
  });

  test('githubProfile alias updates github field', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ githubProfile: 'https://github.com/testuser' });
    expect(res.status).toBe(200);
    expect(res.body.github).toBe('https://github.com/testuser');
  });

  test('portfolioLinks alias updates portfolio field', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ portfolioLinks: ['https://mysite.com'] });
    expect(res.status).toBe(200);
    expect(res.body.portfolio).toBe('https://mysite.com');
  });

  test('returns 400 with no valid fields', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ fakefield: 'ignored' });
    expect(res.status).toBe(400);
  });

  test('ignores restricted fields like isVerified', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ isVerified: true, name: 'Safe Update' });
    expect(res.status).toBe(200);
    // isVerified should still be false (was not in allowedFields)
    expect(res.body.isVerified).toBe(false);
    expect(res.body.name).toBe('Safe Update');
  });
});

// ── STATS ─────────────────────────────────────────────────────────────────────

describe('GET /api/users/me/stats', () => {
  test('returns stats object with all expected fields', async () => {
    const res = await request(app)
      .get('/api/users/me/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('gigsPosted');
    expect(res.body).toHaveProperty('applicationsSubmitted');
    expect(res.body).toHaveProperty('reviewsReceived');
    expect(res.body).toHaveProperty('rating');
    expect(res.body).toHaveProperty('gigsCompleted');
  });
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────

describe('POST /api/users/me/change-password', () => {
  test('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 when new password is too short', async () => {
    const res = await request(app)
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Pass@1234', newPassword: '123' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when new password equals current password', async () => {
    const res = await request(app)
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Pass@1234', newPassword: 'Pass@1234' });
    expect(res.status).toBe(400);
  });

  test('returns 401 when current password is wrong', async () => {
    const res = await request(app)
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass', newPassword: 'NewPass@5678' });
    expect(res.status).toBe(401);
  });
});

// ── PUBLIC PROFILES ───────────────────────────────────────────────────────────

describe('GET /api/users/:id (public profile)', () => {
  test('returns public profile without auth', async () => {
    const res = await request(app).get(`/api/users/${userId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(userId);
  });

  test('never exposes password in public profile', async () => {
    const res = await request(app).get(`/api/users/${userId}`);
    expect(res.body.password).toBeUndefined();
  });

  test('returns 404 for non-existent user', async () => {
    const res = await request(app).get('/api/users/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid ID format', async () => {
    const res = await request(app).get('/api/users/notanid');
    expect(res.status).toBe(400);
  });
});

// ── COLLEGE LIST ──────────────────────────────────────────────────────────────

describe('GET /api/users/colleges', () => {
  test('returns array of colleges', async () => {
    const res = await request(app).get('/api/users/colleges');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('filters by query string', async () => {
    const res = await request(app).get('/api/users/colleges?q=IIT');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((c) => {
      expect(c.toLowerCase()).toContain('iit');
    });
  });

  test('returns empty array when no colleges match', async () => {
    const res = await request(app).get('/api/users/colleges?q=zzznomatch999');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
