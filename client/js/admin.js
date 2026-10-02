// ADMIN DASHBOARD

const menuMessage = document.getElementById("menuMessage");
const menuTableBody = document.getElementById("menuTableBody");
const orderTableBody = document.getElementById("orderTableBody");

const STATUS_ORDER = ["pending", "preparing", "delivering", "completed", "cancelled"];

// In-memory caches of the last fetch, so search/filter can re-render
// instantly without hitting the API again on every keystroke.
let allMenuItems = [];
let allOrders = [];
let supportConversations = [];
let activeSupportConversationId = null;
let activeSupportMessages = [];
let supportListOffset = 0;
let supportListHasMore = false;
let supportMessageOffset = 0;
let supportMessageHasMore = false;
let supportPollTimer = null;
let failedSupportReply = "";

// ---- Login elements ----
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const adminMain = document.getElementById("adminMain");
const loginError = document.getElementById("loginError");
const adminKeyInput = document.getElementById("adminKeyInput");
const togglePassword = document.getElementById("togglePassword");

// LOGIN

togglePassword.addEventListener("click", () => {
  const isHidden = adminKeyInput.type === "password";
  adminKeyInput.type = isHidden ? "text" : "password";
  togglePassword.textContent = isHidden ? "🙈" : "👁";
});

// If admin key already exists in this browser session, skip straight
// to the dashboard.
if (sessionStorage.getItem("adminKey")) {
  showDashboard();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const key = adminKeyInput.value;

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });

    if (res.ok) {
      sessionStorage.setItem("adminKey", key);
      showDashboard();
    } else {
      loginError.textContent = "Wrong key";
    }
  } catch (err) {
    loginError.textContent = "Cannot connect to server";
    console.error(err);
  }
});

// SHOW DASHBOARD

function showDashboard() {
  loginSection.style.display = "none";
  adminMain.style.display = "block";

  loadMenuTable();
  loadOrderTable();
  loadStats();
  loadSupportConversations();
  if (!supportPollTimer) supportPollTimer = setInterval(pollSupport, 10000);
}

// STATISTICS + SALES CHART

const chartModeToggle = document.getElementById("chartModeToggle");
const salesChart = document.getElementById("salesChart");
chartModeToggle.addEventListener("change", () => renderChart());

// Cached separately from allOrders because revenue must survive
// deleted orders - it comes from the server's persistent revenue
// log (revenue.json), not from summing whatever orders currently
// still exist.
let todayRevenue = 0;
let revenueHistory = {};

async function loadStats() {
  try {
    const [orders, todayRev, history] = await Promise.all([
      apiGet("/orders"),
      apiGet("/orders/revenue/today"),
      apiGet("/orders/revenue/history"),
    ]);

    allOrders = orders;
    todayRevenue = todayRev.total;
    revenueHistory = history;

    document.getElementById("statRevenue").textContent = todayRevenue.toLocaleString() + " VND";
    document.getElementById("statOrders").textContent = orders.length;
    document.getElementById("statCompleted").textContent = orders.filter((o) => o.status === "completed").length;
    document.getElementById("statPending").textContent = orders.filter((o) => o.status === "pending").length;

    renderChart();
  } catch (err) {
    console.error("Failed to load statistics:", err);
  }
}

// Same local-date key logic as the server (routes/orders.js todayKey),
// so the keys here match the keys revenue.json was actually written
// under. Using toISOString() would compute the UTC date instead,
// which drifts a day off from Vietnam's calendar date for part of
// each day (UTC+7).
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildLast7DaysStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  return days.map((day) => {
    const key = localDateKey(day);
    const dayOrders = allOrders.filter((o) => o.createdAt && localDateKey(new Date(o.createdAt)) === key);
    return {
      label: `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`,
      revenue: revenueHistory[key] || 0,
      count: dayOrders.length,
    };
  });
}

