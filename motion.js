(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.hero, .tabs, .footer').forEach(function (el, i) {
    el.setAttribute('data-aos', 'fade-up');
    el.setAttribute('data-aos-delay', String(i * 80));
  });
  if (window.AOS) AOS.init({ duration: 650, once: true, offset: 20 });
  var grid = document.getElementById('songGrid');
  if (grid && window.MutationObserver) {
    new MutationObserver(function () {
      grid.querySelectorAll('.song-card, .artist-card').forEach(function (el, i) {
        el.classList.add('animate__animated', 'animate__fadeInUp');
        el.style.animationDelay = (Math.min(i, 8) * 0.05) + 's';
      });
    }).observe(grid, { childList: true });
  }
  if (window.gsap) gsap.from('.logo-img, .hero h1', { y: 14, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' });
})();
