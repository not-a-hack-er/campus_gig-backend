// ============================================================
// tests/notifications.test.js — Notification Test Suite
// ============================================================

const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../src/app');

const TEST_DB = 'mongodb://localhost:27017/campus_gig_test';

let token          = '';
let userId         = '';
let notificationId = '';

beforeAll(async () => {
  await mongoose.connect(TEST_DB);

  const res = await request(app).post('/api/auth/register').send({
    name: 'Notif User', email: `notif_${Date.now()}@test.com`, password: 'Pass@1234'
  });
  token  = res.body.token;
  userId = res.body.user._id;

  // Seed one notification using the service directly
  const Notification = require('../src/models/Notification');
  const notif = await Notification.create({
    recipient: userId,
    title:     'Test Notification',
    body:      'This is a test notification',
    type:      'test',
  });
  notificationId = notif._id.toString();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('GET /api/notifications', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  test('returns array of notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('notification has required fields', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    const notif = res.body[0];
    expect(notif.title).toBeDefined();
    expect(notif.body).toBeDefined();
    expect(notif.isRead).toBe(false);
  });
});

describe('GET /api/notifications/unread-count', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notifications/unread-count');
    expect(res.status).toBe(401);
  });

  test('returns unread notification count', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.unreadCount).toBe('number');
    expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(1);
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  test('marks a notification as read', async () => {
    const res = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.isRead).toBe(true);
  });

  test('returns 400 for invalid notification ID', async () => {
    const res = await request(app)
      .patch('/api/notifications/invalidid/read')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent notification ID', async () => {
    const res = await request(app)
      .patch('/api/notifications/000000000000000000000000/read')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/users/me/fcm-token', () => {
  test('updates user FCM token', async () => {
    const res = await request(app)
      .post('/api/users/me/fcm-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ fcmToken: 'test_fcm_token_12345' });
    expect(res.status).toBe(200);
    expect(res.body.fcmToken).toBe('test_fcm_token_12345');
  });

  test('creates notification and triggers FCM safe check without throwing', async () => {
    const { createNotification } = require('../src/services/notificationService');
    const notif = await createNotification(
      userId,
      'FCM Test Title',
      'FCM Test Body Message',
      { type: 'fcm_test', referenceId: '123' }
    );
    expect(notif).toBeDefined();
    expect(notif.title).toBe('FCM Test Title');
  });
});

