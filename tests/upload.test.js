const request = require('supertest');
const mongoose = require('mongoose');
const { env } = require('../src/config/env');
env.NODE_ENV = 'production';
env.CLOUDINARY_URL = null;
const app = require('../src/app');
const uploadUrl = require('../src/utils/uploadUrl');
const User = require('../src/models/User');
let token;
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEAAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/campus_gig_test');
  const response = await request(app).post('/api/auth/register').send({ name: 'Photo audit', email: `photo-${Date.now()}@test.com`, password: 'Pass@1234' });
  token = response.body.token;
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('production photo is persisted, returns a web URL and serves identical bytes after another profile fetch', async () => {
  const result = await request(app).post('/api/users/me/avatar')
    .set('Authorization', `Bearer ${token}`).attach('avatar', photo, { filename: 'photo.png', contentType: 'image/png' });
  expect(result.status).toBe(200);
  expect(result.body.avatarUrl).toMatch(/^http:\/\//);
  expect(result.body.user.profilePicture).toBe(result.body.avatarUrl);
  const again = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
  expect(again.body.profilePicture).toBe(result.body.avatarUrl);
  const image = await request(app).get(new URL(result.body.avatarUrl).pathname);
  expect(image.status).toBe(200);
  expect(image.headers['content-type']).toMatch(/^image\/png/);
  expect(image.body).toEqual(photo);
  expect(await mongoose.connection.db.collection('userUploads.files').countDocuments()).toBe(1);
});

test('Cloudinary 2.x secure_url is preferred over local paths', () => {
  expect(uploadUrl({ file: { secure_url: 'https://res.cloudinary.com/demo/image.png' } }, 'avatars'))
    .toBe('https://res.cloudinary.com/demo/image.png');
});

test('unsupported uploads are rejected without saving data', async () => {
  const result = await request(app).post('/api/users/me/avatar').set('Authorization', `Bearer ${token}`)
    .attach('avatar', Buffer.from('not a photo'), { filename: 'test.txt', contentType: 'text/plain' });
  expect(result.status).toBe(400);
  expect(await mongoose.connection.db.collection('userUploads.files').countDocuments()).toBe(1);
});

test('serialization excludes credentials and notification token', () => {
  const user = new User({ name: 'test', email: 'test@test.com', password: 'secret', fcmToken: 'private', passwordResetOtp: 'otp' });
  expect(JSON.parse(JSON.stringify(user))).not.toHaveProperty('password');
  expect(JSON.parse(JSON.stringify(user))).not.toHaveProperty('fcmToken');
  expect(JSON.parse(JSON.stringify(user))).not.toHaveProperty('passwordResetOtp');
});
