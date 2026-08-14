// ============================================================
// models/Community.js — Community (Group) Schema
//
// A Community is a group that students can create and join.
// It has an owner (creator), a list of members, and posts.
// ============================================================

const mongoose = require("mongoose");

const communitySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    category:    { type: String, default: "" },
    coverImage:  { type: String, default: "" }, // URL to a cover photo
    isPrivate:   { type: Boolean, default: false },

    // The user who created the community
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // All users who have joined (including the owner)
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ─── Virtual Fields ───────────────────────────────────────────────────────────

// "creator" is an alias for "owner" (used by the Android app)
communitySchema.virtual("creator")
  .get(function () { return this.owner; })
  .set(function (val) { this.owner = val; });

// "memberCount" returns how many users are in the community
communitySchema.virtual("memberCount")
  .get(function () {
    return this.members ? this.members.length : 0;
  });

// ─── JSON Serialization ───────────────────────────────────────────────────────

communitySchema.set("toJSON", {
  virtuals: true,
  getters: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.id;
    if (ret.owner) ret.creator = ret.owner; // Also send as 'creator'
    return ret;
  },
});

communitySchema.set("toObject", { virtuals: true, getters: true });

const Community = mongoose.model("Community", communitySchema);

module.exports = Community;