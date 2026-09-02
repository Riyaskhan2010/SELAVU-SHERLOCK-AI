import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, Loader2, Sparkles, User, RefreshCw, Cpu,
  Plus, Trash2, MessageSquare, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store/appStore";
import { chatApi, conversationsApi } from "@/services/api";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, isToday, isYesterday, subDays, isAfter } from "date-fns";
import type { ChatMessage, Conversation, ConversationMessage } from "@/types";
import { v4 as uuidv4 } from "@/utils/uuid";

const SUGGESTED_PROMPTS = [
  "Summarize the top optimization opportunities",
  "Which service is growing the fastest?",
  "Explain the underutilization findings",
  "What caused the cost spike?",
  "How much could we save by rightsizing?",
];

// ─── Conversation grouping ────────────────────────────────────────────────────

function groupConversations(convs: Conversation[]): {
  label: string;
  items: Conversation[];
}[] {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const today:    Conversation[] = [];
  const yesterday:Conversation[] = [];
  const week:     Conversation[] = [];
  const older:    Conversation[] = [];

  for (const c of convs) {
    const d = new Date(c.updated_at);
    if (isToday(d))           today.push(c);
    else if (isYesterday(d))  yesterday.push(c);
    else if (isAfter(d, sevenDaysAgo)) week.push(c);
    else                      older.push(c);
  }

  return [
    { label: "Today",            items: today },
    { label: "Yesterday",        items: yesterday },
    { label: "Previous 7 Days",  items: week },
    { label: "Older",            items: older },
  ].filter((g) => g.items.length > 0);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AiAssistantPage() {
  const { activeDatasetId } = useAppStore();

  // ── History state ──────────────────────────────────────────────────────────
  const [conversations, setConversations]         = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId]           = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory]       = useState(true);
  const [deletingId, setDeletingId]               = useState<number | null>(null);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  // ── Scroll to bottom on new message ───────────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── Load conversation list on mount ───────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await conversationsApi.list();
      setConversations(data);
    } catch (e) {
      console.error("Failed to load conversations:", e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Open a conversation and load its messages ──────────────────────────────
  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConvId(conv.id);
    setMessages([]);
    setLoadingMsgs(true);
    try {
      const detail = await conversationsApi.get(conv.id);
      const mapped: ChatMessage[] = detail.messages.map((m: ConversationMessage) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
        conversation_id: String(conv.id),
      }));
      setMessages(mapped);
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // ── New chat ───────────────────────────────────────────────────────────────
  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
  };

  // ── Delete conversation ────────────────────────────────────────────────────
  const deleteConversation = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await conversationsApi.delete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const reply = await chatApi.send({
        message: text.trim(),
        dataset_id: activeDatasetId ?? undefined,
        // Send the real integer conversation ID if one is active
        conversation_id: activeConvId ? String(activeConvId) : undefined,
      });

      setMessages((prev) => [...prev, reply]);

      // If this was a new chat, the backend created a conversation — store its ID
      if (!activeConvId && reply.conversation_id) {
        const newId = parseInt(reply.conversation_id, 10);
        if (!isNaN(newId)) {
          setActiveConvId(newId);
        }
      }

      // Refresh conversation list to show updated title / ordering
      fetchConversations();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "Unknown error";
      setMessages((prev) => [...prev, {
        id: uuidv4(),
        role: "assistant",
        content: `Sorry, I couldn't get a response. Error: ${detail}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const groups = groupConversations(conversations);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden">
      {/* ── LEFT: Chat History panel ── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card/50 rounded-l-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Chat History
          </span>
        </div>

        {/* New Chat button */}
        <div className="px-2 py-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs justify-start gap-2"
            onClick={startNewChat}
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </Button>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1 px-1">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-center px-3">
              <MessageSquare className="w-6 h-6 text-muted-foreground mb-2" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Your conversations will appear here.
              </p>
            </div>
          ) : (
            <div className="pb-4 space-y-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                    {group.label}
                  </p>
                  {group.items.map((conv) => (
                    <ConvItem
                      key={conv.id}
                      conv={conv}
                      isActive={conv.id === activeConvId}
                      isDeleting={deletingId === conv.id}
                      onClick={() => openConversation(conv)}
                      onDelete={(e) => deleteConversation(e, conv.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* ── RIGHT: Chat area (existing layout preserved) ── */}
      <div className="flex-1 flex flex-col min-w-0 pl-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/25">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">AI Assistant</h1>
              <p className="text-xs text-muted-foreground">Grounded in your cost analysis data</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={startNewChat} className="text-xs h-7">
              <RefreshCw className="w-3 h-3 mr-1.5" />
              New chat
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full">
            <div className="space-y-4 pb-4">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <WelcomeState onPrompt={send} hasDataset={!!activeDatasetId} />
              ) : (
                <>
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  {sending && <TypingIndicator />}
                </>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Input */}
        <div className="mt-3 shrink-0">
          {!activeDatasetId && (
            <p className="text-xs text-orange-400 mb-2 text-center">
              Select a dataset in the top nav for context-aware answers
            </p>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your cost data..."
              className="flex-1"
              disabled={sending}
            />
            <Button type="submit" disabled={!input.trim() || sending} size="icon">
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation list item ───────────────────────────────────────────────────

function ConvItem({
  conv, isActive, isDeleting, onClick, onDelete,
}: {
  conv: Conversation;
  isActive: boolean;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      <MessageSquare className="w-3 h-3 shrink-0 opacity-60" />
      <span className="flex-1 text-xs truncate">{conv.title}</span>
      <button
        onClick={onDelete}
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-destructive",
          isActive && "opacity-100"
        )}
        disabled={isDeleting}
      >
        {isDeleting
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Trash2 className="w-3 h-3" />}
      </button>
    </div>
  );
}

// ─── Existing sub-components (unchanged) ─────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <div className={cn(
        "flex items-center justify-center w-7 h-7 rounded-full shrink-0 border",
        isUser ? "bg-secondary border-border" : "bg-primary/15 border-primary/25",
      )}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-foreground" />
          : <Cpu className="w-3.5 h-3.5 text-primary" />}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "bg-primary/10 border border-primary/20 text-foreground"
          : "bg-card border border-border text-foreground"
      )}>
        {message.content}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.sources.map((s, i) => (
              <span key={i} className="text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 border border-primary/25 shrink-0">
        <Cpu className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WelcomeState({ onPrompt, hasDataset }: {
  onPrompt: (s: string) => void;
  hasDataset: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
      <div>
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground mb-1">AI Cost Assistant</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Ask anything about your cost data. Answers are grounded in detected findings and evidence.
        </p>
        {!hasDataset && (
          <p className="text-xs text-orange-400 mt-2">
            Select a dataset in the top nav for context-aware answers
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPrompt(p)}
            className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
