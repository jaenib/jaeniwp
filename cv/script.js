(function () {
  const navLinks = Array.from(document.querySelectorAll(".nav a"));
  const sections = Array.from(document.querySelectorAll("main section"));

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
