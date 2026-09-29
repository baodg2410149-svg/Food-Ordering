const trackForm = document.getElementById("trackForm");
const orderInput = document.getElementById("orderId");
const trackButton = document.getElementById("trackButton");
const trackMessage = document.getElementById("trackMessage");
const trackingResult = document.getElementById("trackingResult");
const summaryCard = document.getElementById("summaryCard");
const statusCard = document.getElementById("statusCard");
const timelineEl = document.getElementById("timeline");
const orderItemsEl = document.getElementById("orderItems");
const deliverySection = document.getElementById("deliverySection");
const deliveryDetails = document.getElementById("deliveryDetails");
const supportOpen = document.getElementById("supportOpen");
const supportPanel = document.getElementById("supportPanel");
const supportClose = document.getElementById("supportClose");
const supportForm = document.getElementById("supportForm");
const supportMessage = document.getElementById("supportMessage");
const supportLog = document.getElementById("supportLog");
const supportCopy = document.getElementById("supportCopy");

const POLL_INTERVAL = 20000;
const MAX_POLL_ERRORS = 3;

const DISH_PRESENTATION = {
  1: { englishName: "Beef Pho", vietnameseName: "Phở bò", image: "assets/food/pho bo.jpg" },
  2: { englishName: "Brisket Pho", vietnameseName: "Phở gầu", image: "assets/food/pho gau.jpg" },
  3: { englishName: "Flank Pho", vietnameseName: "Phở nạm", image: "assets/food/pho nam.jpg" },
  4: { englishName: "Chicken Pho", vietnameseName: "Phở gà", image: "assets/food/pho ga.jpg" },
  5: { englishName: "Vietnamese Fried Dough", vietnameseName: "Quẩy", image: "assets/food/quay.jpg" },
  6: { englishName: "Poached Egg", vietnameseName: "Trứng trần", image: "assets/food/trung tran.jpg" },
  7: { englishName: "Vietnamese Iced Tea", vietnameseName: "Trà đá", image: "assets/food/tra da.jpg" },
  8: { englishName: "Soy Milk", vietnameseName: "Sữa đậu nành", image: "assets/food/sua dau.jpg" },
};

const TRACKING_STAGES = [
  {
    key: "placed",
    title: "Order Placed",
    description: "The restaurant has received your order.",
    statuses: ["pending", "confirmed", "received"],
  },
  {
    key: "preparing",
    title: "Preparing",
    description: "Our kitchen is preparing your Vietnamese dishes.",
    statuses: ["preparing", "ready", "cooking", "processing"],
  },
  {
    key: "dispatched",
    title: "Dispatched",
    description: "Your order has been picked up and is on the way.",
    statuses: ["delivering", "out_for_delivery", "dispatched", "on_the_way"],
  },
  {
    key: "delivered",
    title: "Delivered",
    description: "Your food has arrived. Enjoy your meal!",
    statuses: ["completed", "delivered"],
  },
];

const STATUS_LABELS = {
  pending: "Order received",
  preparing: "Preparing your order",
  delivering: "Your order is on the way",
  completed: "Delivered",
  cancelled: "Order cancelled",
};

let activeOrderId = "";
let activeOrder = null;
let pollingTimer = null;
let pollingErrors = 0;
let requestInFlight = false;

trackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadOrder(orderInput.value, { manual: true });
});

