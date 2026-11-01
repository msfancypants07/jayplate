const state = { data: null, meal: 'lunch', search: '', filter: '', selected: null, showBasics: false, expanded: new Set(), foods: new Map() };
let requestId = 0;
const el = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const integer = value => value === null || value === undefined ? '—' : Number(value).toLocaleString();
const priority = {
  'hopkins-cafe': ['passport', 'nest', 'classics', 'root', 'woodstone', 'sizzle', 'soup', 'bakery'],
  'nolans-on-33rd': ['nourish', 'byob', 'blue jay bar', 'scratch fired', 'flattop', 'soup', 'bakery'],
  'peabody-institute': ['carvery', 'root', "chef's table", 'soup', 'bakery', 'sizzle'],
  'levering-cafe': ['hot coffee', 'cold coffee', 'tea latte', 'hot tea', 'iced tea', 'syrups']
};
const basicsPattern = /^(toppings? bar|deli bar|salad bar|cereal bar|bagel bar|waffle bar|beverages|nature bar|omelet bar)$/i;
const kitchenBasicsPattern = /^(proteins|sides|toppings|salsas|dressings(?: & | and )sauces|sauces|bases|breads)$/i;

function stationRank(hall, group) {
  const name = group.name.toLowerCase();
  if (hall.slug === 'site-1') {
    const menuIndex = hall.menus.findIndex(menu => menu.name === group.menuName);
    const main = /^(signature bowls|signature salads & bowls|entrees|small plates|sonoran crisps|soups|dumplings)$/i.test(group.name);
    return menuIndex * 100 + (main ? 0 : kitchenBasicsPattern.test(group.name) ? 70 : 30) + group.originalIndex;
  }
  const configured = priority[hall.slug] || [];
  const index = configured.indexOf(name);
  if (index >= 0) return index * 100 + group.originalIndex;
  return (basicsPattern.test(group.name) ? 2000 : 1000) + group.originalIndex;
}

function isBasic(hall, group) {
  if (hall.slug === 'levering-cafe') return false;
  return hall.slug === 'site-1' ? kitchenBasicsPattern.test(group.name) : basicsPattern.test(group.name);
}

function rotatesThisWeek(food) {
  return food.serviceDays > 1 && food.daysListed > 0 && food.daysListed < food.serviceDays;
}

function todayInBaltimore() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  state.meal = Number(parts.hour) < 11 ? 'breakfast' : Number(parts.hour) < 16 ? 'lunch' : 'dinner';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function visibleItem(food) {
  const query = state.search.trim().toLowerCase();
  if (query && ![food.name, food.description, food.ingredients, ...(food.labels || [])].some(value => value?.toLowerCase().includes(query))) return false;
  if (state.filter && !(food.labels || []).some(label => label.toLowerCase() === state.filter)) return false;
  return true;
}

function hallGroups(hall) {
  return hall.menus.flatMap(menu => menu.stations.map((station, index) => ({ ...station, menuName: menu.name, key: `${menu.name}-${index}`, originalIndex: index })))
    .map(group => ({ ...group, items: group.items.filter(visibleItem).sort((a, b) => isBasic(hall, group) ? 0 : Number(rotatesThisWeek(b)) - Number(rotatesThisWeek(a))) }))
    .filter(group => group.items.length)
    .sort((a, b) => stationRank(hall, a) - stationRank(hall, b));
}

function nutritionShort(food) {
  if (!food.nutrition) return '<span class="food-nutrition">Nutrition unavailable</span>';
  return `<span class="food-nutrition"><span><strong>${integer(food.nutrition.calories)}</strong> cal</span><span><strong>${integer(food.nutrition.protein)}</strong>g protein</span></span>`;
}

function labelHtml(label) {
  const dietary = ['vegan', 'vegetarian', 'halal'];
  return `<span class="label ${dietary.includes(label.toLowerCase()) ? '' : 'allergen'}">${escapeHtml(label)}</span>`;
}

function foodHtml(food) {
  state.foods.set(String(food.id), food);
  return `<li class="food-row"><div class="food-main"><div><div class="food-name">${escapeHtml(food.name)}</div><div class="food-serving">${food.serving ? `${escapeHtml(food.serving)} serving` : 'Serving size not listed'}</div></div>${nutritionShort(food)}</div><div class="food-meta"><div class="labels">${rotatesThisWeek(food) ? `<span class="rotation" title="Listed on ${food.daysListed} of ${food.serviceDays} menu days this week">Rotates this week</span>` : ''}${food.labels.slice(0,4).map(labelHtml).join('')}</div><button class="details-button" data-food="${food.id}" type="button">Full facts ↗</button></div></li>`;
}

