// ============================================================
// utils/ApiResponse.js — Standard API Response Wrapper
//
// All successful API responses are wrapped in this class
// so the frontend always gets a consistent shape.
//
// Behavior:
//   - If 'data' is provided, toJSON() returns just the data directly
//     (so the frontend doesn't have to unwrap an extra layer)
//   - If no 'data', returns { success, message, timestamp }
//
// Usage:
//   res.json(new ApiResponse(true, "Gig created", gigObject));
//   res.json(new ApiResponse(true, "Password changed", null));
// ============================================================

class ApiResponse {
  constructor(success, message, data = null) {
    this.success   = success;
    this.message   = message;
    this.data      = data;
    this.timestamp = new Date().toISOString();
  }

  // This is called automatically when Express does res.json()
  toJSON() {
    // If there is data, return it directly (unwrapped)
    if (this.data !== null && this.data !== undefined) {
      // If the data itself has a toJSON method (e.g. a Mongoose doc), use it
      if (typeof this.data.toJSON === "function") {
        return this.data.toJSON();
      }
      return this.data;
    }

    // No data — return a simple status + message response
    return {
      success:   this.success,
      message:   this.message,
      timestamp: this.timestamp,
    };
  }
}

module.exports = ApiResponse;
