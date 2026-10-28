(() => {
  'use strict';

  const menuButton = document.querySelector('[data-uc-menu-trigger]');
  const menu = document.querySelector('.uc-site-nav');
  if (menuButton && menu) {
    const closeMenu = () => {
      menu.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Apri navigazione');
    };
    menuButton.addEventListener('click', () => {
      const open = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Chiudi navigazione' : 'Apri navigazione');
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    const mq = window.matchMedia('(min-width: 811px)');
    if (mq.addEventListener) mq.addEventListener('change', closeMenu);
  }

  const filters = [...document.querySelectorAll('[data-uc-filter]')];
  const sections = [...document.querySelectorAll('[data-uc-group]')];
  const count = document.querySelector('[data-uc-filter-count]');
  function filterCatalog(key) {
    if (!filters.length) return;
    filters.forEach(btn => {
      const current = btn.dataset.ucFilter === key;
      btn.classList.toggle('is-active', current);
      btn.setAttribute('aria-pressed', String(current));
    });
    let visible = 0;
    sections.forEach(section => {
      const show = key === 'all' || section.dataset.ucGroup === key;
      section.hidden = !show;
      if (show) visible += section.querySelectorAll('.uc-card').length;
    });
    if (count) count.textContent = `${visible} ${visible === 1 ? 'caso' : 'casi'}`;
  }
  filters.forEach(btn => btn.addEventListener('click', () => filterCatalog(btn.dataset.ucFilter)));
  if (sections.length) filterCatalog('all');

  // Shared form primitives: counts follow actual input values, including reset.
  function initCharacterCounters(root) {
    const fields = [...root.querySelectorAll('[maxlength][id]')];
    const update = () => fields.forEach(field => {
      const output = root.querySelector(`[data-uc-counter-for="${field.id}"]`);
      if (!output) return;
      const maximum = Number(field.getAttribute('maxlength'));
      output.textContent = `${field.value.length} / ${maximum}`;
      output.classList.toggle('is-near-limit', field.value.length >= maximum - 8);
    });
    fields.forEach(field => field.addEventListener('input', update));
    update();
    return update;
  }

  function euro(amount) {
    const n = Number(amount);
    const decimals = Number.isInteger(n) ? 0 : 2;
    return `€ ${new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: decimals, maximumFractionDigits: 2
    }).format(n)}`;
  }

  // Mobile is one usable interface at a time, not two scaled-down screenshots.
  // The desktop layout remains a simultaneous side-by-side comparison.
  function createMobileViewer(root) {
    const panels = root.querySelector('.uc-demo-panels');
    const editor = panels?.querySelector('.uc-demo-editor');
    const result = panels?.querySelector('.uc-demo-site');
    const publish = root.querySelector('[data-uc-publish]');
    const reset = root.querySelector('[data-uc-reset]');
    if (!panels || !editor || !result || !publish) return { show() {} };

    const media = window.matchMedia('(max-width: 810px)');
    const name = root.dataset.ucDemo;
    editor.id = `uc-${name}-panel-edit`;
    result.id = `uc-${name}-panel-result`;
    const nav = document.createElement('div');
    nav.className = 'uc-view-switcher';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', 'Interfaccia del laboratorio');
    const makeButton = (view, label, panel) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.ucView = view;
      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-pressed', String(view === 'edit'));
      nav.append(button);
      return button;
    };
    const guided = name === 'editor';
    const btnEdit = makeButton('edit', name === 'reviews' ? 'Seleziona' : 'Modifica', editor);
    const btnResult = makeButton('result', 'Anteprima', result);
    panels.before(nav);
    const toolbar = root.querySelector('.uc-demo-toolbar');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'uc-mobile-back';
    back.textContent = name === 'reviews' ? '← Torna alla selezione' : '← Torna alle modifiche';
    toolbar.insertBefore(back, publish);
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'uc-demo-replay';
    replay.textContent = 'Ricomincia demo ↻';
    replay.hidden = true;
    toolbar.insertBefore(replay, publish.nextSibling);
    replay.addEventListener('click', () => reset?.click());

    let view = 'edit';
    const paint = () => {
      const mobile = media.matches;
      editor.hidden = mobile && view !== 'edit';
      result.hidden = mobile && view !== 'result';
      const published = root.dataset.ucPhase === 'published';
      publish.hidden = published || (mobile && view !== 'result');
      replay.hidden = !published || (mobile && view !== 'result');
      nav.hidden = !mobile;
      back.hidden = !mobile || view !== 'result';
      btnEdit.setAttribute('aria-pressed', String(view === 'edit'));
      btnResult.setAttribute('aria-pressed', String(view === 'result'));
      nav.dataset.view = view;
      root.dataset.ucMobileView = view;
    };
    const show = (next, reframe = false) => {
      view = next;
      paint();
      if (reframe && media.matches) {
        window.requestAnimationFrame(() => {
          // Change of view: keep the switcher visible, never jump to the result footer.
          const rect = nav.getBoundingClientRect();
          if (rect.top < -15 || rect.top > innerHeight - 85) {
            window.scrollTo({ top: Math.max(0, scrollY + rect.top - 12), behavior: 'instant' });
          }
        });
      }
    };
    btnEdit.addEventListener('click', () => show('edit'));
    btnResult.addEventListener('click', () => show('result'));
    back.addEventListener('click', () => show('edit', true));
    if (media.addEventListener) media.addEventListener('change', paint);
    else if (media.addListener) media.addListener(paint);
    paint();
    return { show };
  }

  function markProgress(root, step) {
    const progress = root.closest('.uc-detail-main')?.querySelector('[data-uc-progress]');
    if (!progress) return;
    progress.dataset.ucCurrent = String(step);
    progress.style.setProperty('--uc-progress-fraction', String((step - 1) / 2));
    progress.querySelectorAll('[data-uc-step]').forEach((item) => {
      const current = Number(item.dataset.ucStep);
      item.classList.toggle('is-current', current === step);
      item.classList.toggle('is-complete', current < step);
      if (current === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function createStateHelpers(root, labels) {
    const publishButton = root.querySelector('[data-uc-publish]');
    const previewButton = root.querySelector('[data-uc-preview]');
    const resetButton = root.querySelector('[data-uc-reset]');
    const editorStatus = root.querySelector('[data-uc-editor-status]');
    const siteStatus = root.querySelector('[data-uc-site-status]');
    const message = root.querySelector('[data-uc-demo-message]');
    const pending = root.querySelector('[data-uc-pending]');
    let hasPreview = false;
    let lastView = 'published';
    const viewer = createMobileViewer(root);
    const originalPublishLabel = publishButton.innerHTML;
    const resultPanel = root.querySelector('.uc-demo-site');
    const confirmation = document.createElement('div');
    confirmation.className = 'uc-publication-confirmation';
    confirmation.setAttribute('role', 'status');
    confirmation.setAttribute('aria-live', 'polite');
    const guided = root.dataset.ucDemo === 'editor';
    confirmation.innerHTML = '<span class="uc-success-icon" aria-hidden="true">✓</span><div><strong data-uc-published-title></strong><p data-uc-published-summary></p></div>';
    confirmation.querySelector('[data-uc-published-title]').textContent = labels.publishedHeadline;
    confirmation.hidden = true;
    const previewBody = resultPanel.querySelector('.uc-site-frame, .uc-catalog-public, .uc-reviews-public');
    if (previewBody) previewBody.after(confirmation);
    else resultPanel.append(confirmation);
    const setPhase = (phase) => {
      root.dataset.ucPhase = phase;
      if (siteStatus) siteStatus.dataset.ucStatus = phase;
      confirmation.hidden = phase !== 'published';
    };

    return {
      previewButton, publishButton, resetButton, editorStatus, siteStatus, message, pending,
      setDirty(options = {}) {
        // Keep the last preview on screen, but clearly mark it as outdated.
        // Used by cases 02 and 03: inputs must never silently redraw the preview.
        const stale = !!options.keepPreview && (root.dataset.ucPhase === 'preview' || root.dataset.ucPhase === 'stale');
        setPhase(stale ? 'stale' : 'dirty');
        hasPreview = false;
        publishButton.disabled = true;
        publishButton.innerHTML = originalPublishLabel;
        editorStatus.textContent = labels.dirtyEditor;
        siteStatus.textContent = stale ? labels.previewStaleStatus : (guided ? '● Sito attuale' : (labels.currentStatus || labels.publishedStatus));
        if (pending) pending.hidden = false;
        message.textContent = labels.dirtyMessage;
        markProgress(root, 1);
        viewer.show(root.dataset.ucMobileView || 'edit');
      },
      setPreview() {
        setPhase('preview');
        hasPreview = true;
        lastView = 'preview';
        publishButton.disabled = false;
        publishButton.innerHTML = originalPublishLabel;
        editorStatus.textContent = labels.previewEditor;
        siteStatus.textContent = labels.previewStatus;
        if (pending) pending.hidden = true;
        message.textContent = labels.previewMessage;
        markProgress(root, 2);
        viewer.show('result', true);
      },
      setPublished(summary) {
        setPhase('published');
        confirmation.querySelector('[data-uc-published-summary]').textContent = summary || 'Contenuto aggiornato nella simulazione.';
        hasPreview = false;
        lastView = 'published';
        publishButton.disabled = true;
        publishButton.textContent = labels.publishedButtonLabel;
        editorStatus.textContent = labels.publishedEditor;
        siteStatus.textContent = labels.publishedStatus;
        if (pending) pending.hidden = true;
        message.textContent = labels.publishedMessage;
        markProgress(root, 3);
        viewer.show('result', true);
      },
      setReset() {
        setPhase('reset');
        hasPreview = false;
        lastView = 'published';
        publishButton.disabled = true;
        publishButton.innerHTML = originalPublishLabel;
        editorStatus.textContent = labels.resetEditor;
        siteStatus.textContent = guided ? '● Sito attuale' : (labels.currentStatus || labels.publishedStatus);
        if (pending) pending.hidden = true;
        message.textContent = labels.resetMessage;
        markProgress(root, 1);
        viewer.show('edit');
      },
      canPublish() { return hasPreview; }
    };
  }

  function initEditorDemo(root) {
    const titleInput = root.querySelector('[data-uc-input-title]');
    const subtitleInput = root.querySelector('[data-uc-input-subtitle]');
    const photoButtons = [...root.querySelectorAll('[data-uc-photo]')];
    const previewTitle = root.querySelector('[data-uc-public-title]');
    const previewSubtitle = root.querySelector('[data-uc-public-subtitle]');
    const previewHero = root.querySelector('[data-uc-public-hero]');
    if (!titleInput || !subtitleInput || !photoButtons.length || !previewTitle || !previewSubtitle || !previewHero) return;

    const updateCounters = initCharacterCounters(root);
    const state = createStateHelpers(root, {
      dirtyEditor: 'Hai modifiche da vedere',
      dirtyMessage: 'Ora premi «Guarda l’anteprima» per vedere le modifiche.',
      previewEditor: 'Anteprima pronta',
      previewMessage: 'Controlla l’anteprima. Se ti convince, pubblica le modifiche.',
      publishedEditor: 'Modifiche pubblicate',
      publishedHeadline: 'Modifiche pubblicate',
      publishedButtonLabel: 'Modifiche pubblicate ✓',
      publishedMessage: '',
      resetEditor: 'Pronto per modificare',
      resetMessage: 'Puoi cambiare il titolo, il testo o la fotografia e provare di nuovo.',
      publishedStatus: '● Modifiche pubblicate',
      previewStatus: '◉ Anteprima · Da pubblicare',
      previewStaleStatus: '◌ Anteprima da aggiornare'
    });

    const starting = Object.freeze({ title: titleInput.value, subtitle: subtitleInput.value, photo: 'originale' });
    let selectedPhoto = starting.photo;
    let published = {...starting};
    let preview = {...starting};

    const photoSources = Object.fromEntries(photoButtons.map(btn => [btn.dataset.ucPhoto, btn.querySelector('img')?.getAttribute('src')]));
    const validateTexts = () => {
      let valid = true;
      for (const field of [titleInput, subtitleInput]) {
        const ok = field.value.trim().length >= 1;
        field.setCustomValidity(ok ? '' : 'Inserisci almeno un carattere, non solo spazi.');
        field.setAttribute('aria-invalid', String(!ok));
        const error = root.querySelector(`[data-uc-error-for="${field.id}"]`);
        if (error) error.hidden = ok;
        if (!ok) valid = false;
      }
      state.previewButton.disabled = !valid;
      return valid;
    };
    const draft = () => ({ title: titleInput.value.trim(), subtitle: subtitleInput.value.trim(), photo: selectedPhoto });
    const render = (data) => {
      previewTitle.textContent = data.title;
      previewSubtitle.textContent = data.subtitle;
      const source = photoSources[data.photo] || photoSources.originale;
      if (source) previewHero.style.backgroundImage = `url("${source.replace(/"/g, '%22')}")`;
    };
    const syncPhotoButtons = () => photoButtons.forEach(btn => {
      const selected = btn.dataset.ucPhoto === selectedPhoto;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });

    titleInput.addEventListener('input', () => { state.setDirty({keepPreview:true}); validateTexts(); });
    subtitleInput.addEventListener('input', () => { state.setDirty({keepPreview:true}); validateTexts(); });
    photoButtons.forEach(btn => btn.addEventListener('click', () => {
      selectedPhoto = btn.dataset.ucPhoto;
      syncPhotoButtons();
      state.setDirty({keepPreview:true});
      validateTexts();
    }));
    state.previewButton.addEventListener('click', () => {
      if (!validateTexts()) {
        [titleInput, subtitleInput].find(field => !field.value.trim())?.focus();
        return;
      }
      preview = draft(); render(preview); state.setPreview();
    });
    state.publishButton.addEventListener('click', () => {
      if (!state.canPublish()) return;
      published = {...preview};
      render(published);
      state.setPublished(`Il sito mostra ora «${published.title}» e la foto che hai scelto.`);
    });
    state.resetButton.addEventListener('click', () => {
      published = {...starting};
      preview = {...starting};
      selectedPhoto = starting.photo;
      titleInput.value = starting.title;
      subtitleInput.value = starting.subtitle;
      updateCounters();
      syncPhotoButtons();
      render(published);
      state.setReset();
      validateTexts();
    });
    syncPhotoButtons();
    render(published);
    state.setReset();
    validateTexts();
  }

  function initCatalogDemo(root) {
    const priceInput = root.querySelector('[data-uc-product-price]');
    const statusInput = root.querySelector('[data-uc-product-status]');
    const noteInput = root.querySelector('[data-uc-product-note]');
    const priceHelp = root.querySelector('[data-uc-price-help]');
    const nameHeading = root.querySelector('[data-uc-selected-product-name]');
    const kindLabel = root.querySelector('[data-uc-selected-product-kind]');
    const productButtons = [...root.querySelectorAll('[data-uc-product-select]')];
    const publicCards = [...root.querySelectorAll('[data-uc-public-product]')];
    if (![priceInput, statusInput, noteInput, priceHelp, nameHeading, kindLabel].every(Boolean)
        || productButtons.length !== 3 || publicCards.length !== 3) return;

    const updateCounters = initCharacterCounters(root);
    const state = createStateHelpers(root, {
      dirtyEditor: 'Hai modifiche da vedere',
      dirtyMessage: 'Controlla l’anteprima per vedere i prezzi e la disponibilità aggiornati.',
      previewEditor: 'Anteprima pronta',
      previewMessage: 'Controlla tutti e tre i prodotti e conferma l’aggiornamento.',
      publishedEditor: 'Catalogo aggiornato',
      publishedHeadline: 'Catalogo aggiornato',
      publishedButtonLabel: 'Catalogo aggiornato ✓',
      publishedMessage: '',
      resetEditor: 'Pronto per modificare',
      resetMessage: 'Seleziona un prodotto da aggiornare.',
      currentStatus: '● Catalogo attuale',
      publishedStatus: '● Catalogo aggiornato',
      previewStatus: '◉ Anteprima · Da pubblicare',
      previewStaleStatus: '◌ Anteprima da aggiornare'
    });

    const parsePrice = displayed => displayed.replace(/[€\s.]/g, '').replace(',', '.');
    const clone = data => Object.fromEntries(Object.entries(data).map(([key, val]) => [key, {...val}]));
    const cards = Object.fromEntries(publicCards.map(card => [card.dataset.ucPublicProduct, card]));
    const names = Object.fromEntries(publicCards.map(card => [card.dataset.ucPublicProduct, card.querySelector('h3').textContent]));
    const starting = Object.fromEntries(publicCards.map(card => {
      const key = card.dataset.ucPublicProduct;
      return [key, {
        price: parsePrice(card.querySelector('[data-uc-public-price]').textContent),
        status: card.querySelector('[data-uc-public-status]').textContent.trim(),
        note: card.querySelector('[data-uc-public-note]').textContent.trim()
      }];
    }));
    let drafts = clone(starting);
    let published = clone(starting);
    let preview = clone(starting);
    let selected = 'finestra';

    const saveSelected = () => {
      drafts[selected] = {price: priceInput.value, status: statusInput.value, note: noteInput.value};
    };
    const isValidPrice = value => {
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 999999;
    };
    const validatePrices = () => {
      saveSelected();
      const invalid = Object.keys(drafts).filter(key => !isValidPrice(drafts[key].price));
      productButtons.forEach(button => {
        const broken = invalid.includes(button.dataset.ucProductSelect);
        button.classList.toggle('is-invalid', broken);
        if (broken) button.setAttribute('aria-label', names[button.dataset.ucProductSelect] + ': prezzo non valido');
        else button.removeAttribute('aria-label');
      });
      const currentInvalid = invalid.includes(selected);
      priceInput.setAttribute('aria-invalid', String(currentInvalid));
      priceHelp.classList.toggle('is-error', invalid.length > 0);
      priceHelp.textContent = currentInvalid
        ? 'Inserisci un importo da 0 a 999.999 €, massimo due decimali.'
        : invalid.length
          ? 'Correggi il prezzo di «' + names[invalid[0]] + '» prima dell’anteprima.'
          : 'Importo valido da 0 a 999.999 €, massimo 2 decimali.';
      state.previewButton.disabled = invalid.length > 0;
      return invalid.length === 0;
    };
    const render = data => {
      Object.entries(cards).forEach(([key, card]) => {
        const record = data[key];
        card.querySelector('[data-uc-public-price]').textContent = euro(record.price);
        const availability = card.querySelector('[data-uc-public-status]');
        availability.textContent = record.status;
        availability.classList.toggle('is-secondary', record.status === 'Su richiesta' || record.status === 'In arrivo');
        card.querySelector('[data-uc-public-note]').textContent = record.note;
      });
    };
    const selectProduct = (key, savePrevious = true) => {
      if (!drafts[key]) return;
      if (savePrevious) saveSelected();
      selected = key;
      productButtons.forEach(button => {
        const active = button.dataset.ucProductSelect === key;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
      nameHeading.textContent = names[key];
      kindLabel.textContent = key === 'finestra' ? 'Prodotto in evidenza' : 'Prodotto selezionato';
      priceInput.value = drafts[key].price;
      statusInput.value = drafts[key].status;
      noteInput.value = drafts[key].note;
      updateCounters();
      validatePrices();
    };
    productButtons.forEach(button => button.addEventListener('click', () => selectProduct(button.dataset.ucProductSelect)));

    const onDirty = () => { validatePrices(); state.setDirty({keepPreview:true}); };
    [priceInput, statusInput, noteInput].forEach(el => el.addEventListener('input', onDirty));
    statusInput.addEventListener('change', onDirty);
    state.previewButton.addEventListener('click', () => {
      if (!validatePrices()) return;
      preview = clone(drafts);
      render(preview);
      state.setPreview();
    });
    state.publishButton.addEventListener('click', () => {
      if (!state.canPublish()) return;
      const changed = Object.keys(preview).filter(key =>
        ['price', 'status', 'note'].some(field => preview[key][field] !== published[key][field]));
      published = clone(preview);
      render(published);
      const summary = changed.length
        ? 'Aggiornati: ' + changed.map(key => names[key]).join(', ') + '.'
        : 'Catalogo confermato: tutti e tre i prodotti sono visibili.';
      state.setPublished(summary);
    });
    state.resetButton.addEventListener('click', () => {
      drafts = clone(starting);
      published = clone(starting);
      preview = clone(starting);
      selectProduct('finestra', false);
      render(published);
      state.setReset();
      validatePrices();
    });
    selectProduct('finestra');
    render(published);
    state.setReset();
    validatePrices();
  }

  function initReviewsDemo(root) {
    const toggles = [...root.querySelectorAll('[data-uc-review]')];
    const publicCards = [...root.querySelectorAll('[data-uc-public-review]')];
    const emptyState = root.querySelector('[data-uc-reviews-empty]');
    if (!toggles.length || !publicCards.length) return;

    const state = createStateHelpers(root, {
      dirtyEditor: 'Hai modifiche da vedere',
      dirtyMessage: 'Hai modifiche nuove nella selezione: premi «Controlla l’anteprima» per vedere la sezione aggiornata.',
      previewEditor: 'Anteprima pronta',
      previewMessage: 'Questa è l’anteprima aggiornata della sezione testimonianze.',
      publishedEditor: 'Testimonianze pubblicate',
      publishedHeadline: 'Testimonianze pubblicate',
      publishedButtonLabel: 'Testimonianze pubblicate ✓',
      publishedMessage: '',
      resetEditor: 'Pronto per scegliere',
      resetMessage: 'Dimostrazione ripristinata. Seleziona le testimonianze da mostrare.',
      currentStatus: '● Sito attuale',
      publishedStatus: '● Testimonianze pubblicate',
      previewStatus: '◉ Anteprima · Da pubblicare',
      previewStaleStatus: '◌ Anteprima da aggiornare'
    });

    const starting = Object.freeze(Object.fromEntries(toggles.map(toggle => [toggle.dataset.ucReview, toggle.checked])));
    let published = {...starting};
    let preview = {...starting};
    const draft = () => Object.fromEntries(toggles.map(toggle => [toggle.dataset.ucReview, toggle.checked]));
    const render = (data) => {
      publicCards.forEach(card => {
        const key = card.dataset.ucPublicReview;
        card.hidden = !data[key];
      });
      if (emptyState) emptyState.hidden = Object.values(data).some(Boolean);
    };

    // Leave the last displayed snapshot untouched until the user explicitly checks again.
    // Previously render(published) would replace a visible preview on each new choice.
    toggles.forEach(toggle => toggle.addEventListener('change', () => { state.setDirty({keepPreview:true}); }));
    state.previewButton.addEventListener('click', () => { preview = draft(); render(preview); state.setPreview(); });
    state.publishButton.addEventListener('click', () => {
      if (!state.canPublish()) return;
      published = {...preview};
      render(published);
      const count = Object.values(published).filter(Boolean).length;
      state.setPublished(count === 0 ? 'La sezione non mostrerà testimonianze.' : `${count} ${count === 1 ? 'testimonianza visibile' : 'testimonianze visibili'} nella sezione.`);
    });
    state.resetButton.addEventListener('click', () => {
      published = {...starting};
      preview = {...starting};
      toggles.forEach(toggle => { toggle.checked = !!starting[toggle.dataset.ucReview]; });
      render(published);
      state.setReset();
    });
    render(published);
    state.setReset();
  }

  document.querySelectorAll('[data-uc-demo="editor"]').forEach(initEditorDemo);
  document.querySelectorAll('[data-uc-demo="catalog"]').forEach(initCatalogDemo);
  document.querySelectorAll('[data-uc-demo="reviews"]').forEach(initReviewsDemo);
})();
