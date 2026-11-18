(function () {
  const root = document.getElementById('soda-hero');
  if (!root) return;

  const config = JSON.parse(document.getElementById('soda-config').textContent);
  const flavors = config.flavors;

  const modelViewer = document.querySelector('#product-model');
  const berriesFG = document.querySelector('.berries-container');
  const berriesBG = document.querySelector('.berries-container-bg');
  const leavesBG = document.querySelector('.leaves-container');
  const allBerries = document.querySelectorAll('.berry');
  const cards = document.querySelectorAll('.card');
  let isSwitching = false;
  let switchSpin = 0;
  let activeIndex = 0;
  const textures = [];

  // Preload textures & warm up shaders
  async function initTextures() {
    try {
      for (let i = 0; i < flavors.length; i++) {
        textures[i] = flavors[i].texture ? await modelViewer.createTexture(flavors[i].texture) : null;
      }
      // Shader warm-up: briefly apply another flavor's texture, then restore the first
      if (modelViewer.model && flavors.length > 1 && textures[0] && textures[1]) {
        const material = modelViewer.model.materials[0];
        if (material && material.pbrMetallicRoughness.baseColorTexture) {
          material.pbrMetallicRoughness.baseColorTexture.setTexture(textures[1]);
          await new Promise(r => requestAnimationFrame(r));
          material.pbrMetallicRoughness.baseColorTexture.setTexture(textures[0]);
        }
      }
    } catch (e) { console.error('Texture preload failed', e); }
  }
  if (modelViewer.loaded) initTextures();
  else modelViewer.addEventListener('load', initTextures, { once: true });

  cards.forEach(card => {
    card.addEventListener('click', () => {
      if (isSwitching) return;
      selectFlavor(parseInt(card.dataset.flavorIndex, 10));
    });
  });

  document.querySelectorAll('.nav-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isSwitching || flavors.length < 2) return;
      const dir = parseInt(btn.dataset.dir, 10);
      selectFlavor((activeIndex + dir + flavors.length) % flavors.length);
    });
  });

  function selectFlavor(index) {
    cards.forEach(c => c.classList.remove('active'));
    if (cards[index]) cards[index].classList.add('active');
    activeIndex = index;
    switchFlavor(index);
  }

  function applyTexture(index) {
    const tex = textures[index];
    if (modelViewer.model && tex) {
      modelViewer.model.materials.forEach(material => {
        if (material.pbrMetallicRoughness.baseColorTexture) {
          material.pbrMetallicRoughness.baseColorTexture.setTexture(tex);
        }
      });
    }
  }

  async function switchFlavor(index) {
    if (isSwitching) return;
    isSwitching = true;
    const flavor = flavors[index];
    const body = document.body;
    const berries = document.querySelectorAll('.berry');
    const heroCenter = document.querySelector('.hero-center');

    // 1. Background animation
    gsap.to(body, {
      '--bg-inner': flavor.inner,
      '--bg-mid': flavor.mid,
      '--bg-outer': flavor.outer,
      duration: 1.5,
      ease: 'power2.inOut'
    });

    // 2. Can spin (360 + blur, swap at peak, settle to 720)
    const spinObj = { val: 0, blur: 0 };
    gsap.to(spinObj, {
      val: 360,
      blur: 15,
      duration: 0.6,
      ease: 'power2.in',
      onUpdate: () => {
        switchSpin = spinObj.val;
        modelViewer.style.filter = `blur(${spinObj.blur}px)`;
      },
      onComplete: () => {
        applyTexture(index);
        gsap.to(spinObj, {
          val: 720,
          blur: 0,
          duration: 1.5,
          ease: 'back.out(0.7)',
          onUpdate: () => {
            switchSpin = spinObj.val;
            modelViewer.style.filter = `blur(${spinObj.blur}px)`;
          },
          onComplete: () => {
            switchSpin = 0;
            modelViewer.style.filter = 'none';
          }
        });
      }
    });

    // 3. Berries implode / swap model / explode
    let completedBerries = 0;
    berries.forEach(berry => {
      const bW = berry.offsetWidth / 2;
      const bH = berry.offsetHeight / 2;
      const centerX = (window.innerWidth / 2 - berry.offsetLeft - bW);
      const centerY = (window.innerHeight / 2 - berry.offsetTop - bH);

      const startAngle = parseFloat(berry.dataset.angle) || 0;
      const currentBaseX = parseFloat(berry.dataset.baseX) || 0;
      const currentBaseY = parseFloat(berry.dataset.baseY) || 0;

      const nextBaseX = (Math.random() - 0.5) * 200;
      const nextBaseY = (Math.random() - 0.5) * 200;

      gsap.set(berry, { rotation: startAngle, x: currentBaseX, y: currentBaseY });

      const berryTl = gsap.timeline();

      berryTl.to(berry, {
        x: centerX,
        y: centerY,
        rotation: startAngle + 45,
        scale: 0.1,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => {
          if (flavor.berry) berry.src = flavor.berry;
          heroCenter.style.zIndex = 50;
        }
      })
      .to(berry, { duration: 0.3 })
      .to(berry, {
        onStart: () => { heroCenter.style.zIndex = 1; },
        x: nextBaseX,
        y: nextBaseY,
        rotation: startAngle + 90,
        scale: 1,
        opacity: 1,
        duration: 0.9,
        ease: 'back.out(1.5)',
        onComplete: () => {
          berry.dataset.angle = startAngle + 90;
          berry.dataset.baseX = nextBaseX;
          berry.dataset.baseY = nextBaseY;
          berry.dataset.rx = 0;
          berry.dataset.ry = 0;

          completedBerries++;
          if (completedBerries === berries.length) {
            isSwitching = false;
          }
        }
      });
    });
  }

  // Track berry states for smoothing
  allBerries.forEach(b => {
    b.dataset.rx = 0; b.dataset.ry = 0; b.dataset.angle = Math.random() * 360;
    b.dataset.baseX = 0; b.dataset.baseY = 0;
    b.dataset.targetRx = 0; b.dataset.targetRy = 0;
  });

  let mouse = { x: 0, y: 0, px: 0, py: 0 };
  let currentMouse = { x: 0, y: 0 };

  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) - 0.5;
    mouse.y = (e.clientY / window.innerHeight) - 0.5;
    mouse.px = e.clientX;
    mouse.py = e.clientY;
  });

  function animate() {
    const time = Date.now() * 0.001;
    currentMouse.x += (mouse.x - currentMouse.x) * 0.05;
    currentMouse.y += (mouse.y - currentMouse.y) * 0.05;

    // Tilt the can + add switch spin
    modelViewer.cameraOrbit = `${(currentMouse.x * 40) + switchSpin}deg ${90 + (currentMouse.y * 20)}deg 380%`;

    // Parallax containers
    berriesFG.style.transform = `translate(${currentMouse.x * 60}px, ${currentMouse.y * 60}px)`;
    berriesBG.style.transform = `translate(${currentMouse.x * -30}px, ${currentMouse.y * -30}px)`;
    leavesBG.style.transform = `translate(${currentMouse.x * -15}px, ${currentMouse.y * -15}px)`;

    if (!isSwitching) {
      allBerries.forEach((berry, i) => {
        const berryRect = berry.getBoundingClientRect();
        const berryX = berryRect.left + berryRect.width / 2;
        const berryY = berryRect.top + berryRect.height / 2;

        const diffX = mouse.px - berryX;
        const diffY = mouse.py - berryY;
        const distance = Math.sqrt(diffX * diffX + diffY * diffY);

        let targetRx = 0, targetRy = 0, speedMult = 1;

        if (distance < 400) {
          const force = (400 - distance) / 400;
          targetRx = (diffX / distance) * force * -80;
          targetRy = (diffY / distance) * force * -80;
          speedMult = 1 + force * 5;
        }

        let rx = parseFloat(berry.dataset.rx) || 0;
        let ry = parseFloat(berry.dataset.ry) || 0;
        let angle = parseFloat(berry.dataset.angle) || 0;
        let baseX = parseFloat(berry.dataset.baseX) || 0;
        let baseY = parseFloat(berry.dataset.baseY) || 0;

        rx += (targetRx - rx) * 0.1;
        ry += (targetRy - ry) * 0.1;
        angle += 0.2 * speedMult;

        berry.dataset.rx = rx;
        berry.dataset.ry = ry;
        berry.dataset.angle = angle;

        const dur = [5, 7, 6, 8, 5.5, 6.5, 9, 11, 10][i % 9];
        const phase = (time + i * 0.7) * (Math.PI * 2 / dur);
        const floatY = Math.sin(phase) * 15;
        const floatAngle = Math.cos(phase) * 6;

        berry.style.transform = `translate(calc(${rx + baseX}px), calc(${ry + baseY}px + ${floatY}px)) rotate(calc(${angle}deg + ${floatAngle}deg))`;
      });
    }

    document.querySelectorAll('.leaf').forEach((leaf, i) => {
      const dur = 10 + i * 2;
      const phase = (time + i * 1.2) * (Math.PI * 2 / dur);
      const floatY = Math.sin(phase) * 20;
      const floatX = Math.cos(phase * 0.5) * 15;
      const floatAngle = Math.sin(phase * 0.3) * 15;
      leaf.style.transform = `translate(${floatX}px, ${floatY}px) rotate(${floatAngle}deg)`;
    });

    requestAnimationFrame(animate);
  }

  animate();
})();

// Bubbles generator (all pages)
(function () {
  const bubblesContainer = document.getElementById('bubbles-container');
  const hero = document.getElementById('soda-hero');
  const src = hero && hero.dataset.bubble;
  if (!bubblesContainer || !src) return;

  function createBubble() {
    const bubble = document.createElement('img');
    bubble.src = src;
    bubble.alt = '';
    bubble.className = 'bubble-img';
    bubble.style.width = Math.random() * 20 + 10 + 'px';
    bubble.style.height = 'auto';
    bubble.style.left = Math.random() * 100 + '%';
    bubble.style.bottom = '-50px';
    bubble.style.opacity = Math.random() * 0.4 + 0.2;

    const duration = Math.random() * 6 + 4;
    bubble.style.animation = `floatUpImg ${duration}s linear forwards`;

    bubblesContainer.appendChild(bubble);
    setTimeout(() => bubble.remove(), duration * 1000);
  }
  setInterval(createBubble, 400);
})();
