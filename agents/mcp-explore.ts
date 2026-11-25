/**
 * Passo 2 – "Sei tu l'agente".
 *
 * Un agente AI non chiama Playwright direttamente: parla con un *server MCP*
 * (Model Context Protocol) che espone "tool" con nome, descrizione e schema JSON.
 * L'LLM legge la lista dei tool, sceglie quale chiamare, riceve il risultato
 * (testo) e decide il passo successivo. Questo script fa la stessa cosa,
 * ma le decisioni sono scritte a mano: così vedi ESATTAMENTE cosa vede l'agente.
 *
 * Esegui:  npm run demo   (in un altro terminale)
 *          npm run mcp:explore
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const args = ['@playwright/mcp', '--headless', '--isolated'];
// Solo per ambienti CI/container (root): browser preinstallato e senza sandbox.
if (process.env.PW_CHROMIUM_PATH) args.push('--executable-path', process.env.PW_CHROMIUM_PATH, '--no-sandbox');

// 1. Avviamo il server MCP come processo figlio e ci colleghiamo via stdio.
const transport = new StdioClientTransport({ command: 'npx', args });
const client = new Client({ name: 'mcp-explore', version: '1.0.0' });
await client.connect(transport);

// 2. "Che cosa so fare?" – è la prima cosa che un agente chiede al server.
const { tools } = await client.listTools();
console.log(`\n=== ${tools.length} tool disponibili ===`);
for (const t of tools) console.log(`- ${t.name}: ${t.description?.split('\n')[0]}`);

// Ogni tool ha uno schema JSON: è il "contratto" che l'LLM deve rispettare.
const click = tools.find((t) => t.name === 'browser_click');
console.log('\nSchema di browser_click:', JSON.stringify(click?.inputSchema.properties, null, 2));

// Piccolo helper che stampa il risultato testuale di un tool.
async function call(name: string, toolArgs: Record<string, unknown> = {}) {
  console.log(`\n>>> L'agente chiama ${name}(${JSON.stringify(toolArgs)})`);
  const res = await client.callTool({ name, arguments: toolArgs });
  const text = (res.content as { type: string; text?: string }[])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  console.log(text);
  // Un errore del tool torna come TESTO: un LLM lo leggerebbe e correggerebbe la chiamata.
  if (text.startsWith('### Error')) throw new Error(`Il tool ${name} ha restituito un errore`);
  return text;
}

// 3. Navighiamo, poi chiediamo uno "snapshot": è così che l'agente "vede" la pagina.
await call('browser_navigate', { url: 'http://localhost:3000' });
let snapshot = await call('browser_snapshot');

// 4. Lo snapshot è l'accessibility tree in YAML, con riferimenti tipo [ref=e12].
//    Un LLM sceglierebbe l'elemento "leggendo"; noi lo cerchiamo con una regex.
const ref = (label: string) => {
  const m = snapshot.match(new RegExp(`${label}.*\\[ref=(\\w+)\\]`));
  if (!m) throw new Error(`Elemento "${label}" non trovato nello snapshot`);
  return m[1];
};

await call('browser_type', { element: 'campo Email', target: ref('textbox "Email"'), text: 'gabri@example.com' });
await call('browser_type', { element: 'campo Password', target: ref('textbox "Password"'), text: 'segreta' });
await call('browser_click', { element: 'bottone Accedi', target: ref('button "Accedi"') });

// 5. Dopo ogni azione l'agente guarda di nuovo: la pagina è cambiata, i ref sono nuovi.
snapshot = await call('browser_snapshot');
await call('browser_click', { element: 'bottone Aggiungi Tazza', target: ref('button "Aggiungi Tazza"') });

// 6. Verifica: un agente "asserisce" rileggendo la pagina, non con expect().
const after = await call('browser_find', { text: 'Articoli' });
console.log(after.includes('"Articoli: 1"') ? '\n✅ Il carrello contiene 1 articolo' : '\n❌ Carrello inatteso');

await client.close();
