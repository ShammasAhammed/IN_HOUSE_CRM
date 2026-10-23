# Using Oppllo One from Claude (the Oppllo MCP): 2 minutes per person

With this connected, anyone on the team can ask Claude (claude.ai, the Claude desktop app or the phone app) about
their work in Oppllo One. They can also have Claude create tasks, change a task's status, comment or log time. Claude
acts as that person, with their permissions, and nothing more: a designer's Claude sees only the designer's clients.
Every action Claude takes is recorded.

It needs no API key and costs Oppllo nothing extra: it runs on each person's own Claude plan.

## Connect (each person, once)
1. In Claude, open **Settings → Connectors** (on a Team or Enterprise plan, the owner adds it once under
   **Organization settings → Connectors**, and people then switch it on).
2. **Add custom connector**. Name: `Oppllo One`. URL: `https://oppllo-one.vercel.app/api/mcp`. Then **Add**.
3. Press **Connect**. Oppllo One opens: sign in with your Google work account if asked, and check that the screen says
   **"Claude wants to use Oppllo One as <your name>"**. Press **Allow**.
4. In a new chat, ask: "Using Oppllo One, what's on my plate today?"

If Oppllo One later moves to another address (for example one.oppllo.com), remove the connector and add it again
with the new URL.

## Disconnect
- Yourself: **My page → Connected AI apps → Disconnect**. It stops working at once.
- The owner can see and disconnect everyone's under **Settings → AI → Connected AI apps**.
- Someone who leaves (marked Left in People) is cut off automatically.

## What Claude can do
The same works from ChatGPT where it's connected the same way: the tools and permissions are the same.

Read: clients, client overview, projects, tasks and their details, my day, the team's week, time logged, who is on
leave, the directory, creatives and the content calendar, Docs pages (search and read, with their tables), meetings,
their decisions and action items, idea boards and templates. Sales roles (owner, BDO, strategists, performance
marketers) also get leads, lead details and the sales dashboard. The owner also has the owner dashboard.
Change: create a task, change a task's status, comment on a task, log time; make boards and draw on them; save and
use templates. Claude is told to confirm with you first. Everything else (fees, leave, approvals, people) stays on the
screens.

## Boards and templates (Stage 13.6)
Claude can build idea boards for you, with your access: where you can only look at a board (view), it can only read
it, and private spaces stay private. Every change is saved like your own (History keeps the earlier version) and
written to the log. Up to 300 stickies or mind-map ideas at a time.

| Tool | What it does |
| --- | --- |
| list_boards, read_board | Find boards; read one as text (frames and sections with their stickies, mind maps as lists) |
| create_board | A new board in a client, space or project, blank or from a template |
| add_stickies | Stickies into a frame or section by its name, or next to what's there |
| create_mind_map | A mind map from an indented list or a tree, in a layout (right, left, both, down, radial) |
| add_section | A named, coloured area, with stickies inside |
| list_templates, use_template | The gallery (approved first); a new board or page from one |
| create_page_from_template | A new Docs page from a page template |
| save_as_template | A board or page into the gallery; client data is taken out and Claude tells you what |

Things to ask (start with "Using Oppllo One, …"):
- "Make a mind map for MES College's November campaign on a new board: audience, channels, offers and a timeline."
- "On the 'NEET 2027 campaign ideas' board, add five reel ideas into the Content frame."
- "Read the October retro board and list what we said we'd try next."
- "Add a section called Week 1 with stickies for a teaser reel, an open day post and a parents' webinar."
- "Save this board as a template called 'Open day plan' for the whole team, tagged events."
- "Make a new board for Zenith from the SWOT template."
- "Start a meeting-notes page for tomorrow's Al Ameen call from the template."

Company templates wait until a strategist or the owner approves them in **Templates** (the gallery in Oppllo One).

## Goals and space kits (Stages 14.3–14.4)
- list_goals, goal_details, post_goal_checkin: company and team goals with health; post a check-in (money in rupees).
  Private spaces, "leaders only" goals and money amounts follow the same rules as the Goals screen.
- list_space_kits, apply_space_kit (owner or HR): set up a team space (Finance, HR, Sales, Oppllo Marketing, Founder
  office, Operations). Claude always shows the preview first and makes things only after you agree; applying again
  adds only what's missing.

Things to ask:
- "Using Oppllo One, which company goals are off track this quarter, and why?"
- "Post a check-in on the colleges goal: 21 signed, two more in talks."
- "Set up a Finance space with the Finance kit." (Claude shows what it will make first.)