supportOpen.addEventListener("click", openSupportChat);
supportClose.addEventListener("click", closeSupportChat);
supportForm.addEventListener("submit", sendSupportMessage);
document.querySelectorAll(".quick-options button").forEach((button) => {
  button.addEventListener("click", () => {
    supportMessage.value = button.textContent;
    supportMessage.focus();
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else if (activeOrder && shouldPoll(activeOrder)) {
    startPolling();
  }
});

window.addEventListener("beforeunload", stopPolling);

initFromUrl();

async function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId") || params.get("id");
  if (!orderId) return;
  orderInput.value = orderId;
  await loadOrder(orderId);
}

async function loadOrder(rawId, options = {}) {
  const id = normalizeOrderId(rawId);

  if (!id) {
    showError("Please enter your order number.");
    trackingResult.hidden = true;
    stopPolling();
    return;
  }

  if (requestInFlight) return;

  requestInFlight = true;
  setLoading(true, options.silent);

  try {
    const order = await fetchOrder(id);
    const previousStatus = activeOrder ? normalizedStatus(activeOrder.status) : "";
    activeOrderId = String(order.id);
    activeOrder = order;
    pollingErrors = 0;
    renderOrder(order);
    updateUrl(order.id);
    if (!options.silent) {
      showMessage("Order found.", "success");
    } else if (previousStatus && previousStatus !== normalizedStatus(order.status)) {
      showMessage("Order status updated.", "success");
    }

    if (shouldPoll(order)) {
      startPolling();
    } else {
      stopPolling();
    }
  } catch (err) {
    if (options.silent) {
      pollingErrors += 1;
      if (pollingErrors >= MAX_POLL_ERRORS) stopPolling();
    } else {
      trackingResult.hidden = true;
      stopPolling();
      showError(errorMessageFor(err));
    }
  } finally {
    requestInFlight = false;
    setLoading(false, options.silent);
  }
}

async function fetchOrder(id) {
  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}`, {
    headers: typeof authHeaders === "function" ? authHeaders() : {},
  });

  if (!res.ok) {
    const err = new Error(`Order lookup failed with ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

function renderOrder(order) {
  trackingResult.hidden = false;
  renderSummary(order);
  renderStatusInfo(order);
  renderTrackingTimeline(order);
  renderOrderItems(order.items || []);
  renderDeliveryDetails(order);
  updateSupportState(order);
}

function renderSummary(order) {
  summaryCard.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = `Order #${order.id}`;

  const placed = document.createElement("p");
  placed.className = "summary-meta";
  placed.textContent = `Placed at: ${formatDateTime(order.createdAt)}`;

  const itemsHeading = document.createElement("p");
  itemsHeading.className = "eyebrow";
  itemsHeading.textContent = "Items";

  const lines = document.createElement("div");
  lines.className = "summary-lines";

  (order.items || []).forEach((item) => {
    const line = document.createElement("div");
    line.className = "summary-line";
    const name = document.createElement("span");
    name.textContent = `${Number(item.quantity || 0)}x ${displayName(item)}`;
    const price = document.createElement("strong");
    price.textContent = formatCurrency(lineTotal(item));
    line.append(name, price);
    lines.append(line);
  });

  const subtotal = document.createElement("div");
  subtotal.className = "summary-line";
  subtotal.append(textSpan("Subtotal"), strongText(formatCurrency(subtotalFor(order))));

  const total = document.createElement("div");
  total.className = "summary-line total";
  total.append(textSpan("Total"), strongText(formatCurrency(totalFor(order))));

  lines.append(subtotal, total);

  const payment = document.createElement("p");
  payment.className = "summary-meta";
  payment.textContent = `Payment method: ${paymentLabel(order)}`;

  const estimate = document.createElement("p");
  estimate.className = "summary-meta";
  estimate.textContent = `Estimated delivery: ${formatDeliveryWindow(order)}`;

  summaryCard.append(heading, placed, itemsHeading, lines, payment, estimate);
}

function renderStatusInfo(order) {
  statusCard.replaceChildren();

  const status = normalizedStatus(order.status);
  const pill = document.createElement("span");
  pill.className = `status-pill${status === "cancelled" ? " cancelled" : ""}`;
  pill.textContent = status === "cancelled" ? "Cancelled" : currentStageTitle(order);

  const note = document.createElement("p");
  note.className = "status-note";
  note.textContent = statusCopy(order);

  const facts = document.createElement("dl");
  facts.className = "status-facts";
  facts.append(
    fact("Current Status", statusLabel(order)),
    fact("Estimated Arrival", formatArrivalWindow(order)),
    fact("Last Updated", formatTime(lastUpdatedAt(order)))
  );

  statusCard.append(pill, note, facts);

  if (isLate(order)) {
    const late = document.createElement("p");
    late.className = "late-warning";
    late.textContent = "Your order is taking longer than expected.";
    statusCard.append(late);
  }
}

function renderTrackingTimeline(order) {
  timelineEl.replaceChildren();
  const currentIndex = stageIndexFor(order.status);
  const historyByStage = statusHistoryByStage(order);
  const isCancelled = normalizedStatus(order.status) === "cancelled";

  TRACKING_STAGES.forEach((stage, index) => {
    const step = document.createElement("li");
    let stateClass = "is-future";
    if (!isCancelled && index < currentIndex) stateClass = "is-complete";
    if (!isCancelled && index === currentIndex) stateClass = "is-current";
    if (!isCancelled && currentIndex === TRACKING_STAGES.length - 1 && index === currentIndex) {
      stateClass = "is-complete";
    }

    step.className = `timeline-step ${stateClass}`;
    step.setAttribute("aria-current", stateClass === "is-current" ? "step" : "false");

    const marker = document.createElement("span");
    marker.className = "timeline-marker";
    marker.textContent = stateClass === "is-complete" ? "✓" : stateClass === "is-current" ? "●" : "○";

    const title = document.createElement("h3");
    title.className = "timeline-title";
    title.textContent = stage.title;

    const copy = document.createElement("p");
    copy.className = "timeline-copy";
    copy.textContent = stage.description;

    const time = historyByStage[stage.key];
    if (time) {
      const timeEl = document.createElement("span");
      timeEl.className = "timeline-time";
      timeEl.textContent = formatTime(time);
      copy.append(timeEl);
    }

    step.append(marker, title, copy);
    timelineEl.append(step);
  });
}

function renderOrderItems(items) {
  orderItemsEl.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "summary-meta";
    empty.textContent = "No items were saved with this order.";
    orderItemsEl.append(empty);
    return;
  }

  items.forEach((item) => {
    const presentation = presentationFor(item);
    const article = document.createElement("article");
    article.className = "tracked-item";

    const imageWrap = document.createElement("div");
    imageWrap.className = "tracked-item-image";
    const imageSource = String(item.image || presentation.image || "").trim();
    if (imageSource) {
      const image = document.createElement("img");
      image.src = imageSource;
      image.alt = `${presentation.englishName} (${presentation.vietnameseName})`;
      image.loading = "lazy";
      image.addEventListener("error", () => image.remove());
      imageWrap.append(image);
    }
    const fallback = document.createElement("span");
    fallback.className = "image-fallback";
    fallback.textContent = "✦";
    imageWrap.append(fallback);

    const body = document.createElement("div");
    body.className = "tracked-item-body";
    const name = document.createElement("h3");
    name.textContent = presentation.englishName;
    const vietnamese = document.createElement("p");
    vietnamese.className = "vietnamese-name";
    vietnamese.textContent = presentation.vietnameseName;
    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = `Quantity: ${Number(item.quantity || 0)} · ${formatCurrency(item.price)} each`;
    const total = document.createElement("p");
    total.className = "item-total";
    total.textContent = formatCurrency(lineTotal(item));

    body.append(name, vietnamese, meta, total);
    article.append(imageWrap, body);
    orderItemsEl.append(article);
  });
}

