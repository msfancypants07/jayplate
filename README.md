# JayPlate

A local, unofficial view of Johns Hopkins dining menus. JayPlate groups food by dining hall and station and puts serving size and key nutrition values beside each item. Menu data comes live from the Hopkins Dining Nutrislice feed.

Public site: [jayplate.carvedmyrrh.chatgpt.site](https://jayplate.carvedmyrrh.chatgpt.site)

The overview favors main dishes from featured stations. Within those stations, items listed on fewer than all service days in Nutrislice's current week appear first. This is a weekly comparison, not a guarantee that an item changes every day. Standard bars are available behind **Show everyday basics**.

## Run locally

Requires Node.js 18 or newer. No package installation is needed.

On macOS, double-click **Start JayPlate.command** in this folder. It starts the local server and opens the site in your default browser. Keep its Terminal window open while using JayPlate.

Or start it manually:

```sh
npm start
```

Open `http://localhost:3000`. Set `PORT` to use a different port.

## Data notes

- The server fetches the public Nutrislice location and weekly menu JSON endpoints and caches responses for five minutes. It makes requests from the server so the browser does not depend on Nutrislice's cross-origin settings.
- Menu and nutrition information is supplied by Hopkins Dining through Nutrislice and can change. Missing nutrition is labeled rather than estimated. Serving sizes are shown with each item.
- Dietary labels are displayed only when present in the source. They are not a guarantee against allergen cross-contact. Follow Hopkins Dining's official guidance for dietary needs.
- This project is not affiliated with Johns Hopkins University or Nutrislice.

## Deployment

The `worker/` version serves the same frontend and menu API on the public Site. Run `npm run build` to create its deployment artifact in `dist/`. The tracked `.openai/hosting.json` connects that artifact to the Site; `dist/` is generated and is not committed.

The repository also includes Vercel configuration. Vercel serves `public/` as the website and `api/menu.js` as the live menu endpoint. Connect this GitHub repository to a Vercel project with the **Other** framework preset to deploy new pushes automatically.
