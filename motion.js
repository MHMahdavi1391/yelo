(function () {
  var play = document.getElementById('miniPlay');
  var cover = document.getElementById('miniCover');
  var angle = 0;
  var last = 0;
  var speed = 360 / 16;
  function playing() { return !!(play && play.querySelector('.fa-pause')); }
  function tick(ts) {
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (playing() && cover) {
      angle = (angle + speed * dt) % 360;
      cover.style.transform = 'rotate(' + angle + 'deg)';
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  if (cover && window.MutationObserver) {
    new MutationObserver(function () {
      angle = 0;
      cover.style.transform = 'rotate(0deg)';
    }).observe(cover, { attributes: true, attributeFilter: ['src'] });
  }
})();
