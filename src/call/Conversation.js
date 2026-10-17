// ============================================================
// CONVERSATION HISTORY
// System prompt + every user/assistant turn for one call.
//
// Notes: things that happened outside the conversation (e.g. "WhatsApp
// brochure delivered"). They're attached to the caller's NEXT message as
// "[system: ...]" so the AI knows about them without breaking the
// strict system/user/assistant order some models require.
// ============================================================

export default class Conversation {
  constructor() {
    this.messages = [];
    this.pendingNotes = [];
    this.lastNotes = []; // notes attached to the latest user turn
  }

  // Resets history and sets the system prompt.
  setSystemPrompt(content) {
    this.messages = [{ role: "system", content }];
    this.pendingNotes = [];
    this.lastNotes = [];
  }

  addNote(note) {
    this.pendingNotes.push(note);
  }

  addUser(content) {
    const notes = this.pendingNotes.map((n) => `[system: ${n}]`).join("\n");
    this.lastNotes = this.pendingNotes;
    this.pendingNotes = [];
    this.messages.push({ role: "user", content: notes ? `${notes}\n${content}` : content });
  }

  // Undo the last caller turn (used when its reply was thrown away).
  // Its notes go back in the queue so the AI still gets them next turn.
  dropLastUser() {
    const last = this.messages.at(-1);
    if (last?.role !== "user") return;

    this.messages.pop();
    this.pendingNotes = [...this.lastNotes, ...this.pendingNotes];
    this.lastNotes = [];
  }

  addAssistant(content) {
    this.messages.push({ role: "assistant", content });
  }

  // Number of turns, excluding the system prompt (handy for logs).
  get turnCount() {
    return this.messages.filter((m) => m.role !== "system").length;
  }
}