function previewScore(food) {
  const name = food.name.toLowerCase();
  let score = rotatesThisWeek(food) ? 3 : 0;
  const dish = /chicken|chick.n|beef|pork|turkey|salmon|shrimp|fish|falafel|gyro|seitan|curry|pizza|pasta|burger|burrito|taco|sandwich|meatball|chowder|stew|bowl|pie|lasagna|tofu|kielbasa/.test(name);
  if (dish) score += 4;
  if (!dish && /^(white|brown|jasmine|basmati|cilantro) rice$|pita|bread|roll|lettuce|onion|tomato|cucumber|topping|dressing|sauce|syrup|crouton|sprinkle|broccoli|carrot/.test(name)) score -= 8;
  return score;
}

function hallCard(hall) {
  const groups = hallGroups(hall);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const failed = hall.menus.some(menu => menu.error);
  const focusGroups = groups.filter(group => !isBasic(hall, group));
  const candidates = focusGroups.length ? focusGroups : groups;
  const previewGroups = hall.slug === 'site-1' ? candidates.filter((group, index) => candidates.findIndex(other => other.menuName === group.menuName) === index) : candidates;
  const preview = previewGroups.slice(0, 4).map(group => ({ group, food: [...group.items].sort((a, b) => previewScore(b) - previewScore(a))[0] })).filter(entry => entry.food);
  const selected = String(state.selected) === String(hall.id);
  return `<article class="hall-card ${selected ? 'selected' : ''}"><div class="hall-top"><h3>${escapeHtml(hall.name)}</h3><span class="hall-count">${count} items</span></div><p class="hall-subtitle">${hall.slug === 'site-1' ? 'Four kitchens' : `${focusGroups.length} featured ${focusGroups.length === 1 ? 'station' : 'stations'}`}${failed ? ' · partial menu' : ''}</p><ul class="preview-list">${preview.map(({group, food}) => `<li><span class="preview-copy"><span class="preview-station">${escapeHtml(hall.slug === 'site-1' ? group.menuName.replace(' Kitchen', '') + ' · ' + group.name : group.name)}</span><strong>${escapeHtml(food.name)}</strong></span><span class="preview-facts">${food.nutrition ? `${integer(food.nutrition.calories)} cal<br><small>${integer(food.nutrition.protein)}g protein</small>` : '<small>Nutrition not listed</small>'}</span></li>`).join('')}</ul><button type="button" class="hall-action" data-hall="${hall.id}" aria-pressed="${selected}">${selected ? 'Viewing menu ↓' : 'View full menu →'}</button></article>`;
}

function stationHtml(group, index) {
  const key = `${state.selected}-${group.key}`;
  const expanded = state.expanded.has(key) || !!state.search || !!state.filter;
  const items = expanded ? group.items : group.items.slice(0, 4);
  return `<section class="station" id="station-${index}"><div class="station-header"><div>${state.data.halls.find(hall => String(hall.id) === String(state.selected))?.menus.length > 1 ? `<small>${escapeHtml(group.menuName)}</small>` : ''}<h3>${escapeHtml(group.name)}</h3></div><span>${group.items.length} ${group.items.length === 1 ? 'item' : 'items'}</span></div><ul class="food-list">${items.map(foodHtml).join('')}</ul>${group.items.length > 4 && !state.search && !state.filter ? `<div class="expand-wrap"><button type="button" class="expand-button" data-expand="${escapeHtml(key)}">${expanded ? 'Show fewer' : `See all ${group.items.length} items`} ↓</button></div>` : ''}</section>`;
}

