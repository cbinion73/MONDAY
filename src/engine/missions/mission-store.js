"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MISSIONS_DIR = process.env.MONDAY_MISSIONS_DIR
  ? path.resolve(process.env.MONDAY_MISSIONS_DIR)
  : fs.existsSync("/Volumes/Monday/Monday")
    ? "/Volumes/Monday/Monday/missions"
    : path.resolve(__dirname, "../../../data/missions");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(MISSIONS_DIR);

function missionDir(id) {
  return path.join(MISSIONS_DIR, id);
}

function exists(id) {
  return fs.existsSync(path.join(missionDir(id), "meta.json"));
}

function createMission(meta) {
  const dir = missionDir(meta.id);
  ensureDir(dir);
  const now = new Date().toISOString();
  const full = { ...meta, stage: meta.stage || "intake", createdAt: now, updatedAt: now };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(full, null, 2));
  return full;
}

function getMeta(id) {
  const file = path.join(missionDir(id), "meta.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function setMeta(id, updates) {
  const existing = getMeta(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(missionDir(id), "meta.json"), JSON.stringify(updated, null, 2));
  return updated;
}

function listMissions(filter = {}) {
  if (!fs.existsSync(MISSIONS_DIR)) return [];
  return fs
    .readdirSync(MISSIONS_DIR)
    .filter((name) => fs.existsSync(path.join(MISSIONS_DIR, name, "meta.json")))
    .map((name) => getMeta(name))
    .filter((m) => {
      if (!m) return false;
      if (filter.domain && m.domain !== filter.domain) return false;
      if (filter.stage && m.stage !== filter.stage) return false;
      if (filter.type && m.type !== filter.type) return false;
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getDoc(id, docName) {
  const file = path.join(missionDir(id), docName);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function setDoc(id, docName, content) {
  ensureDir(missionDir(id));
  fs.writeFileSync(path.join(missionDir(id), docName), content, "utf8");
}

function hasDoc(id, docName) {
  return fs.existsSync(path.join(missionDir(id), docName));
}

function listDocs(id) {
  const dir = missionDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f !== "meta.json");
}

function getMission(id) {
  const meta = getMeta(id);
  if (!meta) return null;
  const docs = {};
  for (const docName of listDocs(id)) {
    docs[docName] = getDoc(id, docName);
  }
  return { meta, docs };
}

module.exports = {
  exists,
  createMission,
  getMeta,
  setMeta,
  listMissions,
  getDoc,
  setDoc,
  hasDoc,
  listDocs,
  getMission,
};
