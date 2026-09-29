// Very simple key-based auth for a class project.
// Client must send header "x-admin-key" matching ADMIN_KEY.
// CHANGE this value before showing the project to others.
const ADMIN_KEY = "1";

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized: admin access required" });
  }
  next();
}

module.exports = { requireAdmin, ADMIN_KEY };