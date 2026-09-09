const mongoose = require('mongoose');
const { pipeline } = require('stream');

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'userUploads' });

// Durable streaming storage on hosts with ephemeral disks, using the existing DB.
const databaseStorage = (folder) => ({
  _handleFile(req, file, cb) {
    const stream = bucket().openUploadStream(file.originalname, {
      metadata: { owner: req.user.id, folder, contentType: file.mimetype },
    });
    pipeline(file.stream, stream, (error) => {
      if (error || file.truncated) {
        bucket().delete(stream.id).catch(() => {});
        return cb(error || new Error('Upload was truncated'));
      }
      cb(null, { filename: String(stream.id), size: stream.length, databaseId: stream.id });
    });
  },
  _removeFile(req, file, cb) {
    bucket().delete(file.databaseId).then(() => cb(null), cb);
  },
});

const serveDatabaseUpload = async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.filename)) return res.sendStatus(404);
    const id = new mongoose.Types.ObjectId(req.params.filename);
    const file = await bucket().find({ _id: id, 'metadata.folder': req.params.folder }).next();
    if (!file) return res.sendStatus(404);
    res.set({
      'Content-Type': file.metadata.contentType,
      'Content-Length': String(file.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    bucket().openDownloadStream(id).on('error', next).pipe(res);
  } catch (error) { next(error); }
};

module.exports = { databaseStorage, serveDatabaseUpload };
