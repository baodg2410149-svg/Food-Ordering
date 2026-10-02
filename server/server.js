const express = require("express");
const cors = require("cors");
const path = require("path");

const menuRoutes = require("./routes/menu");
const orderRoutes = require("./routes/orders");
const supportRoutes = require("./routes/support");
const { ADMIN_KEY } = require("./middleware/adminAuth");
const { readData, writeData } = require("./utils/db");

const app = express();
const PORT = process.env.PORT || 3000;

// cors() allows the browser to call this API from a different origin
// (e.g. Live Server on port 5500) without the request being blocked.
app.use(cors());
// express.json() parses incoming JSON request bodies into req.body,
// so routes can read things like req.body.name directly.
app.use(express.json());

app.post("/api/admin/login", (req, res) => {
  const { key } = req.body;
  if (key === ADMIN_KEY) return res.json({ ok: true });
  res.status(401).json({ error: "Sai admin key" });
});

// Expose the API: /api/menu and /api/orders
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/support", supportRoutes);

// (Optional) Let Express also serve the static frontend files,
// so both sides can be tested from the same origin without CORS issues
app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Since the frontend entry file is now named "Ordering_page.html"
// (not the default "index.html"), express.static will no longer
// auto-serve a page at "/". This route redirects "/" there so
// http://localhost:3000 still works out of the box.
app.get("/", (req, res) => {
  res.redirect("/Ordering_page.html");
});

// One-time migration: orders that were marked "paid" BEFORE the
// revenue.json tracking feature existed have no revenueRecordedOn,
// so their money was never added to any day's revenue bucket.
// This backfills them once, using each order's createdAt date as
// the best guess for which day to credit. Safe to run every startup:
// an order only gets backfilled once, because revenueRecordedOn gets
// set afterwards and this function skips orders that already have it.
function migrateUnrecordedRevenue() {
  const orders = readData("orders.json");
  const revenue = readData("revenue.json", "{}");
  let changed = false;

  orders.forEach((order) => {
    if (order.paymentStatus === "paid" && !order.revenueRecordedOn) {
      const key = order.createdAt ? localDateKey(new Date(order.createdAt)) : localDateKey();
      revenue[key] = (revenue[key] || 0) + Number(order.total);
      order.revenueRecordedOn = key;
      changed = true;
    }
  });

  if (changed) {
    writeData("orders.json", orders);
    writeData("revenue.json", revenue);
    console.log("Backfilled revenue.json from previously-paid orders.");
  }
}

migrateUnrecordedRevenue();

// Same local-date logic as todayKey() in routes/orders.js - kept in
// sync so a migrated order lands in the same bucket a fresh payment
// would use.
function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
