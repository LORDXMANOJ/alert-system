import type { Db } from "./client";
import { addDays, now } from "../clock";
import { audit } from "../audit";
import { runMonitoringChecks } from "../services/monitoring";

/**
 * DEMONSTRATION DATA ONLY. All institutions, people, applications and documents are fictional.
 * Every date is relative to the demo clock, so the scenarios stay meaningful on any day.
 * Names of places are used for flavour and do not refer to real institutions.
 */

const CL = {
  scrutiny: ["Application form complete", "Mandatory particulars verified", "Supporting documents present", "Discrepancies checked against records"],
  rescrutiny: ["Previous observations addressed", "Corrections verified against submitted evidence"],
  committee: ["Committee observations recorded", "Submitted evidence reviewed"],
  decision: ["Competent authority reviewed the history and observations"],
};

type StageDef = { name: string; role: string; days: number; evc?: boolean; committee?: boolean; decision?: boolean; checklist?: string[] };

const TEMPLATES: { id: string; name: string; category: string; description: string; stages: StageDef[] }[] = [
  {
    id: "t-scrutiny", name: "Scrutiny only", category: "Infrastructure revision",
    description: "One scrutiny stage, then the competent decision.",
    stages: [
      { name: "Scrutiny", role: "bureau", days: 15, checklist: CL.scrutiny },
      { name: "Competent decision", role: "authority", days: 10, decision: true, checklist: CL.decision },
    ],
  },
  {
    id: "t-scrutiny-evc", name: "Scrutiny + EVC", category: "Program extension",
    description: "Scrutiny, then an Expert Visit Committee visit, then the competent decision.",
    stages: [
      { name: "Scrutiny", role: "bureau", days: 15, checklist: CL.scrutiny },
      { name: "EVC visit", role: "evc", days: 30, evc: true },
      { name: "Competent decision", role: "authority", days: 10, decision: true, checklist: CL.decision },
    ],
  },
  {
    id: "t-evc-only", name: "Only EVC", category: "Re-verification visit",
    description: "An EVC visit, then the competent decision.",
    stages: [
      { name: "EVC visit", role: "evc", days: 30, evc: true },
      { name: "Competent decision", role: "authority", days: 10, decision: true, checklist: CL.decision },
    ],
  },
  {
    id: "t-evc-committee", name: "EVC + committee review", category: "Annual compliance",
    description: "An EVC visit, a committee review, then the competent decision.",
    stages: [
      { name: "EVC visit", role: "evc", days: 30, evc: true },
      { name: "Committee review", role: "reviewer", days: 20, committee: true, checklist: CL.committee },
      { name: "Competent decision", role: "authority", days: 10, decision: true, checklist: CL.decision },
    ],
  },
  {
    id: "t-full", name: "Scrutiny, re-scrutiny, EVC and decision", category: "New institution",
    description: "Scrutiny, re-scrutiny, EVC visit, then the competent decision.",
    stages: [
      { name: "Scrutiny", role: "bureau", days: 15, checklist: CL.scrutiny },
      { name: "Re-scrutiny", role: "reviewer", days: 10, checklist: CL.rescrutiny },
      { name: "EVC visit", role: "evc", days: 30, evc: true },
      { name: "Competent decision", role: "authority", days: 10, decision: true, checklist: CL.decision },
    ],
  },
];

const REGIONS = [
  { id: "r-north", name: "North" },
  { id: "r-south", name: "South" },
  { id: "r-east", name: "East" },
  { id: "r-west", name: "West" },
  { id: "r-central", name: "Central" },
];

