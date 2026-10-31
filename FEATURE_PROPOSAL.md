# Meko feature proposal: attested promotion

**Team Syzygy (Sunwai), hackCBS 9.0, Meko Track B.** Grounded in our friction log ([research.md](research.md)) and
our build datapack `syzygy-build`, 1 Nov 2026.

**In one line:** let a memory be promoted only once the people it affects have attested to it, keep who attested
(as pseudonymous ids) on the promoted memory, and let a later "it didn't hold" mark it disputed instead of leaving
canon silently wrong.

## 1. The friction, and our workaround

Sunwai's idea is *verified* campus memory (D-004): a fix is promoted to `sunwai-canon` only after the students who
reported the fault confirm it held and the warden approves. Meko gives us the two tiers, private memory and promoted
knowledge, but none of the verification, so we built it beside Meko:

| What we needed | What Meko has today | Our workaround |
|---|---|---|
| Promote only after N students confirm and one warden approves | `memory_promote` is one unconditional call by an owner or maintainer key | A state machine in our SQLite (`sunwai/orchestrator.py`) decides when to call `memory_promote` |
| Know *who* verified a canon lesson | Promoted rows carry the promoter's **name and email**. For an app, that is always the key owner, never the students or the warden | Separate "student confirmed" and "warden approved" memories that nothing links to the lesson, plus "held for N students, approved by the warden" as free text. It goes stale: in our 1 Nov rehearsal a lesson was promoted saying "held for 1 student" after a second student had confirmed |
| Say a canon lesson stopped working | Promotion is one-way, and promoted memories can't be edited | A "FIX DID NOT HOLD" note in the department's datapack, hoping recall ranks it next to the lesson |
| Correct canon | Re-promote under a new id; the old one stays. We did this in `syzygy-build` for clashing decisions (D-020/D-021 became D-025/D-026). Deleting a promoted memory through MCP also failed for us on 1 Nov | Two test lessons stuck in our product canon had to be deleted by hand in the Meko Cloud UI |

Privacy suffers too: every `memory_get_all(promoted=true)` row returned a person's email, so our client strips it
before anything is shown.

## 2. The feature, in Meko's terms

Meko's learnings already move through zones (private, review, institutional). **Attested promotion** lets the
affected people take part in the review step, and keeps the result on the memory:

- A **promotion proposal** names a memory in a datapack and a **policy**: who must attest, how many, and who approves.
  The memory sits in the review zone until the policy is met or the proposal expires.
- **Attestations** are small facts: a pseudonymous attester id chosen by the app, a role, a verdict (`held`,
  `broken`, `approve` or `reject`), the time and an optional note. Meko promotes atomically once the policy is met.
- Who may attest or approve follows datapack sharing: a policy can require that approvals come from a Maintainer key,
  while the app attests for its users under the pseudonymous ids it chose.
- The promoted memory carries **provenance** (counts per verdict, roles, attester ids, proposal id), and search
  returns it: an agent can say "verified by 2 students, approved by the warden" from Meko's record.
- After promotion, enough `broken` attestations mark the memory **disputed**. Nothing is deleted: search ranks it
  lower and returns the dispute with it, and a new memory can **supersede** it.

## 3. The interface

Two new MCP tools, plus new fields on two existing ones.

```jsonc
// tools/call memory_propose_promotion
{"conversation_id": "c0ffee…", "datapack_id": "canon-uuid", "memory_id": "a2b0bc2b-…",
 "policy": {
   "attest": {"role": "student", "verdict": "held", "min": 1, "from": ["S-600b", "S-2d71", "S-91fe"]},
   "approve": {"role": "warden", "min": 1},
   "dispute_after": {"verdict": "broken", "min": 2},
   "expires_in": "7d"}}
// result
{"proposal_id": "prp_7f3a", "status": "open", "zone": "review", "needs": {"held": 1, "approve": 1}}
```

```jsonc
// tools/call memory_attest
{"conversation_id": "c0ffee…", "proposal_id": "prp_7f3a", "attester": "S-600b", "role": "student",
 "verdict": "held", "note": "hot water back since 10 pm"}
// result
{"proposal_id": "prp_7f3a", "status": "open", "needs": {"held": 0, "approve": 1}}

// the warden's {"attester": "warden-hostel", "role": "warden", "verdict": "approve"} then returns
{"proposal_id": "prp_7f3a", "status": "promoted", "memory_id": "a2b0bc2b-…",
 "provenance": {"held": 2, "broken": 0, "approved_by": ["warden"], "attesters": ["S-600b", "S-2d71", "warden-hostel"]}}
```

- `knowledgebase_search` and `memory_get_all(promoted=true)` return `provenance` and a `status` on each row
  (`verified`, `disputed` or `superseded`). They also take filters such as `min_held: 2` or `exclude: ["disputed"]`.
- `memory_attest` with a `memory_id` instead of a `proposal_id` records late confirmations and disputes on a memory
  that is already promoted.
- `provenance` replaces the promoter's email in these responses.

## 4. A scenario, before and after

*November: Hostel A's lesson ("reset the breaker, set the thermostat to 55C, about 40 min") is promoted. January:
the same fix fails twice in Hostel B, where the cause was a burnt heating element. February: a geyser on Hostel A's
3rd floor stops heating.*

**Today.**
- The Hostel agent recalls the November lesson from canon.
- The January failures sit as "FIX DID NOT HOLD" notes in `sunwai-hostel`, where a semantic recall may or may not
  rank them next to the lesson.
- So the plan says "Verified fix. Do this first.", with a 40 min ETA, and the Dean counts the lesson as one more
  verified fix.

**With attested promotion.**
- The January "still broken" taps were `memory_attest(verdict: "broken")` calls on the lesson itself.
- The canon search comes back `status: "disputed"`, `held: 2, broken: 2`.
- The plan says "Verified in Hostel A, but failed twice in Hostel B since: check the heating element too", and the
  ETA uses the longer failed case.
- The Dean's pattern leaves out disputed lessons.
- No app code had to keep the link.

## 5. Why it's new

Memory layers decide what to keep by extraction (a model says something is a fact), and some rank by recency or
confidence. As far as we could find, none of them, including mem0, which Meko builds on, records *who* vouched for
a memory, or lets the people it is about confirm or dispute it. Meko is closest, with a review zone, owner and
maintainer roles, and one-way promotion into shared knowledge. Attestation is the missing step between "an agent
wrote it" and "the institution trusts it". Without it in the context layer, every multi-agent team (a campus, a
support desk, an on-call rotation) rebuilds the same state machine beside it, as we did.

## 6. Risks, and how we'd limit them

- **Privacy.**
  - Attester ids must be pseudonymous app ids (`S-600b`), never emails. Meko stores ids and counts; the app keeps
    any mapping.
  - Notes are scrubbed like any memory write.
  - The email in every promoted row goes away.
- **Abuse.** One student could attest under ten ids, or a group could dispute a good lesson. Limits:
  - the policy lists who may attest (the app knows who reported the fault);
  - one attestation per attester per proposal;
  - approval roles bound to keys or datapack roles;
  - disputes need a threshold, and their notes are shown.
- **Cost.** An attestation is one small row, not an embedding. Proposals expire, so open ones don't pile up. Search
  pays one extra join for `provenance`.
- **Limits.**
  - Meko can't know whether the geyser really works, only who *said* it did. Identity stays the app's job.
  - Promotion stays one-way: "disputed" and "superseded" are states, not deletes, so the history the Dean relies on
    survives.
