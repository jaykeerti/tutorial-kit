// A plain demo component — written like any normal app component (its own state, its own CSS).
// Nothing in here knows about the tutorial.
import { useState } from "react";
import "./TicketForm.css";

type Ticket = { id: number; title: string; priority: "Low" | "Medium" | "High" };

export default function TicketForm() {
  const [tickets, setTickets] = useState<Ticket[]>([
    { id: 2, title: "VPN disconnects every hour", priority: "Medium" },
    { id: 1, title: "Request a second monitor", priority: "Low" },
  ]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Ticket["priority"]>("Low");
  const [justAdded, setJustAdded] = useState<number | null>(null);

  const submit = () => {
    const id = tickets.length + 1;
    setTickets([{ id, title, priority }, ...tickets]);
    setJustAdded(id);
    setOpen(false);
    setTitle("");
    setPriority("Low");
  };

  return (
    <div className="tf">
      <header className="tf-top">
        <div className="tf-logo">🎫 HelpDesk</div>
        <div className="tf-user">Signed in as <b>Demo User</b></div>
      </header>

      <main className="tf-main">
        <div className="tf-head">
          <h1>My tickets</h1>
          <button className="tf-primary" onClick={() => setOpen(true)}>
            + New ticket
          </button>
        </div>

        <ul className="tf-list">
          {tickets.map((t) => (
            <li key={t.id} className={t.id === justAdded ? "tf-item tf-new" : "tf-item"}>
              <span className="tf-id">#{t.id}</span>
              <span className="tf-title">{t.title}</span>
              <span className={`tf-badge tf-${t.priority.toLowerCase()}`}>{t.priority}</span>
            </li>
          ))}
        </ul>
      </main>

      {open && (
        <div className="tf-overlay">
          <div className="tf-modal" role="dialog" aria-label="New ticket">
            <h2>New ticket</h2>
            <label className="tf-label" htmlFor="tf-title">Title</label>
            <input
              id="tf-title"
              className="tf-input"
              placeholder="What's the problem?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="tf-label">Priority</div>
            <div className="tf-seg">
              {(["Low", "Medium", "High"] as const).map((p) => (
                <button key={p} aria-pressed={priority === p} className={priority === p ? "on" : ""} onClick={() => setPriority(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className="tf-actions">
              <button className="tf-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="tf-primary" disabled={!title} onClick={submit}>Create ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
