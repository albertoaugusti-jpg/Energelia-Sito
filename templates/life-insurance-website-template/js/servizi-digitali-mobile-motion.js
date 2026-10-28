/* One reversible mobile timeline. Native scroll is the clock; no timers,
   entrances, wheel/touch interception, or changes to the desktop controller. */
(function () {
  'use strict';
  var film = document.querySelector('[data-mobile-film]');
  if (!film) return;
  var mobile = matchMedia('(max-width: 991.98px)');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var one = function (name) { return film.querySelector('[data-mf-' + name + ']'); };
  var many = function (name) { return Array.from(film.querySelectorAll('[data-mf-' + name + ']')); };
  var canvas = one('canvas'), device = one('device'), shell = one('shell'), app = one('app');
  var site = one('website'), pieces = many('piece'), agenda = one('agenda'), ticket = one('ticket');
  var captions = many('caption'), wires = many('wire'), packets = many('packet'), outputs = many('output');
  var steps = many('step'), pin = film.querySelector('.mf-pin'), space = film.querySelector('.mf-art-space');
  var active = false, frame = 0, start = 0, travel = 1, last = -1;
  var slotX = 22, slotY = 159;
  // Sample the actual branch geometry once; moving packets need no layout reads.
  var routes = wires.slice(1).map(function (path) {
    var length = path.getTotalLength();
    return Array.from({ length: 61 }, function (_, i) { return path.getPointAtLength(length * i / 60); });
  });
  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
  // Smooth interpolation over a scroll interval, never a time-based easing.
  var phase = function (p, a, b) { var t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); };
  var mix = function (a, b, t) { return a + (b - a) * t; };
  function pose(el, x, y, sx, sy, rotation, opacity) {
    el.style.transform = 'translate3d(' + x.toFixed(3) + 'px,' + y.toFixed(3) + 'px,0) rotate(' + rotation.toFixed(3) + 'deg) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
    el.style.opacity = clamp(opacity).toFixed(4);
  }
  function draw(p) {
    // 00–18%: three pieces converge into one website; the same centre becomes a phone.
    var compose = phase(p, 0, .15), morph = phase(p, .17, .32);
    var depart = phase(p, .54, .69), dock = phase(p, .71, .80);
    pose(site, 0, mix(20, -4, morph), mix(1, .60, morph), mix(1, 1.50, morph), mix(-4, 0, morph), 1 - phase(p, .26, .32));
    pieces.forEach(function (piece, i) {
      var t = phase(p, i * .018, .11 + i * .018);
      pose(piece, (i - 1) * 38 * (1 - t), (i === 1 ? -26 : 32) * (1 - t), .94 + .06 * t, .94 + .06 * t, (i - 1) * 7 * (1 - t), .65 + .35 * t);
    });
    pose(device, -194 * depart, -12 * depart, 1 - .30 * depart, 1 - .30 * depart, -12 * depart, 1 - phase(p, .65, .71));
    pose(shell, 0, 5 * (1 - morph), mix(1.34, 1, morph), mix(.64, 1, morph), mix(-4, 0, morph), phase(p, .18, .25));
    pose(app, 0, 28 * (1 - morph), .94 + .06 * morph, .94 + .06 * morph, 0, phase(p, .245, .31));
    // 32–53%: date, time and confirmation, all independently reversible.
    var day = phase(p, .32, .365), time = phase(p, .37, .415), confirm = phase(p, .445, .50);
    pose(one('day'), 0, 0, .8 + .2 * day, .8 + .2 * day, 0, day);
    pose(one('time'), -40 * (1 - time), 0, 1, 1, 0, time);
    film.querySelector('.mf-time b').style.color = time > .5 ? '#fff' : '#173b4e';
    var press = Math.sin(Math.PI * phase(p, .42, .45));
    pose(one('button'), 0, 0, 1 - .035 * press, 1 - .035 * press, 0, 1 - confirm);
    // 54–69%: the ticket is one DOM node, lifted from the phone and placed in its agenda slot.
    var transfer = phase(p, .54, .69);
    var agendaScale = mix(1, .85, dock), agendaX = mix(24, 47, dock), agendaY = mix(60, 12, dock);
    pose(agenda, agendaX - 24 + 345 * (1 - depart), agendaY - 60, agendaScale, agendaScale, 4 * (1 - depart), phase(p, .54, .60));
    var tx = mix(79.5, 24 + slotX, transfer) + 112 * Math.sin(Math.PI * transfer);
    var ty = mix(306, 60 + slotY, transfer) - 96 * Math.sin(Math.PI * transfer);
    var ts = mix(.75, 1, transfer);
    // Once docked, the ticket shares the agenda's transform exactly.
    tx = mix(tx, agendaX + slotX * agendaScale, dock);
    ty = mix(ty, agendaY + slotY * agendaScale, dock);
    ts = mix(ts, agendaScale, dock);
    pose(ticket, mix(145, tx, confirm), mix(252, ty, confirm), mix(.25, ts, confirm), mix(.55, ts, confirm), -7 * Math.sin(Math.PI * transfer), confirm);
    pose(one('transfer'), 0, 0, 1, 1, 0, Math.sin(Math.PI * transfer) * .65);
    // 78–100%: the agenda stays present while its information branches into three outcomes.
    var core = phase(p, .775, .84);
    pose(one('core'), 0, -20 * (1 - core), .6 + .4 * core, .6 + .4 * core, 45 * (1 - core), core);
    wires.forEach(function (wire, i) {
      var t = phase(p, i ? .825 + (i - 1) * .025 : .775, i ? .925 + (i - 1) * .025 : .835);
      // Four tiny SVG strokes are the only painted progress properties.
      wire.style.strokeDasharray = '1'; wire.style.strokeDashoffset = (1 - t).toFixed(4);
    });
    outputs.forEach(function (output, i) {
      var t = phase(p, .875 + i * .025, .945 + i * .025);
      pose(output, (1 - i) * 24 * (1 - t), -32 * (1 - t), .82 + .18 * t, .82 + .18 * t, 0, t);
      var q = phase(p, .835 + i * .025, .925 + i * .025);
      var at = q * 60, lo = Math.floor(at), hi = Math.min(60, lo + 1);
      var x = mix(routes[i][lo].x, routes[i][hi].x, at - lo);
      var y = mix(routes[i][lo].y, routes[i][hi].y, at - lo);
      packets[i].setAttribute('cx', x.toFixed(2)); packets[i].setAttribute('cy', y.toFixed(2));
      packets[i].style.opacity = (Math.sin(Math.PI * q)).toFixed(4);
    });
    var boundaries = [.22, .55, .78];
    captions.forEach(function (caption, i) {
      var incoming = i ? phase(p, boundaries[i - 1] - .025, boundaries[i - 1] + .025) : 1;
      var outgoing = i < 3 ? phase(p, boundaries[i] - .025, boundaries[i] + .025) : 0;
      pose(caption, 0, 16 * (1 - incoming) - 16 * outgoing, 1, 1, 0, incoming * (1 - outgoing));
    });
    steps.forEach(function (step, i) { step.style.opacity = (i === (p < .22 ? 0 : p < .55 ? 1 : p < .78 ? 2 : 3) ? '1' : '.45'); });
    one('progress').style.transform = 'scaleX(' + p.toFixed(4) + ')';
    pose(one('floor'), 0, -80 * dock, 1 - .2 * dock, 1, 0, .5 + .5 * compose);
    film.dataset.progress = p.toFixed(4);
  }
  function render() {
    frame = 0;
    if (!active) return;
    var p = clamp((window.scrollY - start + 12) / travel);
    if (p !== last) { draw(p); canvas.style.visibility = 'visible'; last = p; }
  }
  function request() { if (active && !frame) frame = requestAnimationFrame(render); }
  function measure() {
    if (!active) return;
    var fit = Math.min(1, space.clientWidth / 360, Math.max(.45, (innerHeight - 180) / 440));
    film.style.setProperty('--film-art', (440 * fit) + 'px');
    film.style.setProperty('--film-stage', (440 * fit + 154) + 'px');
    canvas.style.transform = 'scale(' + fit + ')';
    var slot = film.querySelector('.mf-agenda-slot');
    slotX = slot.offsetLeft + 1; slotY = slot.offsetTop;
    start = film.getBoundingClientRect().top + scrollY;
    travel = Math.max(1, film.offsetHeight - pin.offsetHeight);
    last = -1; request();
  }
  function reset() {
    window.removeEventListener('scroll', request);
    window.removeEventListener('resize', measure);
    if (frame) cancelAnimationFrame(frame);
    frame = 0; active = mobile.matches && !reduced.matches;
    film.classList.toggle('is-active', active);
    if (!active) { film.removeAttribute('style'); return; }
    measure();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
  }
  mobile.addEventListener('change', reset); reduced.addEventListener('change', reset);
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', function () { if (frame) cancelAnimationFrame(frame); frame = 0; });
  if (document.fonts) document.fonts.ready.then(measure);
  reset();
})();
