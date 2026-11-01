const UPSTREAM = 'https://hopkinsdining.api.nutrislice.com';
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

async function upstreamJson(resource) {
  const cached = cache.get(resource);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(UPSTREAM + resource, {
      headers: { Accept: 'application/json', 'User-Agent': 'JayPlate/0.1 (public menu viewer)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Nutrislice returned ${response.status}`);
    const value = await response.json();
    cache.set(resource, { at: Date.now(), value });
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

function mealMatches(name, meal) {
  const value = name.toLowerCase();
  if (value.includes('breakfast')) return meal === 'breakfast';
  if (value.includes('late night')) return meal === 'late-night';
  if (value.includes('lunch')) return meal === 'lunch';
  if (value.includes('dinner')) return meal === 'dinner';
  return meal === 'lunch' || meal === 'dinner';
}

function cleanItem(item, appearances, serviceDays) {
  const food = item.food;
  if (!food?.name) return null;
  const nutrients = food.rounded_nutrition_info || {};
  const size = food.serving_size_info || {};
  return {
    id: item.id,
    name: food.name,
    description: food.description || '',
    ingredients: food.ingredients || '',
    serving: [size.serving_size_amount || item.serving_size_amount, size.serving_size_unit || item.serving_size_unit].filter(Boolean).join(' '),
    nutrition: food.has_nutrition_info ? {
      calories: nutrients.calories ?? null,
      protein: nutrients.g_protein ?? null,
      carbs: nutrients.g_carbs ?? null,
      fat: nutrients.g_fat ?? null,
      sodium: nutrients.mg_sodium ?? null,
      fiber: nutrients.g_fiber ?? null,
      sugar: nutrients.g_sugar ?? null,
      saturatedFat: nutrients.g_saturated_fat ?? null
    } : null,
    labels: (food.icons?.food_icons || []).filter(icon => icon.enabled !== false && !icon.is_digital_signage_only).map(icon => icon.name).filter(Boolean),
    daysListed: appearances.get(food.id) || 0,
    serviceDays
  };
}

function stationsFor(day, menuName, appearances, serviceDays) {
  const stations = [];
  let station;
  for (const item of day.menu_items || []) {
    if (item.is_station_header) {
      station = { name: item.text || menuName, items: [] };
      stations.push(station);
      continue;
    }
    const food = cleanItem(item, appearances, serviceDays);
    if (!food) continue;
    if (!station) {
      station = { name: menuName, items: [] };
      stations.push(station);
    }
    station.items.push(food);
  }
  return stations.filter(group => group.items.length);
}

async function menuFor(date, meal) {
  const [year, month, day] = date.split('-');
  const locations = await upstreamJson('/menu/api/schools/');
  const halls = await Promise.all(locations.map(async location => {
    const types = (location.active_menu_types || []).filter(type => mealMatches(type.name, meal));
    const menus = await Promise.all(types.map(async type => {
      const template = type.urls?.full_menu_by_date_api_url_template;
      if (!template) return null;
      const resource = template.replace('{year}', year).replace('{month}', month).replace('{day}', day);
      try {
        const week = await upstreamJson(resource);
        const matchingDay = week.days?.find(entry => entry.date === date);
        const serviceDays = (week.days || []).filter(entry => entry.menu_items?.some(item => item.food)).length;
        const appearances = new Map();
        for (const entry of week.days || []) {
          const ids = new Set((entry.menu_items || []).map(item => item.food?.id).filter(Boolean));
          for (const id of ids) appearances.set(id, (appearances.get(id) || 0) + 1);
        }
        return matchingDay ? { name: type.name, updated: week.last_updated, stations: stationsFor(matchingDay, type.name, appearances, serviceDays) } : null;
      } catch (error) {
        return { name: type.name, error: error.message, stations: [] };
      }
    }));
    return {
      id: location.id,
      name: location.name,
      slug: location.slug,
      address: location.address,
      menus: menus.filter(Boolean),
      sourceUrl: `https://hopkinsdining.nutrislice.com/menu/${location.slug}`
    };
  }));
  return { date, meal, fetchedAt: new Date().toISOString(), halls };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/menu') {
      const date = url.searchParams.get('date');
      const meal = url.searchParams.get('meal');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !['breakfast', 'lunch', 'dinner', 'late-night'].includes(meal)) {
        return jsonResponse({ error: 'Choose a valid date and meal.' }, 400);
      }
      try {
        return jsonResponse(await menuFor(date, meal));
      } catch (error) {
        return jsonResponse({ error: `Could not load the Nutrislice feed: ${error.message}` }, 502);
      }
    }
    const asset = ASSETS[url.pathname === '/' ? '/index.html' : url.pathname];
    if (!asset) return new Response('Not found', { status: 404 });
    const type = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html';
    return new Response(asset, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=300' } });
  }
};
