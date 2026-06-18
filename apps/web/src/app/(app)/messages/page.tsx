"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@mymakaranta/ui";
import { api, type ChatMessage, type ConversationRow, type Messageable } from "@/lib/api";
import { session } from "@/lib/auth";

export default function MessagesPage() {
  const myType = session.user()?.identityType; // "PARENT" | "STAFF"
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const [people, setPeople] = useState<Messageable[]>([]);
  const [busy, setBusy] = useState(false);

  function loadConvos() {
    api.getConversations().then(setConvos).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { loadConvos(); }, []);

  async function openConvo(id: string) {
    setActiveId(id);
    setPicking(false);
    setMessages(await api.getMessages(id).catch(() => []));
    loadConvos(); // refresh unread counts after marking read
  }

  async function openPicker() {
    setPicking(true);
    setActiveId(null);
    setPeople(await api.getMessageable().catch(() => []));
  }

  async function startWith(counterpartId: string) {
    setBusy(true);
    try {
      const { conversationId } = await api.createConversation(counterpartId);
      await openConvo(conversationId);
      loadConvos();
    } catch { /* not allowed */ } finally { setBusy(false); }
  }

  async function send() {
    if (!activeId || !draft.trim()) return;
    setBusy(true);
    try {
      await api.postMessage(activeId, draft.trim());
      setDraft("");
      setMessages(await api.getMessages(activeId));
      loadConvos();
    } catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">Messages</h1>
        <Button size="sm" onClick={openPicker}>New message</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
          {/* Conversation list */}
          <div className="flex flex-col gap-1">
            {convos.length === 0 && !picking && <p className="text-small text-ink-500">No conversations yet.</p>}
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={`rounded-input border px-3 py-2 text-left ${activeId === c.id ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-ink-100 dark:border-white/10"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-small font-medium text-ink-1000 dark:text-ink-100">{c.counterpartName}</span>
                  {c.unreadCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-caption text-white tabular-nums">{c.unreadCount}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Thread / picker */}
          <div className="rounded-card border border-ink-100 dark:border-white/10 bg-surface dark:bg-surface-dark p-4 min-h-[300px] flex flex-col">
            {picking ? (
              <div className="flex flex-col gap-2">
                <p className="text-small font-semibold text-ink-700 dark:text-ink-300">Start a conversation</p>
                {people.length === 0 ? (
                  <p className="text-small text-ink-500">No one to message yet.</p>
                ) : people.map((p, i) => {
                  const id = p.staffId ?? p.parentId!;
                  const name = p.staffName ?? p.parentName!;
                  const sub = p.className ? `${p.childName} · ${p.className}` : p.studentName;
                  return (
                    <button key={`${id}-${i}`} onClick={() => startWith(id)} disabled={busy} className="rounded-input border border-ink-100 dark:border-white/10 px-3 py-2 text-left">
                      <span className="text-small font-medium text-ink-1000 dark:text-ink-100">{name}</span>
                      {sub && <span className="block text-caption text-ink-500">{sub}</span>}
                    </button>
                  );
                })}
              </div>
            ) : activeId ? (
              <>
                <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
                  {messages.map((m) => {
                    const mine = m.senderType === myType;
                    return (
                      <div key={m.id} className={`max-w-[80%] rounded-card px-3 py-2 text-small ${mine ? "self-end bg-brand-500 text-white" : "self-start bg-paper dark:bg-paper-dark text-ink-1000 dark:text-ink-100"}`}>
                        {m.body}
                      </div>
                    );
                  })}
                  {messages.length === 0 && <p className="text-small text-ink-500">No messages yet — say hello.</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Type a message"
                    className="flex-1 rounded-input border border-ink-200 dark:border-white/10 bg-paper dark:bg-paper-dark px-3 py-2 text-small text-ink-1000 dark:text-ink-100"
                  />
                  <Button size="sm" onClick={send} disabled={busy || !draft.trim()}>Send</Button>
                </div>
              </>
            ) : (
              <p className="text-small text-ink-500 m-auto">Select a conversation or start a new one.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
