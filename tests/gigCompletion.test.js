// ============================================================
// tests/gigCompletion.test.js — Gig Completion Lifecycle Tests
//
// Tests the complete workflow: IN_PROGRESS → WORK_SUBMITTED → COMPLETED.
//
// Covers fixed bugs:
//   BUG-02: OTP bypass removed — any 4-char string must no longer complete a gig
//   BUG-05: Re-submission blocked — second submit-work call returns 400
//   BUG-10: Completing from IN_PROGRESS state (before submission) returns 400
// ============================================================

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

let employerToken = '';
let workerToken   = '';
let gigId         = '';
let applicationId = '';
let realOtp       = '';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);

  // Create employer (gig poster)
  const empRes = await request(app).post('/api/auth/register').send({
    name: 'Completion Employer', email: `completion_employer_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  employerToken = empRes.body.token;

  // Create worker (applicant)
  const workerRes = await request(app).post('/api/auth/register').send({
    name: 'Completion Worker', email: `completion_worker_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  workerToken = workerRes.body.token;

  // Employer posts a gig
  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${employerToken}`)
    .send({ title: 'Completion Test Gig', description: 'End-to-end completion flow', budget: 5000, category: 'Test' });
  gigId = gigRes.body._id;

  // Worker applies
  const appRes = await request(app)
    .post(`/api/applications/${gigId}`)
    .set('Authorization', `Bearer ${workerToken}`)
    .send({ proposal: 'I can do this', expectedBudget: 4500 });
  applicationId = appRes.body._id;

  // Employer accepts the worker
  await request(app)
    .patch(`/api/applications/${applicationId}/status`)
    .set('Authorization', `Bearer ${employerToken}`)
    .send({ status: 'ACCEPTED' });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ── SUBMIT WORK ───────────────────────────────────────────────────────────────

describe('POST /api/gigs/:id/submit-work', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/submit-work`)
      .send({ submittedUrl: 'https://github.com/example/repo' });
    expect(res.status).toBe(401);
  });

  test('returns 403 when non-worker tries to submit', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/submit-work`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ submittedUrl: 'https://github.com/example/repo' });
    expect(res.status).toBe(403);
  });

  test('returns 400 when submittedUrl is missing', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/submit-work`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ submittedNote: 'I forgot the URL' });
    expect(res.status).toBe(400);
  });

  test('worker successfully submits work — transitions to work_submitted', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/submit-work`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ submittedUrl: 'https://github.com/example/repo', submittedNote: 'All done!' });
    expect(res.status).toBe(200);
    expect(res.body.gigStatus).toBe('work_submitted');
  });

  // BUG-05 REGRESSION TEST: Worker must NOT be able to re-submit once already submitted
  test('BUG-05: blocks re-submission when gig is already work_submitted', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/submit-work`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ submittedUrl: 'https://github.com/example/repo-v2' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already been submitted');
  });
});

// ── COMPLETION OTP ────────────────────────────────────────────────────────────

describe('GET /api/gigs/:id/completion-otp', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/gigs/${gigId}/completion-otp`);
    expect(res.status).toBe(401);
  });

  test('returns 403 when worker tries to get OTP (employer only)', async () => {
    const res = await request(app)
      .get(`/api/gigs/${gigId}/completion-otp`)
      .set('Authorization', `Bearer ${workerToken}`);
    expect(res.status).toBe(403);
  });

  test('employer can request/refresh the completion OTP', async () => {
    const res = await request(app)
      .get(`/api/gigs/${gigId}/completion-otp`)
      .set('Authorization', `Bearer ${employerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.otp).toBeDefined();
    expect(typeof res.body.otp).toBe('string');
    expect(res.body.otp.length).toBe(4);
    expect(res.body.expiresAt).toBeDefined();
    realOtp = res.body.otp; // Save for the completion test below
  });
});

// ── GIG COMPLETION ────────────────────────────────────────────────────────────

describe('POST /api/gigs/:id/complete', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/complete`)
      .send({ otp: '1234' });
    expect(res.status).toBe(401);
  });

  test('returns 403 when worker tries to complete (employer only)', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/complete`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ otp: '1234' });
    expect(res.status).toBe(403);
  });

  // BUG-02 REGRESSION TEST: Wrong OTP must be rejected — no bypass allowed
  test('BUG-02: rejects incorrect OTP with 400 (no bypass)', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/complete`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ otp: 'aaaa' }); // 4 chars but wrong — must fail
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid completion OTP');
  });

  test('BUG-02: rejects random 4-digit numeric wrong OTP with 400', async () => {
    // Pick a number guaranteed to be wrong (OTPs are 1000-9999, use something outside)
    const wrongOtp = realOtp === '9999' ? '1000' : '9999';
    const res = await request(app)
      .post(`/api/gigs/${gigId}/complete`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ otp: wrongOtp });
    expect(res.status).toBe(400);
  });

  test('employer successfully completes gig with the correct OTP', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/complete`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ otp: realOtp });
    expect(res.status).toBe(200);
    expect(res.body.gigStatus).toBe('completed');
  });

  test('gig is now in completed state — verify via GET', async () => {
    const res = await request(app).get(`/api/gigs/${gigId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  test('completed gig cannot be completed again', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/complete`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ otp: realOtp });
    // Must fail — completed is a terminal state
    expect(res.status).toBe(400);
  });

  test('completed gig cannot have work submitted again', async () => {
    const res = await request(app)
      .post(`/api/gigs/${gigId}/submit-work`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ submittedUrl: 'https://github.com/example/another' });
    expect(res.status).toBe(400);
  });

  // BUG-10 REGRESSION TEST: A fresh gig in IN_PROGRESS cannot be completed
  test('BUG-10: returns 400 when employer tries to complete an in_progress gig (no submission yet)', async () => {
    // Create a fresh gig, accept a worker, then try to complete without submission
    const g = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ title: 'Fresh IN_PROGRESS Gig', description: 'Test BUG-10', budget: 1000, category: 'Test' });
    const freshGigId = g.body._id;

    const a = await request(app)
      .post(`/api/applications/${freshGigId}`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ proposal: 'I can do this', expectedBudget: 900 });
    const freshAppId = a.body._id;

    await request(app)
      .patch(`/api/applications/${freshAppId}/status`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ status: 'ACCEPTED' });

    // Gig is now IN_PROGRESS — employer should NOT be able to complete it
    const res = await request(app)
      .post(`/api/gigs/${freshGigId}/complete`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ otp: '1234' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('has not yet submitted');
  });
});
