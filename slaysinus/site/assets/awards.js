(() => {
  'use strict';
  const carousel = document.querySelector('.awards-carousel');
  if (!carousel) return;
  const slides = [...carousel.querySelectorAll('.award-slide')];
  const dots = [...carousel.querySelectorAll('.award-dot')];
  const counter = carousel.querySelector('.award-counter');
  const status = carousel.querySelector('[role="status"]');
  let current = 0;
  function goTo(index) {
    const next = (index + slides.length) % slides.length;
    if (next === current) return;
    const moveFocus = slides[current].contains(document.activeElement);
    const image = slides[next].querySelector('img');
    if (image.dataset.src) {
      image.src = image.dataset.src;
      delete image.dataset.src;
    }
    slides.forEach((slide, i) => {
      const active = i === next;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
      dots[i].setAttribute('aria-current', String(active));
    });
    current = next;
    if (moveFocus) slides[next].querySelector('button').focus({preventScroll:true});
    counter.textContent = `${next + 1} / ${slides.length}`;
    status.textContent = `${next + 1} из ${slides.length}: ${slides[next].querySelector('h3').textContent}`;
  }
  carousel.querySelector('[data-previous]').addEventListener('click', () => goTo(current - 1));
  carousel.querySelector('[data-next]').addEventListener('click', () => goTo(current + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target.closest('.moments-widget')) return;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
    const rect = carousel.getBoundingClientRect();
    if (!carousel.contains(document.activeElement) && (rect.bottom < 100 || rect.top > innerHeight * .8)) return;
    event.preventDefault();
    goTo(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  let start = null;
  carousel.addEventListener('touchstart', event => {
    start = event.touches.length === 1 ? {x:event.touches[0].clientX, y:event.touches[0].clientY} : null;
  }, {passive:true});
  carousel.addEventListener('touchend', event => {
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(current + (dx < 0 ? 1 : -1));
    start = null;
  }, {passive:true});
  carousel.addEventListener('touchcancel', () => { start = null; }, {passive:true});
})();
