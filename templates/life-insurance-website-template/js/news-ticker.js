(function() {
  var track = document.getElementById('newsTickerTrack');
  if (!track) return;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildItems(items) {
    if (!items || items.length === 0) {
      track.innerHTML = '<span class="news-ticker-empty">Nessuna notizia disponibile al momento.</span>';
      return;
    }
    var html = items.map(function(it) {
      var title = escapeHtml(it.title);
      var link = escapeHtml(it.link);
      return '<span class="news-ticker-item"><a href="' + link + '" target="_blank" rel="noopener noreferrer">' + title + '</a></span>';
    }).join('');
    // Duplichiamo la lista per ottenere uno scroll continuo senza salti
    track.innerHTML = html + html;
  }

  fetch('/api/news', { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) { buildItems(data.items); })
    .catch(function(err) {
      console.warn('News ticker: errore caricamento', err);
      track.innerHTML = '<span class="news-ticker-empty">Notizie non disponibili.</span>';
    });
})();