function renderDeliveryDetails(order) {
  deliveryDetails.replaceChildren();
  const rows = [
    ["Customer", order.customerName],
    ["Phone", order.phone || order.customerPhone],
    ["Address", order.address || order.deliveryAddress],
    ["Table", order.tableNumber],
    ["Driver", order.driverName || order.driver],
    ["Estimated arrival", formatArrivalWindow(order)],
  ].filter(([, value]) => value && value !== "Not available");

  deliverySection.hidden = rows.length === 0;
  rows.forEach(([label, value]) => deliveryDetails.append(detailTerm(label), detailValue(value)));
}

function updateSupportState(order) {
  supportCopy.textContent = isLate(order)
    ? "Your order is taking longer than expected. Contact our restaurant and we will check it right away."
    : "If your order is taking longer than expected, contact our restaurant for assistance.";
}

function startPolling() {
  stopPolling();
  if (document.hidden) return;
  pollingTimer = window.setInterval(() => {
    if (activeOrderId) loadOrder(activeOrderId, { silent: true });
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollingTimer) window.clearInterval(pollingTimer);
  pollingTimer = null;
}

function shouldPoll(order) {
  return !["completed", "delivered", "cancelled"].includes(normalizedStatus(order.status));
}

function setLoading(isLoading, silent) {
  if (silent) return;
  trackButton.disabled = isLoading;
  trackButton.innerHTML = isLoading ? '<span class="loading-spinner" aria-hidden="true"></span>Finding...' : "Track Order";
  if (isLoading) showMessage("Finding your order...", "");
}

function showError(message) {
  showMessage(message, "error");
}

function showMessage(message, type) {
  trackMessage.className = `tracking-message${type ? ` ${type}` : ""}`;
  trackMessage.textContent = message;
}

function errorMessageFor(err) {
  if (err.status === 404) return "We couldn't find this order. Please check your order number and try again.";
  return "We're having trouble retrieving your order right now. Please try again.";
}

function openSupportChat() {
  supportPanel.hidden = false;
  supportPanel.setAttribute("aria-hidden", "false");
  supportMessage.focus();
}

function closeSupportChat() {
  supportPanel.hidden = true;
  supportPanel.setAttribute("aria-hidden", "true");
  supportOpen.focus();
}

function sendSupportMessage(event) {
  event.preventDefault();
  const message = supportMessage.value.trim();
  if (!message) return;

  const customer = document.createElement("p");
  customer.textContent = `You: ${message}`;
  const reply = document.createElement("p");
  reply.textContent = `Phở Việt Support: Thank you. We will check order #${activeOrderId || "your order"} and assist you shortly.`;
  supportLog.append(customer, reply);
  supportMessage.value = "";
  supportLog.scrollTop = supportLog.scrollHeight;
}

function normalizeOrderId(value) {
  return String(value || "").trim().replace(/^#/, "");
}

function updateUrl(orderId) {
  const url = new URL(window.location.href);
  url.searchParams.set("orderId", orderId);
  window.history.replaceState({}, "", url);
}

function normalizedStatus(status) {
  return String(status || "pending").toLowerCase();
}

function stageIndexFor(status) {
  const normalized = normalizedStatus(status);
  const index = TRACKING_STAGES.findIndex((stage) => stage.statuses.includes(normalized));
  return index === -1 ? 0 : index;
}

function currentStageTitle(order) {
  return TRACKING_STAGES[stageIndexFor(order.status)].title;
}

function statusLabel(order) {
  const status = normalizedStatus(order.status);
  return STATUS_LABELS[status] || currentStageTitle(order);
}

function statusCopy(order) {
  const status = normalizedStatus(order.status);
  if (status === "cancelled") return "This order has been cancelled. Please contact support if you need help.";
  return TRACKING_STAGES[stageIndexFor(status)].description;
}

function statusHistoryByStage(order) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const byStage = {};

  if (order.createdAt) byStage.placed = order.createdAt;

  history.forEach((entry) => {
    const stage = TRACKING_STAGES[stageIndexFor(entry.status)];
    if (stage && entry.at && !byStage[stage.key]) byStage[stage.key] = entry.at;
  });

  return byStage;
}

function lastUpdatedAt(order) {
  return order.statusUpdatedAt || latestHistoryTime(order) || order.createdAt;
}

function latestHistoryTime(order) {
  if (!Array.isArray(order.statusHistory) || !order.statusHistory.length) return "";
  return order.statusHistory[order.statusHistory.length - 1].at;
}

function isLate(order) {
  const deadline = parseDate(order.estimatedDeliveryEndAt || order.estimatedArrivalEndAt);
  return Boolean(deadline && Date.now() > deadline.getTime() && shouldPoll(order));
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")} VND`;
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "Not available";
  return `${formatTime(date)} - ${date.toLocaleDateString("vi-VN")}`;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return "Not available";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function formatDeliveryWindow(order) {
  if (order.estimatedDeliveryStartAt && order.estimatedDeliveryEndAt) {
    return `${formatTime(order.estimatedDeliveryStartAt)} - ${formatTime(order.estimatedDeliveryEndAt)}`;
  }
  if (order.estimatedMinutesMin && order.estimatedMinutesMax) {
    return `${order.estimatedMinutesMin}-${order.estimatedMinutesMax} minutes`;
  }
  return "Not available";
}

function formatArrivalWindow(order) {
  return formatDeliveryWindow(order);
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function presentationFor(item) {
  const presentation = DISH_PRESENTATION[item.id] || {};
  const vietnameseNames = {
    1: "Ph\u1edf b\u00f2",
    2: "Ph\u1edf g\u1ea7u",
    3: "Ph\u1edf n\u1ea1m",
    4: "Ph\u1edf g\u00e0",
    5: "Qu\u1ea9y",
    6: "Tr\u1ee9ng tr\u1ea7n",
    7: "Tr\u00e0 \u0111\u00e1",
    8: "S\u1eefa \u0111\u1eadu n\u00e0nh",
  };

  return {
    englishName: presentation.englishName || item.name || "Menu item",
    vietnameseName: vietnameseNames[item.id] || item.name || "Menu item",
    image: item.image || presentation.image || "",
  };
}

function displayName(item) {
  return presentationFor(item).englishName;
}

function lineTotal(item) {
  return Number(item.price || 0) * Number(item.quantity || 0);
}

function subtotalFor(order) {
  if (Array.isArray(order.items) && order.items.length) {
    return order.items.reduce((sum, item) => sum + lineTotal(item), 0);
  }
  return Number(order.total || 0);
}

function totalFor(order) {
  return Number(order.total || subtotalFor(order));
}

function paymentLabel(order) {
  const method = order.paymentMethod || order.paymentType;
  if (method) return method;
  return order.paymentStatus === "paid" ? "Paid" : "Unpaid";
}

function textSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function strongText(text) {
  const strong = document.createElement("strong");
  strong.textContent = text;
  return strong;
}

function fact(label, value) {
  const wrap = document.createElement("div");
  wrap.append(detailTerm(label), detailValue(value));
  return wrap;
}

function detailTerm(text) {
  const dt = document.createElement("dt");
  dt.textContent = text;
  return dt;
}

function detailValue(text) {
  const dd = document.createElement("dd");
  dd.textContent = text;
  return dd;
}