const INSTITUTIONS = [
  { id: "inst-vindhya", name: "Vindhya Institute of Technology (Demo)", region: "r-central", city: "Bhopal", isNew: false },
  { id: "inst-narmada", name: "Narmada Engineering College (Demo)", region: "r-central", city: "Jabalpur", isNew: false },
  { id: "inst-godavari", name: "Godavari Institute of Management (Demo)", region: "r-south", city: "Vijayawada", isNew: false },
  { id: "inst-kaveri", name: "Kaveri Polytechnic (Demo)", region: "r-south", city: "Mysuru", isNew: false },
  { id: "inst-cauvery", name: "Cauvery Institute of Architecture (Demo)", region: "r-south", city: "Tiruchirappalli", isNew: false },
  { id: "inst-ganga", name: "Ganga Valley Technical Institute (Demo)", region: "r-east", city: "Patna", isNew: false },
  { id: "inst-himalaya", name: "Himalaya School of Engineering (Demo)", region: "r-north", city: "Dehradun", isNew: true },
  { id: "inst-sahyadri", name: "Sahyadri College of Applied Sciences (Demo)", region: "r-west", city: "Pune", isNew: true },
];

const USERS = [
  { id: "u-admin", name: "Dr. Asha Verma", designation: "Demo administrator", role: "admin", region: null, inst: null },
  { id: "u-regional", name: "Ravi Kumar", designation: "Demo regional officer, Central", role: "regional", region: "r-central", inst: null },
  { id: "u-bureau", name: "Meera Nair", designation: "Demo bureau officer", role: "bureau", region: null, inst: null },
  { id: "u-evc", name: "Suresh Pillai", designation: "Demo EVC coordinator", role: "evc", region: null, inst: null },
  { id: "u-reviewer", name: "Anita Desai", designation: "Demo committee reviewer", role: "reviewer", region: null, inst: null },
  { id: "u-authority", name: "Prof. Vikram Rao", designation: "Demo competent authority", role: "authority", region: null, inst: null },
  { id: "u-auditor", name: "Farah Sheikh", designation: "Demo auditor (read-only)", role: "auditor", region: null, inst: null },
  { id: "u-inst-vindhya", name: "Demo user, Vindhya", designation: "Institution user", role: "institution", region: null, inst: "inst-vindhya" },
  { id: "u-inst-narmada", name: "Demo user, Narmada", designation: "Institution user", role: "institution", region: null, inst: "inst-narmada" },
  { id: "u-inst-himalaya", name: "Demo user, Himalaya", designation: "Institution user", role: "institution", region: null, inst: "inst-himalaya" },
];

const RULES = [
  {
    id: "R-STAGE", name: "Stage deadline", recordType: "application", thresholds: "3,1,0", severity: "warning",
    responsible: "bureau", escalation: 3,
    description: "Warns before, and flags when overdue, the deadline of the current stage. The stage owner is responsible.",
  },
  {
    id: "R-EVC", name: "EVC scheduling and visit", recordType: "evc", thresholds: "14,7,1,0", severity: "warning",
    responsible: "evc", escalation: 5,
    description: "Flags EVCs awaiting scheduling and scheduled visits against their target or visit date.",
  },
  {
    id: "R-UT", name: "Undertaking due date", recordType: "undertaking", thresholds: "30,15,7,0", severity: "warning",
    responsible: "institution", escalation: 5,
    description: "Reminds the institution before an undertaking is due and flags it when overdue.",
  },
  {
    id: "R-DOC", name: "Document validity", recordType: "document", thresholds: "30,15,7,0", severity: "warning",
    responsible: "institution", escalation: 7,
    description: "Advance warning before a verified document expires, and an overdue flag after expiry.",
  },
  {
    id: "R-REVIEW", name: "Review turnaround", recordType: "review", thresholds: "1,0", severity: "info",
    responsible: "reviewer", escalation: 3,
    description: "Flags evidence and renewals that have waited too long for review.",
  },
];

