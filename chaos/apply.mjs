// "Chaos mode": simula un commit di uno sviluppatore che modifica l'app.
// Modifica DAVVERO i sorgenti in demo-app/, come farebbe una pull request.
//
//   npm run chaos -- rename-button   → cambio di UI legittimo (il bottone "Entra" diventa "Login")
//   npm run chaos -- price-bug       → bug vero (il totale perde i centesimi)
//   npm run chaos -- slow-cart       → il carrello si aggiorna in modo asincrono (a volte 200 ms),
//                                      come se chiamasse un'API: legittimo, ma smaschera i test fragili
//   npm run chaos -- rename-button,price-bug
//   npm run chaos:reset              → ripristina l'app (git checkout demo-app)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'demo-app', 'public');
const mutations = {
  'rename-button': { file: 'index.html', from: '>Entra</button>', to: '>Login</button>' },
  'price-bug': { file: 'app.js', from: 'sum + p.price', to: 'sum + Math.floor(p.price)' },
  'slow-cart': { file: 'app.js', from: 'cart.push(p); render();', to: 'cart.push(p); Math.random() < 0.2 ? setTimeout(render, 200) : render();' },
};

const wanted = (process.argv[2] ?? '').split(',').filter(Boolean);
if (!wanted.length) {
  console.log(`Uso: npm run chaos -- <${Object.keys(mutations).join('|')}>[,...]`);
  process.exit(1);
}
for (const name of wanted) {
  const m = mutations[name];
  if (!m) throw new Error(`Mutazione sconosciuta: ${name}`);
  const path = join(root, m.file);
  const src = readFileSync(path, 'utf8');
  if (!src.includes(m.from)) throw new Error(`${name}: già applicata o sorgente cambiato`);
  writeFileSync(path, src.replace(m.from, m.to));
  console.log(`💥 ${name} applicata a demo-app/public/${m.file}`);
}
