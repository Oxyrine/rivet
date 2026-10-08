# Rivet: two-person pitch script (about 9 minutes, plus questions)

**Presenter 1, Operations** drives the laptop: landing page, control room, stores.
**Presenter 2, Field and customer** drives the phone and a second window: technician app, site supervisor, the customer's verifier.

One browser profile holds one sign-in. Presenter 1 uses a normal window for the Coordinator and a private window for the Storekeeper. Presenter 2 uses the phone for Priya and a private window for the Supervisor. `/verify` needs no sign-in. On the sign-in menu, **Enter as…** logs you in with one click (the menu carries a demo-only notice, which is fine to point out).

---

## Before you walk in (10 minutes earlier)

1. **Wake the API.** Open `https://rivet-1.onrender.com/health`. On the free tier the first request can take about a minute.
2. **Reset the data.** Sign in as **Admin**, open **Team access**, use **Reset demo data…** and confirm with **Yes, erase & reset**. This also loads the current seed: three jobs waiting for a technician (J-2253, J-2257, J-2260) and parts reserved for the assigned jobs.
3. **Set the clock to 09:02** in the same page ("Demo controls & time travel"). The buttons *10 minutes forward* and *1 hour forward* move it later.
   If **Admin** is missing from **Enter as…**, the server has not enabled admin demo entry. You can still pitch; the SLA numbers will then come from the real clock instead of the scripted morning, so do not quote "54 minutes".
4. **Check the live site is talking to the real API.** The site falls back to a built-in demo engine if the API does not answer in 2.5 seconds, and that engine does not have the Stores page or the seed above. If **Stores** shows nothing for the Storekeeper, or J-2253 is not "Unassigned" in the control room, the real API was asleep: wait, reload, repeat.
5. **Open and sign in:**
   - P1 normal window: `/control` as **Coordinator**.
   - P1 private window: `/stores` as **Storekeeper**.
   - P2 phone: `/tech` as **Technician · Priya** (allow location). Add it to the home screen if you can.
   - P2 private window: `/portal` as **Site supervisor**.
   - P2 any window: `/verify`.
6. **Rehearse the photo step** on the phone once (before photo, after photo in the report). Have the supervisor PIN to hand: **4826**.

---

## The run of show

### 0. Hook (P1, landing page `/`, 40 s)

**Click:** nothing. Show the landing page.

**P1:** "A plant's hydraulic press stops. Today that is a phone call, a WhatsApp message saying 'I've kept a seal kit aside', and a technician's own report to prove it was fixed. Three promises with no owner, and a record that belongs to the provider."

**P2:** "Rivet records every technician-hour, spare part, SLA and plant permit as a commitment. When one breaks it shows everything that breaks with it, recovers it in one click, and only closes the job on evidence the customer can check on their own device."

*(Four words to land: **Ledger. Cascade. Recovery. Proof.**)*

### 1. The control room (P1, `/control` as Coordinator, 45 s)

**Click:** nothing yet. Point at the four numbers, the job board, the Risk Radar tab.

**P1:** "This is the coordinator's one screen. Open jobs, jobs at risk, and on the right the Risk Radar, which ranks jobs by how bad their situation is. Today there are eleven open jobs. Three at the top are *Unassigned*, nobody owns them yet. Let's fix that first."

### 2. Assign work, and see why not everyone qualifies (P1, 60 s)

**Click:** in the board click **M-133 · J-2253** (Unassigned, Approved). Scroll the drawer to the technician list.

**P1:** "Rivet ranks every technician and tells you why someone is out. Arjun: certificate expired. Dev: time conflict. The approved contractor: wrong skill. Nobody has to remember that, and it can't be assigned around."

**Click:** **Assign & Reserve Resources →**. Then scroll to *Reservations & custody holds*.

**P1:** "Assigning did three things at once: booked Karthik's time, reserved the part for this job in the store, and started the SLA. These are double-entry movements. A part held for this job cannot be held for another."

### 3. The store knows too (P1, private window `/stores` as Storekeeper, 40 s)

**Click:** switch to the Storekeeper window, reload **Stores**.

**P1:** "Same reservation, other side of the counter. The storekeeper sees what each technician needs: Karthik's part now says *Ready to hand over*. Before assignment it said *Waiting for a technician*. No chat message, no spreadsheet."

**Click:** **Issue 1** next to Karthik's part.

**P1:** "Issuing is recorded by the storekeeper, who is not the technician. Hold that thought: that independence is what makes the proof work later."

### 4. 09:02, the real incident (P1, 60 s)

**Click:** switch back to the Coordinator window. **New request** (top right). The form is preset to **M-104** and **hydraulic leak**. Submit.

**P1:** "A pressure spike on M-104, a P1 hydraulic press with a four-hour SLA. Rivet checks the contract, the skills, the seal kit HS-40 and the tools in under a second."

**Click:** in the drawer, if it shows *Approve Service Request*, click it, then **Assign & Reserve Resources →** with *Best Qualified (Auto-Ranked)*. Ravi is first, nine minutes away.

### 5. 10:10, Ravi's van breaks down (P1, 90 s)

**Click:** open the **Schedule Solver** tab. Technician: **Ravi**. Click **Report Dropout**.

**P1:** "This is the moment a coordinator normally starts phoning round. Rivet already knows what depends on Ravi."

**Click:** **Impact Graph** tab.

**P1:** "Three jobs and eight commitments turn red: his time, the seal-kit hold, the SLA. Nothing has been changed yet; this is a dry run."

**Click:** **Recovery Plans** tab. Click the plan ranked first.

**P1:** "Plan A hands J-2231 to Priya, with zero SLA misses. Below it, options that were *refused* and why: Rivet will not suggest a plan that creates a new conflict. And if nothing could save everything, it would save what it can and say what is left."