function render() {
  if (!state.data) return;
  state.foods.clear();
  const halls = state.data.halls;
  const populated = halls.filter(hall => hallGroups(hall).length);
  const unavailable = halls.filter(hall => !hallGroups(hall).length);
  const failedHalls = unavailable.filter(hall => hall.menus.some(menu => menu.error));
  const emptyHalls = unavailable.filter(hall => !hall.menus.some(menu => menu.error));
  if (!populated.some(hall => String(hall.id) === String(state.selected))) state.selected = populated[0]?.id || halls[0]?.id;
  el('hall-grid').innerHTML = populated.map(hallCard).join('');
  el('hall-empty').innerHTML = `${failedHalls.length ? `<span>Menu temporarily unavailable at</span> ${failedHalls.map(hall => `<strong>${escapeHtml(hall.name)}</strong>`).join('<span class="empty-separator">·</span>')} <button type="button" class="retry-inline" id="retry">Retry</button>` : ''}${emptyHalls.length ? `<span>${failedHalls.length ? ' · ' : ''}${state.search || state.filter ? 'No matches at' : 'No menu listed at'}</span> ${emptyHalls.map(hall => `<strong>${escapeHtml(hall.name)}</strong>`).join('<span class="empty-separator">·</span>')}` : ''}`;
  el('hall-empty').hidden = !unavailable.length;
  const hall = halls.find(entry => String(entry.id) === String(state.selected));
  if (!hall) return;
  const groups = hallGroups(hall);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const title = `${new Date(`${state.data.date}T12:00:00`).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})} · ${state.meal.replace('-', ' ')}`;
  const failed = hall.menus.some(menu => menu.error);
  const focus = groups.filter(group => !isBasic(hall, group));
  const basics = groups.filter(group => isBasic(hall, group));
  const showAll = state.showBasics || !!state.search || !!state.filter;
  const visibleGroups = [...focus, ...(showAll ? basics : [])];
  el('hall-detail').innerHTML = `<div class="detail-shell"><nav class="mobile-hall-nav" aria-label="Choose dining hall">${populated.map(entry => `<button type="button" data-hall="${entry.id}" aria-pressed="${String(entry.id) === String(hall.id)}">${escapeHtml(entry.name)}</button>`).join('')}</nav><div class="detail-heading"><div><h2>${escapeHtml(hall.name)}</h2><p>${escapeHtml(title)} · ${count} listed ${count === 1 ? 'item' : 'items'}${failed ? ' · some menu data unavailable' : ''}</p></div><a class="source-link" href="${escapeHtml(hall.sourceUrl)}" target="_blank" rel="noopener">Official menu ↗</a></div>${groups.length ? `<nav class="station-nav" aria-label="Jump to station">${visibleGroups.map((group, index) => `<button type="button" data-station="${index}">${escapeHtml(group.name)}</button>`).join('')}</nav>${focus.length ? `<div class="group-heading"><h3 class="group-title">${hall.slug === 'levering-cafe' ? 'Drinks' : 'Featured stations'}</h3><span>Items that rotate this week appear first</span></div><div class="station-grid">${focus.map((group, index) => stationHtml(group, index)).join('')}</div>` : ''}${basics.length && !showAll ? `<button type="button" class="basics-toggle" id="show-basics">Show everyday basics <span>${basics.length} stations · salad, cereal, drinks & more ↓</span></button>` : ''}${basics.length && showAll ? `<h3 class="group-title basics-title">Everyday basics</h3><div class="station-grid basics-grid">${basics.map((group, index) => stationHtml(group, focus.length + index)).join('')}</div>${!state.search && !state.filter ? '<button type="button" class="hide-basics" id="hide-basics">Hide everyday basics ↑</button>' : ''}` : ''}` : `<div class="empty-detail">${failed ? 'This menu could not be loaded. Try again soon.' : 'No matching items are listed here. Try another meal, date, or filter.'}</div>`}<p class="notice">Nutrition is shown per listed serving. Items and portions may change. Dietary labels are source supplied and do not guarantee freedom from cross-contact.</p></div>`;
  const total = halls.reduce((sum, entry) => sum + hallGroups(entry).reduce((n, group) => n + group.items.length, 0), 0);
  el('status').textContent = `${total} options across ${halls.length} locations`;
}

