import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Download, LockKeyhole, ShieldCheck, X, LoaderCircle, RefreshCw } from 'lucide-react';
import { api, loadCheckout, money } from './api.js';

const storageKey = 'clinical-workshop-registration';
function savedRegistration() {
  try { return JSON.parse(sessionStorage.getItem(storageKey)) || null; } catch { return null; }
}

export default function Registration({ dialogRef, config }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('form');
  const [pending, setPending] = useState(savedRegistration);
  const [receipt, setReceipt] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    const onCancel = e => { if (busy) e.preventDefault(); };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [busy, dialogRef]);

  function remember(order) {
    const saved = { registrationId: order.registrationId, token: order.token, orderId: order.orderId, keyId: order.keyId, amount: order.amount, currency: order.currency };
    setPending(saved);
    try { sessionStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* State still works without storage. */ }
    return saved;
  }
  function applyStatus(result) {
    if (result.status === 'paid') {
      setReceipt(result); setStage('success'); setPending(null);
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
    } else setStage('pending');
  }
  async function checkStatus() {
    setBusy(true); setError('');
    try { applyStatus(await api('payments/status', pending)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function openCheckout(order, prefill) {
    await loadCheckout();
    // A native modal dialog would make the provider's iframe inert. Close it while Checkout is open.
    dialogRef.current.close();
    let verifying = false;
    const reopen = () => { if (mounted.current && !dialogRef.current.open) dialogRef.current.showModal(); };
    try {
      const checkout = new window.Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amount, currency: 'INR',
        name: 'AI in Clinical Practice', description: 'VPS Lakeshore Hospital · One-day workshop',
        prefill, theme: { color: '#0f766e' },
        modal: { ondismiss: () => {
          if (!verifying) { setBusy(false); setError('Checkout closed. You can resume this payment or check its status below.'); reopen(); }
        } },
        handler: async response => {
          verifying = true; reopen(); setBusy(true); setStage('pending'); setError('');
          try { applyStatus(await api('payments/verify', { ...order, ...response })); }
          catch (err) { setError(`${err.message} Please check payment status before trying again.`); }
          finally { setBusy(false); }
        },
      });
      checkout.on('payment.failed', () => {
        setError('The payment was not completed. You can retry securely or check payment status.');
      });
      checkout.open();
    } catch (err) { reopen(); throw err; }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await loadCheckout();
      const order = remember(await api('payments/orders', { ...values, consent: values.consent === 'on' }));
      await openCheckout(order, { name: `${values.firstName} ${values.lastName}`, email: values.email, contact: values.phone });
    } catch (err) { setError(err.message); setBusy(false); }
  }
  async function resume() {
    setBusy(true); setError('');
    try {
      const status = await api('payments/status', pending);
      if (status.status === 'paid') { applyStatus(status); setBusy(false); return; }
      await openCheckout(pending);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  function downloadReceipt() {
    const text = `AI in Clinical Practice\nVPS Lakeshore Hospital\n\nRegistration confirmation (not a tax invoice)\nRegistration: ${receipt.registrationId}\nPayment: ${receipt.paymentId}\nPaid: ${money(receipt.amount)}\nDate: ${config.startsAt ? new Date(config.startsAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'To be announced'}\nVenue: ${config.venue}\nSupport: ${config.supportEmail}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `workshop-${receipt.registrationId}.txt`; a.click(); URL.revokeObjectURL(url);
  }

  return <dialog ref={dialogRef} className="registration-dialog" aria-labelledby="registration-title" onClick={e => { if (e.target === e.currentTarget && !busy) e.currentTarget.close(); }}>
    <div className="dialog-body">
      <button className="icon-button close-dialog" aria-label="Close registration" disabled={busy} onClick={() => dialogRef.current.close()}><X size={21} /></button>
      <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
      <h2 id="registration-title">{stage === 'success' ? 'You’re registered.' : stage === 'pending' ? 'Payment confirmation' : 'Join the workshop.'}</h2>
      {stage === 'success' ? <div className="payment-state">
        <span className="success-icon"><Check size={32} /></span>
        <p>Your payment of <strong>{money(receipt.amount)}</strong> has been verified. Your workshop registration is confirmed.</p>
        <div className="receipt"><span>Registration reference</span><code>{receipt.registrationId}</code><span>Payment reference</span><code>{receipt.paymentId}</code></div>
        <button className="button primary full" onClick={downloadReceipt}><Download size={17} /> Save confirmation</button>
        <p className="fine-print">Keep this confirmation for your records. For joining details, contact {config.supportEmail}.</p>
      </div> : <>
        <p className="dialog-description">One day of practical AI learning, built around your clinical workflow.</p>
        <div className="order-summary"><span>Workshop registration<small>One attendee · Full-day access</small></span><strong>{config.amount ? money(config.amount) : 'Fee TBA'}</strong></div>
        {config.testMode && <p className="notice">Test checkout is enabled. No real payment will be collected.</p>}
        {!config.checkoutEnabled && <p className="notice">Paid registration is not open yet. The confirmed date and registration details will appear here when booking opens.</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {pending ? <div className="payment-state">
          <ShieldCheck size={32} className="teal" />
          <h3>{stage === 'pending' ? 'Let’s confirm your payment' : 'Your registration is in progress'}</h3>
          <p>If you have paid, check your status before attempting another payment. Confirmation may take a moment.</p>
          <code className="pending-id">{pending.registrationId}</code>
          <button className="button primary full" onClick={checkStatus} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />} Check payment status</button>
          <button className="button secondary full" onClick={resume} disabled={busy || !config.checkoutEnabled}>Resume secure checkout <ArrowRight size={17} /></button>
        </div> : <form onSubmit={submit}>
          <fieldset disabled={busy || !config.checkoutEnabled}>
            <div className="form-grid">
              <label>First name<input name="firstName" required maxLength={100} autoComplete="given-name" placeholder="First name" /></label>
              <label>Last name<input name="lastName" required maxLength={100} autoComplete="family-name" placeholder="Last name" /></label>
            </div>
            <label>Email address<input name="email" type="email" required maxLength={180} autoComplete="email" placeholder="you@example.com" /></label>
            <label>Phone number<input name="phone" type="tel" required maxLength={25} autoComplete="tel" pattern="[+0-9 ()\-]{7,25}" placeholder="+91 98765 43210" /></label>
            <div className="form-grid">
              <label>Hospital / clinic<input name="organization" required maxLength={180} autoComplete="organization" placeholder="Your organisation" /></label>
              <label>Medical specialty<input name="specialty" required maxLength={180} placeholder="e.g. General medicine" /></label>
            </div>
            <label className="consent"><input name="consent" type="checkbox" required /><span>I accept the {config.policies?.terms ? <a href={config.policies.terms} target="_blank" rel="noreferrer">terms</a> : 'terms'}, {config.policies?.privacy ? <a href={config.policies.privacy} target="_blank" rel="noreferrer">privacy policy</a> : 'privacy policy'} and {config.policies?.refund ? <a href={config.policies.refund} target="_blank" rel="noreferrer">refund policy</a> : 'refund policy'} for registration.</span></label>
            <button type="submit" className="button primary full">{busy ? <><LoaderCircle size={17} className="spin" /> Opening checkout…</> : <> {config.checkoutEnabled ? `Continue to pay ${money(config.amount)}` : 'Registration opens soon'} <ArrowRight size={17} /></>}</button>
          </fieldset>
        </form>}
        <p className="secure-note"><LockKeyhole size={13} /> Secure checkout by Razorpay · UPI, cards & more</p>
      </>}
    </div>
  </dialog>;
}
