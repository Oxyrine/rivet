import type { Metadata } from 'next';
import { ArrowDownToLine, CheckCircle2, ExternalLink, ShieldCheck, Smartphone } from 'lucide-react';
import s from './page.module.css';

export const metadata: Metadata = {
  title: 'Rivet Field for Android',
  description: 'Install the Rivet Field companion app for Android.',
};

const downloadUrl = '/rivet-field.apk';
const releaseUrl = 'https://github.com/Oxyrine/rivet/releases';
const checksum = 'ADA7798E3D65529511FE8773BE7EE9505533CC7F4FA2B4C3006CD28E6CB26E08';

export default function FieldAppPage() {
  return (
    <div className={s.page}>
      <section className={s.hero}>
        <div className={s.eyebrow}><span /> Rivet Field · Android</div>
        <div className={s.heroGrid}>
          <div>
            <h1>Keep the job moving from the floor.</h1>
            <p>
              Rivet Field gives technicians a direct route into the live field workspace, with a simple connection check and a browser fallback when a job takes them outside Rivet.
            </p>
            <div className={s.actions}>
              <a className={s.download} href={downloadUrl}>
                <ArrowDownToLine size={18} aria-hidden="true" /> Download preview APK
              </a>
              <a className={s.releaseLink} href={releaseUrl} target="_blank" rel="noreferrer">
                Release notes <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
            <p className={s.meta}>Version 1.0.1 · Android 7.0 or newer · 1.9 MB</p>
          </div>
          <div className={s.device} aria-hidden="true">
            <div className={s.deviceTop} />
            <div className={s.screen}>
              <span className={s.appMark}>R</span>
              <strong>RIVET / FIELD</strong>
              <small>Connected to Rivet</small>
              <i />
              <b>Open today&apos;s work</b>
            </div>
          </div>
        </div>
      </section>

      <section className={s.content}>
        <article className={s.install}>
          <div className={s.sectionHeading}>
            <Smartphone size={20} aria-hidden="true" />
            <div>
              <span>Install</span>
              <h2>Ready in three steps</h2>
            </div>
          </div>
          <ol>
            <li><b>Download the APK</b><span>Use the button above on your Android phone.</span></li>
            <li><b>Allow this download</b><span>Android may ask you to allow installs from your browser or file manager.</span></li>
            <li><b>Open Rivet Field</b><span>Sign in to Rivet and continue to the field workspace.</span></li>
          </ol>
        </article>

        <article className={s.verification}>
          <div className={s.sectionHeading}>
            <ShieldCheck size={20} aria-hidden="true" />
            <div>
              <span>Verified artifact</span>
              <h2>Check what you install</h2>
            </div>
          </div>
          <p>This preview APK is debug-signed for direct team testing. Its SHA-256 file hash is published here so you can verify the download.</p>
          <code>{checksum}</code>
          <div className={s.signal}><CheckCircle2 size={16} aria-hidden="true" /> APK signature verified before release</div>
        </article>
      </section>
    </div>
  );
}