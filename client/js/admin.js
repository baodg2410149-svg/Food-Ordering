// ============================================================
// ADMIN DASHBOARD
// ============================================================

// ---- DOM elements ----
const addMenuForm = document.getElementById("addMenuForm");
const menuMessage = document.getElementById("menuMessage");
const menuTableBody = document.getElementById("menuTableBody");
const orderTableBody = document.getElementById("orderTableBody");

const STATUS_ORDER = [
  "pending",
  "preparing",
  "delivering",
  "completed",
  "cancelled"
];

// ---- Login elements ----
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const adminMain = document.getElementById("adminMain");
const loginError = document.getElementById("loginError");
const adminKeyInput = document.getElementById("adminKeyInput");
const togglePassword = document.getElementById("togglePassword");


// ============================================================
// LOGIN
// ============================================================

// Eye icon: show/hide admin key
togglePassword.addEventListener("click", () => {
  const isHidden = adminKeyInput.type === "password";

  adminKeyInput.type = isHidden ? "text" : "password";
  togglePassword.textContent = isHidden ? "🙈" : "👁";
});


// If admin key already exists in this browser session,
// automatically show the dashboard.
if (sessionStorage.getItem("adminKey")) {
  showDashboard();
}


// Login form
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  loginError.textContent = "";

  const key = adminKeyInput.value;

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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


// ============================================================
// SHOW DASHBOARD
// ============================================================

function showDashboard() {
  loginSection.style.display = "none";
  adminMain.style.display = "block";

  // Load all dashboard data
  loadMenuTable();
  loadOrderTable();
  loadStats();
}


// ============================================================
// STATISTICS
// ============================================================

// IMPORTANT:
// This function is outside showDashboard() so that
// updateOrderStatus(), togglePayment(), and deleteOrder()
// can also use it.

async function loadStats() {
  try {
    const orders = await apiGet("/orders");

    // Calculate revenue from PAID orders only
    const revenue = orders
      .filter((order) => order.paymentStatus === "paid")
      .reduce((sum, order) => sum + Number(order.total), 0);

    // Total Revenue
    document.getElementById("statRevenue").textContent =
      revenue.toLocaleString() + " VND";

    // Total Orders
    document.getElementById("statOrders").textContent =
      orders.length;

    // Completed Orders
    document.getElementById("statCompleted").textContent =
      orders.filter((order) => order.status === "completed").length;

    // Pending Orders
    document.getElementById("statPending").textContent =
      orders.filter((order) => order.status === "pending").length;

  } catch (err) {
    console.error("Failed to load statistics:", err);
  }
}


// ============================================================
// MENU - DISPLAY
// ============================================================