function renderChart() {
  const stats = buildLast7DaysStats();
  const showOrders = chartModeToggle.checked;
  const values = stats.map((s) => (showOrders ? s.count : s.revenue));
  const max = Math.max(...values, 1);

  salesChart.replaceChildren();
  stats.forEach((s, i) => {
    const value = values[i];
    const bar = document.createElement("div");
    bar.className = "chart-bar";

    const valueLabel = document.createElement("span");
    valueLabel.className = "chart-bar-value";
    valueLabel.textContent = showOrders ? value : value.toLocaleString();

    const fill = document.createElement("div");
    fill.className = "chart-bar-fill";
    fill.style.height = `${Math.max(Math.round((value / max) * 100), 2)}%`;

    const dayLabel = document.createElement("span");
    dayLabel.className = "chart-bar-label";
    dayLabel.textContent = s.label;

    bar.append(valueLabel, fill, dayLabel);
    salesChart.append(bar);
  });
}

// CUSTOMER SUPPORT

const supportNavLink = document.getElementById("supportNavLink");
const supportUnreadBadge = document.getElementById("supportUnreadBadge");
const supportRefreshBtn = document.getElementById("supportRefreshBtn");
const supportSearchInput = document.getElementById("supportSearchInput");
const supportStatusFilter = document.getElementById("supportStatusFilter");
const supportListStatus = document.getElementById("supportListStatus");
const supportConversationList = document.getElementById("supportConversationList");
const supportLoadMoreBtn = document.getElementById("supportLoadMoreBtn");
const supportEmptyState = document.getElementById("supportEmptyState");
const supportActivePane = document.getElementById("supportActivePane");
const supportActiveCustomer = document.getElementById("supportActiveCustomer");
const supportActiveMeta = document.getElementById("supportActiveMeta");
const supportActiveStatus = document.getElementById("supportActiveStatus");
const supportOrderInfo = document.getElementById("supportOrderInfo");
const supportLoadOlderBtn = document.getElementById("supportLoadOlderBtn");
const supportMessages = document.getElementById("supportMessages");
const supportReplyForm = document.getElementById("supportReplyForm");
const supportReplyInput = document.getElementById("supportReplyInput");
const supportReplyStatus = document.getElementById("supportReplyStatus");
const supportRetryBtn = document.getElementById("supportRetryBtn");
const supportSendBtn = document.getElementById("supportSendBtn");

supportNavLink.addEventListener("click", (event) => {
  event.preventDefault();
  document.getElementById("customerSupportSection").scrollIntoView({ behavior: "smooth", block: "start" });
});
supportRefreshBtn.addEventListener("click", () => loadSupportConversations());
supportSearchInput.addEventListener("input", debounceSupportSearch);
supportStatusFilter.addEventListener("change", () => loadSupportConversations());
supportLoadMoreBtn.addEventListener("click", () => loadSupportConversations({ append: true }));
supportLoadOlderBtn.addEventListener("click", () => loadSupportConversation(activeSupportConversationId, { older: true }));
supportActiveStatus.addEventListener("change", updateActiveSupportStatus);
supportRetryBtn.addEventListener("click", () => {
  if (failedSupportReply) sendSupportReply(failedSupportReply);
});
supportReplyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    supportReplyForm.requestSubmit();
  }
});
supportReplyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendSupportReply(supportReplyInput.value);
});

let supportSearchTimer;
function debounceSupportSearch() {
  clearTimeout(supportSearchTimer);
  supportSearchTimer = setTimeout(() => loadSupportConversations(), 250);
}

async function pollSupport() {
  if (adminMain.style.display === "none") return;
  const activeId = activeSupportConversationId;
  const shouldStick = isSupportMessageNearBottom();
  await loadSupportConversations({ silent: true });
  if (activeId) await loadSupportConversation(activeId, { silent: true, keepScroll: !shouldStick });
}

