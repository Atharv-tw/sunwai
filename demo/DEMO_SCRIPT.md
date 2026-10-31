# Demo video script (≤5 min, screen + voice)

Record with the swarm view (`/swarm.html`) on one half of the screen, the student/staff screens on the other.
Use the real app with `MEKO_ENABLED=on` and a fresh `data/sunwai.db`. Never record against `data/fake.db`.
Anything scripted is badged SCRIPTED on screen; say so out loud.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Swarm view, `MEKO ON`, empty graph | "Sunwai: campus complaints that get remembered. Every dot you'll see is a real Meko call." |
| 0:20 | Student screen: geyser complaint in Hostel A | "A student complains in their own words." Point at the first read edge (Desk recalls) and the write into `sunwai-desk`. |
| 1:00 | Staff screen: plan with context cards | "The Hostel agent recalled last winter's fix. Each card shows the Meko memory id; nothing is shown that Meko didn't return." |
| 1:40 | Electricity form: record power cut | "Electricity staff write a note. Watch the orange edge land in the Hostel datapack. The ETA now says why." |
| 2:10 | Record fix, students confirm, warden approves lesson | "Agents never promote alone. Student confirms, warden approves, then the yellow edge goes to canon." |
| 2:50 | Click `Canon` node, side panel | "Counters: notes, reads, promotions, directives, approvals, errors. All from the log." |
| 3:10 | 40 Wi-Fi complaints (burst) | "Forty complaints in different wording, one incident. Reads spike, one write." |
| 3:40 | Geyser complaint in Hostel B | "The case that must benefit: it arrives with the verified fix and an honest ETA." |
| 4:10 | Flip `MEKO_ENABLED=off`, reload swarm view | "Same flow, Meko off. No recall, no notes, nothing verified. The view goes dark." |
| 4:40 | Replay slider | "And I can replay the whole run from the log." |
| 4:55 | Repo link, team | "Team Syzygy: Atharv, Arun, Alok. Meko, YugabyteDB, hackCBS 9.0." |

Before recording: run the 5-minute window (`5 min`), close the admin box, projector size 1366×768.
