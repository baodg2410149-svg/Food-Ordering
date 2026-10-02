const express = require("express");
const router = express.Router();
const { readData, writeData, nextId } = require("../utils/db");
const { requireAdmin } = require("../middleware/adminAuth");

const SUPPORT_FILE = "support.json";
const ORDERS_FILE = "orders.json";
const VALID_STATUSES = ["open", "in_progress", "resolved"];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_MESSAGE_LENGTH = 1000;

function nowIso() {
  return new Date().toISOString();
}

function readSupportData() {
  const data = readData(SUPPORT_FILE);
  if (!Array.isArray(data)) return [];

  let changed = false;
  const conversations = data.map((entry) => {
    if (Array.isArray(entry.messages)) return entry;

    changed = true;
    const createdAt = entry.createdAt || nowIso();
    return {
      id: entry.id,
      orderId: entry.orderId || null,
      customerName: entry.customerName || "Customer",
      status: normalizeStatus(entry.status),
      unreadForAdmin: entry.status === "resolved" ? 0 : 1,
      unreadForCustomer: 0,
      createdAt,
      updatedAt: entry.updatedAt || createdAt,
      messages: [
        {
          id: 1,
          sender: "customer",
          text: entry.message || "",
          createdAt,
          clientMessageId: null,
          readByAdminAt: null,
          readByCustomerAt: createdAt,
        },
      ],
    };
  });

  if (changed) writeSupportData(conversations);
  return conversations;
}

function writeSupportData(conversations) {
  writeData(SUPPORT_FILE, conversations);
}

function readOrders() {
  return readData(ORDERS_FILE);
}

function orderForId(orderId) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return readOrders().find((order) => order.id === id) || null;
}

function normalizeStatus(status) {
  if (status === "handling") return "in_progress";
  if (status === "new") return "open";
  return VALID_STATUSES.includes(status) ? status : "open";
}

function validateMessage(message) {
  const text = String(message || "").trim();
  if (!text) return { error: "Message cannot be empty" };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.` };
  }
  return { text };
}

function pageOptions(req) {
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

function nextMessageId(conversation) {
  return nextId(conversation.messages || []);
}

function latestMessage(conversation) {
  const messages = conversation.messages || [];
  return messages[messages.length - 1] || null;
}

function conversationSummary(conversation, order = null) {
  const last = latestMessage(conversation);
  return {
    id: conversation.id,
    orderId: conversation.orderId,
    customerName: conversation.customerName,
    status: normalizeStatus(conversation.status),
    unreadForAdmin: conversation.unreadForAdmin || 0,
    unreadForCustomer: conversation.unreadForCustomer || 0,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessage: last
      ? {
          id: last.id,
          sender: last.sender,
          text: last.text,
          createdAt: last.createdAt,
        }
      : null,
    order: order
      ? {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus || "unpaid",
          total: order.total,
          tableNumber: order.tableNumber || null,
        }
      : null,
  };
}

function findConversationByOrder(conversations, orderId) {
  return conversations.find((conversation) => Number(conversation.orderId) === Number(orderId));
}

function requireCustomerConversation(req, conversations) {
  const conversation = conversations.find((item) => item.id === Number(req.params.id));
  if (!conversation) return { status: 404, error: "Conversation not found" };

  const orderId = Number(req.body.orderId || req.query.orderId);
  if (!orderId || Number(conversation.orderId) !== orderId) {
    return { status: 403, error: "You do not have access to this conversation" };
  }

  const order = orderForId(orderId);
  if (!order) return { status: 404, error: "Order not found" };
  return { conversation, order };
}

function appendMessage(conversation, sender, text, clientMessageId = null) {
  const createdAt = nowIso();
  const message = {
    id: nextMessageId(conversation),
    sender,
    text,
    createdAt,
    clientMessageId,
    readByAdminAt: sender === "admin" ? createdAt : null,
    readByCustomerAt: sender === "customer" ? createdAt : null,
  };

  conversation.messages.push(message);
  conversation.updatedAt = createdAt;

  if (sender === "customer") {
    conversation.unreadForAdmin = (conversation.unreadForAdmin || 0) + 1;
    if (conversation.status === "resolved") conversation.status = "open";
  } else {
    conversation.unreadForCustomer = (conversation.unreadForCustomer || 0) + 1;
  }

  return message;
}

// ADMIN: list support conversations with search, status filter and pagination
router.get("/admin/conversations", requireAdmin, (req, res) => {
  const { limit, offset } = pageOptions(req);
  const status = req.query.status ? normalizeStatus(req.query.status) : "";
  const search = String(req.query.search || "").trim().toLowerCase();

  const ordersById = new Map(readOrders().map((order) => [order.id, order]));
  let conversations = readSupportData();

  if (status) {
    conversations = conversations.filter((conversation) => normalizeStatus(conversation.status) === status);
  }

  if (search) {
    conversations = conversations.filter((conversation) => {
      const orderId = conversation.orderId ? String(conversation.orderId) : "";
      return (
        String(conversation.customerName || "").toLowerCase().includes(search) ||
        orderId.includes(search)
      );
    });
  }

  conversations.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  res.json({
    items: conversations
      .slice(offset, offset + limit)
      .map((conversation) => conversationSummary(conversation, ordersById.get(conversation.orderId))),
    total: conversations.length,
    offset,
    limit,
    hasMore: offset + limit < conversations.length,
    unreadTotal: conversations.reduce((sum, conversation) => sum + (conversation.unreadForAdmin || 0), 0),
  });
});

// ADMIN: read one conversation and a page of recent messages
router.get("/admin/conversations/:id", requireAdmin, (req, res) => {
  const { limit, offset } = pageOptions(req);
  const conversations = readSupportData();
  const conversation = conversations.find((item) => item.id === Number(req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  conversation.unreadForAdmin = 0;
  const readAt = nowIso();
  conversation.messages.forEach((message) => {
    if (message.sender === "customer" && !message.readByAdminAt) message.readByAdminAt = readAt;
  });
  writeSupportData(conversations);

  const messages = conversation.messages || [];
  const end = messages.length - offset;
  const start = Math.max(end - limit, 0);
  const page = end > 0 ? messages.slice(start, end) : [];
  const order = conversation.orderId ? orderForId(conversation.orderId) : null;

  res.json({
    conversation: conversationSummary(conversation, order),
    messages: page,
    totalMessages: messages.length,
    nextOffset: start > 0 ? offset + page.length : null,
  });
});

// ADMIN: send a reply
router.post("/admin/conversations/:id/messages", requireAdmin, (req, res) => {
  const validation = validateMessage(req.body.message);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const conversations = readSupportData();
  const conversation = conversations.find((item) => item.id === Number(req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const message = appendMessage(conversation, "admin", validation.text);
  if (conversation.status === "open") conversation.status = "in_progress";
  writeSupportData(conversations);
  res.status(201).json({ message, conversation: conversationSummary(conversation, orderForId(conversation.orderId)) });
});

// ADMIN: update conversation status
router.put("/admin/conversations/:id/status", requireAdmin, (req, res) => {
  const status = normalizeStatus(req.body.status);
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}` });
  }

  const conversations = readSupportData();
  const conversation = conversations.find((item) => item.id === Number(req.params.id));

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  conversation.status = status;
  conversation.updatedAt = nowIso();
  writeSupportData(conversations);
  res.json(conversationSummary(conversation, orderForId(conversation.orderId)));
});

