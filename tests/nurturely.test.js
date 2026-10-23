const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const {
  generateAccessToken,
  generateRefreshToken,
  ACCESS_SECRET,
  REFRESH_SECRET,
} = require("../Utils/token");

test("Token Generator: creates valid access token with user payload", (t) => {
  const mockUser = {
    _id: "60d5ec49f1b2c8b1f8e4e1a1",
    email: "alexander@nurturely.io",
    role: "admin",
    fullName: "Alexander Wright",
  };

  const token = generateAccessToken(mockUser);
  assert.ok(token, "Access token must be generated");

  const decoded = jwt.verify(token, ACCESS_SECRET);
  assert.strictEqual(decoded.id, mockUser._id);
  assert.strictEqual(decoded.email, mockUser.email);
  assert.strictEqual(decoded.role, "admin");
});

test("Token Generator: creates valid refresh token", (t) => {
  const mockUser = { _id: "60d5ec49f1b2c8b1f8e4e1a2" };
  const refreshToken = generateRefreshToken(mockUser);
  assert.ok(refreshToken, "Refresh token must be generated");

  const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
  assert.strictEqual(decoded.id, mockUser._id);
});

test("Role Authorization: rejects unauthorized roles", (t) => {
  const authorize = require("../Middleware/authorize");
  const middleware = authorize("admin");

  const req = { user: { role: "sales" } };
  let statusSet = 0;
  let jsonSent = null;

  const res = {
    status: (code) => {
      statusSet = code;
      return {
        json: (data) => {
          jsonSent = data;
        },
      };
    },
  };

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(statusSet, 403, "Sales user should receive 403 on admin-only route");
  assert.strictEqual(nextCalled, false, "next() should not be called when unauthorized");
});

test("Role Authorization: accepts authorized admin role", (t) => {
  const authorize = require("../Middleware/authorize");
  const middleware = authorize("admin");

  const req = { user: { role: "admin" } };
  let nextCalled = false;

  middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, "next() should be called when role matches");
});