async function loadSupportConversations(options = {}) {
  if (!options.append) supportListOffset = 0;
  const params = new URLSearchParams();
  params.set("limit", "10");
  params.set("offset", String(supportListOffset));
  if (supportSearchInput.value.trim()) params.set("search", supportSearchInput.value.trim());
  if (supportStatusFilter.value) params.set("status", supportStatusFilter.value);

  if (!options.silent && !options.append) {
    supportListStatus.hidden = false;
    supportListStatus.textContent = "Loading conversations...";
  }

  try {
    const data = await apiGet(`/support/admin/conversations?${params}`);
    supportConversations = options.append ? supportConversations.concat(data.items || []) : data.items || [];
    supportListOffset += (data.items || []).length;
    supportListHasMore = Boolean(data.hasMore);
    renderSupportConversationList();
    updateSupportBadge(data.unreadTotal || 0);
  } catch (err) {
    supportListStatus.hidden = false;
    supportListStatus.textContent = "Unable to load support conversations.";
    console.error(err);
  }
}

function renderSupportConversationList() {
  supportConversationList.replaceChildren();
  supportLoadMoreBtn.hidden = !supportListHasMore;

  if (!supportConversations.length) {
    supportListStatus.hidden = false;
    supportListStatus.textContent = "No support conversations yet.";
    return;
  }

  supportListStatus.hidden = true;
  supportConversations.forEach((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `support-conversation-item${conversation.id === activeSupportConversationId ? " is-active" : ""}`;

    const top = document.createElement("span");
    top.className = "support-conversation-top";
    const name = document.createElement("span");
    name.className = "support-conversation-name";
    name.textContent = conversation.customerName || "Customer";
    top.append(name, supportStatusPill(conversation.status));

    if (conversation.unreadForAdmin) {
      const unread = document.createElement("span");
      unread.className = "support-unread";
      unread.textContent = conversation.unreadForAdmin;
      top.append(unread);
    }

    const meta = document.createElement("span");
    meta.className = "support-conversation-meta";
    meta.textContent = `Order #${conversation.orderId || "N/A"} - ${formatSupportDate(conversation.updatedAt)}`;

    const preview = document.createElement("span");
    preview.className = "support-conversation-preview";
    preview.textContent = conversation.lastMessage
      ? `${conversation.lastMessage.sender === "admin" ? "Admin" : "Customer"}: ${conversation.lastMessage.text}`
      : "No messages yet";

    button.append(top, meta, preview);
    button.addEventListener("click", () => loadSupportConversation(conversation.id));
    supportConversationList.append(button);
  });
}

function updateSupportBadge(count) {
  supportUnreadBadge.hidden = count === 0;
  supportUnreadBadge.textContent = count;
}

async function loadSupportConversation(id, options = {}) {
  if (!id) return;
  const previousScrollHeight = supportMessages.scrollHeight;
  const previousScrollTop = supportMessages.scrollTop;
  const shouldStick = !options.keepScroll && (options.older ? false : isSupportMessageNearBottom());
  const offset = options.older ? supportMessageOffset : 0;

  try {
    const data = await apiGet(`/support/admin/conversations/${id}?limit=20&offset=${offset}`);
    activeSupportConversationId = id;
    supportMessageHasMore = data.nextOffset !== null;
    supportMessageOffset = data.nextOffset || 0;
    activeSupportMessages = options.older ? (data.messages || []).concat(activeSupportMessages) : data.messages || [];

    renderSupportActivePane(data.conversation);
    renderSupportMessages();
    renderSupportConversationList();
    await loadSupportConversations({ silent: true });

    if (options.older) {
      supportMessages.scrollTop = supportMessages.scrollHeight - previousScrollHeight + previousScrollTop;
    } else if (shouldStick) {
      supportMessages.scrollTop = supportMessages.scrollHeight;
    }
  } catch (err) {
    supportReplyStatus.textContent = "Unable to load conversation.";
    supportReplyStatus.className = "support-error";
    console.error(err);
  }
}

