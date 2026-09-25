/**
 * Observes mouse-button edges without taking the click.
 * A capturing overlay would eat the press that should still hit the pet
 * or whatever window is underneath.
 */
let getAsyncKeyState = null;

function keyState() {
  if (!getAsyncKeyState) {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    getAsyncKeyState = user32.func("int16 __stdcall GetAsyncKeyState(int)");
  }
  return getAsyncKeyState;
}

function isDown(vk) {
  return (keyState()(vk) & 0x8000) !== 0;
}

function watchPresses(onPress) {
  let left = false;
  let right = false;
  try {
    left = isDown(0x01);
    right = isDown(0x02);
  } catch (err) {
    console.warn("pointer watch unavailable", err && err.message);
    return () => {};
  }
  const timer = setInterval(() => {
    let nextLeft = left;
    let nextRight = right;
    try {
      nextLeft = isDown(0x01);
      nextRight = isDown(0x02);
    } catch (_) {
      return;
    }
    if ((nextLeft && !left) || (nextRight && !right)) onPress();
    left = nextLeft;
    right = nextRight;
  }, 30);
  return () => clearInterval(timer);
}

module.exports = { watchPresses };
