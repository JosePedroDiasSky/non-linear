function fetchAdventure() {
  return fetch('adventure/scenes.json').then((resp) => resp.json());
}

function monster2html(monster) {
  return `<div class="details__opponent">
  <span class="details__name">${monster.name}</span>
  <span class="details__stat"><span class="details__stat-stamina">Stamina ${monster.stamina}</span></span><span class="details__stat"><span class="details__stat details__stat--skill">Skill ${monster.skill}</span></span>
</div>`
}

function htmlify(txt) {
  return txt.replace(/\n/gm, '<br />').replace(/\t/g, '    ');
}

function uiOneOf(arr, skipClean) {
  return new Promise((resolve) => {
    if (skipClean) {
      interactions.innerHTML = '';
    }
    arr.forEach((item) => {
      const el = document.createElement('button');
      el.appendChild(document.createTextNode(item.label));
      el.onclick = () => {
        resolve(item);
      };
      interactions.appendChild(el);
    });
  });
}

fetchAdventure().then(async (adv) => {
  details.classList.remove('hide');
  details.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Choose your potion!';
  const potion = (await uiOneOf([
    { label: 'skill' },
    { label: 'strength' },
    { label: 'fortune' }
  ])).label;
  details.classList.add('hide');

  const hero = await createCharacter('hero', potion);
  window.hero = hero;

  function updateHero() {
    //heroStats.innerHTML = '' + hero;
    document.querySelector(
      '.hero-stats__stat--stamina span.hero-stats__value'
    ).innerHTML = hero.stamina;
    const staminaPerc = parseInt(hero.stamina.value / hero.stamina.initial * 10) * 10;
    document.querySelector(
      '.hero-stats__stat--stamina span.hero-stats__quant'
    ).className = `hero-stats__quant hero-stats__quant--${staminaPerc > 100 ? 100 : staminaPerc}`;
    document.querySelector(
      '.hero-stats__stat--skill span.hero-stats__value'
    ).innerHTML = hero.skill;
    const skillPerc = parseInt(hero.skill.value / hero.skill.initial * 10) * 10;
    document.querySelector(
      '.hero-stats__stat--skill span.hero-stats__quant'
    ).className = `hero-stats__quant hero-stats__quant--${skillPerc > 100 ? 100 : skillPerc}`;
    document.querySelector(
      '.hero-stats__stat--luck span.hero-stats__value'
    ).innerHTML = hero.luck;
    const luckPerc = parseInt(hero.luck.value / hero.luck.initial * 10) * 10;
    document.querySelector(
      '.hero-stats__stat--luck span.hero-stats__quant'
    ).className = `hero-stats__quant hero-stats__quant--${luckPerc > 100 ? 100 : luckPerc}`;
  }

  updateHero();

  function doFight({ enemies, ...batatas }) {
    details.classList.remove('hide');
    return new Promise(async (resolve, reject) => {
      const monsters = enemies.map((en) => new Creature(en));
      console.log('fight:', { hero, monsters, ...batatas });
      const fight = new Fight({ hero, monsters, ...batatas });
      let outcome = await fight.turn(); // text:string, actions:[Obj], escape:bool, alive:bool

      function doSubStep() {
        updateHero();

        details.innerHTML = `${fight.monsters.map(monster2html).join('')}
${outcome.label}`;
        // console.log(outcome);

        interactions.innerHTML = '';
        if (outcome.actions) {
          outcome.actions.forEach((act) => {
            const el = document.createElement('button');
            el.appendChild(document.createTextNode(act.label));
            el.onclick = async function() {
              outcome = await act.callback();
              doSubStep();
            };
            interactions.appendChild(el);
          });
        } else if (outcome.alive) {
          details.classList.add('hide');
          resolve();
        } else {
          details.classList.add('hide');
          reject(outcome.escape);
        }
      }

      doSubStep();
    });
  }

  function runCommand(arr) {
    console.warn('runCommand: ' + arr.join(', '));
    const method = arr[0];
    const args = arr.slice(1);
    try {
      if (method === 'goTo') {
        doSection(args[0]);
      } else {
        return hero[method].apply(hero, args);
      }
    } catch (ex) {
      // console.error(ex);
    }
  }

  const mapSeries = (arr, prom, prevProm = Promise.resolve()) =>
    Promise.all(arr.map((val) => (prevProm = prevProm.then(() => prom(val)))));

  function process(int) {
    console.warn('process', int);

    return new Promise(async (resolve) => {
      if (int.do) {
        if (int.label) {
          uiOneOf([int])
            .then((t) => process(t.do))
            .then(resolve);
        } else {
          process(int.do).then(resolve);
        }
      } else if (int.fight) {
        doFight({
          enemies: int.fight,
          canEscape: int.escape,
          beatEmUp: int.beatEmUp
        })
          .then(resolve)
          .catch(() => {
            process(int.escape); // TODO?
          });
      } else if (int.oneOf) {
        uiOneOf(int.oneOf)
          .then(async ({ label, ...t }) => process(t.do || t))
          .then(resolve);
      } else if (int.lucky || int.unlucky) {
        async function work() {
          const wasLucky = await hero.testLuck();
          const whatToDo = wasLucky ? int.lucky : int.unlucky;
          if (whatToDo) {
            return process(whatToDo);
          } else {
            return Promise.resolve();
          }
        }
        if (int.label) {
          uiOneOf([{ label: int.label }])
            .then(work)
            .then(resolve);
        } else {
          await work().then(resolve);
        }
      } else if (int.sequence) {
        mapSeries(int.sequence, process).then(resolve);
      } else if (int.if) {
        process(int.if).then((result) => {
          if (result) {
            (int.then && process(int.then).then(resolve)) || resolve();
          } else {
            (int.else && process(int.else).then(resolve)) || resolve();
          }
        });
      } else {
        resolve(runCommand(int));
      }
    });
  }

  function doSection(name) {
    const section = adv[name];
    if (!section) {
      return window.alert('SECTION NOT FOUND: ' + name);
    }

    location.hash = name;

    text.innerHTML = section.text.replace(/\n/g, '<br/>');
    const hasImage = !!section.image;
    caption.innerHTML = section.caption || '';
    if (hasImage) {
      image.src = 'adventure/images/' + section.image || '';
    }
    image.style.display = hasImage ? '' : 'none';
    caption.style.display = hasImage ? '' : 'none';

    interactions.innerHTML = '';
    if (section.interaction) {
      process(section.interaction).then(() => {
        console.log('ALL DONE!');
      });
    }
  }

  window.doSection = doSection;

  function onHash() {
    const hash = (location.hash && location.hash.substring(1)) || '0';
    doSection(hash);
  }
  document.addEventListener('hashchange', onHash);
  onHash();
});
