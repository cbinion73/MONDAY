"use strict";
// Thin shim — all state is now SQLite-backed via db/state-store.
// Re-exports the full public API so no call sites need updating.
module.exports = require("../db/state-store");
