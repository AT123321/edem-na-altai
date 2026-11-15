(() => {
  'use strict';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = $('#header');
  const menuToggle = $('.menu-toggle');
  const mobileNav = $('#mobile-nav');
  const scrollNavigation = $('#scroll-navigation');
  const scrollMenuToggle = $('#scroll-menu-toggle');
  const scrollNav = $('#scroll-nav');
  const scrollTop = $('#scroll-top');
  const menus = [
    { container: header, toggle: menuToggle, panel: mobileNav, openLabel: 'Открыть меню', closeLabel: 'Закрыть меню' },
    { container: scrollNavigation, toggle: scrollMenuToggle, panel: scrollNav, openLabel: 'Открыть навигацию по разделам', closeLabel: 'Закрыть навигацию по разделам' }
  ];
  const setMenu = (menu, open) => {
    menu.toggle.setAttribute('aria-expanded', String(open));
    menu.toggle.setAttribute('aria-label', open ? menu.closeLabel : menu.openLabel);
    menu.panel.hidden = !open;
    menu.container.classList.toggle('menu-open', open);
  };
  const closeMenu = () => menus.forEach(menu => setMenu(menu, false));
  menus.forEach(menu => {
    menu.toggle.addEventListener('click', () => {
      const opening = menu.panel.hidden;
      closeMenu();
      setMenu(menu, opening);
    });
    $$('a', menu.panel).forEach(link => link.addEventListener('click', closeMenu));
  });
  document.addEventListener('click', event => {
    menus.forEach(menu => {
      if (!menu.container.contains(event.target)) setMenu(menu, false);
    });
  });
  document.addEventListener('keydown', event => {
    const openMenu = menus.find(menu => !menu.panel.hidden);
    if (event.key === 'Escape' && openMenu) {
      closeMenu();
      openMenu.toggle.focus();
    }
  });
  window.matchMedia('(min-width: 851px)').addEventListener('change', event => {
    if (event.matches) closeMenu();
  });
  let navigationFramePending = false;
  const updateScrollNavigation = () => {
    const visible = window.scrollY > 160;
    scrollNavigation.hidden = !visible;
    scrollTop.hidden = !visible;
    if (!visible) setMenu(menus[1], false);
    navigationFramePending = false;
  };
  window.addEventListener('scroll', () => {
    if (!navigationFramePending) {
      navigationFramePending = true;
      requestAnimationFrame(updateScrollNavigation);
    }
  }, { passive: true });
  updateScrollNavigation();

  // The native dialogs keep focus inside, restore the trigger and support Escape.
  const videoDialog = $('#video-dialog');
  const video = $('#camp-video');
  const photoDialog = $('#photo-dialog');
  let scrollBeforeDialog = 0;
  const openDialog = dialog => {
    closeMenu();
    scrollBeforeDialog = window.scrollY;
    dialog.showModal();
    document.body.classList.add('modal-open');
  };
  [videoDialog, photoDialog].forEach(dialog => {
    $('[data-close]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      // Safari can move the page when the native dialog returns focus.
      if (Math.abs(window.scrollY - scrollBeforeDialog) > 2) window.scrollTo({ top: scrollBeforeDialog, behavior: 'instant' });
    });
  });
  $$('[data-video]').forEach(trigger => trigger.addEventListener('click', () => {
    if (!video.src) {
      video.src = 'assets/camp-film.mp4';
      video.load();
    }
    $('.video-launcher').classList.add('watched');
    openDialog(videoDialog);
    video.play().catch(() => {
      // Native controls remain available when the browser requires another tap.
    });
  }));
  videoDialog.addEventListener('close', () => video.pause());
  video.addEventListener('error', () => $('.video-error').hidden = false);
  video.addEventListener('loadeddata', () => $('.video-error').hidden = true);

  const galleryPhotos = $$('[data-photo]');
  const photoStage = $('.photo-dialog-stage');
  const photoLoading = $('.photo-loading');
  const photoError = $('.photo-error');
  let fullPhoto = $('#full-photo');
  let currentPhoto = 0;
  let photoRequest = 0;
  let activePhotos = galleryPhotos.filter(photo => !photo.dataset.group);
  const photoCache = new Map();
  const decodePhoto = image => {
    if (image.decode) return image.decode();
    if (image.complete) return image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('Image unavailable'));
    return new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  };
  const loadPhoto = (source, priority = 'low') => {
    let entry = photoCache.get(source);
    if (entry) {
      photoCache.delete(source);
      photoCache.set(source, entry);
      entry.image.fetchPriority = priority;
      return entry;
    }
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    entry = { image, ready: false, promise: null };
    image.src = source;
    entry.promise = decodePhoto(image).then(() => {
      entry.ready = true;
      return image;
    }).catch(error => {
      if (photoCache.get(source) === entry) photoCache.delete(source);
      throw error;
    });
    photoCache.set(source, entry);
    // Keep decoded neighbors without retaining the whole album in phone memory.
    while (photoCache.size > 5) photoCache.delete(photoCache.keys().next().value);
    return entry;
  };
  const replacePhoto = (image, alt, visible = true) => {
    image.id = 'full-photo';
    image.alt = alt;
    image.style.visibility = visible ? '' : 'hidden';
    if (fullPhoto !== image) fullPhoto.replaceWith(image);
    fullPhoto = image;
  };
  const finishPhotoLoading = () => {
    photoLoading.hidden = true;
    photoStage.setAttribute('aria-busy', 'false');
  };
  const showPhoto = index => {
    if (!activePhotos.length) return;
    const request = ++photoRequest;
    currentPhoto = (index + activePhotos.length) % activePhotos.length;
    const trigger = activePhotos[currentPhoto];
    const thumbnail = $('img', trigger);
    const entry = loadPhoto(trigger.dataset.photo, 'high');
    $('.photo-dialog-caption').textContent = trigger.dataset.caption;
    $('.photo-count').textContent = `${currentPhoto + 1} / ${activePhotos.length}`;
    photoError.hidden = true;
    if (entry.ready) {
      replacePhoto(entry.image, thumbnail.alt);
      finishPhotoLoading();
    } else {
      // A fresh node cannot keep painting the preceding photo while src loads.
      const preview = thumbnail.cloneNode();
      preview.removeAttribute('srcset');
      preview.removeAttribute('sizes');
      preview.loading = 'eager';
      preview.decoding = 'async';
      preview.src = thumbnail.currentSrc || thumbnail.src;
      replacePhoto(preview, thumbnail.alt, false);
      photoLoading.hidden = false;
      photoStage.setAttribute('aria-busy', 'true');
      const previewReady = decodePhoto(preview).then(() => {
        if (request === photoRequest && fullPhoto === preview) {
          preview.style.visibility = '';
          finishPhotoLoading();
        }
        return true;
      }).catch(() => false);
      entry.promise.then(image => {
        if (request !== photoRequest) return;
        replacePhoto(image, thumbnail.alt);
        finishPhotoLoading();
      }).catch(async () => {
        const hasPreview = await previewReady;
        if (request !== photoRequest) return;
        finishPhotoLoading();
        photoError.hidden = hasPreview;
      });
    }
    if (activePhotos.length > 1) {
      [-1, 1].forEach(offset => {
        const neighbor = activePhotos[(currentPhoto + offset + activePhotos.length) % activePhotos.length];
        loadPhoto(neighbor.dataset.photo).promise.catch(() => {});
      });
    }
  };
  galleryPhotos.forEach(trigger => trigger.addEventListener('click', () => {
    activePhotos = galleryPhotos.filter(photo => photo.dataset.group === trigger.dataset.group);
    showPhoto(activePhotos.indexOf(trigger));
    openDialog(photoDialog);
  }));
  $('.photo-prev').addEventListener('click', () => showPhoto(currentPhoto - 1));
  $('.photo-next').addEventListener('click', () => showPhoto(currentPhoto + 1));
  photoDialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(currentPhoto - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(currentPhoto + 1); }
  });
  let swipeStart = null;
  photoStage.addEventListener('touchstart', event => { swipeStart = event.changedTouches[0].clientX; }, { passive: true });
  photoStage.addEventListener('touchend', event => {
    if (swipeStart === null) return;
    const distance = event.changedTouches[0].clientX - swipeStart;
    if (Math.abs(distance) > 55) showPhoto(currentPhoto + (distance < 0 ? 1 : -1));
    swipeStart = null;
  }, { passive: true });
  photoDialog.addEventListener('close', () => {
    ++photoRequest;
    swipeStart = null;
    finishPhotoLoading();
    photoError.hidden = true;
  });
  const connectGallery = (rail, previous, next) => {
    const move = direction => rail.scrollBy({ left: direction * Math.min(rail.clientWidth * .7, 520), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    const updateButtons = () => {
      previous.disabled = rail.scrollLeft < 5;
      next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 5;
    };
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    rail.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons, { passive: true });
    updateButtons();
  };
  connectGallery($('.photo-rail'), $('[data-gallery-prev]'), $('[data-gallery-next]'));
  $$('[data-gallery-rail]').forEach(rail => {
    const name = rail.dataset.galleryRail;
    connectGallery(rail, $(`[data-rail-prev="${name}"]`), $(`[data-rail-next="${name}"]`));
  });

  let toastTimer;
  const notify = message => {
    const toast = $('.toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  };
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const number = button.dataset.copy;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(number);
      } else {
        const input = document.createElement('textarea');
        input.value = number;
        input.setAttribute('readonly', '');
        input.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        button.focus({ preventScroll: true });
        if (!copied) throw new Error('Clipboard unavailable');
      }
      notify('Номер скопирован. Сохраните его и найдите контакт в MAX.');
    } catch {
      notify(`Не получилось скопировать. Номер: ${number}`);
    }
  }));

  // Slow, one-time entrances. Content stays readable if JavaScript is unavailable.
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('is-waiting');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px -30px 0px' });
    document.body.classList.add('motion-ready');
    $$('.reveal').forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight) element.classList.add('is-waiting');
      observer.observe(element);
    });
    reducedMotion.addEventListener('change', event => {
      if (event.matches) {
        observer.disconnect();
        $$('.is-waiting').forEach(element => element.classList.remove('is-waiting'));
      }
    });
  }
})();
