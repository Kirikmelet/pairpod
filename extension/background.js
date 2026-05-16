const runtime = globalThis.browser ?? globalThis.chrome;

runtime.runtime.onInstalled.addListener(() => {
  console.info("Uncommon Hacks extension installed");
});
