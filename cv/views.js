// View counter for the films. Counts a view on first play per page load.
// Backend: /api/views/<id> (GET) and /api/views/<id>/hit (POST), see DEPLOY.md.
document.querySelectorAll('video[data-views]').forEach(function (v) {
  var id = v.getAttribute('data-views');
  var out = document.querySelector('[data-views-for="' + id + '"]');
  var show = function (n) {
    if (out && typeof n === 'number') out.textContent = '· ' + n + (n === 1 ? ' view' : ' views');
  };
  fetch('/api/views/' + id).then(function (r) { return r.json(); })
    .then(function (d) { show(d.views); }).catch(function () {});
  v.addEventListener('play', function () {
    fetch('/api/views/' + id + '/hit', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) { show(d.views); }).catch(function () {});
  }, { once: true });
});
