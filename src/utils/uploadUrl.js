const ApiError = require('./ApiError');

// Cloudinary 2.x returns secure_url; disk storage returns a filesystem path.
module.exports = function uploadUrl(req, folder) {
  const file = req.file;
  const remote = file.secure_url || file.url || file.path;
  if (typeof remote === 'string' && /^https?:\/\//i.test(remote)) return remote;
  if (file.filename) {
    return `${req.protocol}://${req.get('host')}/uploads/${folder}/${encodeURIComponent(file.filename)}`;
  }
  throw new ApiError(502, 'Image storage did not return a usable URL. Please try again.');
};
