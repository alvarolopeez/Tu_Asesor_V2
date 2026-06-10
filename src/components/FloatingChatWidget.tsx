"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Bot, PhoneCall } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface VisitorContact {
  name: string;
  phone: string;
}

export default function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  // Brief #008 T7: captura opcional de contacto. Si el visitante lo deja,
  // el route crea/vincula un lead source='web_widget'. Todo opcional: sin
  // teléfono el chat sigue siendo anónimo como siempre.
  const [contact, setContact] = useState<VisitorContact | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactDismissed, setContactDismissed] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize from localStorage and add welcome message
  useEffect(() => {
    const savedConvId = localStorage.getItem("chatbot_conversation_id");
    if (savedConvId) {
      setConversationId(savedConvId);
    }

    try {
      const savedContact = localStorage.getItem("chatbot_contact");
      if (savedContact) setContact(JSON.parse(savedContact) as VisitorContact);
    } catch {
      // contacto corrupto en localStorage — se ignora, el chat sigue anónimo
    }

    // Add welcome message only if no messages exist
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "¡Hola! Soy tu asistente virtual. ¿En qué te puedo ayudar hoy con respecto a la compra o venta de inmuebles en Sevilla?",
        }
      ]);
    }
  }, []);

  // Save conversationId when it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem("chatbot_conversation_id", conversationId);
    }
  }, [conversationId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (content: string, contactOverride?: VisitorContact) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const effectiveContact = contactOverride ?? contact;

    try {
      const res = await fetch("/api/chatbot/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          conversation_id: conversationId,
          channel: "web_widget",
          // Campos opcionales (Brief #008 T7): el route crea/vincula el lead.
          ...(effectiveContact?.phone
            ? { visitor_name: effectiveContact.name, visitor_phone: effectiveContact.phone }
            : {}),
        }),
      });

      if (!res.ok) throw new Error("Error en la respuesta del servidor");

      const data = await res.json();

      if (data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "Lo siento, hubo un error procesando tu mensaje.",
      };

      setMessages((prev) => [...prev, botMsg]);

      // Tras el primer intercambio real, ofrecer (una sola vez) dejar contacto.
      const userCount = messages.filter((m) => m.role === "user").length + 1;
      if (userCount >= 2 && !effectiveContact && !contactDismissed) {
        setShowContactForm(true);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Lo siento, estamos experimentando problemas de conexión. Por favor, contacta por WhatsApp.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const content = inputValue.trim();
    setInputValue("");
    await sendMessage(content);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = contactName.trim();
    const phone = contactPhone.trim();
    if (!phone) return;

    const newContact: VisitorContact = { name, phone };
    setContact(newContact);
    localStorage.setItem("chatbot_contact", JSON.stringify(newContact));
    setShowContactForm(false);

    // El contacto viaja como mensaje real: el route crea/vincula el lead y
    // Paula responde con naturalidad. Sin tocar el engine.
    await sendMessage(
      `Quiero que me contacte un asesor. Soy ${name || "visitante web"} y mi teléfono es ${phone}.`,
      newContact,
    );
  };

  return (
    <>
      {/* Bubble Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-[100] bg-[#FBBF24] text-[#2C3E50] p-4 rounded-full shadow-2xl hover:bg-yellow-500 hover:scale-110 transition-all duration-300 flex items-center justify-center animate-bounce ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
        aria-label="Abrir asistente virtual"
      >
        <MessageSquare size={32} />
      </button>

      {/* Chat Window */}
      <div 
        className={`fixed bottom-6 right-6 z-[110] w-[90vw] max-w-[380px] sm:w-[380px] h-[500px] max-h-[80vh] flex flex-col bg-[#1E293B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="bg-[#0f172a] p-4 flex justify-between items-center border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-[#FBBF24] text-[#2C3E50] p-2 rounded-full">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold font-heading leading-tight">Asistente IA</h3>
              <p className="text-xs text-[#FBBF24] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#FBBF24] animate-pulse"></span>
                En línea
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#1E293B] to-[#0f172a]">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[85%] p-3 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-[#FBBF24] text-[#2C3E50] rounded-tr-sm' 
                    : 'glass-effect bg-white/10 text-white border border-white/5 rounded-tl-sm'
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="glass-effect bg-white/10 border border-white/5 p-4 rounded-2xl rounded-tl-sm flex gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Contacto opcional (Brief #008 T7) */}
        {showContactForm && !contact && (
          <div className="px-4 py-3 bg-[#0f172a] border-t border-[#FBBF24]/20 shrink-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-slate-300">
                <span className="text-[#FBBF24] font-bold">¿Quieres que te contacte Álvaro?</span>{" "}
                Déjanos tu nombre y teléfono (opcional).
              </p>
              <button
                type="button"
                onClick={() => { setShowContactForm(false); setContactDismissed(true); }}
                className="text-slate-500 hover:text-white transition-colors shrink-0"
                aria-label="Cerrar formulario de contacto"
              >
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleContactSubmit} className="flex gap-2">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nombre"
                className="w-1/3 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#FBBF24] transition-colors"
              />
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Teléfono *"
                required
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#FBBF24] transition-colors"
              />
              <button
                type="submit"
                disabled={!contactPhone.trim() || isTyping}
                className="bg-[#FBBF24] text-[#2C3E50] text-xs font-bold px-3 py-1.5 rounded-full hover:bg-yellow-500 transition-colors disabled:opacity-50 shrink-0"
              >
                Enviar
              </button>
            </form>
          </div>
        )}

        {/* Input */}
        <div className="p-4 bg-[#0f172a] border-t border-white/10 shrink-0">
          {!contact && !showContactForm && (
            <button
              type="button"
              onClick={() => setShowContactForm(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] text-slate-400 hover:text-[#FBBF24] transition-colors mb-2"
            >
              <PhoneCall size={11} /> Quiero que me contacte un asesor
            </button>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-white text-sm focus:outline-none focus:border-[#FBBF24] transition-colors"
            />
            <button 
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="bg-[#FBBF24] text-[#2C3E50] p-2 rounded-full hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Send size={20} className="ml-1" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