async function loadMenuTable() {
  try {
    const menu = await apiGet("/menu");

    menuTableBody.innerHTML = "";

    menu.forEach((item) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${item.id}</td>
        <td>${item.name}</td>
        <td>${Number(item.price).toLocaleString()} VND</td>
        <td>${item.category}</td>
        <td>
          <button data-id="${item.id}">
            Delete
          </button>
        </td>
      `;

      tr
        .querySelector("button")
        .addEventListener("click", () => deleteMenuItem(item.id));

      menuTableBody.append(tr);
    });

  } catch (err) {
    console.error("Failed to load menu:", err);
  }
}


// ============================================================
// MENU - DELETE
// ============================================================

async function deleteMenuItem(id) {
  if (!confirm("Delete this dish?")) return;

  try {
    await apiDelete(`/menu/${id}`);

    // Refresh menu
    await loadMenuTable();

  } catch (err) {
    alert(`Failed to delete dish: ${err.message}`);
    console.error(err);
  }
}


// ============================================================
// MENU - ADD NEW DISH
// ============================================================

addMenuForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  menuMessage.innerHTML = "";

  const name = document.getElementById("mName").value.trim();
  const description = document.getElementById("mDesc").value.trim();
  const price = document.getElementById("mPrice").value;
  const category =
    document.getElementById("mCategory").value.trim() || "other";

  try {
    await apiPost("/menu", {
      name,
      description,
      price,
      category
    });

    menuMessage.innerHTML = `
      <p class="message success">
        Dish added successfully
      </p>
    `;

    // Clear form
    addMenuForm.reset();

    // Refresh menu table
    await loadMenuTable();

  } catch (err) {
    menuMessage.innerHTML = `
      <p class="message error">
        Error: ${err.message}
      </p>
    `;

    console.error(err);
  }
});


// ============================================================
// ORDERS - DISPLAY
// ============================================================

async function loadOrderTable() {
  try {
    const orders = await apiGet("/orders");

    orderTableBody.innerHTML = "";

    orders.forEach((order) => {

      // Create status options
      const select = STATUS_ORDER
        .map(
          (status) => `
            <option
              value="${status}"
              ${status === order.status ? "selected" : ""}
            >
              ${status}
            </option>
          `
        )
        .join("");


      // Old orders may not have paymentStatus.
      // Default them to unpaid.
      const paymentStatus = order.paymentStatus || "unpaid";

      const isPaid = paymentStatus === "paid";


      // Create table row
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${order.id}</td>

        <td>${order.customerName}</td>

        <td>
          ${Number(order.total).toLocaleString()} VND
        </td>

        <td>
          <span class="status-${order.status}">
            ${order.status}
          </span>
        </td>

        <td>
          <span class="payment-${paymentStatus}">
            ${isPaid ? "Paid" : "Unpaid"}
          </span>
        </td>

        <td>

          <select data-id="${order.id}">
            ${select}
          </select>

          <button
            data-toggle-payment-id="${order.id}"
            data-current="${paymentStatus}"
          >
            ${isPaid ? "Mark Unpaid" : "Mark Paid"}
          </button>

          <button
            data-delete-id="${order.id}"
          >
            Delete
          </button>

        </td>
      `;


      // ----------------------------------------
      // Change order status
      // ----------------------------------------

      tr
        .querySelector("select")
        .addEventListener("change", (e) => {
          updateOrderStatus(order.id, e.target.value);
        });


      // ----------------------------------------
      // Change payment status
      // ----------------------------------------

      tr
        .querySelector("button[data-toggle-payment-id]")
        .addEventListener("click", (e) => {

          const current = e.target.dataset.current;

          const next =
            current === "paid"
              ? "unpaid"
              : "paid";

          togglePayment(order.id, next);
        });


      // ----------------------------------------
      // Delete order
      // ----------------------------------------

      tr
        .querySelector("button[data-delete-id]")
        .addEventListener("click", () => {
          deleteOrder(order.id);
        });


      orderTableBody.append(tr);
    });

  } catch (err) {
    console.error("Failed to load orders:", err);
  }
}


// ============================================================
// ORDERS - CHANGE ORDER STATUS
// ============================================================

async function updateOrderStatus(id, status) {
  try {

    // Update backend
    await apiPut(`/orders/${id}`, {
      status
    });

    // Refresh order table
    await loadOrderTable();

    // Refresh statistics
    await loadStats();

  } catch (err) {

    alert(`Không đổi được trạng thái đơn hàng: ${err.message}`);

    console.error(err);
  }
}


// ============================================================
// ORDERS - CHANGE PAYMENT STATUS
// ============================================================

async function togglePayment(id, paymentStatus) {
  try {

    // ----------------------------------------
    // 1. Update payment in backend
    // ----------------------------------------

    await apiPut(`/orders/${id}/payment`, {
      paymentStatus
    });


    // ----------------------------------------
    // 2. Refresh order table
    // ----------------------------------------

    await loadOrderTable();


    // ----------------------------------------
    // 3. Refresh dashboard statistics
    // ----------------------------------------

    await loadStats();


    // No error message here because everything
    // succeeded.


  } catch (err) {

    // Only show an error if the API request
    // actually failed.

    alert(
      `Không đổi được trạng thái thanh toán: ${err.message}`
    );

    console.error(err);
  }
}


// ============================================================
// ORDERS - DELETE
// ============================================================

async function deleteOrder(id) {
  if (!confirm("Delete this order?")) return;

  try {

    // Delete from backend
    await apiDelete(`/orders/${id}`);


    // Refresh order table
    await loadOrderTable();


    // Refresh statistics
    await loadStats();

  } catch (err) {

    alert(`Failed to delete order: ${err.message}`);

    console.error(err);
  }
}