async function loadMenu() {
  const currentRequest = ++requestId;
  if (location.protocol === 'file:') {
    document.body.classList.add('file-mode');
    el('status').textContent = 'Local server needed';
    el('hall-grid').innerHTML = '<div class="launch-note"><h3>Start JayPlate to see the live menu</h3><p>Opening this HTML file directly cannot load the dining data. Double-click <strong>Start JayPlate.command</strong> in the project folder, or run <code>npm start</code> there. Then open <a href="http://127.0.0.1:3000">http://127.0.0.1:3000</a>.</p></div>';
    return;
  }
  el('status').textContent = 'Loading menus…';
  el('hall-grid').innerHTML = '<div class="hall-card"><h3>Fetching the latest menu</h3><p>This can take a few seconds.</p></div>';
  el('hall-empty').hidden = true;
  el('hall-detail').innerHTML = '';
  try {
    const response = await fetch(`/api/menu?date=${encodeURIComponent(el('date').value)}&meal=${encodeURIComponent(state.meal)}`);
    const data = await response.json();
    if (currentRequest !== requestId) return;
    if (!response.ok) throw new Error(data.error || 'Could not load menu data.');
    state.data = data;
    render();
  } catch (error) {
    if (currentRequest !== requestId) return;
    state.data = null;
    el('hall-grid').innerHTML = `<div class="error-box"><strong>Menu unavailable right now.</strong><p>${escapeHtml(error.message)}</p><button type="button" id="retry">Try again</button></div>`;
    el('status').textContent = 'Could not load menus';
  }
}

function openFood(food) {
  const facts = food.nutrition ? [
    ['Calories', integer(food.nutrition.calories)], ['Protein', `${integer(food.nutrition.protein)} g`],
    ['Carbs', `${integer(food.nutrition.carbs)} g`], ['Fat', `${integer(food.nutrition.fat)} g`],
    ['Sodium', `${integer(food.nutrition.sodium)} mg`], ['Fiber', `${integer(food.nutrition.fiber)} g`],
    ['Sugar', `${integer(food.nutrition.sugar)} g`], ['Sat. fat', `${integer(food.nutrition.saturatedFat)} g`]
  ] : [];
  el('dialog-body').innerHTML = `<p class="eyebrow">FOOD DETAILS</p><h2 id="dialog-title">${escapeHtml(food.name)}</h2><p class="serving">${food.serving ? `Per ${escapeHtml(food.serving)} serving` : 'Serving size not listed'}</p><div class="labels">${food.labels.map(labelHtml).join('')}</div>${food.nutrition ? `<div class="facts">${facts.map(([name, value]) => `<div class="fact"><strong>${value}</strong><span>${name}</span></div>`).join('')}</div>` : '<p>Nutrition details are not listed for this item.</p>'}${food.description ? `<h3>Description</h3><p class="ingredients">${escapeHtml(food.description)}</p>` : ''}${food.ingredients ? `<h3>Ingredients</h3><p class="ingredients">${escapeHtml(food.ingredients)}</p>` : ''}<p class="dialog-note">Source: Hopkins Dining via Nutrislice. Values and ingredients may change; ask dining staff about allergy concerns.</p>`;
  el('food-dialog').showModal();
}

el('date').value = todayInBaltimore();
document.querySelectorAll('[data-meal]').forEach(button => {
  button.setAttribute('aria-pressed', String(button.dataset.meal === state.meal));
  button.addEventListener('click', () => {
    state.meal = button.dataset.meal;
    document.querySelectorAll('[data-meal]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    loadMenu();
  });
});
el('date').addEventListener('change', loadMenu);
el('search').addEventListener('input', event => { state.search = event.target.value; render(); });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  state.filter = state.filter === button.dataset.filter ? '' : button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === state.filter)));
  el('clear-filters').hidden = !state.filter;
  render();
}));
el('clear-filters').addEventListener('click', () => {
  state.filter = '';
  document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', 'false'));
  el('clear-filters').hidden = true;
  render();
});
document.addEventListener('click', event => {
  const hall = event.target.closest('[data-hall]');
  if (hall) { state.selected = hall.dataset.hall; state.showBasics = false; render(); el('hall-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  const expand = event.target.closest('[data-expand]');
  if (expand) { const key = expand.dataset.expand; state.expanded.has(key) ? state.expanded.delete(key) : state.expanded.add(key); render(); }
  const food = event.target.closest('[data-food]');
  if (food) { const selected = state.foods.get(food.dataset.food); if (selected) openFood(selected); }
  const station = event.target.closest('[data-station]');
  if (station) document.getElementById(`station-${station.dataset.station}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (event.target.closest('#show-basics')) { state.showBasics = true; render(); document.querySelector('.basics-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (event.target.closest('#hide-basics')) { state.showBasics = false; render(); el('hall-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (event.target.id === 'retry') loadMenu();
});
el('close-dialog').addEventListener('click', () => el('food-dialog').close());
el('food-dialog').addEventListener('click', event => { if (event.target === el('food-dialog')) el('food-dialog').close(); });
loadMenu();
