(function () {
  const swatches = document.querySelectorAll("[data-accent]");
  const navLinks = Array.from(document.querySelectorAll(".nav a"));
  const sections = Array.from(document.querySelectorAll("main section"));

  const setAccent = (color) => {
    document.documentElement.style.setProperty("--accent", color);
    swatches.forEach((btn) => btn.classList.toggle("active", btn.dataset.accent === color));
    try {
      localStorage.setItem("jaenib-accent", color);
    } catch (err) {
      // ignore storage failures (private mode, etc.)
    }
  };

  swatches.forEach((button) => {
    button.addEventListener("click", () => setAccent(button.dataset.accent));
  });

  try {
    const stored = localStorage.getItem("jaenib-accent");
    if (stored) {
      setAccent(stored);
    }
  } catch (err) {
    // storage unavailable; ignore
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          navLinks.forEach((link) => {
            const href = link.getAttribute("href") || "";
            link.classList.toggle("active", href.slice(1) === id);
          });
        });
      },
      { rootMargin: "-55% 0px -35% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
  }
})();
