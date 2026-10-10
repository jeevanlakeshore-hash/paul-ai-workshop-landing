import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowRight, CalendarDays, Check, ChevronDown, Clock3, CodeXml, FileCheck2, GraduationCap, HeartPulse, Hospital, Laptop, LockKeyhole, Mail, Menu, ShieldCheck, Sparkles, Stethoscope, Sun, Sunrise, X } from 'lucide-react';
import { sessions, faqs } from './content.js';
import { api, money } from './api.js';
import Registration from './Registration.jsx';

// Prefix public/ paths with Vite's base so images resolve when the site is served under /ai-workshop/.
const image = name => `${import.meta.env.BASE_URL}images/${name}`;

const fallback = { amount: null, startsAt: null, checkoutEnabled: false, policies: {}, venue: 'VPS Lakeshore Hospital', supportEmail: 'support@ai-for-doctors.com' };

function Countdown({ startsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!startsAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [startsAt]);
  const remaining = startsAt ? Math.max(0, new Date(startsAt).getTime() - now) : null;
  const parts = remaining === null ? ['—', '—', '—', '—'] : [Math.floor(remaining / 86400000), Math.floor(remaining / 3600000) % 24, Math.floor(remaining / 60000) % 60, Math.floor(remaining / 1000) % 60].map(n => String(n).padStart(2, '0'));
  return <div className="countdown-card"><div className="countdown-heading"><span className="status-dot" />{remaining === null ? 'A new chapter is coming' : remaining === 0 ? 'The workshop has started' : 'Your next chapter starts in'}<CalendarDays size={15} /></div><div className="countdown" role="timer" aria-live="off">{['Days', 'Hours', 'Minutes', 'Seconds'].map((label, i) => <div key={label}><strong>{parts[i]}</strong><span>{label}</span></div>)}</div>{remaining === null && <p>Date to be announced. Stay tuned.</p>}</div>;
}

function Logo({ footer = false }) {
  return <a className="wordmark" href="#top" aria-label="AI in Clinical Practice home"><span className="brand-icon"><Stethoscope size={23} /></span><span>AI in Clinical Practice<small>{footer ? 'LEARN. APPLY. TRANSFORM.' : 'A WORKSHOP FOR DOCTORS'}</small></span></a>;
}

