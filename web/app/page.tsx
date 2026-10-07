import Link from 'next/link';
import {ArrowUpRight, ArrowRight, Wrench, Route, Fingerprint} from 'lucide-react';
import s from './home.module.css';

const stations=[
  {id:'01',title:'Get the crew in place.',description:'Match the job to the right technician. Reserve the parts before the van leaves.',href:'/control',link:'Open dispatch',Icon:Wrench},
  {id:'02',title:'Stay ahead of the delay.',description:'Trace the jobs a disruption touches and compare your recovery options.',href:'/control',link:'Review the schedule',Icon:Route},
  {id:'03',title:'Leave a proper record.',description:'Review the work, check the evidence, and keep a service history you can verify.',href:'/verify',link:'Check a service record',Icon:Fingerprint},
];
export default function Home(){return <div className={s.home}>
  <div className={s.overline}><span>RIVET / FIELD OPERATIONS</span><span className={s.edition}>SERVICE MANUAL · VOL. 01</span></div>
  <section className={s.hero}>
    <div className={s.intro}><span className={s.label}>FOR THE PEOPLE WHO KEEP THINGS WORKING</span><h1>Good machines.<br/><em>Keep them<br/>running.</em></h1><p>A working day has a lot of moving parts.<br/>Bring the people, the equipment and the paperwork together.</p><Link className={s.launch} href="/control">Enter the control room <ArrowUpRight size={18}/></Link><Link className={s.customer} href="/portal">Here to review a service? <ArrowRight size={14}/></Link></div>
    <figure className={s.drawing}><div className={s.drawingTitle}><span>ASSEMBLY / HYDRAULIC PRESS</span><span>FIG. 01</span></div>
      <svg viewBox="0 0 420 360" role="img" aria-label="Technical line drawing of a hydraulic press with a pressure gauge and service connection">
        <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="currentColor" strokeWidth=".6"/></pattern></defs>
        <g fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M60 290h265M75 290V80h215v210M88 290V93h189v197M66 72h233v21H66zM50 290h282v16H50zM66 308h14v9H66m234-9h14v9h-14M137 93v26h91V93M163 119v67h39v-67M151 186h63v17h-63zM125 238h116v52H125zM137 253h92M137 270h92M182 51v21M150 51h64M182 37v14"/>
        <path d="M168 146h29M168 153h29M168 160h29M115 230h136M115 220v20m136-20v20"/>
        <circle cx="291" cy="144" r="25"/><circle cx="291" cy="144" r="20"/><path d="M291 119v6m25 19h-6m-19 25v-6m-25-19h6M287 148l17-19M291 169v71h47v-98h-22M338 200h16v52h-16M350 240h15v50h-40"/>
        <path d="M45 72H24v235h21M20 72h8m-8 235h8M80 328v13h210v-13M80 337v8m210-8v8" strokeDasharray="2 3" opacity=".5"/>
        <path d="M137 119h26v67h-26zM202 119h26v67h-26z" fill="url(#hatch)" opacity=".25"/>
        <path className={s.pressure} d="M365 290v-90h-27V106h-90V80" stroke="var(--accent)" strokeDasharray="4 8"/>
        <g className={s.servicePoint}><circle cx="365" cy="200" r="7" stroke="var(--accent)"/><circle cx="365" cy="200" r="2" fill="var(--accent)" stroke="none"/></g>
        <path d="M75 104 49 48H20M204 186l38 26h71M326 278l45 43h29" opacity=".4"/>
        </g><g fill="currentColor" fontFamily="monospace" fontSize="8"><text x="20" y="39">FRAME / 01</text><text x="246" y="226">RAM / 02</text><text x="333" y="337">RETURN / 03</text><text x="154" y="354">SERVICE ELEVATION</text></g>
      </svg><figcaption><span>DESIGNED TO BE MAINTAINED.</span><span>ILLUSTRATION · NOT LIVE TELEMETRY</span></figcaption>
    </figure>
  </section>
  <div className={s.sectionRule}><span>THE WORK, FROM START TO SIGN-OFF</span><span>01 — 03</span></div>
  <section className={s.stations} aria-label="Service workflow">{stations.map(({id,title,description,href,link,Icon})=><Link className={s.station} key={id} href={href}><div className={s.stationTop}><span>{id}</span><Icon size={22} strokeWidth={1.3}/></div><h2>{title}</h2><p>{description}</p><span className={s.stationLink}>{link}<ArrowUpRight size={15}/></span></Link>)}</section>
  <footer className={s.footer}><span>PEOPLE. PARTS. PROOF.</span><span>Development workspace · simulated equipment telemetry</span></footer>
 </div>}
