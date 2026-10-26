// Preloaded in every test worker. A missing fake must never contact an account.
process.env.HARDCOVER_API_KEY = "Bearer offline-test-only";
globalThis.fetch = async () => {
  throw new Error("Network disabled: provide an explicit offline transport fake.");
};
