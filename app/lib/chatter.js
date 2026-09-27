/* Idle chatter must not capture the screen, even when the user has
   allowed screenshots for explicit requests. */
function chatterTurnExtras() {
  return {
    captureScreen: null,
    allowVision: false,
  };
}

module.exports = { chatterTurnExtras };
