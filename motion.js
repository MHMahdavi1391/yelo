(function () {
  var player = document.getElementById('miniPlayer');
  var play = document.getElementById('miniPlay');
  function syncSpin() {
    if (!player || !play) return;
    player.classList.toggle('is-playing', !!play.querySelector('.fa-pause'));
  }
  if (play && window.MutationObserver) {
    new MutationObserver(syncSpin).observe(play, { childList: true, subtree: true });
  }
  syncSpin();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.tabs, .footer').forEach(function (el, i) {
    el.setAttribute('data-aos', 'fade-up');
    el.setAttribute('data-aos-delay', String(i * 80));
  });
  if (window.AOS) AOS.init({ duration: 650, once: true, offset: 20 });
})();