function renderSupportActivePane(conversation) {
  supportEmptyState.hidden = true;
  supportActivePane.hidden = false;
  supportActiveCustomer.textContent = conversation.customerName || "Customer";
  supportActiveMeta.textContent = `Conversation #${conversation.id} - Updated ${formatSupportDate(conversation.updatedAt)}`;
  supportActiveStatus.value = conversation.status;
  supportLoadOlderBtn.hidden = !supportMessageHasMore;

  supportOrderInfo.replaceChildren();
  if (conversation.order) {
    supportOrderInfo.append(
      supportInfoText(`Order #${conversation.order.id}`),
      supportInfoText(`Status: ${conversation.order.status}`),
      supportInfoText(`Payment: ${conversation.order.paymentStatus}`),
      supportInfoText(`Total: ${Number(conversation.order.total || 0).toLocaleString()} VND`)
    );
    const link = document.createElement("a");
    link.href = `Order_tracking.html?orderId=${encodeURIComponent(conversation.order.id)}`;
    link.textContent = "Open tracking";
    supportOrderInfo.append(link);
  } else {
    supportOrderInfo.append(supportInfoText("No order linked"));
  }
}

function renderSupportMessages() {
  supportMessages.replaceChildren();
  if (!activeSupportMessages.length) {
    const empty = document.createElement("div");
    empty.className = "support-panel-state";
    empty.textContent = "No messages yet.";
    supportMessages.append(empty);
    return;
  }

  activeSupportMessages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = `support-message${message.sender === "admin" ? " is-admin" : ""}`;

    const text = document.createElement("div");
    text.className = "support-message-text";
    text.textContent = message.text;

    const time = document.createElement("span");
    time.className = "support-message-time";
    time.textContent = `${message.sender === "admin" ? "Admin" : "Customer"} - ${formatSupportDate(message.createdAt)}`;

    bubble.append(text, time);
    supportMessages.append(bubble);
  });
}

async function sendSupportReply(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message || !activeSupportConversationId) return;

  supportSendBtn.disabled = true;
  supportReplyInput.disabled = true;
  supportReplyStatus.textContent = "Sending...";
  supportReplyStatus.className = "";
  supportRetryBtn.hidden = true;

  try {
    await apiPost(`/support/admin/conversations/${activeSupportConversationId}/messages`, { message });
    failedSupportReply = "";
    supportReplyInput.value = "";
    supportReplyStatus.textContent = "Sent.";
    await loadSupportConversation(activeSupportConversationId);
  } catch (err) {
    failedSupportReply = message;
    supportReplyStatus.textContent = "Failed to send.";
    supportReplyStatus.className = "support-error";
    supportRetryBtn.hidden = false;
    console.error(err);
  } finally {
    supportSendBtn.disabled = false;
    supportReplyInput.disabled = false;
    supportReplyInput.focus();
  }
}

async function updateActiveSupportStatus() {
  if (!activeSupportConversationId) return;

  try {
    await apiPut(`/support/admin/conversations/${activeSupportConversationId}/status`, {
      status: supportActiveStatus.value,
    });
    await loadSupportConversations({ silent: true });
    await loadSupportConversation(activeSupportConversationId, { silent: true, keepScroll: true });
  } catch (err) {
    supportReplyStatus.textContent = "Unable to update status.";
    supportReplyStatus.className = "support-error";
    console.error(err);
  }
}

function isSupportMessageNearBottom() {
  return supportMessages.scrollHeight - supportMessages.scrollTop - supportMessages.clientHeight < 80;
}

function supportStatusPill(status) {
  const pill = document.createElement("span");
  pill.className = `support-status-pill support-status-${status}`;
  pill.textContent = status === "in_progress" ? "In Progress" : status;
  return pill;
}

function supportInfoText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function formatSupportDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// MENU - DISPLAY / SEARCH / FILTER

const menuSearchInput = document.getElementById("menuSearchInput");
const menuCategoryFilter = document.getElementById("menuCategoryFilter");
const addDishToggle = document.getElementById("addDishToggle");
const addMenuFormWrapper = document.getElementById("addMenuFormWrapper");
const addMenuForm = document.getElementById("addMenuForm");

