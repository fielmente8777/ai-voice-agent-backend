// ============================================================
// LOGGER
// Every log line is prefixed with a tag, e.g. [call:3f9a1c2b:tts].
// With several calls running at once you can grep one call's logs:
//   npm run dev | grep 3f9a1c2b
// Set LOG_LEVEL=debug in .env to see verbose logs.
// ============================================================

export default function createLogger(tag) {
  const prefix = `[${tag}]`;

  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    debug: (...args) => {
      if (process.env.LOG_LEVEL === "debug") console.log(prefix, ...args);
    },
    child: (subTag) => createLogger(`${tag}:${subTag}`),
  };
}
