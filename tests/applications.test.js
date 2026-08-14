// ============================================================
// tests/applications.test.js — Application Test Suite
// ============================================================

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

let ownerToken   = '';
let ownerUserId  = '';
let applierToken = '';
let thirdToken   = '';
let gigId        = '';
let applicationId = '';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);

  // Owner — posts the gig
  const res1 = await request(app).post('/api/auth/register').send({
    name: 'App Owner', email: `appowner_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  ownerToken  = res1.body.token;
  ownerUserId = res1.body.user._id;

  // Applier — applies to the gig
  const res2 = await request(app).post('/api/auth/register').send({
    name: 'Applier', email: `applier_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  applierToken = res2.body.token;

  // Third user — for unauthorized tests
  const res3 = await request(app).post('/api/auth/register').send({
    name: 'Third', email: `third_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  thirdToken = res3.body.token;

  // Create a gig to apply to
  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      title: 'App Test Gig', description: 'For application tests', budget: 3000, category: 'Test'
    });
  gigId = gigRes.body._id;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ── APPLY ─────────────────────────────────────────────────────────────────────

describe('POST /api/applications/:gigId', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/applications/${gigId}`)
      .send({ proposal: 'I can do it', expectedBudget: 2500 });
    expect(res.status).toBe(401);
  });

  test('returns 400 when owner applies to own gig', async () => {
    const res = await request(app)
      .post(`/api/applications/${gigId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ proposal: 'Own gig apply', expectedBudget: 3000 });
    expect(res.status).toBe(400);
  });

  test('returns 400 without proposal', async () => {
    const res = await request(app)
      .post(`/api/applications/${gigId}`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ expectedBudget: 2500 });
    expect(res.status).toBe(400);
  });

  test('returns 400 without expectedBudget', async () => {
    const res = await request(app)
      .post(`/api/applications/${gigId}`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ proposal: 'I can do it' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent gig', async () => {
    const res = await request(app)
      .post('/api/applications/000000000000000000000000')
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ proposal: 'Test', expectedBudget: 1000 });
    expect(res.status).toBe(404);
  });

  test('successfully applies to a gig and returns 201', async () => {
    const res = await request(app)
      .post(`/api/applications/${gigId}`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ proposal: 'I have 3 years of experience', expectedBudget: 2500 });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.status).toBe('pending');
    applicationId = res.body._id;
  });

  test('returns 400 on duplicate application', async () => {
    const res = await request(app)
      .post(`/api/applications/${gigId}`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ proposal: 'Applying again', expectedBudget: 2500 });
    expect(res.status).toBe(400);
  });
});

// ── READ ──────────────────────────────────────────────────────────────────────

describe('GET /api/applications/my', () => {
  test('returns applicant\'s own applications', async () => {
    const res = await request(app)
      .get('/api/applications/my')
      .set('Authorization', `Bearer ${applierToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('returns empty array for user with no applications', async () => {
    const res = await request(app)
      .get('/api/applications/my')
      .set('Authorization', `Bearer ${thirdToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('GET /api/applications/gig/:gigId', () => {
  test('owner can view gig applications', async () => {
    const res = await request(app)
      .get(`/api/applications/gig/${gigId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('non-owner cannot view gig applications (403)', async () => {
    const res = await request(app)
      .get(`/api/applications/gig/${gigId}`)
      .set('Authorization', `Bearer ${thirdToken}`);
    expect(res.status).toBe(403);
  });
});

// ── STATUS UPDATE ─────────────────────────────────────────────────────────────

describe('PATCH /api/applications/:id/status', () => {
  test('owner can accept an application', async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  test('non-owner cannot update application status (403)', async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${thirdToken}`)
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(403);
  });

  test('applier cannot update their own application status (403)', async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(403);
  });

  test('applier can withdraw their own pending application', async () => {
    const gigRes = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Fresh Gig for Withdrawal',
        description: 'Testing withdrawal flow',
        budget: 4000,
        category: 'Test'
      });
    const freshGigId = gigRes.body._id;

    const appRes = await request(app)
      .post(`/api/applications/${freshGigId}`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ proposal: 'Withdraw test proposal', expectedBudget: 3800 });
    const pendingAppId = appRes.body._id;

    const res = await request(app)
      .patch(`/api/applications/${pendingAppId}/status`)
      .set('Authorization', `Bearer ${applierToken}`)
      .send({ status: 'WITHDRAWN' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('withdrawn');
  });

  test('invalid status returns 400', async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'INVALID_STATE' });
    expect(res.status).toBe(400);
  });

  test('non-existent application returns 404', async () => {
    const res = await request(app)
      .patch('/api/applications/000000000000000000000000/status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ACCEPTED' });
    expect(res.status).toBe(404);
  });
});
