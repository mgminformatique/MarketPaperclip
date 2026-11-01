// Independent of React so a failed application bundle still offers recovery.
(() => {
  let ready = false;
  let notice;
  const finish = () => {
    ready = true;
    clearTimeout(timer);
    notice?.remove();
  };
  document.addEventListener("marketpaperclip:ready", finish, { once: true });
  const timer = setTimeout(() => {
    if (ready || !document.body) return;
    notice = document.createElement("aside");
    notice.className = "interaction-recovery";
    notice.setAttribute("role", "alert");
    const message = document.createElement("span");
    const english = document.documentElement.lang === "en";
    message.textContent = english
      ? "The interface has not finished loading."
      : "L’interface n’a pas terminé son chargement.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = english ? "Try again" : "Réessayer";
    retry.addEventListener("click", () => window.location.reload());
    const open = document.createElement("a");
    open.href = window.location.href;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = english ? "Open in a new tab" : "Ouvrir dans un onglet";
    notice.append(message, retry, open);
    document.body.append(notice);
  }, 12000);
})();
