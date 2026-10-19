/* Juniors Pizza & Kebab — "build your order" basket.
   Reads the menu already on the page, adds an Add button to each orderable item,
   lets customers pick size + extras, and sends the order summary by phone/email.
   No payment, no tracking, no external services. */
(function () {
  'use strict';

  var PHONE_TEL = '+61395534025';
  var PHONE_SHOW = '(03) 9553 4025';
  var EMAIL = 'admin@juniorspizzakebab.com.au';
  var OFFER_END = new Date('2026-11-09T00:00:00+11:00');
  var STORE_KEY = 'jpk-order-v1';

  var EXTRAS = {
    gf:      { n: 'Gluten-free base (large 13″ only)', p: 4, max: 1 },
    cheese:  { n: 'Extra cheese', p: 1.5, max: 3 },
    meat:    { n: 'Extra meat (per topping)', p: 2.5, max: 5 },
    veg:     { n: 'Extra vegetable topping', p: 1, max: 5 },
    sauce:   { n: 'Extra sauce', p: 1, max: 5, help: 'Garlic, chilli, BBQ or sweet chilli — tell us which in the notes' },
    kmeat:   { n: 'Extra kebab meat', p: 3.5, max: 3 },
    hcheese: { n: 'HSP extra cheese', p: 2.5, max: 3 }
  };
  var SETS = {
    pizza: ['gf', 'cheese', 'meat', 'veg', 'sauce'],
    kebab: ['kmeat', 'cheese', 'veg', 'sauce'],
    hsp:   ['hcheese', 'kmeat', 'sauce'],
    plain: []
  };

  var ITEMS = {};
  var seq = 0;
  var cart = [];
  var cur = null;       // item being configured
  var sel = null;       // {size:index|null, ex:{key:qty}, qty:number}

  /* ---------- helpers ---------- */
  function money(s) {
    var m = String(s || '').replace(/[^0-9.]/g, '');
    return m ? parseFloat(m) : NaN;
  }
  function fmt(n) { return '$' + n.toFixed(2); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function ownText(el) {
    var s = '';
    Array.prototype.forEach.call(el.childNodes, function (n) { if (n.nodeType === 3) { s += n.nodeValue; } });
    return s.replace(/\s+/g, ' ').trim();
  }
  function $(sel, root) { return (root || document).querySelector(sel); }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        cart = arr.filter(function (l) {
          return l && typeof l.name === 'string' && typeof l.unit === 'number' && typeof l.qty === 'number' && l.qty > 0;
        });
      }
    } catch (e) { cart = []; }
  }

  /* ---------- read the menu from the page ---------- */
  function register(item, host, asRow) {
    if (!item.name || isNaN(item.base) && !(item.sizes && item.sizes.length)) { return; }
    item.id = 'i' + (++seq);
    ITEMS[item.id] = item;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'oa-add';
    b.setAttribute('data-oa', item.id);
    b.setAttribute('aria-label', 'Add ' + item.name + ' to your order');
    b.textContent = '+ Add';
    if (asRow) {
      var price = $('b', host);
      var end = document.createElement('span');
      end.className = 'oa-end';
      host.insertBefore(end, price);
      end.appendChild(price);
      end.appendChild(b);
    } else {
      host.appendChild(b);
    }
  }

  function readMenu() {
    ['pizzas', 'gourmet'].forEach(function (id) {
      var sec = document.getElementById(id);
      if (!sec) { return; }
      Array.prototype.forEach.call(sec.querySelectorAll('.mcard'), function (card) {
        var sizes = Array.prototype.map.call(card.querySelectorAll('.pl'), function (pl) {
          return { label: txt($('b', pl)), price: money(txt($('i', pl))) };
        }).filter(function (s) { return s.label && !isNaN(s.price); });
        register({
          name: ownText($('h3', card)), desc: txt($('p', card)), type: 'pizza', sizes: sizes, base: NaN
        }, $('.bd', card) || card, false);
      });
    });

    [['kebabs', 'kebab', ''], ['hsp', 'hsp', 'HSP '], ['parma', 'plain', ''], ['sides', 'plain', '']].forEach(function (g) {
      var sec = document.getElementById(g[0]);
      if (!sec) { return; }
      Array.prototype.forEach.call(sec.querySelectorAll('figure'), function (fig) {
        var cap = $('figcaption', fig);
        if (!cap) { return; }
        var item = {
          name: g[2] + txt($('span', cap)), desc: txt($('p', cap)), type: g[1],
          sizes: [], base: money(txt($('b', cap)))
        };
        if (g[1] === 'hsp') { item.needNote = true; item.hint = 'Which sauce? (BBQ, chilli, garlic, sweet chilli)'; }
        register(item, fig, false);
      });
    });

    var dr = document.getElementById('drinks');
    if (dr) {
      Array.prototype.forEach.call(dr.querySelectorAll('.ln'), function (row) {
        var parts = txt($('span', row)).split(/\s—\s/);
        var item = { name: parts[0], desc: parts[1] || '', type: 'plain', sizes: [], base: money(txt($('b', row))) };
        if (parts[1]) { item.needNote = true; item.hint = 'Which one? ' + parts[1]; }
        register(item, row, true);
      });
    }
  }

  /* ---------- UI shell ---------- */
  var CSS = [
    '.oa-add{font:inherit;font-weight:700;font-size:.9rem;border:0;cursor:pointer;background:var(--tomato);color:var(--ribbon-ink);border-radius:999px;padding:9px 16px;min-height:40px}',
    '.oa-add:hover{background:var(--tomato-ink)}',
    '.mcard .oa-add{margin-top:12px;width:100%}',
    'figure>.oa-add{margin-top:8px}',
    '.oa-end{display:flex;align-items:center;gap:10px;flex:none}',
    '.oa-end .oa-add{padding:6px 14px;min-height:34px}',
    '.oa-add:focus-visible,.oa-btn:focus-visible,.oa-step button:focus-visible,.oa-bar-btn:focus-visible,.oa-dlg input:focus-visible,.oa-dlg a:focus-visible{outline:3px solid var(--focus);outline-offset:2px}',
    '.oa-dlg{border:0;border-radius:16px;padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:var(--paper-raised);color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:inherit}',
    '.oa-dlg::backdrop{background:rgba(20,10,5,.62)}',
    '.oa-in{padding:20px;overflow:auto;max-height:calc(100vh - 24px)}',
    '.oa-dlg h3{font-family:"Anton",sans-serif;font-weight:400;letter-spacing:.03em;font-size:1.5rem;margin:0 0 4px;color:var(--ember)}',
    '.oa-dlg h4{margin:18px 0 8px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)}',
    '.oa-desc{margin:0 0 6px;color:var(--ink-soft);font-size:.92rem}',
    '.oa-dlg fieldset{border:0;margin:0;padding:0}',
    '.oa-opt{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer}',
    '.oa-opt input{accent-color:var(--tomato);width:20px;height:20px;margin:0 10px 0 0;flex:none}',
    '.oa-opt span:first-child{display:flex;align-items:center;font-weight:600}',
    '.oa-opt.on{border-color:var(--tomato);background:rgba(195,30,43,.07)}',
    '.oa-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}',
    '.oa-row small{display:block;color:var(--ink-soft);font-size:.78rem;font-weight:400}',
    '.oa-step{display:flex;align-items:center;gap:8px;flex:none}',
    '.oa-step button{width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:1.2rem;font-weight:700;cursor:pointer;line-height:1}',
    '.oa-step button:disabled{opacity:.35;cursor:default}',
    '.oa-step output{min-width:22px;text-align:center;font-weight:700}',
    '.oa-dlg label.oa-fld{display:block;margin-top:14px;font-weight:600;font-size:.9rem}',
    '.oa-dlg input[type=text],.oa-dlg input[type=tel]{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px 12px;font:inherit;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink)}',
    '.oa-err{color:var(--tomato);font-weight:600;font-size:.9rem;min-height:1.2em;margin-top:10px}',
    '.oa-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}',
    '.oa-actions.oa-stick{position:sticky;bottom:-20px;background:var(--paper-raised);padding:12px 0 20px;margin:16px 0 -20px;border-top:1px solid var(--line)}',
    '.oa-btn{font:inherit;font-weight:700;font-size:.95rem;border-radius:999px;padding:12px 20px;min-height:44px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);background:var(--paper);color:var(--ink)}',
    '.oa-btn.pri{background:var(--tomato);border-color:var(--tomato);color:var(--ribbon-ink);flex:1 1 180px}',
    '.oa-btn.pri:hover{background:var(--tomato-ink)}',
    '.oa-line{padding:12px 0;border-bottom:1px solid var(--line)}',
    '.oa-line-top{display:flex;justify-content:space-between;gap:12px;font-weight:700}',
    '.oa-line small{display:block;color:var(--ink-soft);font-size:.82rem;margin-top:2px}',
    '.oa-line-ctl{display:flex;align-items:center;justify-content:space-between;margin-top:8px}',
    '.oa-link{background:none;border:0;padding:6px 0;font:inherit;font-size:.85rem;color:var(--tomato);text-decoration:underline;cursor:pointer}',
    '.oa-total{display:flex;justify-content:space-between;font-size:1.15rem;font-weight:800;padding:14px 0 4px}',
    '.oa-note{margin:8px 0 0;padding:10px 12px;border-radius:10px;background:rgba(201,138,44,.16);font-size:.88rem}',
    '.oa-fine{font-size:.82rem;color:var(--ink-soft);margin:10px 0 0}',
    '.oa-ok{color:var(--veg);font-weight:700;font-size:.9rem;min-height:1.2em;margin-top:8px}',
    '.oa-bar{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--head-bg);display:flex;justify-content:center}',
    '.oa-bar[hidden]{display:none}',
    '.oa-bar-btn{font:inherit;font-weight:800;font-size:1rem;width:min(560px,100%);min-height:48px;border:0;border-radius:999px;cursor:pointer;background:var(--tomato);color:var(--ribbon-ink);display:flex;justify-content:space-between;align-items:center;padding:0 22px}',
    'html.oa-has-bar body{padding-bottom:84px}'
  ].join('\n');

  var itemDlg, cartDlg, bar, barBtn;

  function build() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    itemDlg = document.createElement('dialog');
    itemDlg.className = 'oa-dlg';
    itemDlg.setAttribute('aria-labelledby', 'oa-i-title');
    cartDlg = document.createElement('dialog');
    cartDlg.className = 'oa-dlg';
    cartDlg.setAttribute('aria-labelledby', 'oa-c-title');
    bar = document.createElement('div');
    bar.className = 'oa-bar';
    bar.hidden = true;
    bar.innerHTML = '<button type="button" class="oa-bar-btn"><span>View your order (<span id="oa-n">0</span>)</span><span id="oa-t">$0.00</span></button>';
    document.body.appendChild(itemDlg);
    document.body.appendChild(cartDlg);
    document.body.appendChild(bar);
    barBtn = $('.oa-bar-btn', bar);
    barBtn.addEventListener('click', openCart);
    [itemDlg, cartDlg].forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) { d.close(); } });
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.oa-add') : null;
      if (b) { openItem(b.getAttribute('data-oa')); }
    });
  }

  /* ---------- item dialog ---------- */
  function isLarge(label) { return /^L(\s|$)/.test(label || ''); }

  function unitPrice() {
    var p = cur.sizes.length ? (sel.size === null ? 0 : cur.sizes[sel.size].price) : cur.base;
    Object.keys(sel.ex).forEach(function (k) { p += EXTRAS[k].p * sel.ex[k]; });
    return p;
  }

  function gfAllowed() {
    return cur.type === 'pizza' && sel.size !== null && isLarge(cur.sizes[sel.size].label);
  }

  function openItem(id) {
    cur = ITEMS[id];
    if (!cur) { return; }
    sel = { size: null, ex: {}, qty: 1 };
    var h = '<form class="oa-in" novalidate><h3 id="oa-i-title">' + esc(cur.name) + '</h3>';
    if (cur.desc && !cur.needNote) { h += '<p class="oa-desc">' + esc(cur.desc) + '</p>'; }
    if (cur.sizes.length) {
      h += '<fieldset><legend><h4>Choose a size</h4></legend>';
      cur.sizes.forEach(function (s, i) {
        h += '<label class="oa-opt"><span><input type="radio" name="oa-sz" value="' + i + '">' + esc(s.label) + '</span><span>' + fmt(s.price) + '</span></label>';
      });
      h += '</fieldset>';
    }
    var keys = SETS[cur.type] || [];
    if (keys.length) {
      h += '<h4>Add extras</h4>';
      keys.forEach(function (k) {
        var x = EXTRAS[k];
        h += '<div class="oa-row" data-k="' + k + '"><div>' + esc(x.n) + ' <strong>+' + fmt(x.p) + '</strong>' +
          (x.help ? '<small>' + esc(x.help) + '</small>' : '') + '</div>' +
          '<div class="oa-step"><button type="button" data-d="-1" aria-label="Fewer ' + esc(x.n) + '">−</button><output>0</output><button type="button" data-d="1" aria-label="More ' + esc(x.n) + '">+</button></div></div>';
      });
    }
    h += '<label class="oa-fld">' + (cur.needNote ? esc(cur.hint) : 'Notes (optional)') +
      '<input type="text" id="oa-note" maxlength="160" autocomplete="off"' +
      (cur.needNote ? ' required' : ' placeholder="e.g. no onion, cut in 8"') + '></label>';
    h += '<h4>How many?</h4><div class="oa-row" style="border:0"><div></div><div class="oa-step" id="oa-q"><button type="button" data-d="-1" aria-label="Fewer">−</button><output>1</output><button type="button" data-d="1" aria-label="More">+</button></div></div>';
    h += '<div class="oa-err" role="alert" id="oa-err"></div>';
    h += '<div class="oa-actions oa-stick"><button type="button" class="oa-btn" id="oa-cancel">Cancel</button><button type="submit" class="oa-btn pri" id="oa-submit"></button></div></form>';
    itemDlg.innerHTML = h;
    var form = $('form', itemDlg);
    form.addEventListener('submit', function (e) { e.preventDefault(); addToCart(); });
    $('#oa-cancel', itemDlg).addEventListener('click', function () { itemDlg.close(); });
    Array.prototype.forEach.call(form.querySelectorAll('input[name=oa-sz]'), function (r) {
      r.addEventListener('change', function () {
        sel.size = parseInt(r.value, 10);
        if (!gfAllowed()) { delete sel.ex.gf; }
        refresh();
      });
    });
    Array.prototype.forEach.call(form.querySelectorAll('.oa-row[data-k] button'), function (b) {
      b.addEventListener('click', function () {
        var k = b.closest('.oa-row').getAttribute('data-k');
        var q = (sel.ex[k] || 0) + parseInt(b.getAttribute('data-d'), 10);
        q = Math.max(0, Math.min(EXTRAS[k].max, q));
        if (k === 'gf' && !gfAllowed()) { q = 0; $('#oa-err', itemDlg).textContent = 'The gluten-free base is for large (13″) pizzas only.'; }
        if (q) { sel.ex[k] = q; } else { delete sel.ex[k]; }
        refresh();
      });
    });
    Array.prototype.forEach.call($('#oa-q', itemDlg).querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        sel.qty = Math.max(1, Math.min(20, sel.qty + parseInt(b.getAttribute('data-d'), 10)));
        refresh();
      });
    });
    refresh();
    itemDlg.showModal();
  }

  function refresh() {
    Array.prototype.forEach.call(itemDlg.querySelectorAll('.oa-opt'), function (l) {
      l.classList.toggle('on', l.querySelector('input').checked);
    });
    Array.prototype.forEach.call(itemDlg.querySelectorAll('.oa-row[data-k]'), function (r) {
      var k = r.getAttribute('data-k'), q = sel.ex[k] || 0;
      $('output', r).textContent = q;
      var btns = r.querySelectorAll('button');
      btns[0].disabled = q === 0;
      btns[1].disabled = q >= EXTRAS[k].max || (k === 'gf' && !gfAllowed());
    });
    var qb = $('#oa-q', itemDlg).querySelectorAll('button');
    $('#oa-q output', itemDlg).textContent = sel.qty;
    qb[0].disabled = sel.qty <= 1;
    qb[1].disabled = sel.qty >= 20;
    var ready = !cur.sizes.length || sel.size !== null;
    $('#oa-submit', itemDlg).textContent = (ready ? 'Add to order · ' + fmt(unitPrice() * sel.qty) : 'Add to order');
  }

  function addToCart() {
    var err = $('#oa-err', itemDlg);
    var note = $('#oa-note', itemDlg).value.trim();
    if (cur.sizes.length && sel.size === null) { err.textContent = 'Please choose a size.'; return; }
    if (cur.needNote && !note) { err.textContent = cur.hint; $('#oa-note', itemDlg).focus(); return; }
    var size = cur.sizes.length ? cur.sizes[sel.size] : null;
    var ex = Object.keys(sel.ex).map(function (k) { return { n: EXTRAS[k].n, q: sel.ex[k], p: EXTRAS[k].p }; });
    cart.push({
      name: cur.name, size: size ? size.label : '', ex: ex, note: note,
      unit: unitPrice(), qty: sel.qty
    });
    save();
    itemDlg.close();
    updateBar();
  }

  /* ---------- basket ---------- */
  function total() {
    return cart.reduce(function (s, l) { return s + l.unit * l.qty; }, 0);
  }
  function updateBar() {
    var n = cart.reduce(function (s, l) { return s + l.qty; }, 0);
    bar.hidden = n === 0;
    document.documentElement.classList.toggle('oa-has-bar', n > 0);
    $('#oa-n', bar).textContent = n;
    $('#oa-t', bar).textContent = fmt(total());
  }
  function lineDesc(l) {
    var parts = [];
    l.ex.forEach(function (x) { parts.push((x.q > 1 ? x.q + ' x ' : '') + x.n.toLowerCase()); });
    return parts;
  }
  function summary() {
    var name = ($('#oa-name', cartDlg) || {}).value || '';
    var phone = ($('#oa-phone', cartDlg) || {}).value || '';
    var when = ($('#oa-when', cartDlg) || {}).value || '';
    var out = ['Juniors Pizza & Kebab — pickup order', ''];
    cart.forEach(function (l) {
      var t = l.qty + ' x ' + l.name + (l.size ? ' (' + l.size + ')' : '');
      var d = lineDesc(l);
      if (d.length) { t += ' + ' + d.join(', '); }
      if (l.note) { t += ' [' + l.note + ']'; }
      out.push(t + ' — ' + fmt(l.unit * l.qty));
    });
    out.push('', 'Total: ' + fmt(total()) + ' (pay in store)', '');
    out.push('Name: ' + name.trim(), 'Phone: ' + phone.trim(), 'Pickup time: ' + (when.trim() || 'As soon as possible'));
    return out.join('\n');
  }

  function offerApplies() {
    return new Date() < OFFER_END && cart.some(function (l) {
      return /^(L|FAM)(\s|$)/.test(l.size);
    });
  }

  function openCart() {
    if (!cart.length) { return; }
    renderCart();
    cartDlg.showModal();
  }

  function renderCart() {
    var keep = {
      name: ($('#oa-name', cartDlg) || {}).value || '',
      phone: ($('#oa-phone', cartDlg) || {}).value || '',
      when: ($('#oa-when', cartDlg) || {}).value || ''
    };
    var h = '<div class="oa-in"><h3 id="oa-c-title">Your order</h3>';
    if (!cart.length) {
      h += '<p class="oa-desc">Your order is empty.</p><div class="oa-actions"><button type="button" class="oa-btn" id="oa-close">Close</button></div></div>';
      cartDlg.innerHTML = h;
      $('#oa-close', cartDlg).addEventListener('click', function () { cartDlg.close(); });
      return;
    }
    cart.forEach(function (l, i) {
      var d = lineDesc(l);
      h += '<div class="oa-line"><div class="oa-line-top"><span>' + l.qty + ' × ' + esc(l.name) + (l.size ? ' (' + esc(l.size) + ')' : '') + '</span><span>' + fmt(l.unit * l.qty) + '</span></div>' +
        (d.length ? '<small>+ ' + esc(d.join(', ')) + '</small>' : '') +
        (l.note ? '<small>Note: ' + esc(l.note) + '</small>' : '') +
        '<div class="oa-line-ctl"><div class="oa-step" data-i="' + i + '"><button type="button" data-d="-1" aria-label="Fewer ' + esc(l.name) + '">−</button><output>' + l.qty + '</output><button type="button" data-d="1" aria-label="More ' + esc(l.name) + '">+</button></div>' +
        '<button type="button" class="oa-link" data-rm="' + i + '">Remove</button></div></div>';
    });
    h += '<div class="oa-total"><span>Total</span><span>' + fmt(total()) + '</span></div>';
    if (offerApplies()) {
      h += '<p class="oa-note"><strong>Opening offer:</strong> FREE 1.25L drink with any Large or Family pizza. Say “OPEN” when you order (until 8 November 2026, one per order, not combined with other deals).</p>';
    }
    h += '<label class="oa-fld">Your name<input type="text" id="oa-name" autocomplete="name" maxlength="60"></label>' +
      '<label class="oa-fld">Phone number<input type="tel" id="oa-phone" autocomplete="tel" maxlength="20"></label>' +
      '<label class="oa-fld">Pickup time (optional)<input type="text" id="oa-when" maxlength="40" placeholder="e.g. 6:30pm, or as soon as possible"></label>';
    h += '<p class="oa-fine">This is a pickup order and you pay in store. It is only confirmed once we answer your call or reply to your email.</p>';
    h += '<div class="oa-err" role="alert" id="oa-cerr"></div><div class="oa-ok" role="status" id="oa-ok"></div>';
    h += '<div class="oa-actions"><a class="oa-btn pri" id="oa-call" href="tel:' + PHONE_TEL + '">Call ' + PHONE_SHOW + ' to order</a>' +
      '<button type="button" class="oa-btn" id="oa-mail">Email order</button>' +
      '<button type="button" class="oa-btn" id="oa-copy">Copy order</button></div>';
    h += '<div class="oa-actions" style="margin-top:8px"><button type="button" class="oa-link" id="oa-clear">Clear order</button><button type="button" class="oa-link" id="oa-more">Keep browsing</button></div></div>';
    cartDlg.innerHTML = h;
    $('#oa-name', cartDlg).value = keep.name;
    $('#oa-phone', cartDlg).value = keep.phone;
    $('#oa-when', cartDlg).value = keep.when;

    Array.prototype.forEach.call(cartDlg.querySelectorAll('.oa-step[data-i] button'), function (b) {
      b.addEventListener('click', function () {
        var i = parseInt(b.closest('.oa-step').getAttribute('data-i'), 10);
        var q = cart[i].qty + parseInt(b.getAttribute('data-d'), 10);
        if (q < 1) { cart.splice(i, 1); } else { cart[i].qty = Math.min(20, q); }
        afterCartChange();
      });
    });
    Array.prototype.forEach.call(cartDlg.querySelectorAll('[data-rm]'), function (b) {
      b.addEventListener('click', function () { cart.splice(parseInt(b.getAttribute('data-rm'), 10), 1); afterCartChange(); });
    });
    $('#oa-more', cartDlg).addEventListener('click', function () { cartDlg.close(); });
    $('#oa-clear', cartDlg).addEventListener('click', function () { cart = []; afterCartChange(); });
    $('#oa-mail', cartDlg).addEventListener('click', function () {
      if (!detailsOk()) { return; }
      var subj = 'Pickup order from ' + $('#oa-name', cartDlg).value.trim();
      window.location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(summary());
    });
    $('#oa-copy', cartDlg).addEventListener('click', function () {
      if (!detailsOk()) { return; }
      copyText(summary());
    });
  }

  function detailsOk() {
    var e = $('#oa-cerr', cartDlg);
    if (!$('#oa-name', cartDlg).value.trim()) { e.textContent = 'Please enter your name.'; $('#oa-name', cartDlg).focus(); return false; }
    if (!$('#oa-phone', cartDlg).value.trim()) { e.textContent = 'Please enter a phone number so we can confirm.'; $('#oa-phone', cartDlg).focus(); return false; }
    e.textContent = '';
    return true;
  }

  function copyText(s) {
    var ok = $('#oa-ok', cartDlg);
    function done(good) {
      ok.textContent = good ? 'Order copied — paste it into a text or message to us.' : 'Could not copy. Please call us instead.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(function () { done(true); }, function () { done(false); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var good = false;
      try { good = document.execCommand('copy'); } catch (e) { good = false; }
      document.body.removeChild(ta);
      done(good);
    }
  }

  function afterCartChange() {
    save();
    updateBar();
    if (!cart.length) { cartDlg.close(); return; }
    renderCart();
  }

  /* ---------- go ---------- */
  function init() {
    if (typeof HTMLDialogElement === 'undefined') { return; } // very old browsers: menu stays view-only
    readMenu();
    build();
    load();
    updateBar();
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
