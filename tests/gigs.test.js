// ============================================================
// tests/gigs.test.js — Gig CRUD Test Suite
// ============================================================

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

let token  = '';
let token2 = ''; // Second user
let gigId  = '';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);

  // Register and login user 1 (gig owner)
  const res1 = await request(app).post('/api/auth/register').send({
    name: 'Gig Owner', email: `owner_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  token = res1.body.token;

  // Register user 2 (another user — for auth tests)
  const res2 = await request(app).post('/api/auth/register').send({
    name: 'Other User', email: `other_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  token2 = res2.body.token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ── CREATE ────────────────────────────────────────────────────────────────────

describe('POST /api/gigs', () => {
  test('rejects unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/gigs').send({
      title: 'Test', description: 'Test', budget: 1000, category: 'Dev'
    });
    expect(res.status).toBe(401);
  });

  test('rejects missing required fields with 400', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Only title' });
    expect(res.status).toBe(400);
  });

  test('creates a gig with valid data and returns 201', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title:          'Build a REST API',
        description:    'Need a Node.js API built',
        budget:         5000,
        category:       'Development',
        skillsRequired: ['Node.js', 'MongoDB'],
        duration:       '2 weeks',
        location:       'Remote',
      });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.title).toBe('Build a REST API');
    expect(res.body.postedBy).toBeDefined();
    expect(res.body.postedBy.name).toBe('Gig Owner');
    gigId = res.body._id;
  });

  test('accepts "skills" alias for skillsRequired', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title:       'Skills alias test',
        description: 'Using skills alias',
        budget:      2000,
        category:    'Design',
        skills:      ['Figma', 'Adobe XD'],
      });
    expect(res.status).toBe(201);
    expect(res.body.skillsRequired).toEqual(['Figma', 'Adobe XD']);
    // Clean up
    await request(app).delete(`/api/gigs/${res.body._id}`).set('Authorization', `Bearer ${token}`);
  });

  test('default status is open', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Status test', description: 'Check default status', budget: 500, category: 'Other'
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open'); // Returned as lowercase via getter
    await request(app).delete(`/api/gigs/${res.body._id}`).set('Authorization', `Bearer ${token}`);
  });
});

// ── READ ──────────────────────────────────────────────────────────────────────

describe('GET /api/gigs', () => {
  test('returns array of gigs without auth', async () => {
    const res = await request(app).get('/api/gigs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('filters by category', async () => {
    const res = await request(app).get('/api/gigs?category=Development');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('filters by keyword', async () => {
    const res = await request(app).get('/api/gigs?keyword=REST');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((g) => {
      const matches =
        g.title.toLowerCase().includes('rest') ||
        g.description.toLowerCase().includes('rest');
      expect(matches).toBe(true);
    });
  });

  test('filters by budget range', async () => {
    const res = await request(app).get('/api/gigs?minBudget=4000&maxBudget=6000');
    expect(res.status).toBe(200);
    res.body.forEach((g) => {
      expect(g.budget).toBeGreaterThanOrEqual(4000);
      expect(g.budget).toBeLessThanOrEqual(6000);
    });
  });

  test('returns empty array for unmatched filter', async () => {
    const res = await request(app).get('/api/gigs?category=DoesNotExist999');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('returns 400 for invalid gig ID', async () => {
    const res = await request(app).get('/api/gigs/notanid');
    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent gig ID', async () => {
    const res = await request(app).get('/api/gigs/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/gigs/:id', () => {
  test('returns full gig details', async () => {
    const res = await request(app).get(`/api/gigs/${gigId}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Build a REST API');
    expect(res.body.postedBy).toBeDefined();
  });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────

describe('PUT /api/gigs/:id', () => {
  test('updates gig successfully by owner', async () => {
    const res = await request(app)
      .put(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', budget: 6000 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.budget).toBe(6000);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).put(`/api/gigs/${gigId}`).send({ title: 'Hack' });
    expect(res.status).toBe(401);
  });

  test('returns 403 when non-owner tries to update', async () => {
    const res = await request(app)
      .put(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ title: 'Stolen' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /api/gigs/:id', () => {
  test('returns 403 when non-owner tries to delete', async () => {
    const res = await request(app)
      .delete(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(403);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).delete(`/api/gigs/${gigId}`);
    expect(res.status).toBe(401);
  });

  test('owner successfully deletes gig', async () => {
    const res = await request(app)
      .delete(`/api/gigs/${gigId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  test('deleted gig returns 404', async () => {
    const res = await request(app).get(`/api/gigs/${gigId}`);
    expect(res.status).toBe(404);
  });
});