export default function App() {
  const [menu, setMenu] = useState(false);
  const [config, setConfig] = useState(fallback);
  const [configError, setConfigError] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configRetry, setConfigRetry] = useState(0);
  const [openModule, setOpenModule] = useState('0-0');
  const registration = useRef(null);
  const bio = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true); setConfigError(false);
    api('workshop').then(data => { if (!cancelled) setConfig(data); }).catch(() => { if (!cancelled) setConfigError(true); }).finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [configRetry]);
  function register() { setMenu(false); setConfigRetry(value => value + 1); registration.current.showModal(); }
  const date = config.startsAt ? new Date(config.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'Upcoming date TBA';

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="container header-inner"><Logo /><nav className={menu ? 'navigation is-open' : 'navigation'} aria-label="Main navigation" id="main-navigation"><a href="#audience" onClick={() => setMenu(false)}>Who it’s for</a><a href="#syllabus" onClick={() => setMenu(false)}>Syllabus</a><a href="#instructor" onClick={() => setMenu(false)}>Instructor</a><button className="button primary small" onClick={register}>Register now <ArrowRight size={15} /></button></nav><button className="icon-button menu-toggle" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button></div></header>
    <main id="main">
      <section className="hero" id="top"><div className="container hero-grid">
        <div className="hero-copy"><div className="pill"><span className="status-dot" /> ONE-DAY, HANDS-ON WORKSHOP</div><h1>A new era of care.<br /><span>Powered by AI.</span><br />Led by you.</h1><p className="hero-subtitle">AI in Clinical Practice</p><p className="hero-description">Bring the possibilities of AI into your everyday practice. A practical workshop to help you work smarter, simplify documentation, and keep patient care at the centre.</p>
          <div className="event-details"><span><CalendarDays size={16} />{date}</span><span><Clock3 size={16} />9:00 AM – 5:30 PM IST</span></div>
          <div className="hero-actions"><button className="button primary" onClick={register}>Register for the workshop <ArrowRight size={18} /></button><a className="button secondary" href="#syllabus">Explore syllabus <ArrowDown size={16} /></a></div>
          <p className="hero-note"><Check size={14} /> No coding experience needed <span>·</span> Built for clinicians</p>
          <div className="host"><span>HOSTED BY</span><div className="host-logo"><img src={image('lakeshore-logo.png')} width="155" height="45" alt="VPS Lakeshore Hospital" /></div></div>
        </div>
        <div className="hero-visual"><div className="hero-image-wrap"><img className="hero-image" src={image('workshop-hero.png')} alt="Doctor exploring AI-assisted clinical tools" fetchPriority="high" width="1024" height="768" /><div className="image-shade" /><div className="image-label"><span className="glass-icon"><HeartPulse size={21} /></span><div>Human expertise.<br /><strong>New possibilities.</strong></div><span className="image-label-plus">+</span></div><div className="visual-tag"><Sparkles size={13} /> THE FUTURE IS IN YOUR HANDS</div></div><Countdown startsAt={config.startsAt} /></div>
      </div></section>
      <div className="learning-strip"><div className="container strip-inner"><span><Laptop />Hands-on learning</span><span><Stethoscope />Real clinical use cases</span><span><ShieldCheck />Responsible AI practices</span><span><GraduationCap />Completion certificate</span></div></div>

      <section id="audience" className="section container"><div className="section-heading"><div><p className="eyebrow">DESIGNED AROUND YOUR PRACTICE</p><h2>Better tools. <span>More human care.</span></h2></div><p>Make sense of AI, without the jargon.<br />Leave with skills you can put to work.</p></div><div className="audience-grid">
        <article className="info-card"><span className="card-icon"><Stethoscope size={25} /></span><h3>For the people behind the care.</h3><p>Whether you’re seeing patients, running a clinic, or starting your medical career, this day is for you.</p><ul className="check-list"><li><Check />Practising doctors & specialists</li><li><Check />Clinic owners & healthcare managers</li><li><Check />Resident doctors & medical researchers</li></ul><div className="card-footnote"><CodeXml size={16} /> Medical curiosity required. Coding skills optional.</div></article>
        <article className="info-card takeaways"><span className="card-icon"><Sparkles size={25} /></span><h3>Practical skills. Lasting value.</h3><p>Go beyond the headlines with tools, templates and a thoughtful approach to using AI.</p><ul className="check-list"><li><Check />Evaluate AI tools for clinical workflows</li><li><Check />Build better documentation and note templates</li><li><Check />Understand patient privacy and ethical AI</li><li><Check />Receive a workshop completion certificate</li></ul></article>
      </div></section>

      <section id="syllabus" className="section syllabus-section"><div className="container syllabus-grid"><div className="syllabus-intro"><p className="eyebrow">THE DAY, AT A GLANCE</p><h2>From understanding<br />to <span>doing.</span></h2><p>Six focused modules. Real-world applications. One day to change how you think about AI in your practice.</p><div className="syllabus-meta"><span><Clock3 size={18} />9:00 AM – 5:30 PM</span><span><FileCheck2 size={18} />6 practical modules</span><span><Laptop size={18} />Live demonstrations & practice</span></div><a className="text-link" href="#registration">Make time for what’s next <ArrowRight size={16} /></a><div className="learning-note"><Activity size={26} /><p>Technology supports your expertise.<br /><strong>Clinical judgment stays with you.</strong></p></div></div>
        <div className="sessions">{sessions.map((session, si) => <div className="session" key={session.name}><div className="session-heading">{si ? <Sun size={18} /> : <Sunrise size={18} />}<h3>{session.name}</h3><span>{session.time}</span></div><div className="module-list">{session.modules.map(([time, title, description], mi) => { const id = `${si}-${mi}`; const open = openModule === id; return <article className={`module ${open ? 'expanded' : ''}`} key={id}><h4><button aria-expanded={open} aria-controls={`module-${id}`} onClick={() => setOpenModule(open ? null : id)}><span className="module-number">{String(si * 3 + mi + 1).padStart(2, '0')}</span><span className="module-title"><small>{time}</small>{title}</span><ChevronDown size={18} /></button></h4><div className="module-description" id={`module-${id}`} hidden={!open}>{description}</div></article>; })}</div>{si === 0 && <div className="lunch-break"><span />13:00 – 14:00 · Lunch & conversations<span /></div>}</div>)}</div>
      </div></section>

      <section id="instructor" className="section container instructor-section"><div className="instructor-image"><img src={image('instructor.jpg')} alt="Subilal K, workshop instructor" width="430" height="470" loading="lazy" /><div className="instructor-image-label"><span className="status-dot" /> MEET YOUR INSTRUCTOR</div></div><div className="instructor-copy"><p className="eyebrow">EXPERIENCE MEETS APPROACHABILITY</p><h2>Learn with<br /><span>Subilal K.</span></h2><p className="instructor-role">Founder, Doc Near U · AI & Automation Expert</p><p>With over a decade of experience building autonomous systems, Subilal makes complex ideas approachable. His teaching connects AI concepts to practical workflows you can understand and apply.</p><p>Expect a day of demonstrations, guided exercises and open conversations about where AI fits in clinical practice.</p><div className="instructor-facts"><div><strong>10+</strong><span>Years building systems</span></div><div><strong>Practical</strong><span>From concept to application</span></div></div><button className="text-link" onClick={() => bio.current.showModal()}>More about your instructor <ArrowRight size={17} /></button></div></section>

      <section className="section faq-section"><div className="container faq-grid"><div><p className="eyebrow">A LITTLE MORE CLARITY</p><h2>Good questions.<br /><span>Clear answers.</span></h2><p>Need something else? <a href={`mailto:${config.supportEmail}`}>Get in touch <ArrowRight size={14} /></a></p></div><div className="faq-list">{faqs.map(([question, answer], index) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{index === 1 && config.startsAt ? `The workshop takes place on ${date} at ${config.venue}. Sessions run from 9:00 AM to 5:30 PM IST.` : answer}</p></details>)}</div></div></section>

      <section className="container final-cta" id="registration"><div className="cta-orbit" aria-hidden="true" /><div><p className="eyebrow">INVEST IN YOUR NEXT CHAPTER</p><h2>The future of your practice<br />starts with <span>one day.</span></h2><p>Bring your curiosity. Leave with a new perspective.</p><div className="cta-actions"><button className="button primary" onClick={register}>Register for the workshop <ArrowRight size={18} /></button><span>{config.amount ? <><strong>{money(config.amount)}</strong> · per attendee</> : 'Registration details coming soon'}</span></div><p className="secure-note"><LockKeyhole size={13} /> Secure payments powered by Razorpay</p>{configError && <p className="notice">Registration details are temporarily unavailable. Please refresh or contact support.</p>}</div><span className="cta-art" aria-hidden="true"><Stethoscope /></span></section>
    </main>
    <footer><div className="container footer-main"><div><Logo footer /><p>Helping healthcare professionals explore<br />what’s possible with AI.</p><div className="host-logo"><img src={image('lakeshore-logo.png')} alt="VPS Lakeshore Hospital" width="155" height="45" loading="lazy" /></div></div><div className="footer-links"><h3>The workshop</h3><a href="#audience">Who it’s for</a><a href="#syllabus">Syllabus</a><a href="#instructor">Your instructor</a><button onClick={register}>Registration</button></div><div className="footer-contact"><h3>Let’s connect</h3><p>Workshop enquiries & support</p><a href={`mailto:${config.supportEmail}`}><Mail size={16} />{config.supportEmail}</a><span><Hospital size={16} />Hosted by VPS Lakeshore Hospital</span></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} AI in Clinical Practice. All rights reserved.</span><div>{Object.entries(config.policies).filter(([, url]) => url).map(([key, url]) => <a href={url} key={key} target="_blank" rel="noreferrer">{key === 'terms' ? 'Terms' : key === 'privacy' ? 'Privacy policy' : 'Refund policy'}</a>)}<a href="#top">Back to top ↑</a></div></div></footer>
    <Registration dialogRef={registration} config={config} configError={configError} configLoading={configLoading} onRetry={() => setConfigRetry(value => value + 1)} />
    <dialog ref={bio} className="bio-dialog" aria-labelledby="bio-title" onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}><div className="dialog-body"><button className="icon-button close-dialog" onClick={() => bio.current.close()} aria-label="Close instructor biography"><X size={21} /></button><p className="eyebrow">YOUR INSTRUCTOR</p><h2 id="bio-title">Subilal K</h2><p className="teal">Founder of Doc Near U · AI & Automation Expert</p><img src={image('instructor.jpg')} alt="Subilal K" width="130" height="130" /><p>Subilal’s work spans AI, automation, digital marketing and business process optimisation. Over the past ten years, he has helped turn complex, repetitive processes into practical systems.</p><p>His workshop brings that implementation experience to healthcare professionals, with an emphasis on understandable tools, thoughtful evaluation and hands-on learning.</p><button className="button primary" onClick={() => { bio.current.close(); register(); }}>Join the workshop <ArrowRight size={17} /></button></div></dialog>
  </>;
}
