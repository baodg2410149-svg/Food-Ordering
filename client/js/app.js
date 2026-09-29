const menuGrid = document.getElementById("menuGrid");
const cartList = document.getElementById("cartList");
const totalEl = document.getElementById("total");
const cartCount = document.getElementById("cartCount");
const emptyCart = document.getElementById("emptyCart");
const searchBox = document.getElementById("searchBox");
const orderForm = document.getElementById("orderForm");
const orderMessage = document.getElementById("orderMessage");
const cartDrawer = document.getElementById("cartDrawer");
const cartBackdrop = document.getElementById("cartBackdrop");
const cartToggle = document.getElementById("cartToggle");
const cartClose = document.getElementById("cartClose");

// Presentation metadata only: all order values and payloads remain API-driven.
const DISH_PRESENTATION = {
  1: { englishName: "Beef Pho", vietnameseName: "Phở bò", image: "assets/food/pho bo.jpg" },
  2: { englishName: "Brisket Pho", vietnameseName: "Phở gầu", image: "assets/food/pho gau.jpg" },
  3: { englishName: "Flank Pho", vietnameseName: "Phở nạm", image: "assets/food/pho nam.jpg" },
  4: { englishName: "Chicken Pho", vietnameseName: "Phở gà", image: "assets/food/pho ga.jpg" },
  5: { englishName: "Vietnamese Fried Dough", vietnameseName: "Quẩy", image: "assets/food/quay.jpg" },
  6: { englishName: "Poached Egg", vietnameseName: "Trứng trần", image: "assets/food/trung tran.jpg" },
  7: { englishName: "Vietnamese Iced Tea", vietnameseName: "Trà đá", image: "assets/food/tra da.jpg" },
  8: { englishName: "Soy Milk", vietnameseName: "Sữa đậu nành", image: "assets/food/sua dau.jpg" }
};

let cart = [];
let activeCategory = "";
let searchTimer;

// Maps item id -> { item, footer } so we can rebuild just one card's
// footer (Add button <-> quantity stepper) without reloading the grid.
const cardFootersById = new Map();

const formatPrice = (price) => `${Number(price).toLocaleString()} VND`;

function presentationFor(item) {
  const presentation = DISH_PRESENTATION[item.id] || {};
  return {
    englishName: presentation.englishName || item.name,
    vietnameseName: presentation.vietnameseName || item.name,
    image: item.image || presentation.image || ""
  };
}

const imageFor = (item) => String(item.image || presentationFor(item).image || "").trim();

// Search now matches the Vietnamese name (from the API), the English
// name (from DISH_PRESENTATION) and the description - done here on
// the client, since the server only knows the Vietnamese name.
function matchesSearch(item, term) {
  if (!term) return true;
  const p = presentationFor(item);
  return (
    item.name.toLowerCase().includes(term) ||
    p.englishName.toLowerCase().includes(term) ||
    p.vietnameseName.toLowerCase().includes(term) ||
    (item.description || "").toLowerCase().includes(term)
  );
}

async function loadMenu() {
  menuGrid.innerHTML = '<p class="menu-status">Preparing the menu...</p>';

  const params = new URLSearchParams();
  if (activeCategory) params.set("category", activeCategory);

  try {
    const query = params.toString() ? `?${params}` : "";
    const menu = await apiGet(`/menu${query}`);
    const term = searchBox.value.trim().toLowerCase();
    renderMenu(menu.filter((item) => matchesSearch(item, term)));
  } catch (err) {
    menuGrid.innerHTML = `<p class="menu-status is-error">Unable to load the menu. ${err.message}</p>`;
  }
}

function renderMenu(menu) {
  menuGrid.innerHTML = "";
  cardFootersById.clear();

  if (!menu.length) {
    menuGrid.innerHTML = '<p class="menu-status">No dishes match your search.</p>';
    return;
  }

  menu.forEach((item) => {
    const p = presentationFor(item);
    const card = document.createElement("article");
    const imageWrap = document.createElement("div");
    const body = document.createElement("div");
    const source = imageFor(item);

    card.className = "food-card";
    imageWrap.className = "food-image";

    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = `${p.englishName} (${p.vietnameseName})`;
      image.loading = "lazy";
      image.addEventListener("error", () => image.remove());
      imageWrap.append(image);
    }

    const fallback = document.createElement("span");
    fallback.className = "image-fallback";
    fallback.textContent = item.category === "drink" ? "○" : "✦";
    imageWrap.append(fallback);

    body.className = "food-card-body";

    const category = document.createElement("p");
    const title = document.createElement("h3");
    const vietnamese = document.createElement("p");
    const description = document.createElement("p");
    const footer = document.createElement("div");

    category.className = "food-category";
    category.textContent = item.category || "menu";
    title.textContent = p.englishName;
    vietnamese.className = "vietnamese-name";
    vietnamese.textContent = p.vietnameseName;
    description.className = "food-description";
    description.textContent = item.description || "Prepared with care for your table.";
    footer.className = "food-card-footer";

    renderCardFooter(item, footer);
    cardFootersById.set(item.id, { item, footer });

    body.append(category, title, vietnamese, description, footer);
    card.append(imageWrap, body);
    menuGrid.append(card);
  });
}

