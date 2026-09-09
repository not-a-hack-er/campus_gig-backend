// ============================================================
// tests/reviews.test.js — Review Test Suite
// ============================================================

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

let reviewerToken  = '';
let reviewedUserId = '';
let reviewedToken  = '';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);

  // Reviewer — writes the review
  const res1 = await request(app).post('/api/auth/register').send({
    name: 'Reviewer', email: `reviewer_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  reviewerToken = res1.body.token;

  // Reviewed user — receives the review
  const res2 = await request(app).post('/api/auth/register').send({
    name: 'Reviewed', email: `reviewed_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  reviewedToken  = res2.body.token;
  reviewedUserId = res2.body.user._id;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('POST /api/reviews/:userId', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  test('returns 400 for self-review', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .set('Authorization', `Bearer ${reviewedToken}`)
      .send({ rating: 5, comment: 'I am great' });
    expect(res.status).toBe(400);
  });

  test('returns 400 without rating', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ comment: 'No rating here' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for rating > 5', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ rating: 10, comment: 'Off scale' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for rating < 1', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ rating: 0 });
    expect(res.status).toBe(400);
  });

  test('creates a valid review and returns 201', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ rating: 4, comment: 'Really solid work!' });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.rating).toBe(4);
  });

  test('updates reviewed user\'s rating and totalReviews', async () => {
    const res = await request(app).get(`/api/users/${reviewedUserId}`);
    expect(res.body.rating).toBeGreaterThan(0);
    expect(res.body.totalReviews).toBe(1);
  });

  test('returns 400 for duplicate review', async () => {
    const res = await request(app)
      .post(`/api/reviews/${reviewedUserId}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ rating: 3, comment: 'Trying again' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reviews/:userId', () => {
  test('returns list of reviews for a user', async () => {
    const res = await request(app).get(`/api/reviews/${reviewedUserId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('reviewer info is populated', async () => {
    const res = await request(app).get(`/api/reviews/${reviewedUserId}`);
    expect(res.body[0].reviewer).toBeDefined();
    expect(res.body[0].reviewer.name).toBeDefined();
  });

  test('returns empty array for user with no reviews', async () => {
    // Create a fresh user with no reviews
    const freshRes = await request(app).post('/api/auth/register').send({
      name: 'Fresh', email: `fresh_${Date.now()}@test.com`, password: 'Pass@1234'
    });
    const freshId = freshRes.body.user._id;
    const res = await request(app).get(`/api/reviews/${freshId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('returns 400 for invalid user ID format', async () => {
    const res = await request(app).get('/api/reviews/notanid');
    expect(res.status).toBe(400);
  });
});

// ── BUG-08 REGRESSION: /gig/:gigId route ordering ────────────────────────────
//
// Previously GET /api/reviews/gig/:gigId was registered AFTER GET /:userId.
// Express matched /gig/abc123 with userId="gig" and called getUserReviewsController
// instead of getGigReviewsController, returning a 400 CastError ("gig" is not
// a valid ObjectId) instead of an array of reviews.

describe('GET /api/reviews/gig/:gigId (BUG-08 regression)', () => {
  test('BUG-08: /api/reviews/gig/:gigId returns reviews array (not a 400 CastError)', async () => {
    // Use a valid (but non-existent) ObjectId — the route must reach getGigReviewsController,
    // which returns an empty array for a gig with no reviews.
    // Before the fix this returned 400 because /:userId captured "gig" as a userId.
    const fakeGigId = '000000000000000000000001';
    const res = await request(app).get(`/api/reviews/gig/${fakeGigId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true); // Must be an array, not an error object
  });
});