// CUSTOMER: create or open the support conversation for an order
router.post("/conversations", (req, res) => {
  const order = orderForId(req.body.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const conversations = readSupportData();
  let conversation = findConversationByOrder(conversations, order.id);

  if (!conversation) {
    const createdAt = nowIso();
    conversation = {
      id: nextId(conversations),
      orderId: order.id,
      customerName: order.customerName || "Customer",
      status: "open",
      unreadForAdmin: 0,
      unreadForCustomer: 0,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    };
    conversations.push(conversation);
    writeSupportData(conversations);
  }

  res.status(201).json({ conversation: conversationSummary(conversation, order) });
});

// CUSTOMER: read messages for own order conversation
router.get("/conversations/:id/messages", (req, res) => {
  const { limit, offset } = pageOptions(req);
  const conversations = readSupportData();
  const result = requireCustomerConversation(req, conversations);

  if (result.error) return res.status(result.status).json({ error: result.error });

  result.conversation.unreadForCustomer = 0;
  const readAt = nowIso();
  result.conversation.messages.forEach((message) => {
    if (message.sender === "admin" && !message.readByCustomerAt) message.readByCustomerAt = readAt;
  });
  writeSupportData(conversations);

  const messages = result.conversation.messages || [];
  const end = messages.length - offset;
  const start = Math.max(end - limit, 0);
  const page = end > 0 ? messages.slice(start, end) : [];

  res.json({
    conversation: conversationSummary(result.conversation, result.order),
    messages: page,
    totalMessages: messages.length,
    nextOffset: start > 0 ? offset + page.length : null,
  });
});

// CUSTOMER: send a message to own order conversation
router.post("/conversations/:id/messages", (req, res) => {
  const validation = validateMessage(req.body.message);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const conversations = readSupportData();
  const result = requireCustomerConversation(req, conversations);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const duplicate = result.conversation.messages.find(
    (message) => req.body.clientMessageId && message.clientMessageId === req.body.clientMessageId
  );
  if (duplicate) {
    return res.json({ message: duplicate, conversation: conversationSummary(result.conversation, result.order) });
  }

  const message = appendMessage(
    result.conversation,
    "customer",
    validation.text,
    req.body.clientMessageId || null
  );
  writeSupportData(conversations);
  res.status(201).json({ message, conversation: conversationSummary(result.conversation, result.order) });
});

module.exports = router;
