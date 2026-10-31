# Feature proposal: attested promotion

**Team Syzygy (Sunwai), hackCBS 9.0, Meko Track B.** Draft from our friction log (`research.md`), 1 Nov 2026.

**One line:** let a memory be promoted only once the people it affects have attested to it, keep who attested
(as pseudonymous ids) on the promoted memory, and let a later "it didn't hold" mark it disputed instead of leaving
canon silently wrong.

## 1. The friction, and how we worked around it

Sunwai's whole idea is *verified* campus memory (D-004). A caretaker's fix becomes a lesson only when the
students who reported the fault confirm it held and the warden approves. Only then is it promoted to
`sunwai-canon`, which later cases recall and the Dean reads. Meko gives us the two tiers (private memory →
promoted knowledge) but none of the verification, so we built it beside Meko:

| What we needed | What Meko has today | Our workaround |
|---|---|---|
| Promote only after N students confirm and one warden approves | `memory_promote` is one call by an owner or maintainer key, with no conditions | A state machine in our SQLite (`sunwai/orchestrator.py`) decides when to call `memory_promote` |
| Know *who* verified a canon lesson | Promoted rows carry the promoter's **name and email**, which for an app is always the key owner (Atharv), never the students or the warden | Separate "student confirmed" and "warden approved" memories (6 approval writes in our rehearsal), not linked to the lesson they approve; the lesson text says "held for 2 students, approved by the warden" as free text |
| Say a canon lesson stopped working | Promotion is one-way; promoted memories can't be edited | A "FIX DID NOT HOLD" note in the department's datapack, in the hope that recall surfaces it beside the lesson |
| Fix a mistake in canon | Re-promote under a new id (we did this for clashing decisions D-020/D-021 → D-025/D-026); the old one stays forever | None: the wrong copy is still found by `knowledgebase_search` |

The privacy side is real too: every `memory_get_all(promoted=true)` row returned a person's email, so our
client has to strip it before anything is shown (friction log, 31 Oct).

## 2. The feature, in Meko's terms

Meko's learnings already move through zones: private → review → institutional, with promotion as a reviewer
decision captured in the trace. **Attested promotion** makes the review step something the affected people
take part in, and keeps the result on the memory itself:

- A **promotion proposal** names a memory and a **policy**: who must attest (roles or listed attester ids), how
  many, and who approves. The memory sits in the review zone while the proposal is open.
- **Attestations** are small signed facts: attester id (pseudonymous, chosen by the app), role, verdict
  (`held` / `broken` / `approve` / `reject`), time, optional note. Meko promotes atomically once the policy
  is met.
- The promoted memory carries **provenance**: counts per verdict, roles, attester ids, and the proposal id.
  Search results expose it, so an agent can say "verified by 2 students, approved by the warden" from Meko's
  record, not from text the app wrote.
- After promotion, `broken` attestations past a threshold mark the memory **disputed**. It is not deleted:
  search ranks it lower and returns the dispute with it. A new memory can **supersede** it.

## 3. MCP interface

Two new tools, and two new fields on existing results.

```jsonc
// tools/call memory_propose_promotion
{
  "conversation_id": "c0ffee…",
  "datapack_id": "canon-uuid",
  "memory_id": "a2b0bc2b-2576-4a87-9b60-dcb0ed8131a1",
  "policy": {
    "attest": {"role": "student", "verdict": "held", "min": 1, "from": ["S-600b", "S-2d71", "S-91fe"]},
    "approve": {"role": "warden", "min": 1},
    "dispute_after": {"verdict": "broken", "min": 2},
    "expires_in": "7d"
  }
}
// result
{"proposal_id": "prp_7f3a", "status": "open", "zone": "review", "needs": {"held": 1, "approve": 1}}
```

```jsonc
// tools/call memory_attest
{"conversation_id": "c0ffee…", "proposal_id": "prp_7f3a", "attester": "S-600b", "role": "student",
 "verdict": "held", "note": "hot water back since 10 pm"}
// result
{"proposal_id": "prp_7f3a", "status": "open", "needs": {"held": 0, "approve": 1}}

// …the warden's {"attester": "warden-hostel", "role": "warden", "verdict": "approve"} then returns
{"proposal_id": "prp_7f3a", "status": "promoted", "memory_id": "a2b0bc2b-…",
 "provenance": {"held": 2, "broken": 0, "approved_by": ["warden"], "attesters": ["S-600b", "S-2d71", "warden-hostel"]}}
```

`knowledgebase_search` and `memory_get_all(promoted=true)` gain `provenance` and `status`
(`verified` | `disputed` | `superseded`) per row, plus a filter such as `min_held: 2` or `exclude: ["disputed"]`.
`memory_attest` on an already promoted memory (`memory_id` instead of `proposal_id`) records late
confirmations and disputes. The promoter's email is no longer part of these responses; `provenance` replaces it.

## 4. Before and after

*February. The geyser on Hostel C's 1st floor stops heating.*

**Today.** The Hostel agent recalls canon and finds the November lesson from Hostel A: "reset the breaker and
set the thermostat to 55C, about 40 min". But in January that same fix failed twice in Hostel B (a failed
heating element, not the thermostat). Those failures sit as "FIX DID NOT HOLD" notes in `sunwai-hostel`, where
a semantic recall may or may not rank them next to the lesson. The plan says "Verified fix. Do this first.", the
ETA says 40 min, and the Dean counts the geyser lesson as one more verified fix.

**With attested promotion.** The January "still broken" taps were `memory_attest(verdict: "broken")` on the
lesson itself. The search result for Hostel C comes back `status: "disputed"`, `held: 2, broken: 2`. The
agent's plan says "Verified in Hostel A, but failed twice in Hostel B since: check the heating element too", the
ETA uses the longer failed-case duration, and the Dean's pattern excludes disputed lessons. Nothing app-side
had to keep the link.

## 5. Why no context layer does this today

Memory layers decide what to keep by extraction (an LLM says something is a fact) and sometimes rank it by
recency or confidence. As far as we could find, none of them, including mem0, which Meko builds on, records
*who* vouched for a memory, or lets the people a memory is about confirm or dispute it. Meko is the closest:
it already has a review zone, owner/maintainer roles, and one-way promotion into shared knowledge. Attestation
is the missing step between "an agent wrote it" and "the institution trusts it", and it belongs in the context
layer, because every multi-agent team (a campus, a support desk, an on-call rotation) otherwise rebuilds the same
state machine beside it, as we did.

## 6. Risks and limits

- **Privacy.** Attester ids must be pseudonymous app ids (`S-600b`), never emails. Meko stores ids and counts;
  the app keeps any mapping. Notes are scrubbed like any memory write. Today's email-in-every-promoted-row goes
  away.
- **Abuse.** Fake attestations (one student, ten ids) or a brigade disputing a good lesson. Mitigations: the
  policy can list allowed attesters (we know who reported the fault), one attestation per attester per proposal,
  approval roles bound to API keys or datapack roles, and disputes need a threshold *and* show their notes.
- **Cost.** An attestation is one small row, not an embedding; proposals expire (`expires_in`), so open ones
  don't pile up. Search pays one extra join for `provenance`.
- **Limits.** Meko can't know whether the geyser really works: it records who *said* it did. Identity stays the
  app's job. Promotion stays one-way; "disputed" and "superseded" are states, not deletes, so the history the
  Dean relies on survives.
