(() => {
  'use strict';
  const widget = document.querySelector('.moments-widget');
  if (!widget) return;
  const mediaBase = new URL('.', document.currentScript.src);
  const items = (window.SLAYSINUS_MOMENTS || []).filter(item =>
    item && ['image', 'video'].includes(item.type) && typeof item.src === 'string' && item.src.trim()
  ).map((item, index) => ({...item, number:item.number || index + 1}));
  const frame = widget.querySelector('.moments-frame');
  const counter = widget.querySelector('.moments-counter');
  const previous = widget.querySelector('[data-moment-previous]');
  const next = widget.querySelector('[data-moment-next]');
  const pause = widget.querySelector('.moments-pause');
  const status = widget.querySelector('[role="status"]');
  const track = document.createElement('div');
  track.className = 'moments-track';
  frame.replaceChildren(track);
  const interval = 16000;
  let current = items.length ? Math.floor(Math.random() * items.length) : 0;
  let media = null;
  let activeCard = null;
  let cards = [];
  let timer = null;
  let generation = 0;
  let ready = false;
  let auto = true;
  function isVisible() {
    const rect = frame.getBoundingClientRect();
    const shown = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && shown >= rect.height * .15;
  }
  const wrap = index => (index + items.length) % items.length;
  const source = path => new URL(path, mediaBase).href;
  const label = item => `${item.type === 'video' ? 'Видео' : 'Фото'} · ${item.number} / ${items.length}`;

  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }
  function schedule() {
    stopTimer();
    if (items.length > 1 && auto && ready && isVisible() && !document.hidden) {
      timer = setTimeout(() => show(current + 1), interval);
    }
  }
  function syncVideo() {
    if (!(media instanceof HTMLVideoElement)) return;
    if (isVisible() && !document.hidden) {
      media.preload = 'auto';
      media.play().catch(() => {});
    } else media.pause();
  }
  function layout() {
    if (!activeCard || !frame.clientWidth) return;
    const gap = frame.clientWidth < 600 ? 12 : 24;
    const maxWidth = frame.clientWidth * (frame.clientWidth < 600 ? .76 : .72);
    const small = frame.clientWidth < 600;
    const limit = Math.min(small ? 440 : 520, Math.max(small ? 250 : 260, innerHeight * (small ? .52 : .55)));
    const activeRatio = Number(activeCard.dataset.ratio) || 1;
    const activeHeight = Math.min(limit * activeRatio, maxWidth) / activeRatio;
    frame.style.height = `${activeHeight}px`;
    track.style.gap = `${gap}px`;
    cards.forEach(card => {
      const maxHeight = activeHeight * (card === activeCard ? 1 : .84);
      const ratio = Number(card.dataset.ratio) || 1;
      const width = Math.min(maxHeight * ratio, maxWidth);
      card.style.width = `${width}px`;
      card.style.height = `${width / ratio}px`;
    });
    // Center the current card, regardless of the aspect ratios beside it.
    const offset = activeCard.offsetLeft + activeCard.offsetWidth / 2;
    track.style.transform = `translate(${-offset}px, -50%)`;
  }
  function preview(index, direction) {
    const item = items[wrap(index)];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'moments-card moments-preview';
    card.dataset.ratio = (item.width || 1) / (item.height || 1);
    card.setAttribute('aria-label', `${direction < 0 ? 'Предыдущий кадр' : 'Следующий кадр'}: ${label(item)}`);
    const path = item.type === 'video' ? item.poster : item.src;
    if (path) {
      const img = document.createElement('img');
      img.src = source(path);
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      card.append(img);
    }
    if (item.type === 'video') {
      const badge = document.createElement('span');
      badge.className = 'moments-video-label';
      badge.textContent = 'Видео';
      card.append(badge);
    }
    card.addEventListener('click', () => show(current + direction, true));
    return card;
  }
  function show(index, manual = false) {
    if (!items.length) return;
    stopTimer();
    const moveFocus = track.contains(document.activeElement);
    const direction = index < current ? -1 : 1;
    current = wrap(index);
    const token = ++generation;
    ready = false;
    if (media instanceof HTMLVideoElement) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    const item = items[current];
    activeCard = document.createElement('div');
    activeCard.className = 'moments-card moments-current';
    activeCard.dataset.ratio = (item.width || 1) / (item.height || 1);
    activeCard.setAttribute('role', 'group');
    activeCard.setAttribute('aria-label', label(item));
    const message = document.createElement('div');
    message.className = 'moments-message';
    message.textContent = item.type === 'video' ? 'Загружаем видео…' : 'Загружаем фото…';
    media = document.createElement(item.type === 'video' ? 'video' : 'img');
    media.className = 'moments-media';
    const loaded = () => {
      if (token !== generation) return;
      const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
      if (width && height) {
        activeCard.dataset.ratio = width / height;
        layout();
      }
      message.hidden = true;
      ready = true;
      schedule();
    };
    media.addEventListener(item.type === 'video' ? 'loadeddata' : 'load', loaded, {once:true});
    media.addEventListener('error', () => {
      if (token !== generation) return;
      message.textContent = 'Кадр не загрузился. Можно перейти к следующему.';
      message.hidden = false;
      ready = true;
      schedule();
    }, {once:true});
    if (item.type === 'video') {
      media.controls = true;
      media.playsInline = true;
      media.muted = true;
      media.preload = isVisible() ? 'auto' : 'metadata';
      media.setAttribute('aria-label', item.alt || 'Видео из нашего года');
      if (item.poster) media.poster = source(item.poster);
    } else {
      media.alt = item.alt || 'Фото из нашего года';
      media.decoding = 'async';
      media.draggable = false;
    }
    media.src = source(item.src);
    activeCard.append(media, message);
    cards = items.length > 1 ? [preview(current - 1, -1), activeCard, preview(current + 1, 1)] : [activeCard];
    track.replaceChildren(...cards);
    layout();
    syncVideo();
    counter.textContent = label(item);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      activeCard.animate([{opacity:.45, translate:`${direction * 18}px 0`}, {opacity:1, translate:'0 0'}], {duration:350, easing:'ease-out'});
    }
    if (manual) status.textContent = label(item);
    if (moveFocus) (direction < 0 ? previous : next).focus({preventScroll:true});
  }
  previous.addEventListener('click', () => show(current - 1, true));
  next.addEventListener('click', () => show(current + 1, true));
  pause.addEventListener('click', () => {
    auto = !auto;
    pause.textContent = auto ? 'Остановить смену' : 'Продолжить смену';
    pause.setAttribute('aria-pressed', String(!auto));
    status.textContent = auto ? 'Автоматическая смена включена' : 'Автоматическая смена остановлена';
    schedule();
  });
  widget.addEventListener('keydown', event => {
    if (!items.length || event.target.closest('video') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(current + (event.key === 'ArrowRight' ? 1 : -1), true);
  });
  let touch = null;
  let swiped = false;
  frame.addEventListener('touchstart', event => {
    swiped = false;
    touch = event.touches.length === 1 && !event.target.closest('video')
      ? {x:event.touches[0].clientX, y:event.touches[0].clientY} : null;
  }, {passive:true});
  frame.addEventListener('touchend', event => {
    if (!touch || !items.length) return;
    const dx = event.changedTouches[0].clientX - touch.x;
    const dy = event.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      event.preventDefault();
      swiped = true;
      show(current + (dx < 0 ? 1 : -1), true);
    }
    touch = null;
  }, {passive:false});
  frame.addEventListener('click', event => {
    if (swiped) { event.preventDefault(); event.stopPropagation(); swiped = false; }
  }, true);
  frame.addEventListener('touchcancel', () => { touch = null; }, {passive:true});
  document.addEventListener('visibilitychange', () => { syncVideo(); schedule(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(() => {
      syncVideo();
      schedule();
    }, {threshold:[0, .15]}).observe(frame);
  }
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(frame);
  else window.addEventListener('resize', layout);
  if (items.length < 2) [previous, next, pause].forEach(button => { button.disabled = true; });
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'moments-message';
    empty.textContent = 'Здесь будут наши фото и видео.';
    frame.replaceChildren(empty);
    counter.textContent = 'Пока нет кадров';
    return;
  }
  show(current);
})();
