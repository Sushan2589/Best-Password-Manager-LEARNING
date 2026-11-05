import type { Metadata } from "next";
import Link from "next/link";
import Image, { getImageProps } from "next/image";
import { ArrowDown, ArrowRight, Check, ChevronDown, Globe2, KeyRound, LockKeyhole, Menu, MousePointer2, ShieldCheck } from "lucide-react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "Your passwords. Off your mind. | Password Manager" },
  description: "A calmer home for your passwords. Keep your credentials encrypted, create stronger passwords, and fill matching logins with the Chrome and Edge extension.",
  openGraph: { title: "Your passwords. Off your mind. | Password Manager", description: "A little less to remember. A lot more room for everything else.", type: "website", siteName: "Password Manager" },
};

const features = [
  { Icon: Globe2, number: "01", title: "Find the right login", description: "Email, work, your very specific hobbies. Keep your accounts together and find the right one with a quick search.", tag: "Organized vault" },
  { Icon: MousePointer2, number: "02", title: "Fill with a click", description: "Click a login field, choose a matching account, and fill the form. Your browser extension handles the busywork.", tag: "Browser autofill" },
  { Icon: KeyRound, number: "03", title: "Generate a stronger password", description: "Make a fresh, random password for your next account. Choose its length and characters in the password generator.", tag: "Password generator" },
];
const questions = [
  { question: "How are my saved passwords protected?", answer: "Your vault entries are encrypted in your browser with AES-256-GCM before they are sent to the server. Your vault password derives the encryption key locally. That key stays in memory while the vault is unlocked; locking clears the app's references to it." },
  { question: "Is my sign-in password the same as my vault password?", answer: "They serve different purposes. Your sign-in password authenticates your account; your vault password unlocks your encrypted entries. You can choose different passwords, and we recommend that you do. Each can be changed separately in Account security." },
  { question: "Which browsers does the extension support?", answer: "The extension is built for Chrome and Microsoft Edge. Approve HTTPS website access once to enable field suggestions, then unlock your vault. It offers matching accounts on supported login forms and fills only after you select one. It never submits a form for you." },
  { question: "What happens when I close the extension popup?", answer: "You choose when your vault locks. Keep a timed inactivity limit, lock when the popup closes, or keep it unlocked until the browser closes. The key stays in memory only. Session expiry, manual locking, extension reloads, or loss of that memory can lock it sooner." },
  { question: "What if I forget my vault password?", answer: "Your vault password is not stored, so it cannot be recovered for you. Keep it somewhere safe. Changing your account sign-in password does not decrypt your vault or replace its unlock password." },
];

function Brand() {
  return <Link href="/" className={styles.brand} aria-label="Password Manager home"><span className={styles.brandMark}><LockKeyhole size={20} strokeWidth={1.5} /></span><span>Password{" "}<span className={styles.brandSecond}>Manager</span></span></Link>;
}

