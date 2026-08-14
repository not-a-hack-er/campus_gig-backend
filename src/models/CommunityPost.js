// ============================================================
// models/CommunityPost.js — Post inside a Community
//
// When a user posts something in a community, it is stored here.
// Each post belongs to a community and has an author.
// ============================================================

const mongoose = require("mongoose");

const communityPostSchema = new mongoose.Schema(
  {
    // Which community this post was made in
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },

    // The user who wrote the post
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The text content of the post
    content: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

const CommunityPost = mongoose.model("CommunityPost", communityPostSchema);

module.exports = CommunityPost;