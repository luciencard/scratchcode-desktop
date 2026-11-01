// ScratchCode sur téléphone et tablette (site, appli Android, écrans tactiles).
// Se charge après le bundle de l'éditeur et ne touche pas à son code :
//  1. Scène tactile : plusieurs doigts à la fois (joystick + bouton), pas de défilement ni de zoom
//     parasite, pas de déplacement involontaire des sprites-boutons pendant le jeu.
//  2. Plein écran : bouton « Quitter » toujours visible, drapeau vert et stop dans la barre,
//     touche Retour d'Android qui ramène à l'éditeur.
//  3. Appli Android APK : mêmes menus que l'appli ordinateur (pas de compte ni de cloud, menu
//     « Remettre le code en forme » dans le menu mobile).
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var body = document.body;

  function vm() { return window.scratchcode && window.scratchcode.vm; }
  function isFull() { return body.classList.contains('stage-full'); }
  function isPlayer() { return body.classList.contains('player'); }

  // ---------- 3. Appli Android APK : comme l'appli ordinateur ----------
  var apk = false;
  try { apk = !!window.ScAndroid && JSON.parse(window.ScAndroid.info()).flavor !== 'play'; } catch (e) { apk = !!window.ScAndroid; }
  if (apk) document.documentElement.classList.add('no-account', 'sc-apk');

  // Le menu mobile est reconstruit à chaque ouverture : on y ajoute ce que la barre de menus
  // de l'ordinateur propose et on retire le compte dans l'APK.
  function patchSheet(sheet) {
    if (!sheet.querySelector('.ms-sec') || sheet.querySelector('[data-act="format"]')) return;
    if (document.documentElement.classList.contains('no-account')) {
      sheet.querySelectorAll('.ms-sec').forEach(function (sec) {
        if (sec.querySelector('[data-act="login"], [data-act="logout"], [data-act="cloud-list"]')) sec.remove();
      });
    }
    var help = sheet.querySelector('[data-act="help"]');
    if (!help) return;
    var btn = document.createElement('button');
    btn.setAttribute('data-act', 'format');
    btn.innerHTML = '<svg class="ic" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M8 12h12M8 18h12M4 12h.01M4 18h.01"/></svg><span>Remettre le code en forme</span>';
    btn.addEventListener('click', function () { setTimeout(function () { var c = sheet.querySelector('.ms-close'); if (c) c.click(); }, 0); });
    help.after(btn);
  }
  var sheet = $('#mSheet');
  if (sheet) new MutationObserver(function () { patchSheet(sheet); }).observe(sheet, { childList: true });

  // ---------- 2. Plein écran ----------
  var header = $('.stage-header');
  var fullBtn = $('.stage-size[data-size="full"]');
  var normalBtn = $('.stage-size[data-size="normal"]');
  function exitFull() { if (normalBtn) normalBtn.click(); }
  if (header && normalBtn) {
    var exit = document.createElement('button');
    exit.className = 'sc-exit-full';
    exit.type = 'button';
    exit.title = 'Quitter le plein écran';
    exit.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg><span>Quitter</span>';
    exit.addEventListener('click', exitFull);
    header.appendChild(exit);
  }
  // Le bouton plein écran devient un interrupteur : un second appui revient à la scène normale.
  if (fullBtn) fullBtn.addEventListener('click', function (e) {
    if (isFull() && !isPlayer()) { e.stopImmediatePropagation(); exitFull(); }
  }, true);
  // Touche Retour d'Android : sortir du plein écran avant tout le reste.
  function wrapBack() {
    var orig = window.scHandleBack;
    if (!orig || orig.__scMobile) return !!orig;
    var wrapped = function () {
      if (isFull() && !isPlayer() && $('#modalBack') && $('#modalBack').hidden) { exitFull(); return true; }
      return orig.apply(this, arguments);
    };
    wrapped.__scMobile = true;
    window.scHandleBack = wrapped;
    return true;
  }

  // ---------- 1. Scène tactile ----------
  var canvas = $('#stage');
  var wrap = $('#stageWrap') || (canvas && canvas.parentNode);
  var touches = new Map(); // pointerId -> { x, y, sx, sy, target, drag, dragged }
  var DRAG_START = 12; // px : un doigt bouge toujours un peu, il ne doit pas déplacer un bouton

  function io(e, extra) {
    var r = canvas.getBoundingClientRect();
    var d = { x: e.clientX - r.left, y: e.clientY - r.top, canvasWidth: r.width, canvasHeight: r.height };
    for (var k in extra) d[k] = extra[k];
    return d;
  }
  function scratchXY(e) {
    var r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * 480 - 240), Math.round(180 - (e.clientY - r.top) / r.height * 360)];
  }
  function pick(d) {
    // même recherche que la souris de scratch-vm (Mouse._pickTarget)
    var rt = vm().runtime, id = rt.renderer.pick(d.x, d.y);
    for (var i = 0; i < rt.targets.length; i++) if (rt.targets[i].drawableID === id) return rt.targets[i];
    return rt.getTargetForStage();
  }
  function clickHats(t) {
    var rt = vm().runtime;
    rt.startHats('event_whenthisspriteclicked', null, t);
    rt.startHats('event_whenstageclicked', null, t);
  }
  // Dans l'éditeur (projet arrêté, scène normale) on peut glisser les sprites pour les placer ;
  // pendant le jeu ou en plein écran, seuls les sprites « glissables » se déplacent au doigt.
  function canDrag(t) {
    if (!t || t.isStage) return false;
    if (t.draggable) return true;
    return !isFull() && !isPlayer() && vm().runtime.threads.length === 0;
  }

  function down(e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* doigt déjà levé */ }
    var v = vm(), d = io(e), t = pick(d), xy = scratchXY(e);
    var first = touches.size === 0;
    touches.set(e.pointerId, { x: d.x, y: d.y, sx: e.clientX, sy: e.clientY, target: t,
      offX: t.x - xy[0], offY: t.y - xy[1], drag: canDrag(t), dragged: false });
    if (first) {
      d.isDown = true;
      v.postIOData('mouse', d); // « souris pressée » + scripts « quand ce sprite est cliqué »
    } else {
      // La souris de Scratch est déjà pressée : on la place sur ce doigt et on lance les
      // scripts de clic nous-mêmes (Scratch les ignore si la souris était déjà pressée).
      v.postIOData('mouse', d);
      if (!t.draggable) clickHats(t);
    }
  }
  function move(e) {
    var p = touches.get(e.pointerId);
    if (!p) return;
    var v = vm(), d = io(e), xy = scratchXY(e);
    var coords = $('#coords');
    if (coords) coords.textContent = 'x: ' + xy[0] + ' y: ' + xy[1];
    if (p.drag) {
      if (!p.dragged) {
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_START) { p.x = d.x; p.y = d.y; return; }
        p.dragged = true;
        v.startDrag(p.target.id);
      }
      p.target.setXY(xy[0] + p.offX, xy[1] + p.offY, true); // force : scratch-vm ignore setXY pendant un glisser
    }
    // La souris suit le doigt qui bouge vraiment (le doigt posé sur un bouton tremble à peine).
    if (Math.hypot(d.x - p.x, d.y - p.y) >= 2 || touches.size === 1) {
      p.x = d.x; p.y = d.y;
      v.postIOData('mouse', d);
    }
  }
  function up(e) {
    var p = touches.get(e.pointerId);
    if (!p) return;
    var v = vm();
    touches.delete(e.pointerId);
    if (p.dragged) {
      v.stopDrag(p.target.id);
      if (window.scratchcode.markDirty) window.scratchcode.markDirty();
    }
    if (touches.size === 0) {
      v.postIOData('mouse', io(e, { isDown: false, wasDragged: p.dragged }));
    } else {
      if (p.target.draggable && !p.dragged && e.type === 'pointerup') clickHats(p.target);
      // La souris retourne sur un doigt encore posé.
      var rest = Array.from(touches.values()).pop();
      var r = canvas.getBoundingClientRect();
      v.postIOData('mouse', { x: rest.x, y: rest.y, canvasWidth: r.width, canvasHeight: r.height });
    }
  }

  // « Touche le pointeur de souris ? » vaut vrai si un des doigts posés touche le sprite :
  // on peut tenir le joystick et appuyer sur un bouton en même temps.
  function patchTouching() {
    var v = vm(), stage = v && v.runtime.getTargetForStage();
    if (!stage) return false;
    var proto = Object.getPrototypeOf(stage);
    if (proto.__scMultiTouch || typeof proto.isTouchingObject !== 'function' || typeof proto.isTouchingPoint !== 'function') return true;
    var orig = proto.isTouchingObject;
    proto.isTouchingObject = function (obj) {
      if (obj === '_mouse_' && touches.size > 1) {
        var self = this, hit = false;
        touches.forEach(function (p) { if (!hit && self.isTouchingPoint(p.x, p.y)) hit = true; });
        return hit;
      }
      return orig.call(this, obj);
    };
    proto.__scMultiTouch = true;
    return true;
  }

  if (canvas && wrap) {
    // Écouteurs en phase de capture sur le cadre de la scène : les doigts n'atteignent plus les
    // écouteurs souris du bundle (une seule souris) ; la souris et le stylet restent inchangés.
    var guard = function (fn) {
      return function (e) {
        if (e.pointerType !== 'touch' || e.target !== canvas || !vm()) return;
        e.stopPropagation();
        if (e.type === 'pointerdown' || e.type === 'pointermove') e.preventDefault();
        fn(e);
      };
    };
    wrap.addEventListener('pointerdown', guard(down), true);
    wrap.addEventListener('pointermove', guard(move), true);
    wrap.addEventListener('pointerup', guard(up), true);
    wrap.addEventListener('pointercancel', guard(up), true);
    // Appui long : pas de menu contextuel ni de loupe de sélection sur la scène.
    wrap.addEventListener('contextmenu', function (e) { if (e.target === canvas) e.preventDefault(); });
  }

  // Le bundle et la machine Scratch se chargent après ce fichier : on attend qu'ils soient prêts.
  var tries = 0;
  var timer = setInterval(function () {
    var okBack = wrapBack() || !window.ScAndroid;
    var okTouch = patchTouching();
    if ((okBack && okTouch) || ++tries > 150) clearInterval(timer);
  }, 200);
})();