addDishToggle.addEventListener("click", () => {
  addMenuFormWrapper.hidden = !addMenuFormWrapper.hidden;
});
menuSearchInput.addEventListener("input", renderMenuTable);
menuCategoryFilter.addEventListener("change", renderMenuTable);

async function loadMenuTable() {
  try {
    allMenuItems = await apiGet("/menu");
    renderMenuTable();
  } catch (err) {
    console.error("Failed to load menu:", err);
  }
}

function renderMenuTable() {
  const term = menuSearchInput.value.trim().toLowerCase();
  const category = menuCategoryFilter.value;

  const filtered = allMenuItems.filter((item) => {
    const matchesTerm = !term || item.name.toLowerCase().includes(term) || (item.description || "").toLowerCase().includes(term);
    const matchesCategory = !category || item.category === category;
    return matchesTerm && matchesCategory;
  });

  menuTableBody.innerHTML = "";
  filtered.forEach((item) => menuTableBody.append(buildMenuRow(item)));
}

function buildMenuRow(item) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${item.id}</td>
    <td class="cell-name">${item.name}</td>
    <td class="cell-price">${Number(item.price).toLocaleString()} VND</td>
    <td class="cell-category"><span class="category-tag">${item.category}</span></td>
    <td class="cell-actions">
      <button data-edit-id="${item.id}">Edit</button>
      <button data-id="${item.id}">Delete</button>
    </td>
  `;
  tr.querySelector("button[data-id]").addEventListener("click", () => deleteMenuItem(item.id));
  tr.querySelector("button[data-edit-id]").addEventListener("click", () => toggleEditMenuRow(tr, item));
  return tr;
}

// Turns name/price/category cells into inputs in place, so editing
// doesn't need a separate page or modal.
function toggleEditMenuRow(tr, item) {
  const nameCell = tr.querySelector(".cell-name");
  const priceCell = tr.querySelector(".cell-price");
  const categoryCell = tr.querySelector(".cell-category");
  const actionsCell = tr.querySelector(".cell-actions");

  nameCell.innerHTML = `<input type="text" class="edit-name" value="${item.name}">`;
  priceCell.innerHTML = `<input type="number" class="edit-price" min="0" value="${item.price}">`;
  categoryCell.innerHTML = `<input type="text" class="edit-category" value="${item.category}">`;
  actionsCell.innerHTML = `<button data-save-id="${item.id}">Save</button><button data-cancel-id="${item.id}">Cancel</button>`;

  actionsCell.querySelector("[data-save-id]").addEventListener("click", () => saveMenuEdit(item.id, tr));
  actionsCell.querySelector("[data-cancel-id]").addEventListener("click", renderMenuTable);
}

async function saveMenuEdit(id, tr) {
  const name = tr.querySelector(".edit-name").value.trim();
  const price = tr.querySelector(".edit-price").value;
  const category = tr.querySelector(".edit-category").value.trim() || "other";

  try {
    await apiPut(`/menu/${id}`, { name, price: Number(price), category });
    await loadMenuTable();
  } catch (err) {
    alert(`Failed to update dish: ${err.message}`);
    console.error(err);
  }
}

async function deleteMenuItem(id) {
  if (!confirm("Delete this dish?")) return;
  try {
    await apiDelete(`/menu/${id}`);
    await loadMenuTable();
  } catch (err) {
    alert(`Failed to delete dish: ${err.message}`);
    console.error(err);
  }
}

addMenuForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  menuMessage.innerHTML = "";

  const name = document.getElementById("mName").value.trim();
  const description = document.getElementById("mDesc").value.trim();
  const price = document.getElementById("mPrice").value;
  const category = document.getElementById("mCategory").value.trim() || "other";

  try {
    await apiPost("/menu", { name, description, price, category });
    menuMessage.innerHTML = `<p class="message success">Dish added successfully</p>`;
    addMenuForm.reset();
    await loadMenuTable();
  } catch (err) {
    menuMessage.innerHTML = `<p class="message error">Error: ${err.message}</p>`;
    console.error(err);
  }
});

// ORDERS - DISPLAY / SEARCH / FILTER

const orderSearchInput = document.getElementById("orderSearchInput");
const orderStatusFilter = document.getElementById("orderStatusFilter");
const orderPaymentFilter = document.getElementById("orderPaymentFilter");

orderSearchInput.addEventListener("input", renderOrderTable);
orderStatusFilter.addEventListener("change", renderOrderTable);
orderPaymentFilter.addEventListener("change", renderOrderTable);

async function loadOrderTable() {
  try {
    allOrders = await apiGet("/orders");
    renderOrderTable();
  } catch (err) {
    console.error("Failed to load orders:", err);
  }
}

function renderOrderTable() {
  const term = orderSearchInput.value.trim().toLowerCase();
  const statusFilter = orderStatusFilter.value;
  const paymentFilter = orderPaymentFilter.value;

  const filtered = allOrders.filter((order) => {
    const paymentStatus = order.paymentStatus || "unpaid";
    const matchesTerm = !term || order.customerName.toLowerCase().includes(term) || String(order.id).includes(term);
    const matchesStatus = !statusFilter || order.status === statusFilter;
    const matchesPayment = !paymentFilter || paymentStatus === paymentFilter;
    return matchesTerm && matchesStatus && matchesPayment;
  });

  orderTableBody.innerHTML = "";
  filtered.forEach((order) => orderTableBody.append(buildOrderRow(order)));
}

function buildOrderRow(order) {
  const select = STATUS_ORDER
    .map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`)
    .join("");

  const paymentStatus = order.paymentStatus || "unpaid";
  const isPaid = paymentStatus === "paid";
  const displayId = `#${String(order.id).padStart(2, "0")}`;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${displayId}</td>
    <td>${order.customerName}</td>
    <td>${Number(order.total).toLocaleString()} VND</td>
    <td><span class="status-tag status-${order.status}">${order.status}</span></td>
    <td><span class="payment-tag payment-${paymentStatus}">${isPaid ? "Paid" : "Unpaid"}</span></td>
    <td>
      <select data-id="${order.id}">${select}</select>
      <button data-toggle-payment-id="${order.id}" data-current="${paymentStatus}">${isPaid ? "Mark Unpaid" : "Mark Paid"}</button>
      <button data-delete-id="${order.id}">Delete</button>
    </td>
  `;

  tr.querySelector("select").addEventListener("change", (e) => updateOrderStatus(order.id, e.target.value));
  tr.querySelector("button[data-toggle-payment-id]").addEventListener("click", (e) => {
    const current = e.target.dataset.current;
    togglePayment(order.id, current === "paid" ? "unpaid" : "paid");
  });
  tr.querySelector("button[data-delete-id]").addEventListener("click", () => deleteOrder(order.id));
  return tr;
}

async function updateOrderStatus(id, status) {
  try {
    await apiPut(`/orders/${id}`, { status });
    await loadOrderTable();
    await loadStats();
  } catch (err) {
    alert(`Không đổi được trạng thái đơn hàng: ${err.message}`);
    console.error(err);
  }
}

async function togglePayment(id, paymentStatus) {
  try {
    await apiPut(`/orders/${id}/payment`, { paymentStatus });
    await loadOrderTable();
    await loadStats();
  } catch (err) {
    alert(`Không đổi được trạng thái thanh toán: ${err.message}`);
    console.error(err);
  }
}

async function deleteOrder(id) {
  if (!confirm("Delete this order?")) return;
  try {
    await apiDelete(`/orders/${id}`);
    await loadOrderTable();
    await loadStats();
  } catch (err) {
    alert(`Failed to delete order: ${err.message}`);
    console.error(err);
  }
}
