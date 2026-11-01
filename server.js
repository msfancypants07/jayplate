const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const UPSTREAM = 'https://hopkinsdining.api.nutrislice.com';
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const publicDir = path.join(__dirname, 'public');

async function upstreamJson(resource) {
  const cached = cache.get(resource);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(UPSTREAM + resource, {
      headers: { Accept: 'application/json', 'User-Agent': 'JayPlate/0.1 (local menu viewer)' },
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

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function sendFile(res, file) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
  try {
    const body = await fs.readFile(path.join(publicDir, file));
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/menu') {
      const date = url.searchParams.get('date');
      const meal = url.searchParams.get('meal');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !['breakfast', 'lunch', 'dinner', 'late-night'].includes(meal)) {
        return sendJson(res, 400, { error: 'Choose a valid date and meal.' });
      }
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
      return sendJson(res, 200, { date, meal, fetchedAt: new Date().toISOString(), halls });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return sendFile(res, 'index.html');
    if (url.pathname === '/styles.css') return sendFile(res, 'styles.css');
    if (url.pathname === '/app.js') return sendFile(res, 'app.js');
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    sendJson(res, 502, { error: `Could not load the Nutrislice feed: ${error.message}` });
  }
}

if (require.main === module) {
  http.createServer(handleRequest).listen(PORT, HOST, () => console.log(`JayPlate is running at http://${HOST}:${PORT}`));
}

module.exports = handleRequest;
