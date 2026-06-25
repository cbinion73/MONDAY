"use strict";

function resolvePropState({ prop, phase }) {
  if (!prop) {
    return {
      visible: false,
      expanded: false,
      payload: null,
    };
  }

  if (phase === "reveal") {
    return {
      visible: true,
      expanded: true,
      payload: prop,
    };
  }

  return {
    visible: false,
    expanded: false,
    payload: null,
  };
}

module.exports = {
  resolvePropState,
};
