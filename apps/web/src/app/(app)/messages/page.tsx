"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, PageContainer, PageHeader, Spinner, cn } from "@mymakaranta/ui";
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
    <PageContainer>
      <PageHeader
        title="Messages"
        description="Chat directly with parents and staff."
        actions={<Button size="sm" onClick={openPicker}>New message</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
          {/* Conversation list */}
          <div className="flex flex-col gap-1.5">
            {convos.length === 0 && !picking && <p className="text-small text-ink-500">No conversations yet.</p>}
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={cn(
                  "rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                  activeId === c.id
                    ? "border-brand-500/40 bg-brand-50 dark:bg-brand-500/15"
                    : "border-ink-1000/[0.08] hover:bg-ink-1000/[0.02] dark:border-white/10 dark:hover:bg-white/[0.03]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-small font-medium text-ink-1000 dark:text-ink-100">{c.counterpartName}</span>
                  {c.unreadCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-caption tabular-nums text-white">{c.unreadCount}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Thread / picker */}
          <Card className="flex min-h-[340px] flex-col p-4">
            {picking ? (
              <div className="flex flex-col gap-2">
                <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-ink-500">Start a conversation</p>
                {people.length === 0 ? (
                  <p className="text-small text-ink-500">No one to message yet.</p>
                ) : people.map((p, i) => {
                  const id = p.staffId ?? p.parentId!;
                  const name = p.staffName ?? p.parentName!;
                  const sub = p.className ? `${p.childName} · ${p.className}` : p.studentName;
                  return (
                    <button
                      key={`${id}-${i}`}
                      onClick={() => startWith(id)}
                      disabled={busy}
                      className="rounded-[10px] border border-ink-1000/[0.08] px-3 py-2 text-left transition-colors hover:bg-ink-1000/[0.02] dark:border-white/10 dark:hover:bg-white/[0.03]"
                    >
                      <span className="text-small font-medium text-ink-1000 dark:text-ink-100">{name}</span>
                      {sub && <span className="block text-caption text-ink-500">{sub}</span>}
                    </button>
                  );
                })}
              </div>
            ) : activeId ? (
              <>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                  {messages.map((m) => {
                    const mine = m.senderType === myType;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[80%] rounded-[14px] px-3.5 py-2 text-small leading-relaxed",
                          mine
                            ? "self-end bg-brand-500 text-white"
                            : "self-start bg-ink-1000/[0.05] text-ink-1000 dark:bg-white/[0.06] dark:text-ink-100",
                        )}
                      >
                        {m.body}
                      </div>
                    );
                  })}
                  {messages.length === 0 && <p className="m-auto text-small text-ink-500">No messages yet — say hello.</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Type a message"
                    className="flex-1"
                  />
                  <Button size="sm" onClick={send} disabled={busy || !draft.trim()}>Send</Button>
                </div>
              </>
            ) : (
              <p className="m-auto text-small text-ink-500">Select a conversation or start a new one.</p>
            )}
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
