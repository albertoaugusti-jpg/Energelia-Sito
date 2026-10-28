/* Digital enquiries. A retry retains its key; success requires a persisted reference. */
(function () {
  'use strict';
  var form = document.querySelector('[data-nx-project-form]');
  if (!form) return;
  var status = form.querySelector('[data-nx-form-status]');
  var submit = form.querySelector('[type=submit]');
  var originalText = submit.innerHTML;
  var goals = JSON.parse(document.getElementById('digital-goals-data').textContent);
  var goalPanel = form.querySelector('.dr-goals');
  var goalChoices = form.querySelector('[data-digital-goals]');
  var sending = false;
  var completed = false;
  var retryPayload = null;
  var key = newKey();
  form.noValidate = true;
  function newKey() {
    return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)), function(n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  function announce(text, ok) {
    status.textContent = text;
    status.className = 'nx-form-status is-visible ' + (ok ? 'is-success' : 'is-error');
    status.focus();
  }
  function fieldError(name, text) {
    var hint = form.querySelector('[data-error="' + name + '"]');
    if (hint) hint.textContent = text;
    var controls = form.querySelectorAll('[name="' + name + '"]');
    controls.forEach(function(control) { control.setAttribute('aria-invalid', text ? 'true' : 'false'); });
  }
  function clearErrors() {
    form.querySelectorAll('[data-error]').forEach(function(el) { el.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function(el) { el.removeAttribute('aria-invalid'); });
  }
  function revealAndFocus(control) {
    var details = control.closest('details');
    if (details) details.open = true;
    control.focus();
  }
  form.addEventListener('change', function(event) {
    if (event.target.name !== 'service') return;
    fieldError('service', '');
    fieldError('goals', '');
    goalChoices.replaceChildren();
    Object.entries(goals[event.target.value] || {}).forEach(function(entry) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'goals'; input.value = entry[0];
      var text = document.createElement('span'); text.textContent = entry[1];
      label.append(input, text); goalChoices.append(label);
    });
    goalPanel.hidden = !goalChoices.children.length;
  });
  form.addEventListener('input', function(event) { if (event.target.name) fieldError(event.target.name, ''); });
  form.addEventListener('submit', async function(event) {
    event.preventDefault();
    if (sending || completed) return;
    clearErrors();
    var invalid = [];
    Array.from(form.elements).forEach(function(control) {
      if (control.willValidate && !control.validity.valid) {
        fieldError(control.name, control.validationMessage);
        invalid.push(control);
      }
    });
    if (invalid.length) {
      status.textContent = 'Controlla i campi indicati prima di inviare.';
      status.className = 'nx-form-status is-error';
      revealAndFocus(invalid[0]);
      return;
    }
    var values = new FormData(form);
    var payload = {};
    ['name','email','phone','service','message','project_context','existing_solution','timeline','company_website'].forEach(function(name) { payload[name] = String(values.get(name) || '').trim(); });
    payload.goals = values.getAll('goals');
    payload.contact_ack = values.get('contact_ack') === 'on';
    // A changed request after an uncertain response needs a new key; unchanged retries reuse it.
    var serialized = JSON.stringify(payload);
    if (retryPayload && retryPayload !== serialized) key = newKey();
    retryPayload = serialized;
    payload.idempotency_key = key;
    sending = true;
    submit.disabled = true;
    submit.textContent = 'Invio in corso…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Stiamo registrando la tua richiesta…';
    status.className = 'nx-form-status';
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 25000);
    try {
      var response = await fetch('/api/digital-project', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        credentials: 'same-origin', body: JSON.stringify(payload), signal: controller.signal
      });
      var data = await response.json().catch(function() { return {}; });
      if (!response.ok || !data.success || !data.reference) {
        if (data.fields) Object.keys(data.fields).forEach(function(name) { fieldError(name, data.fields[name]); });
        throw new Error(data.error || 'Invio non confermato. I dati sono ancora qui: riprova oppure chiamaci.');
      }
      completed = true;
      // Keep the confirmation visible and prevent accidental resubmission.
      form.querySelectorAll('input, textarea, select').forEach(function(control) { control.disabled = true; });
      submit.textContent = 'Richiesta inviata ✓';
      announce('Grazie, abbiamo ricevuto la tua richiesta. Energelia ti ricontatterà per un primo confronto sul progetto.', true);
    } catch (error) {
      announce(error.name === 'AbortError' ? 'La connessione sta impiegando troppo tempo. L’invio non è confermato: riprova, senza cancellare i dati.' : error.message || 'Invio non confermato. Riprova tra poco.', false);
    } finally {
      clearTimeout(timeout);
      sending = false;
      form.removeAttribute('aria-busy');
      if (!completed) { submit.disabled = false; submit.innerHTML = originalText; }
    }
  });
})();
