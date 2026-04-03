// VS Code API utilities for webview communication

const vscodeApi = acquireVsCodeApi();
window.vscodeApi = vscodeApi; // Make it globally available

// Map to track pending messages
const pendingMessages = new Map();
let messageId = 0;

// Listen for responses from the extension
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'response' && message.id) {
    const pending = pendingMessages.get(message.id);
    if (pending) {
      pendingMessages.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.data);
      }
    }
  }
});

/**
 * Send a message to the extension and wait for a response
 * @param {string} command - The command name
 * @param {object} data - The data to send
 * @returns {Promise} - Resolves with the response data
 */
export function sendMessage(command, data) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const timeout = setTimeout(() => {
      pendingMessages.delete(id);
      reject(new Error(`Message timeout for command: ${command}`));
    }, 60000); // 60 second timeout

    pendingMessages.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    vscodeApi.postMessage({ id, command, data });
  });
}

export default vscodeApi;
