/* La page publique lit un document GitHub. Seul le serveur du PC peut l'écrire. */
window.CarnetNotes = function (ids, onChange, onStatus) {
  'use strict';
  const home = location.origin === 'http://127.0.0.1:8767';
  const file = location.protocol === 'file:';
  const editable = home || file;
  const legacyKey = 'cine-carbonne-festival-2027-ratings-v1';
  const journalKey = legacyKey + '-journal';
  const publicURL = 'https://raw.githubusercontent.com/Cpasgrave/carnet-cine-carbonne-2027/notes/notes.json';
  let entries = {}, running = false, again = false, timer, cacheOK = true;

  function merge(incoming) {
    let changed = false;
    for (const [id, value] of Object.entries(incoming)) {
      if (!ids.has(id)) continue;
      if (!value || !(value.score === null || (Number.isInteger(value.score) && value.score >= 1 && value.score <= 10))
          || !Number.isFinite(Date.parse(value.updatedAt))) throw Error('Note illisible');
      if (entries[id] && Date.parse(entries[id].updatedAt) >= Date.parse(value.updatedAt)) continue;
      entries[id] = {score: value.score, updatedAt: value.updatedAt};
      changed = true;
    }
    return changed;
  }
  function scores() {
    return Object.fromEntries(Object.entries(entries).filter(([, value]) => value.score !== null));
  }
  function readCache() {
    const journal = localStorage.getItem(journalKey);
    if (journal) merge(JSON.parse(journal));
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) merge(window.CatalogCore.mergeRatings({}, JSON.parse(legacy), ids).ratings);
  }
  function persist() {
    try {
      readCache();
      localStorage.setItem(journalKey, JSON.stringify(entries));
      localStorage.setItem(legacyKey, JSON.stringify({format:'cine-carbonne-ratings', version:1, ratings:scores()}));
      cacheOK = true;
    } catch { cacheOK = false; }
  }
  function status(message) {
    onStatus(message + (editable && !cacheOK ? ' · Copie navigateur indisponible' : ''));
  }
  async function refresh() {
    if (file) { status('Fichier local · ouvrir le lanceur pour publier les notes'); return; }
    if (running) { again = true; return; }
    running = true;
    try {
      let url = publicURL + '?v=' + Math.floor(Date.now() / 15000);
      const options = {cache:'no-store', signal:AbortSignal.timeout(15000)};
      if (home) {
        url = 'http://127.0.0.1:8768/api/notes';
        options.keepalive = true;
        options.method = 'POST';
        options.headers = {'Content-Type':'application/json'};
        options.body = JSON.stringify({entries});
      }
      const res = await fetch(url, options);
      if (!res.ok) throw Error('Notes indisponibles');
      const doc = await res.json();
      if (doc.version !== 1 || !doc.entries || Array.isArray(doc.entries) || typeof doc.entries !== 'object') throw Error('Notes illisibles');
      if (merge(doc.entries)) {
        if (home) persist();
        onChange(scores());
      }
      if (home) {
        status(doc.status === 'published' ? 'Notes à jour sur GitHub'
          : doc.status === 'retry' ? 'Notes sur le PC · nouvel envoi automatique à GitHub'
          : 'Notes sur le PC · publication en cours');
        if (doc.status === 'pending') schedule(2000);
      } else status('Lecture seule · Notes de programmation');
    } catch {
      status(home ? 'Publication en attente · nouvel essai automatique'
        : 'Lecture seule · Actualisation des notes indisponible');
    } finally {
      running = false;
      if (again) { again = false; schedule(100); }
    }
  }
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }
  function set(id, score) {
    if (!editable || !ids.has(id)) return;
    const before = entries[id] ? Date.parse(entries[id].updatedAt) : 0;
    const stamp = new Date(Math.max(Date.now(), before + 1)).toISOString();
    apply({[id]:{score, updatedAt:stamp}});
  }
  function apply(changes) {
    if (!editable || !merge(changes)) return;
    persist();
    onChange(scores(), true);
    status(home ? 'Envoi des notes à GitHub…' : 'Fichier local · sauvegarde navigateur');
    schedule(0);
  }
  function start() {
    if (editable) {
      try { readCache(); onChange(scores()); } catch { cacheOK = false; }
      window.addEventListener('storage', event => {
        if (event.key !== journalKey || !event.newValue) return;
        try { if (merge(JSON.parse(event.newValue))) { onChange(scores()); schedule(0); } }
        catch { status('Copie navigateur illisible'); }
      });
    }
    status(editable ? 'Chargement des notes du PC…' : 'Lecture seule · Chargement des notes…');
    refresh();
    if (!file) {
      setInterval(() => { if (!document.hidden) refresh(); }, home ? 20000 : 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
      window.addEventListener('online', refresh);
    }
  }
  return {editable, start, set, apply};
};
