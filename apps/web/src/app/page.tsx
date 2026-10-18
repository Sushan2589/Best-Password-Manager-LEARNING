import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, Check, ChevronDown, Globe2, KeyRound, LockKeyhole, Menu, MousePointer2, ShieldCheck } from "lucide-react";
import styles from "./landing.module.css";
import LandingMotion from "./components/landing/LandingMotion";

export const metadata: Metadata = {
  title: { absolute: "Your passwords. Off your mind. | Password Manager" },
  description: "A calmer home for your passwords. Keep your credentials encrypted, create stronger passwords, and fill matching logins with the Chrome and Edge extension.",
  openGraph: { title: "Your passwords. Off your mind. | Password Manager", description: "A little less to remember. A lot more room for everything else.", type: "website", siteName: "Password Manager" },
};

const features = [
  { Icon: Globe2, color: "lavender", number: "01", title: "A home for every login.", description: "Email, work, your very specific hobbies. Keep your accounts together and find the right one with a quick search.", tag: "ONE ORGANIZED VAULT" },
  { Icon: MousePointer2, color: "peach", number: "02", title: "Less typing. More doing.", description: "Click a login field, choose a matching account, and fill the form. Your browser extension handles the busywork.", tag: "FILL WITH A CLICK" },
  { Icon: KeyRound, color: "lime", number: "03", title: "Give predictable a break.", description: "Make a fresh, random password for your next account. Choose its length and characters in the password generator.", tag: "STRONGER BY DESIGN" },
];
const questions = [
  { question: "How are my saved passwords protected?", answer: "Your vault entries are encrypted in your browser with AES-256-GCM before they are sent to the server. Your vault password derives the encryption key locally. That key stays in memory while the vault is unlocked; locking clears the app's references to it." },
  { question: "Is my sign-in password the same as my vault password?", answer: "They serve different purposes. Your sign-in password authenticates your account; your vault password unlocks your encrypted entries. You can choose different passwords, and we recommend that you do. Each can be changed separately in Account security." },
  { question: "Which browsers does the extension support?", answer: "The extension is built for Chrome and Microsoft Edge. Approve HTTPS website access once to enable field suggestions, then unlock your vault. It offers matching accounts on supported login forms and fills only after you select one. It never submits a form for you." },
  { question: "What happens when I close the extension popup?", answer: "You choose when your vault locks. Keep a timed inactivity limit, lock when the popup closes, or keep it unlocked until the browser closes. The key stays in memory only. Session expiry, manual locking, extension reloads, or loss of that memory can lock it sooner." },
  { question: "What if I forget my vault password?", answer: "Your vault password is not stored, so it cannot be recovered for you. Keep it somewhere safe. Changing your account sign-in password does not decrypt your vault or replace its unlock password." },
];

function Brand() {
  return <Link href="/" className={styles.brand} aria-label="Password Manager home"><span className={styles.brandMark}><LockKeyhole size={20} strokeWidth={2.2} /></span><span>Password<span className={styles.brandSecond}>Manager</span></span></Link>;
}