export default function Home() {
  const screenshotAlt = "Actual Password Manager web vault with sample accounts and hidden passwords";
  const desktopScreenshot = getImageProps({ src: "/images/product/vault-desktop.png", alt: screenshotAlt,
    width: 1440, height: 1060, quality: 85, loading: "eager", fetchPriority: "high",
    sizes: "(max-width: 800px) calc(100vw - 90px), (max-width: 1050px) calc(100vw - 116px), (max-width: 1224px) calc(100vw - 124px), 1100px",
    className: styles.vaultScreenshot });
  const mobileScreenshot = getImageProps({ src: "/images/product/vault-mobile.png", alt: screenshotAlt,
    width: 390, height: 780, quality: 85, sizes: "calc(100vw - 56px)" });
  return <div className={styles.page} data-landing-page>

    <a className={styles.skipLink} href="#main">Skip to content</a>
    <header className={styles.header}><div className={styles.navInner}>
      <Brand />
      <nav aria-label="Main navigation" className={styles.desktopNav}><a href="#features">Features</a><a href="#security">Security</a><a href="#browser">Browser extension</a></nav>
      <div className={styles.navActions}><Link href="/login" className={styles.signIn}>Sign in</Link><Link href="/register" className={styles.navCta}>Get started <ArrowRight size={15} /></Link></div>
      <details className={styles.mobileMenu}><summary aria-label="Open navigation"><Menu size={22} /></summary><nav aria-label="Mobile navigation"><a href="#features">Features</a><a href="#security">Security</a><a href="#browser">Browser extension</a><a href="#faq">Questions & answers</a><Link href="/login">Sign in</Link></nav></details>
    </div></header>

    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span className={styles.statusDot} /> Your encrypted password vault</span>
          <h1 id="hero-title">Your passwords.<br /><span className={styles.heroAccent}>Off your mind.</span></h1>
          <p>Save your logins in one encrypted vault.<br className={styles.desktopBreak} /> Find them fast. Fill them when you choose.</p>
          <div className={styles.heroActions}><Link href="/register" className={styles.primaryCta}>Create your vault</Link><a href="#how-it-works" className={styles.textCta}>See how it works <ArrowDown size={16} /></a></div>

        </div>
        <div className={styles.playground}>
          <a href="/images/product/vault-desktop.png" target="_blank" rel="noopener noreferrer" className={styles.screenshotLink} aria-label="View full-size web vault screenshot">
            <picture><source media="(max-width: 600px)" srcSet={mobileScreenshot.props.srcSet} sizes={mobileScreenshot.props.sizes} width={390} height={780} /><img {...desktopScreenshot.props} /></picture>
          </a>
          <div className={styles.previewCaption}><span className={styles.captionLine} /><span>Web vault / Sample accounts</span><span className={styles.captionLine} /></div>
        </div>
        <div className={styles.featureStrip}><span><Globe2 size={18} /> Your web vault</span><span className={styles.stripPlus}>+</span><span><MousePointer2 size={18} /> Chrome & Edge extension</span><span className={styles.stripPlus}>=</span><span className={styles.stripResult}>Save, find, fill <Check size={16} /></span></div>
      </section>

      <section id="features" className={`${styles.section} ${styles.featuresSection}`} aria-labelledby="features-title">
        <div className={styles.sectionHeading}><div><span className={styles.sectionLabel}>Everyday essentials</span><h2 id="features-title">Keep every login<br />within reach</h2></div><p>Save your accounts, generate passwords,<br className={styles.desktopBreak} /> and choose what to fill</p></div>
        <div className={styles.featureGrid}>{features.map(({ Icon, number, title, description, tag }) => <article key={number} className={styles.featureCard}><div className={styles.featureCardTop}><span className={styles.featureIcon}><Icon size={18} strokeWidth={1.5} /></span><span className={styles.cardNumber}>/{number}</span></div><h3>{title}</h3><p>{description}</p><span className={styles.featureTag}>{tag}</span></article>)}</div>
      </section>

      <section id="browser" className={`${styles.section} ${styles.browserSection}`} aria-labelledby="browser-title">
        <figure className={styles.extensionFigure}>
          <Image src="/images/product/extension-vault.png" alt="Actual browser extension showing sample saved accounts with the vault unlocked" width={400} height={600} quality={85} sizes="(max-width: 600px) calc(100vw - 104px), (max-width: 800px) 280px, 340px" loading="lazy" decoding="async" className={styles.extensionScreenshot} />
          <figcaption>The actual extension, with sample accounts.</figcaption>
        </figure>
        <div className={styles.browserCopy}><span className={styles.sectionLabel}>Chrome & Edge</span><h2 id="browser-title">Your logins,<br />beside the field</h2><p>Already on the sign-in page? Your logins can meet you there. Click a field, choose your account, and get back to whatever brought you online.</p><ul><li><Check size={16} /> Matching accounts, right beside the field</li><li><Check size={16} /> A shortcut when you need it: <kbd>Alt</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>L</kbd></li><li><Check size={16} /> You fill. You review. You hit sign in.</li></ul><Link href="/extension" className={styles.textCta}>Get the browser extension <ArrowRight size={16} /></Link><span className={styles.browserAvailability}>For Chrome & Microsoft Edge · Website access required</span></div>
      </section>

      <section id="security" className={styles.securityWrap} aria-labelledby="security-title"><div className={styles.securitySection}>
        <div className={styles.securityCopy}><span className={styles.securityEyebrow}><span /> Encrypted on your device</span><h2 id="security-title">Your vault.<br />Your key.</h2><p>Easy to use should still mean carefully protected. Your vault entries are encrypted on your device, before they reach the server.</p><a href="#faq" className={styles.securityLink}>A closer look at your vault</a></div>
        <div className={styles.securityVisual} aria-hidden="true"><div className={styles.lockTile}><LockKeyhole size={64} strokeWidth={1.5} /></div><span className={styles.encryptedPill}><LockKeyhole size={12} /> Encrypted locally</span></div>
        <div className={styles.securityPoints}><div><ShieldCheck size={21} /><span><strong>AES-256-GCM encryption</strong><small>Protecting the contents of your vault.</small></span></div><div><KeyRound size={21} /><span><strong>Your vault key stays local</strong><small>Derived from your vault password.</small></span></div><div><LockKeyhole size={21} /><span><strong>You set the boundaries</strong><small>Vault locking, MFA, and session controls.</small></span></div></div>
      </div></section>

      <section id="how-it-works" className={`${styles.section} ${styles.stepsSection}`} aria-labelledby="steps-title"><span className={styles.sectionLabel}>Getting started</span><h2 id="steps-title">From account to first login</h2><div className={styles.stepsGrid}>{[
        ["01", "Create your vault", "Create an account, verify your email, and set up your vault password. Pick a passphrase you can keep safe."],
        ["02", "Add your accounts", "Add your accounts and generate fresh passwords. Your credentials are encrypted before they leave your browser."],
        ["03", "Choose a login to fill", "Use your web vault, or enable the browser extension to choose and fill matching logins as you go."],
      ].map(([number, title, text]) => <article key={number}><span className={styles.stepNumber}>{number}<span /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section id="faq" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title"><div><span className={styles.sectionLabel}>Vault essentials</span><h2 id="faq-title">Know how your<br />vault works</h2><p>Encryption, browser access,<br className={styles.desktopBreak} /> and your vault password</p></div><div className={styles.questions}>{questions.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

      <section className={styles.finalCta} aria-labelledby="start-title"><span className={styles.sectionLabel}>Your next sign-in starts here</span><h2 id="start-title">One place for your passwords.<br /><span>One less thing to remember.</span></h2><Link href="/register" className={styles.primaryCta}>Create your vault</Link><p>Already have an account? <Link href="/login">Sign in</Link></p></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><Brand /><p>A little less to remember.<br />A lot more room for everything else.</p><nav aria-label="Footer navigation"><a href="#security">Security</a><a href="#faq">FAQs</a><Link href="/login">Sign in</Link></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Password Manager</span><span>Keep the passwords. Lose the mental tabs.</span></div></footer>
  </div>;
}