// Draws the footer of one card: price + either an "Add to order"
// button (not in cart yet) or a quantity stepper (already in cart).
// Called again after any cart change so the card stays in sync
// without reloading the whole menu grid.
function renderCardFooter(item, footer) {
  footer.replaceChildren();

  const price = document.createElement("strong");
  price.textContent = formatPrice(item.price);
  footer.append(price);

  const cartItem = cart.find((c) => c.id === item.id);
  const p = presentationFor(item);

  if (!cartItem) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-button";
    add.textContent = item.available === false ? "Unavailable" : "Add to order";
    add.disabled = item.available === false;
    add.addEventListener("click", () => addToCart(item));
    footer.append(add);
    return;
  }

  const stepper = document.createElement("div");
  stepper.className = "card-quantity-controls";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "step-btn";
  minus.textContent = "−";
  minus.setAttribute("aria-label", `Decrease ${p.englishName}`);
  minus.addEventListener("click", () => changeQuantity(item.id, -1));

  const qty = document.createElement("span");
  qty.className = "step-qty";
  qty.textContent = cartItem.quantity;

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "step-btn";
  plus.textContent = "+";
  plus.setAttribute("aria-label", `Increase ${p.englishName}`);
  plus.addEventListener("click", () => changeQuantity(item.id, 1));

  stepper.append(minus, qty, plus);
  footer.append(stepper);
}

function refreshCardFooter(id) {
  const entry = cardFootersById.get(id);
  if (entry) renderCardFooter(entry.item, entry.footer);
}

function addToCart(item) {
  const existing = cart.find((c) => c.id === item.id);
  if (existing) existing.quantity += 1;
  else cart.push({ id: item.id, name: item.name, price: item.price, quantity: 1 });
  renderCart();
  refreshCardFooter(item.id);
}

function changeQuantity(id, amount) {
  const item = cart.find((c) => c.id === id);
  if (!item) return;
  item.quantity += amount;
  if (item.quantity <= 0) cart = cart.filter((c) => c.id !== id);
  renderCart();
  refreshCardFooter(id);
}

function renderCart() {
  cartList.innerHTML = "";
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = count;
  cartToggle.setAttribute("aria-label", `Your order, ${count} ${count === 1 ? "item" : "items"}`);
  emptyCart.hidden = Boolean(cart.length);

  cart.forEach((item) => {
    const p = presentationFor(item);
    const row = document.createElement("li");
    const text = document.createElement("div");
    const name = document.createElement("strong");
    const sub = document.createElement("span");
    const controls = document.createElement("div");

    row.className = "cart-item";
    name.textContent = p.englishName;
    sub.textContent = `${formatPrice(item.price)} · ${formatPrice(item.price * item.quantity)}`;
    text.append(name, sub);

    controls.className = "quantity-controls";
    [["−", "Decrease", -1], ["+", "Increase", 1]].forEach(([symbol, label, amount]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = symbol;
      button.setAttribute("aria-label", `${label} ${p.englishName}`);
      button.addEventListener("click", () => changeQuantity(item.id, amount));
      controls.append(button);
      if (amount === -1) {
        const quantity = document.createElement("span");
        quantity.textContent = item.quantity;
        controls.append(quantity);
      }
    });

    row.append(text, controls);
    cartList.append(row);
  });

  totalEl.textContent = formatPrice(cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
}

function openCart() {
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
  cartBackdrop.hidden = false;
  cartToggle.setAttribute("aria-expanded", "true");
  cartClose.focus();
}

function closeCart() {
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  cartBackdrop.hidden = true;
  cartToggle.setAttribute("aria-expanded", "false");
  cartToggle.focus();
}

document.querySelectorAll(".category-tab").forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll(".category-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    loadMenu();
  });
});

searchBox.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadMenu, 250);
});

cartToggle.addEventListener("click", openCart);
cartClose.addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) closeCart();
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  orderMessage.replaceChildren();

  const customerName = document.getElementById("customerName").value.trim();
  const tableNumber = document.getElementById("tableNumber").value.trim();

  if (!customerName || !cart.length) {
    showOrderMessage(!customerName ? "Please enter your name." : "Your cart is empty.", "error");
    return;
  }

  try {
    const order = await apiPost("/orders", { customerName, tableNumber, items: cart });
    cart = [];
    renderCart();
    // Reset every card footer back to "Add to order" now that the cart is empty.
    cardFootersById.forEach(({ item, footer }) => renderCardFooter(item, footer));
    orderForm.reset();
    showOrderSuccess(order);
  } catch (err) {
    showOrderMessage(`Unable to place the order: ${err.message}`, "error");
  }
});

function showOrderMessage(message, type) {
  const notice = document.createElement("p");
  notice.className = `message ${type}`;
  notice.textContent = message;
  orderMessage.replaceChildren(notice);
}

function showOrderSuccess(order) {
  const notice = document.createElement("p");
  const link = document.createElement("a");
  notice.className = "message success";
  notice.textContent = `Order #${order.id} is confirmed. `;
  link.href = `Order_tracking.html?orderId=${encodeURIComponent(order.id)}`;
  link.textContent = "Track my order";
  notice.append(link);
  orderMessage.replaceChildren(notice);
}

loadMenu();