export default function Home() {
  return <div className={styles.page} data-landing-page>
    <LandingMotion />
    <a className={styles.skipLink} href="#main">Skip to content</a>
    <header className={styles.header}><div className={styles.navInner}>
      <Brand />
      <nav aria-label="Main navigation" className={styles.desktopNav}><a href="#features">The good stuff</a><a href="#security">Security</a><a href="#browser">Browser extension</a></nav>
      <div className={styles.navActions}><Link href="/login" className={styles.signIn}>Sign in</Link><Link href="/register" className={styles.navCta}>Get started <ArrowRight size={15} /></Link></div>
      <details className={styles.mobileMenu}><summary aria-label="Open navigation"><Menu size={22} /></summary><nav aria-label="Mobile navigation"><a href="#features">Features</a><a href="#security">Security</a><a href="#browser">Browser extension</a><a href="#faq">Questions & answers</a><Link href="/login">Sign in</Link></nav></details>
    </div></header>

    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span className={styles.statusDot} /> A LITTLE LESS TO REMEMBER</span>
          <h1 id="hero-title">Your passwords.<br /><span className={styles.heroAccent}>Off your mind.<svg className={styles.heroUnderline} viewBox="0 0 550 28" fill="none" aria-hidden="true" focusable="false"><path pathLength="1" d="M8 16C133 3 340 3 542 12" /><path pathLength="1" d="M57 24C212 15 369 15 493 21" /></svg></span></h1>
          <p>A calmer home for your digital life. Keep your logins close,<br className={styles.desktopBreak} /> your passwords strong, and your next sign-in simple.</p>
          <div className={styles.heroActions}><Link href="/register" className={styles.primaryCta}>Create your vault</Link><a href="#how-it-works" className={styles.textCta}>Take a little tour <ArrowDown size={16} /></a></div>
          <div className={styles.heroNotes}><span><Check size={13} /> Encrypted in your browser</span><span><Check size={13} /> Built for everyday life</span></div>
        </div>
        <div className={styles.playground}>
          <div className={`${styles.floatingNote} ${styles.noteLeft}`} aria-hidden="true">One less thing<br />to keep in your head.</div>
          <div className={`${styles.floatingNote} ${styles.noteRight}`} aria-hidden="true"><span className={styles.noteKey}><KeyRound size={23} /></span><span>goodbye,<br /><strong>Forgot password?</strong></span></div>
          <a href="/images/product/vault-desktop.png" target="_blank" rel="noopener noreferrer" className={styles.screenshotLink} aria-label="View full-size web vault screenshot">
            <picture><source media="(max-width: 600px)" srcSet="/images/product/vault-mobile.png" width={390} height={780} /><Image src="/images/product/vault-desktop.png" alt="Actual Password Manager web vault with sample accounts and hidden passwords" width={1440} height={1060} unoptimized loading="eager" decoding="async" fetchPriority="high" className={styles.vaultScreenshot} /></picture>
          </a>
          <div className={styles.previewCaption}><span className={styles.captionLine} /><span>THE ACTUAL VAULT. SAMPLE ACCOUNTS. REAL INTERFACE.</span><span className={styles.captionLine} /></div>
        </div>
        <div className={styles.featureStrip}><span><Globe2 size={18} /> Your web vault</span><span className={styles.stripPlus}>+</span><span><MousePointer2 size={18} /> Chrome & Edge extension</span><span className={styles.stripPlus}>=</span><span className={styles.stripResult}>A smoother everyday <Check size={16} /></span></div>
      </section>

      <section id="features" className={`${styles.section} ${styles.featuresSection}`} aria-labelledby="features-title">
        <div className={styles.sectionHeading} data-reveal><div><span className={styles.sectionLabel}>SMALL DETAILS. BIG EXHALE.</span><h2 id="features-title">More life.<br />Less login admin.</h2></div><p>Your brain has better things to do than remember<br className={styles.desktopBreak} /> which password has the exclamation mark.</p></div>
        <div className={styles.featureGrid}>{features.map(({ Icon, color, number, title, description, tag }) => <article data-reveal key={number} className={`${styles.featureCard} ${styles[color]}`}><div className={styles.featureCardTop}><span className={styles.featureIcon}><Icon size={26} strokeWidth={1.7} /></span><span className={styles.cardNumber}>/{number}</span></div><h3>{title}</h3><p>{description}</p><span className={styles.featureTag}>{tag}</span></article>)}</div>
      </section>

      <section id="browser" className={`${styles.section} ${styles.browserSection}`} aria-labelledby="browser-title">
        <figure className={styles.extensionFigure} data-reveal>
          <Image src="/images/product/extension-vault.png" alt="Actual browser extension showing sample saved accounts with the vault unlocked" width={400} height={600} unoptimized loading="lazy" decoding="async" className={styles.extensionScreenshot} />
          <figcaption>The actual extension, with sample accounts.</figcaption>
        </figure>
        <div className={styles.browserCopy} data-reveal><span className={styles.sectionLabel}>RIGHT WHERE YOU NEED IT</span><h2 id="browser-title">Meet your browser&apos;s<br />new plus-one.</h2><p>Already on the sign-in page? Your logins can meet you there. Click a field, choose your account, and get back to whatever brought you online.</p><ul><li><Check size={16} /> Matching accounts, right beside the field</li><li><Check size={16} /> A shortcut when you need it: <kbd>Alt</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>L</kbd></li><li><Check size={16} /> You fill. You review. You hit sign in.</li></ul><a href="#how-it-works" className={styles.textCta}>Make yourself at home <ArrowRight size={16} /></a><span className={styles.browserAvailability}>For Chrome & Microsoft Edge · Website access required</span></div>
      </section>

      <section id="security" className={styles.securityWrap} aria-labelledby="security-title"><div className={styles.securitySection} data-reveal>
        <div className={styles.securityCopy}><span className={styles.securityEyebrow}><span /> LESS WORRY, BY DESIGN</span><h2 id="security-title">Private things.<br />Kept private.</h2><p>Easy to use should still mean carefully protected. Your vault entries are encrypted on your device, before they reach the server.</p><a href="#faq" className={styles.securityLink}>A closer look at your vault</a></div>
        <div className={styles.securityVisual} aria-hidden="true"><div className={styles.lockTile}><LockKeyhole size={64} strokeWidth={1.5} /></div><span className={styles.encryptedPill}><LockKeyhole size={12} /> ENCRYPTED LOCALLY</span></div>
        <div className={styles.securityPoints}><div><ShieldCheck size={21} /><span><strong>AES-256-GCM encryption</strong><small>Protecting the contents of your vault.</small></span></div><div><KeyRound size={21} /><span><strong>Your vault key stays local</strong><small>Derived from your vault password.</small></span></div><div><LockKeyhole size={21} /><span><strong>You set the boundaries</strong><small>Vault locking, MFA, and session controls.</small></span></div></div>
      </div></section>

      <section id="how-it-works" className={`${styles.section} ${styles.stepsSection}`} aria-labelledby="steps-title"><span className={styles.sectionLabel}>A FRESH START, IN THREE SMALL STEPS</span><h2 id="steps-title">Settle in. Then get on with it.</h2><div className={styles.stepsGrid}>{[
        ["01", "Say hello to your vault.", "Create an account, verify your email, and set up your vault password. Pick a passphrase you can keep safe."],
        ["02", "Give your logins a home.", "Add your accounts and generate fresh passwords. Your credentials are encrypted before they leave your browser."],
        ["03", "Let the little things flow.", "Use your web vault, or enable the browser extension to choose and fill matching logins as you go."],
      ].map(([number, title, text]) => <article data-reveal key={number}><span className={styles.stepNumber}>{number}<span /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section id="faq" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title"><div><span className={styles.sectionLabel}>GOOD QUESTIONS</span><h2 id="faq-title">A little clarity<br />goes a long way.</h2><p>Because your passwords<br className={styles.desktopBreak} /> deserve more than a shrug.</p></div><div className={styles.questions} data-reveal>{questions.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

      <section data-reveal className={styles.finalCta} aria-labelledby="start-title"><span className={styles.sectionLabel}>MAKE A LITTLE SPACE IN YOUR HEAD</span><h2 id="start-title">Remember what matters.<br /><span>We&apos;ll help with the logins.</span></h2><Link href="/register" className={styles.primaryCta}>Let&apos;s make your vault</Link><p>Already feeling at home? <Link href="/login">Sign in</Link></p></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><Brand /><p>A little less to remember.<br />A lot more room for everything else.</p><nav aria-label="Footer navigation"><a href="#security">Security</a><a href="#faq">FAQs</a><Link href="/login">Sign in</Link></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Password Manager</span><span>Keep the passwords. Lose the mental tabs.</span></div></footer>
  </div>;
}
