export async function api(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to reach registration. Please try again.');
  return data;
}

let checkoutLoader;
export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutLoader) checkoutLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); checkoutLoader = undefined; reject(new Error('Checkout took too long to load. Please try again.')); }, 15000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); checkoutLoader = undefined; reject(new Error('Could not load secure checkout. Check your connection and try again.')); };
    document.head.appendChild(script);
  });
  return checkoutLoader;
}

export const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);
