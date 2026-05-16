const runtime = globalThis.browser ?? globalThis.chrome;

document.getElementById("open-app")?.addEventListener("click", () => {
  const appUrl = runtime.runtime.getURL("app/index.html");
  runtime.tabs.create({ url: appUrl });
});
