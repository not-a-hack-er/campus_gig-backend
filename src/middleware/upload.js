// ============================================================
// middleware/upload.js — Profile Picture Upload Handler
//
// Uses 'multer' to handle multipart/form-data image uploads.
//
// Storage Strategy (automatically selected based on env vars):
//
//   PRODUCTION (CLOUDINARY_URL set):
//     - Files are uploaded directly to Cloudinary CDN
//     - No local disk required — works in ephemeral containers
//     - Returns a persistent HTTPS URL
//
//   DEVELOPMENT (CLOUDINARY_URL not set):
//     - Falls back to local disk at /uploads/avatars/
//     - Fine for local development; NOT suitable for multi-instance deploys
//
// The controller receives req.file in both cases — the
// interface is identical regardless of storage backend.
// ============================================================

const multer   = require("multer");
const path     = require("path");
const ApiError = require("../utils/ApiError");
const { env }  = require("../config/env");

// ─── File Type Filter ─────────────────────────────────────────────────────────
// Applied regardless of storage backend — only accept known image types.
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    cb(new ApiError(400, "Only image files are allowed (jpg, png, webp, gif)"), false);
  }
};

// ─── Storage Selection ────────────────────────────────────────────────────────

let storage;

if (env.CLOUDINARY_URL) {
  // ── Cloud Storage (Production) ───────────────────────────────────────────────
  // Uploads go directly to Cloudinary — no local disk involved.
  const cloudinary      = require("cloudinary").v2;
  const { CloudinaryStorage } = require("multer-storage-cloudinary");

  // Cloudinary SDK auto-configures from CLOUDINARY_URL env var
  // Format: cloudinary://api_key:api_secret@cloud_name
  cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });

  storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder:         "campus-gig/avatars",                    // Folder in your Cloudinary account
      public_id:      `avatar-${req.user.id}-${Date.now()}`,   // Deterministic filename
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],  // Server-side type guard
      transformation: [
        // Auto-resize to a sensible avatar size and strip EXIF metadata for privacy
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto:good" },
      ],
    }),
  });
} else {
  // ── Local Disk Storage (Development Fallback) ────────────────────────────────
  // Files are saved to /uploads/avatars/ relative to the project root.
  // WARNING: Not suitable for production — files are lost on container restart.
  if (env.NODE_ENV === "production") {
    console.warn("[upload] ⚠️  Using local disk storage in production — set CLOUDINARY_URL");
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, "../../uploads/avatars"));
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
      const filename  = `avatar-${req.user.id}-${Date.now()}${extension}`;
      cb(null, filename);
    },
  });
}

// ─── Multer Instance ──────────────────────────────────────────────────────────

const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5 MB regardless of backend
}).single("avatar"); // Expect one file in the "avatar" form field

// ─── Promise Wrapper (Avatar) ─────────────────────────────────────────────────
// Wraps multer in a Promise so controllers can use async/await + try/catch.
const handleAvatarUpload = (req, res) => {
  return new Promise((resolve, reject) => {
    uploadAvatar(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return reject(new ApiError(400, "File too large. Maximum size is 5 MB."));
        }
        return reject(new ApiError(400, `Upload error: ${err.message}`));
      }
      if (err) return reject(err); // Our custom ApiError from fileFilter
      resolve(); // Upload successful
    });
  });
};

// ─── Resume Upload ────────────────────────────────────────────────────────────
// Accepts PDF, DOC, DOCX files up to 10 MB.
// Uses Cloudinary (raw resource type) in production, local disk in development.

const resumeFileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",                                                      // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only PDF, DOC, and DOCX files are accepted for resumes"), false);
  }
};

let resumeStorage;

if (env.CLOUDINARY_URL) {
  // Upload resume to Cloudinary as a raw (non-image) resource
  const cloudinary      = require("cloudinary").v2;
  const { CloudinaryStorage } = require("multer-storage-cloudinary");

  cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });

  resumeStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder:        "campus-gig/resumes",
      public_id:     `resume-${req.user.id}-${Date.now()}`,
      resource_type: "raw",   // Required for non-image files (PDF, DOC, DOCX)
    }),
  });
} else {
  // Local disk fallback for development
  const fs = require("fs");
  const resumeDir = path.join(__dirname, "../../uploads/resumes");
  if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });

  resumeStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, resumeDir);
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase() || ".pdf";
      cb(null, `resume-${req.user.id}-${Date.now()}${extension}`);
    },
  });
}

const uploadResume = multer({
  storage: resumeStorage,
  fileFilter: resumeFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10 MB for resumes
}).single("resume"); // Expect one file in the "resume" form field

// Promise wrapper for resume upload
const handleResumeUpload = (req, res) => {
  return new Promise((resolve, reject) => {
    uploadResume(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return reject(new ApiError(400, "Resume file too large. Maximum size is 10 MB."));
        }
        return reject(new ApiError(400, `Resume upload error: ${err.message}`));
      }
      if (err) return reject(err);
      resolve();
    });
  });
};

module.exports = { handleAvatarUpload, handleResumeUpload };