/** Placeholder bytes for demo files. They are labelled as demo content inside the file. */
function demoFile(label: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n% DEMONSTRATION PLACEHOLDER - fictional sample: ${label}\n%%EOF\n`);
}

type AppSeed = {
  id: string; title: string; inst: string; tpl: string; pos: number; status: "in_progress" | "clarification" | "decided";
  submittedAgo: number; elapsed: number; priority?: "normal" | "high";
  decision?: "approved" | "deferred" | "rejected"; reason?: string;
  evc?: { status: string; targetIn: number; scheduledIn?: number; completedAgo?: number };
};

const APPS: AppSeed[] = [
  { id: "APF-2026-0001", title: "B.Tech Artificial Intelligence: program extension", inst: "inst-vindhya", tpl: "t-scrutiny-evc", pos: 1, status: "in_progress", submittedAgo: 4, elapsed: 3 },
  { id: "APF-2026-0002", title: "Additional laboratory block", inst: "inst-narmada", tpl: "t-scrutiny", pos: 1, status: "clarification", submittedAgo: 20, elapsed: 12, priority: "high" },
  { id: "APF-2026-0003", title: "MBA (Business Analytics) intake", inst: "inst-godavari", tpl: "t-scrutiny-evc", pos: 2, status: "in_progress", submittedAgo: 40, elapsed: 35, evc: { status: "awaiting_scheduling", targetIn: -21 } },
  { id: "APF-2026-0004", title: "Himalaya campus: new institution", inst: "inst-himalaya", tpl: "t-full", pos: 3, status: "in_progress", submittedAgo: 70, elapsed: 6, evc: { status: "scheduled", targetIn: -2, scheduledIn: 2 } },
  { id: "APF-2026-0005", title: "Sahyadri campus: new institution", inst: "inst-sahyadri", tpl: "t-full", pos: 2, status: "in_progress", submittedAgo: 28, elapsed: 14, priority: "high" },
  { id: "APF-2026-0006", title: "Civil engineering diploma: annual compliance", inst: "inst-kaveri", tpl: "t-evc-committee", pos: 1, status: "in_progress", submittedAgo: 30, elapsed: 22, evc: { status: "awaiting_scheduling", targetIn: -8 } },
  { id: "APF-2026-0007", title: "Architecture studio re-verification", inst: "inst-cauvery", tpl: "t-evc-only", pos: 1, status: "in_progress", submittedAgo: 10, elapsed: 4, evc: { status: "scheduled", targetIn: 10, scheduledIn: 9 } },
  { id: "APF-2026-0008", title: "Workshop block for mechanical labs", inst: "inst-ganga", tpl: "t-scrutiny", pos: 2, status: "in_progress", submittedAgo: 26, elapsed: 6 },
  { id: "APF-2026-0009", title: "Diploma in civil engineering: program extension", inst: "inst-kaveri", tpl: "t-scrutiny-evc", pos: 1, status: "in_progress", submittedAgo: 2, elapsed: 1 },
  { id: "APF-2026-0010", title: "Hostel and library expansion: annual compliance", inst: "inst-narmada", tpl: "t-evc-committee", pos: 2, status: "in_progress", submittedAgo: 50, elapsed: 9, evc: { status: "completed", targetIn: -30, completedAgo: 14 } },
  { id: "APF-2026-0011", title: "Seminar hall and management wing: new institution", inst: "inst-vindhya", tpl: "t-full", pos: 4, status: "in_progress", submittedAgo: 90, elapsed: 4, evc: { status: "completed", targetIn: -60, completedAgo: 30 } },
  { id: "APF-2026-0012", title: "M.Sc Data Science: program extension", inst: "inst-godavari", tpl: "t-scrutiny-evc", pos: 3, status: "decided", submittedAgo: 120, elapsed: 5, decision: "approved", reason: "Scrutiny and EVC completed. Outcome recorded by the competent authority.", evc: { status: "closed", targetIn: -90, completedAgo: 60 } },
  { id: "APF-2026-0013", title: "Hostel block: infrastructure revision", inst: "inst-narmada", tpl: "t-scrutiny", pos: 2, status: "decided", submittedAgo: 75, elapsed: 20, decision: "deferred", reason: "Deferred until the fire-safety undertaking is verified." },
  { id: "APF-2026-0014", title: "Re-verification of Ganga Valley workshops", inst: "inst-ganga", tpl: "t-evc-only", pos: 2, status: "in_progress", submittedAgo: 45, elapsed: 3, evc: { status: "completed", targetIn: -20, completedAgo: 6 } },
  { id: "APF-2026-0015", title: "Himalaya annual compliance review", inst: "inst-himalaya", tpl: "t-evc-committee", pos: 1, status: "in_progress", submittedAgo: 15, elapsed: 5, evc: { status: "scheduled", targetIn: 9, scheduledIn: 4 } },
  { id: "APF-2026-0016", title: "Cauvery architecture studio: infrastructure revision", inst: "inst-cauvery", tpl: "t-scrutiny", pos: 1, status: "in_progress", submittedAgo: 3, elapsed: 2 },
  { id: "APF-2026-0017", title: "Sahyadri applied sciences lab: program extension", inst: "inst-sahyadri", tpl: "t-scrutiny-evc", pos: 1, status: "in_progress", submittedAgo: 9, elapsed: 9 },
];

const UNDERTAKINGS = [
  { id: "UT-0001", inst: "inst-narmada", app: "APF-2026-0010", condition: "Renew the fire-safety certificate for the hostel block and share the maintenance log.", evidence: "Fire-safety certificate (PDF, PNG or JPG) and a maintenance log.", issuedAgo: 60, dueIn: 20, status: "submitted" },
  { id: "UT-0002", inst: "inst-vindhya", app: "APF-2026-0011", condition: "Complete the seminar hall construction as per the approved plan.", evidence: "Completion photographs and the engineer's completion note.", issuedAgo: 40, dueIn: 5, status: "active" },
  { id: "UT-0003", inst: "inst-kaveri", app: "APF-2026-0006", condition: "Submit the annual lease renewal for the polytechnic campus.", evidence: "Renewed lease deed (PDF).", issuedAgo: 75, dueIn: -6, status: "active" },
  { id: "UT-0004", inst: "inst-himalaya", app: "APF-2026-0015", condition: "Provide a land-use permission letter for the new lab wing.", evidence: "Land-use permission letter (PDF).", issuedAgo: 30, dueIn: 12, status: "correction_requested" },
  { id: "UT-0005", inst: "inst-godavari", app: "APF-2026-0012", condition: "Provide the building safety certificate before the intake begins.", evidence: "Building safety certificate (PDF).", issuedAgo: 100, dueIn: -10, status: "verified" },
  { id: "UT-0006", inst: "inst-ganga", app: "APF-2026-0014", condition: "Install the approved ventilation system in the workshop.", evidence: "Installation completion note with photographs.", issuedAgo: 20, dueIn: 30, status: "active" },
];

type DocSeed = {
  id: string; inst: string; category: string; title: string; app?: string;
  versions: { no: number; expiresIn: number; status: "accepted" | "pending" | "returned"; uploadedAgo: number; remarks?: string }[];
};

const DOCUMENTS: DocSeed[] = [
  { id: "DOC-0001", inst: "inst-vindhya", category: "Lease deed", title: "Campus lease deed (Vindhya)", versions: [{ no: 1, expiresIn: 6, status: "accepted", uploadedAgo: 380 }] },
  { id: "DOC-0002", inst: "inst-narmada", category: "Land-use permission", title: "Land-use permission (Narmada hostel)", versions: [{ no: 1, expiresIn: 28, status: "accepted", uploadedAgo: 340 }] },
  { id: "DOC-0003", inst: "inst-godavari", category: "Building safety certificate", title: "Building safety certificate (Godavari)", versions: [{ no: 1, expiresIn: -3, status: "accepted", uploadedAgo: 368 }] },
  { id: "DOC-0004", inst: "inst-kaveri", category: "Lease deed", title: "Lease deed (Kaveri campus)", versions: [{ no: 1, expiresIn: 14, status: "accepted", uploadedAgo: 350 }, { no: 2, expiresIn: 380, status: "pending", uploadedAgo: 2 }] },
  { id: "DOC-0005", inst: "inst-himalaya", category: "Land-use permission", title: "Land-use permission (Himalaya)", versions: [{ no: 1, expiresIn: 90, status: "accepted", uploadedAgo: 200 }] },
  { id: "DOC-0006", inst: "inst-sahyadri", category: "Fire safety certificate", title: "Fire-safety certificate (Sahyadri)", versions: [{ no: 1, expiresIn: 0.5, status: "accepted", uploadedAgo: 360 }] },
  { id: "DOC-0007", inst: "inst-ganga", category: "Lease deed", title: "Lease deed (Ganga Valley, renewed)", versions: [{ no: 1, expiresIn: -40, status: "accepted", uploadedAgo: 420, remarks: "Superseded by version 2." }, { no: 2, expiresIn: 300, status: "accepted", uploadedAgo: 45, remarks: "Renewal verified against the registered deed." }] },
  { id: "DOC-0008", inst: "inst-cauvery", category: "Building safety certificate", title: "Building safety certificate (Cauvery)", versions: [{ no: 1, expiresIn: 200, status: "pending", uploadedAgo: 4 }] },
  { id: "DOC-0009", inst: "inst-narmada", category: "Fire safety certificate", title: "Fire-safety certificate (Narmada)", versions: [{ no: 1, expiresIn: 10, status: "accepted", uploadedAgo: 355 }] },
];

const day = (base: Date, n: number) => addDays(base, n);

export async function seedDemo(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO system_settings (key, value) VALUES ('clock_offset_days', '0') ON CONFLICT (key) DO UPDATE SET value = '0'");
    const base = now();

    for (const r of REGIONS) await tx.query("INSERT INTO regions (id, name) VALUES ($1, $2)", [r.id, r.name]);
    for (const i of INSTITUTIONS) {
      await tx.query("INSERT INTO institutions (id, name, region_id, city, is_new) VALUES ($1,$2,$3,$4,$5)", [i.id, i.name, i.region, i.city, i.isNew]);
    }
    for (const u of USERS) {
      await tx.query(
        "INSERT INTO users (id, name, designation, role, region_id, institution_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [u.id, u.name, u.designation, u.role, u.region, u.inst],
      );
    }

    const tplById = new Map(TEMPLATES.map((t) => [t.id, t]));
    for (const t of TEMPLATES) {
      await tx.query(
        "INSERT INTO workflow_templates (id, name, description, category) VALUES ($1,$2,$3,$4)",
        [t.id, t.name, t.description, t.category],
      );
      for (const [idx, s] of t.stages.entries()) {
        await tx.query(
          `INSERT INTO workflow_stages (template_id, position, name, role, target_days, is_evc, is_committee, is_decision, checklist)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [t.id, idx + 1, s.name, s.role, s.days, !!s.evc, !!s.committee, !!s.decision, JSON.stringify(s.checklist ?? [])],
        );
      }
    }

    const roleUser: Record<string, string> = { bureau: "u-bureau", evc: "u-evc", reviewer: "u-reviewer", authority: "u-authority" };
    const instUser: Record<string, string> = { "inst-vindhya": "u-inst-vindhya", "inst-narmada": "u-inst-narmada", "inst-himalaya": "u-inst-himalaya" };
    const regionOf = new Map(INSTITUTIONS.map((i) => [i.id, i.region]));

    for (const a of APPS) {
      const tpl = tplById.get(a.tpl)!;
      const stage = tpl.stages[a.pos - 1];
      const submittedAt = day(base, -a.submittedAgo);
      const stageEntered = day(base, -a.elapsed);
      const due = day(stageEntered, stage.days);
      const lastAction = stageEntered;
      await tx.query(
        `INSERT INTO applications (id, title, institution_id, region_id, template_id, category, stage_position, status, priority,
           submitted_at, stage_entered_at, due_at, last_action_at, decision, decision_reason, clarification_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          a.id, a.title, a.inst, regionOf.get(a.inst)!, tpl.id, tpl.category, a.pos, a.status, a.priority ?? "normal",
          submittedAt, stageEntered, due, lastAction,
          a.decision ?? null, a.decision === undefined ? null : a.reason ?? null,
          a.status === "clarification" ? "Please attach the revised building plan and the fire-safety certificate." : null,
        ],
      );

      // Timeline: submission, earlier stage completions, then the current state.
      const events: { type: string; actor: string; role: string; from?: number; to?: number; reason?: string; detail: string; at: Date }[] = [
        { type: "submitted", actor: instUser[a.inst] ?? "u-admin", role: "institution", to: 1, detail: "Application submitted (demonstration data).", at: submittedAt },
      ];
      const span = a.submittedAgo - a.elapsed;
      for (let p = 1; p < a.pos; p++) {
        const owner = tpl.stages[p - 1];
        events.push({
          type: "stage_completed", actor: roleUser[owner.role] ?? "u-admin", role: owner.role, from: p, to: p + 1,
          detail: `${owner.name} completed.`, at: day(submittedAt, (span * p) / a.pos),
        });
      }
      if (a.evc) {
        events.push({ type: "evc_queued", actor: "u-admin", role: "admin", detail: "Placed in the EVC queue (awaiting scheduling).", at: stageEntered });
        if (a.evc.scheduledIn !== undefined) {
          events.push({ type: "evc_scheduled", actor: "u-evc", role: "evc", detail: "Visit scheduled (demonstration data).", at: day(base, -2) });
        }
        if (a.evc.completedAgo !== undefined) {
          events.push({ type: "evc_visit_completed", actor: "u-evc", role: "evc", detail: "Visit completed; observations recorded (demonstration data).", at: day(base, -a.evc.completedAgo) });
        }
      }
      if (a.status === "clarification") {
        events.push({ type: "returned_for_clarification", actor: roleUser[stage.role] ?? "u-admin", role: stage.role, from: a.pos, reason: "Please attach the revised building plan and the fire-safety certificate.", detail: "Returned for clarification.", at: lastAction });
      }
      if (a.status === "decided") {
        events.push({ type: "decision_recorded", actor: "u-authority", role: "authority", from: a.pos, reason: a.reason, detail: `Outcome recorded by the competent authority: ${a.decision}.`, at: lastAction });
      }
      for (const e of events) {
        await tx.query(
          `INSERT INTO application_events (application_id, actor_id, actor_role, type, from_stage, to_stage, reason, detail, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [a.id, e.actor, e.role, e.type, e.from ?? null, e.to ?? null, e.reason ?? null, e.detail, e.at],
        );
      }

      if (a.evc) {
        const target = day(base, a.evc.targetIn);
        await tx.query(
          `INSERT INTO evc_records (id, application_id, status, target_date, scheduled_date, completed_date, coordinator_id, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
          [
            `EVC-${a.id}`, a.id, a.evc.status, target,
            a.evc.scheduledIn !== undefined ? day(base, a.evc.scheduledIn) : null,
            a.evc.completedAgo !== undefined ? day(base, -a.evc.completedAgo) : null,
            a.evc.scheduledIn !== undefined || a.evc.completedAgo !== undefined ? "u-evc" : null,
            a.evc.completedAgo !== undefined ? "Visit completed (demonstration data)." : "",
            stageEntered,
          ],
        );
      }
    }

    for (const f of [
      { id: "F-DEMO-0001", inst: "inst-narmada", name: "fire-safety-certificate-demo.pdf", by: "u-inst-narmada" },
      { id: "F-DEMO-0002", inst: "inst-vindhya", name: "seminar-hall-photos-demo.pdf", by: "u-inst-vindhya" },
      { id: "F-DEMO-0003", inst: "inst-himalaya", name: "land-use-letter-demo.pdf", by: "u-inst-himalaya" },
    ]) {
      await tx.query(
        "INSERT INTO files (id, institution_id, name, mime, size, data, uploaded_by, created_at) VALUES ($1,$2,$3,'application/pdf',$4,$5,$6,$7)",
        [f.id, f.inst, f.name, demoFile(f.name).length, demoFile(f.name), f.by, base],
      );
    }
    for (const u of UNDERTAKINGS) {
      const issued = day(base, -u.issuedAgo);
      const verifiedAt = u.status === "verified" ? day(base, -10) : null;
      await tx.query(
        `INSERT INTO undertakings (id, institution_id, application_id, condition, evidence_required, issued_at, due_at, status, verified_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'u-bureau',$6)`,
        [u.id, u.inst, u.app, u.condition, u.evidence, issued, day(base, u.dueIn), u.status, verifiedAt],
      );
    }

    await tx.query(
      `INSERT INTO undertaking_submissions (undertaking_id, version_no, note, file_id, submitted_by, submitted_at, review_status, remarks)
       VALUES ('UT-0001', 1, 'Certificate renewed; log attached (demonstration data).', 'F-DEMO-0001', 'u-inst-narmada', $1, 'pending', NULL)`,
      [day(base, -3)],
    );
    await tx.query(
      `INSERT INTO undertaking_submissions (undertaking_id, version_no, note, file_id, submitted_by, submitted_at, review_status, reviewer_id, remarks, reviewed_at)
       VALUES ('UT-0004', 1, 'Permission letter attached (demonstration data).', 'F-DEMO-0003', 'u-inst-himalaya', $1, 'correction_requested', 'u-reviewer', 'The letter must name the new lab wing and carry the date of issue.', $2)`,
      [day(base, -8), day(base, -6)],
    );
    await tx.query(
      "INSERT INTO files (id, institution_id, name, mime, size, data, uploaded_by, created_at) VALUES ('F-DEMO-0004','inst-godavari','safety-certificate-demo.pdf','application/pdf',$1,$2,'u-admin',$3)",
      [demoFile("safety").length, demoFile("safety"), base],
    );
    await tx.query(
      `INSERT INTO undertaking_submissions (undertaking_id, version_no, note, file_id, submitted_by, submitted_at, review_status, reviewer_id, remarks, reviewed_at)
       VALUES ('UT-0005', 1, 'Safety certificate attached (demonstration data).', 'F-DEMO-0004', 'u-admin', $1, 'accepted', 'u-reviewer', 'Certificate verified against the issuing record.', $2)`,
      [day(base, -40), day(base, -38)],
    );

    for (const d of DOCUMENTS) {
      await tx.query(
        "INSERT INTO documents (id, institution_id, application_id, category, title, created_at) VALUES ($1,$2,NULL,$3,$4,$5)",
        [d.id, d.inst, d.category, d.title, day(base, -400)],
      );
      let prevId: number | null = null;
      for (const v of d.versions) {
        const fileId = `F-${d.id}-${v.no}`;
        const uploader = instUser[d.inst] ?? "u-inst-narmada";
        await tx.query(
          "INSERT INTO files (id, institution_id, name, mime, size, data, uploaded_by, created_at) VALUES ($1,$2,$3,'application/pdf',$4,$5,$6,$7)",
          [fileId, d.inst, `${d.id}-v${v.no}.pdf`, demoFile(d.id).length, demoFile(d.id), uploader, day(base, -v.uploadedAgo)],
        );
        const reviewed = v.status !== "pending";
        const ins: { rows: { id: number }[] } = await tx.query<{ id: number }>(
          `INSERT INTO document_versions (document_id, version_no, expires_at, file_id, uploaded_by, submitted_at,
             review_status, reviewer_id, remarks, reviewed_at, replaces_version_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            d.id, v.no, day(base, v.expiresIn), fileId, uploader, day(base, -v.uploadedAgo), v.status,
            reviewed ? "u-reviewer" : null, v.remarks ?? null, reviewed ? day(base, -v.uploadedAgo + 1) : null, prevId,
          ],
        );
        prevId = ins.rows[0].id;
      }
    }

    for (const r of RULES) {
      await tx.query(
        `INSERT INTO alert_rules (id, name, record_type, description, thresholds_days, severity, responsible_role, escalation_delay_days, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
        [r.id, r.name, r.recordType, r.description, r.thresholds, r.severity, r.responsible, r.escalation],
      );
    }

    await audit(tx, null, "system.seeded", "system", null, {
      note: "Demonstration data loaded. All records are fictional.",
      applications: APPS.length,
      undertakings: UNDERTAKINGS.length,
      documents: DOCUMENTS.length,
    });
  });

  // The first monitoring pass runs after the seed transaction, so alerts and escalations exist from the start.
  await runMonitoringChecks(db, null);
}

