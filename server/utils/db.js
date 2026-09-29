const fs = require("fs");
const path = require("path");

// Read and parse the full content of a JSON file inside data/.
// If the file doesn't exist yet, create it with defaultContent first
// (menu/orders default to "[]" - a list; revenue.json needs "{}" - a
// map of date -> total, so the caller can choose which).
function readData(fileName, defaultContent = "[]") {
  const filePath = path.join(__dirname, "..", "data", fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, "utf-8");
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

// Overwrite the full content of a JSON file inside data/
function writeData(fileName, data) {
  const filePath = path.join(__dirname, "..", "data", fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// Generate a simple incrementing id based on the current list
function nextId(list) {
  if (list.length === 0) return 1;
  return Math.max(...list.map((item) => item.id)) + 1;
}

module.exports = { readData, writeData, nextId };