**Click:** **Approve** on Plan A.

**P2:** "One click, and only one person can make it: if a second coordinator tries to approve a different plan, the system says *Plan A was approved by the coordinator at 10:14*."

### 6. Over to the field (P2, phone `/tech` as Priya, 75 s)

**P2:** "Priya's phone. This app works offline: every action is saved on the device first and sent when there is signal."

**Click (phone):** open **J-2231**. Tap **1. Check In (GPS)**. Then tap **2. Start Work**.

**P2:** "Start Work is *locked*: **Permit pending**. At a real plant you may not touch a press until the plant issues a permit to work. Rivet enforces that, and the SLA clock pauses on the plant's side, with evidence."

### 7. The customer's side (P2, supervisor window `/portal`, 45 s)

**Click:** Select **J-2231** in *Service requests*. In *Site commitments* click **Confirm** then **Fulfilled** on **PERMIT TO WORK**.

**P2:** "The plant's supervisor issues the permit. Notice what the customer sees: their promises and evidence, not our technician rankings or part holds."

**Click (phone):** **2. Start Work** now works. Open the store window and click **Issue** for Priya's seal kit; then on the phone **Scan Barcode/QR** and scan or key in **HS-40**.

**P1:** "Three independent records so far: the store's issue, Priya's scan, and her check-in. Three different people or systems."

### 8. The report that doesn't add up (P2, 75 s)

**Click (phone):** **Check Out**, add the before and after photos, then **Complete Report**. In *Parts used* set the seal kit to **2** (one more than was issued). Review, **Submit report**.

**Click (supervisor window):** reload **/portal**, scroll to *Completion evidence*.

**P2:** "She claims two seal kits. The store issued one. Rivet lines up the plan, the field report, and records the technician does not write. The line is marked ✕ *Disagrees*, **Closure blocked**, and the Accept button is locked. A self-reported report cannot close a job."

**Click (phone):** back into the report, set the kit to **1**, resubmit. Reload the portal: the table is green.

### 9. Accept, and the clock tells the truth (P2, 60 s)

**Click (supervisor window):** **Confirm machine running**. Tick **I confirm the technician was present at this site.** Enter PIN **4826**. **Accept this exact report**.

**P2:** "Acceptance needs the supervisor's PIN *and* their registered device, on the exact report they saw. The SLA result is computed from the recorded events. Nobody types it. Rivet then signs a copy of the machine's history."

### 10. Proof the customer can check without us (P2, `/verify`, 90 s)

**Click:** step 1 **Show published key**. Read the fingerprint aloud ("compare it with your contract"). Click **Pin key**. Step 2 type **J-2231**, **Load service package**.

**P2:** "The customer pins our public key once. Now the page checks our Ed25519 signature, the hash chain of every event, the report fingerprint, and recomputes the SLA itself. Green: *Service record verified*."

**Click:** **Remember verified head**.

**P2:** "The customer keeps the latest chain head on their own device. Even if we rewrote and re-signed history, it would not extend the head they hold."

**Click:** **Download package**. Open the file in Notepad, change `"acceptance": "Verified"` to `"Accepted"`, save. Back on the page, upload the edited file.

**P2:** "One word changed." (red **Verification failed**) "And the same check works offline, in a standalone page, with no network."

### 11. Close (P1 then P2, 40 s)

**Click (P1):** **Machine passports**, pick **M-104**.

**P1:** "The machine now has a passport: every job, how it was accepted, one-click verify. That record belongs to the customer, not to us."

**P2:** "Ledger, cascade, recovery, proof, on one engine. The whole M-104 morning is an automated test that runs over HTTP with nothing mocked. All 149 backend tests pass."

---

## If you only get three minutes

Do **0, 4, 5, 8, 10**, in that order, skipping assign-the-waiting-job, stores, the permit and the portal tour. Presenter 1 does 4 and 5, Presenter 2 does 8 and 10.

---

## Questions you will get, and honest answers

| Question | Answer |
| --- | --- |
| How is this different from ServiceNow, Salesforce, IFS, Zoho FSM? | They optimise the provider's calendar, and a customer signature on the provider's own report is as far as it goes. Rivet manages the commitments behind the job, and the record is verifiable by the customer. |
| Can the provider just edit history? | A naive edit breaks the signature or the chain. A full rewrite and re-sign passes internal checks, which is why the customer keeps a head they hold: it will not extend. |
| Two coordinators at once? | Writes carry job versions (`VERSION_CONFLICT`) and a plan can be decided once (`PLAN_ALREADY_DECIDED`); the loser is told who won and when. |
| Offline? | The field app queues every action on the device with a sequence number and replays in order. A report sent before work started is refused with a reason, and the app now shows it. |
| What is simulated? | Machine telemetry is an explicitly simulated feed. Demo sign-in is demo-only and says so. Real sign-in on the hosted site is email via Supabase. |
| What isn't built yet? | A native Android app (the web field app is the offline client today), MQTT ingest, device-signed commands, CI that runs the thesis test, the admin forms beyond the workflow editor, and priority contention between jobs. Say it before they ask. |

## If something goes wrong

- **Blank or slow screens:** the API is waking up. Say "free hosting tier", wait 30 to 60 seconds, reload.
- **Phone problems:** do the field steps in a window signed in as **Technician · Priya**. The app is the same.
- **Camera or scanner won't work:** key in `HS-40` for the part; use any image for the photos.
- **Something unexpected after a bad run:** as Admin, **Team access → Reset demo data…**, set the clock to 09:02 again.
- **Last resort:** `python demo/demo.py --pause` replays the nine steps in a terminal. It resets the database `DATABASE_URL` points at, so aim it at a scratch database.
