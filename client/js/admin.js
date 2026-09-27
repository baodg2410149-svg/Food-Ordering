const addMenuForm = document.getElementById("addMenuForm");
const menuMessage = document.getElementById("menuMessage");
const menuTableBody = document.getElementById("menuTableBody");
const orderTableBody = document.getElementById("orderTableBody");

const STATUS_ORDER = ["pending", "preparing", "delivering", "completed", "cancelled"];

// ---- Login gate ----
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const adminMain = document.getElementById("adminMain");
const loginError = document.getElementById("loginError");
const adminKeyInput = document.getElementById("adminKeyInput");
const togglePassword = document.getElementById("togglePassword");

// Eye icon: toggles the input between hidden dots and plain text
togglePassword.addEventListener("click", () => {
  const isHidden = adminKeyInput.type === "password";
  adminKeyInput.type = isHidden ? "text" : "password";
  togglePassword.textContent = isHidden ? "🙈" : "👁";
});

// If a key was already saved this browser tab session, skip login screen.
if (sessionStorage.getItem("adminKey")) showDashboard();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const key = adminKeyInput.value;

  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });

  if (res.ok) {
    sessionStorage.setItem("adminKey", key);
    showDashboard();
  } else {
    loginError.textContent = "Wrong key";
  }
});

function showDashboard() {
  loginSection.style.display = "none";
  adminMain.style.display = "block";
  loadMenuTable();
  loadOrderTable();
  loadStats();
  async function loadStats() {
  const orders = await apiGet("/orders");

  const revenue = orders
    .filter(o => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  document.getElementById("statRevenue").textContent =
    revenue.toLocaleString() + " VND";

  document.getElementById("statOrders").textContent = orders.length;

  document.getElementById("statCompleted").textContent =
    orders.filter(o => o.status === "completed").length;

  document.getElementById("statPending").textContent =
    orders.filter(o => o.status === "pending").length;
}
}

// ---- Menu: display ----
async function loadMenuTable() {
  const menu = await apiGet("/menu");
  menuTableBody.innerHTML = "";
  menu.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.name}</td>
      <td>${item.price.toLocaleString()} VND</td>
      <td>${item.category}</td>
      <td><button data-id="${item.id}">Delete</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => deleteMenuItem(item.id));
    menuTableBody.append(tr);
  });
}

async function deleteMenuItem(id) {
  if (!confirm("Delete this dish?")) return;
  await apiDelete(`/menu/${id}`);
  loadMenuTable();
}

// ---- Menu: add new ----
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
    loadMenuTable();
  } catch (err) {
    menuMessage.innerHTML = `<p class="message error">Error: ${err.message}</p>`;
  }
});

// ---- Orders: display ----
async function loadOrderTable() {
  const orders = await apiGet("/orders");
  orderTableBody.innerHTML = "";

  orders.forEach((order) => {
    const tr = document.createElement("tr");
    const select = STATUS_ORDER
      .map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`)
      .join("");

    // Old orders created before this feature won't have paymentStatus saved,
    // so default to "unpaid" instead of showing "undefined".
    const paymentStatus = order.paymentStatus || "unpaid";
    const isPaid = paymentStatus === "paid";

    tr.innerHTML = `
      <td>${order.id}</td>
      <td>${order.customerName}</td>
      <td>${order.total.toLocaleString()} VND</td>
      <td><span class="status-${order.status}">${order.status}</span></td>
      <td><span class="payment-${paymentStatus}">${isPaid ? "Paid" : "Unpaid"}</span></td>
      <td>
        <select data-id="${order.id}">${select}</select>
        <button data-toggle-payment-id="${order.id}" data-current="${paymentStatus}">
          ${isPaid ? "Mark Unpaid" : "Mark Paid"}
        </button>
        <button data-delete-id="${order.id}">Delete</button>
      </td>
    `;
    tr.querySelector("select").addEventListener("change", (e) =>
      updateOrderStatus(order.id, e.target.value)
    );
    tr.querySelector("button[data-toggle-payment-id]").addEventListener("click", (e) => {
      const current = e.target.dataset.current;
      const next = current === "paid" ? "unpaid" : "paid";
      togglePayment(order.id, next);
    });
    tr.querySelector("button[data-delete-id]").addEventListener("click", () =>
      deleteOrder(order.id)
    );
    orderTableBody.append(tr);
  });
}

async function updateOrderStatus(id, status) {
  await apiPut(`/orders/${id}`, { status });
  loadOrderTable();
  loadStats();
}

async function togglePayment(id, paymentStatus) {
  try {
    await apiPut(`/orders/${id}/payment`, { paymentStatus });
    loadOrderTable();
    loadStats();
  } catch (err) {
    alert(`Không đổi được trạng thái thanh toán: ${err.message}`);
    console.error(err);
  }
}

async function deleteOrder(id) {
  if (!confirm("Delete this order?")) return;
  await apiDelete(`/orders/${id}`);
  loadOrderTable();
  loadStats();
}