// App volutamente semplice: login finto + carrello.
const PRODUCTS = [
  { id: 1, name: 'Tazza', price: 8.5 },
  { id: 2, name: 'Maglietta', price: 19.9 },
  { id: 3, name: 'Quaderno', price: 4.25 },
];
const cart = [];

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const { email, password } = Object.fromEntries(new FormData(e.target));
  const error = document.getElementById('login-error');
  if (password !== 'segreta') {
    error.textContent = 'Credenziali non valide';
    error.hidden = false;
    return;
  }
  document.getElementById('login-view').hidden = true;
  document.getElementById('shop-view').hidden = false;
  document.getElementById('welcome').textContent = `Ciao, ${email}`;
});

const list = document.getElementById('products');
for (const p of PRODUCTS) {
  const li = document.createElement('li');
  li.innerHTML = `<span>${p.name} · ${p.price.toFixed(2)} €</span>`;
  const btn = document.createElement('button');
  btn.textContent = `Aggiungi ${p.name}`;
  btn.addEventListener('click', () => { cart.push(p); render(); });
  li.append(btn);
  list.append(li);
}

function render() {
  document.querySelector('[data-testid=cart-count]').textContent = cart.length;
  const total = cart.reduce((sum, p) => sum + p.price, 0);
  document.querySelector('[data-testid=cart-total]').textContent = total.toFixed(2);
}

document.getElementById('checkout').addEventListener('click', () => {
  const msg = document.getElementById('checkout-msg');
  msg.textContent = cart.length ? 'Ordine confermato!' : 'Il carrello è vuoto';
  msg.hidden = false;
});
