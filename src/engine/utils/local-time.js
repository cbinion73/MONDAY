"use strict";

const USER_TIMEZONE = process.env.MONDAY_USER_TIMEZONE || "America/New_York";

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDate(value, options = {}) {
  const date = parseDate(value);
  if (!date) return null;
  return date.toLocaleDateString("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

function formatLocalTime(value, options = {}) {
  const date = parseDate(value);
  if (!date) return null;
  return date.toLocaleTimeString("en-US", {
    timeZone: USER_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
}

function looksLikeIsoDateTime(value) {
  return typeof value === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}

function normalizeClockString(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return null;
  const hour = String(Number(match[1]));
  const minute = match[2] || "00";
  const meridiem = match[3].toUpperCase();
  return `${hour}:${minute} ${meridiem}`;
}

function normalizeUserFacingDate(value) {
  if (looksLikeIsoDateTime(value)) {
    return formatLocalDate(value);
  }
  return value || null;
}

function normalizeUserFacingTime(value) {
  if (looksLikeIsoDateTime(value)) {
    return formatLocalTime(value);
  }
  const normalizedClock = normalizeClockString(value);
  if (normalizedClock) return normalizedClock;
  return value || null;
}

module.exports = {
  USER_TIMEZONE,
  formatLocalDate,
  formatLocalTime,
  normalizeClockString,
  normalizeUserFacingDate,
  normalizeUserFacingTime,
};
