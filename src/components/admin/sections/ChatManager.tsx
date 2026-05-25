import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { ChatbotConversation, ChatbotMessage, ChatChannel, ConversationStatus } from "@/types";
import { MessageCircle, AlertTriangle, CheckCircle, Smartphone, Globe, Headphones, Send, Lock, Sparkles, User, Bot } from "lucide-react";
import toast from "react-hot-toast";

export default function ChatManager() {
  const [conversations, setConversations] = useState<ChatbotConversation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filterChannel, setFilterChannel] = useState<ChatChannel | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ConversationStatus | "all">("all");

  // Detalle de conversación
  const [selectedConv, setSelectedConv] = useState<ChatbotConversation | null>(null);
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Mensaje nuevo
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Ref para auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar lista de conversaciones
  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('chatbot_conversations')
        .select('*')
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      if (data) setConversations(data as ChatbotConversation[]);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Error al cargar la lista de conversaciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchConversations();
  }, []);

  // Cargar mensajes de conversación activa
  const fetchMessages = async (convId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('chatbot_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      if (data) setMessages(data as ChatbotMessage[]);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast.error("Error al cargar el historial de mensajes");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectConversation = (conv: ChatbotConversation) => {
    setSelectedConv(conv);
    fetchMessages(conv.id);
  };

  // Escuchar conversaciones en tiempo real para actualizar la barra lateral
  useEffect(() => {
    const channel = supabase
      .channel('conversations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chatbot_conversations' },
        (payload) => {
          fetchConversations();
          
          // Si la conversación seleccionada cambió de estado externamente, actualizarla
          const updatedConv = payload.new as ChatbotConversation;
          if (selectedConv && updatedConv && selectedConv.id === updatedConv.id) {
            setSelectedConv(updatedConv);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConv]);

  // Escuchar mensajes entrantes/salientes en tiempo real para el chat activo
  useEffect(() => {
    if (!selectedConv) return;

    const channel = supabase
      .channel(`chat_messages_${selectedConv.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chatbot_messages',
          filter: `conversation_id=eq.${selectedConv.id}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatbotMessage;
          setMessages((prev) => {
            // Evitar duplicados si ya se insertó localmente
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConv]);

  // Auto-scroll al fondo al cargar o recibir nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingMessages]);

  // Cerrar caso/conversación
  const handleCloseConversation = async (convId: string) => {
    try {
      const { error } = await supabase
        .from('chatbot_conversations')
        .update({ status: 'closed', ended_at: new Date().toISOString() })
        .eq('id', convId);
      
      if (error) throw error;
      
      toast.success("Conversación cerrada correctamente");
      fetchConversations();
      if (selectedConv?.id === convId) {
        setSelectedConv(prev => prev ? { ...prev, status: 'closed', ended_at: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error("Error closing conversation:", error);
      toast.error("Error al cerrar la conversación");
    }
  };

  // Cambiar entre Modo IA y Modo Humano (Takeover)
  const toggleMode = async (convId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'escalated' ? 'active' : 'escalated';
    try {
      const { error } = await supabase
        .from('chatbot_conversations')
        .update({ 
          status: newStatus, 
          escalated_to: newStatus === 'escalated' ? 'alvaro' : null 
        })
        .eq('id', convId);
      
      if (error) throw error;
      
      toast.success(
        newStatus === 'escalated' 
          ? "👤 Modo Humano activado. La IA no auto-responderá a este cliente." 
          : "🤖 Modo IA activado. El chatbot volverá a auto-responder."
      );
      
      fetchConversations();
    } catch (error) {
      console.error("Error toggling mode:", error);
      toast.error("Error al cambiar el modo de chat");
    }
  };

  // Enviar mensaje manual (Álvaro)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConv || !newMessageText.trim()) return;

    setSendingMessage(true);
    const textToSend = newMessageText.trim();
    setNewMessageText(""); // Limpiar caja al instante para feedback veloz

    try {
      const response = await fetch("/api/admin/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_SECRET || "",
        },
        body: JSON.stringify({
          conversation_id: selectedConv.id,
          message: textToSend,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error al enviar mensaje");
      }

      const resData = await response.json();
      
      // Si el chat no estaba escalado, la API lo escala en base de datos.
      // Lo reflejamos localmente al instante para evitar clashing:
      if (selectedConv.status !== 'escalated') {
        setSelectedConv(prev => prev ? { ...prev, status: 'escalated', escalated_to: 'alvaro' } : null);
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, status: 'escalated', escalated_to: 'alvaro' } : c));
        toast.success("Cambiado automáticamente a Modo Humano (IA pausada)");
      }

      // Añadir mensaje enviado localmente (si no entró por realtime)
      const loggedMsg = resData.message;
      if (loggedMsg) {
        setMessages(prev => {
          if (prev.some(m => m.id === loggedMsg.id)) return prev;
          return [...prev, loggedMsg];
        });
      }

    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(`No se pudo enviar el mensaje: ${error.message}`);
      setNewMessageText(textToSend); // Restaurar texto si falló
    } finally {
      setSendingMessage(false);
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp': return <Smartphone size={16} className="text-green-400" />;
      case 'web_widget': return <Globe size={16} className="text-blue-400" />;
      case 'chatwoot': return <Headphones size={16} className="text-purple-400" />;
      default: return <MessageCircle size={16} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': 
        return <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20 flex items-center gap-1 font-semibold"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span> Chatbot IA</span>;
      case 'escalated': 
        return <span className="px-2 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full border border-amber-500/20 flex items-center gap-1 font-semibold"><User size={12} /> Modo Humano</span>;
      case 'closed': 
        return <span className="px-2 py-1 bg-slate-500/10 text-slate-400 text-xs rounded-full border border-slate-500/20 flex items-center gap-1 font-semibold"><Lock size={12} /> Cerrado</span>;
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-180px)]">
      
      {/* PANEL IZQUIERDO: Lista de conversaciones */}
      <div className="bg-[#1E293B] rounded-2xl border border-white/5 flex flex-col h-full overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 space-y-4 bg-[#0F172A]/30">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <MessageCircle size={22} className="text-[#FBBF24]" />
            Live Chat IA
          </h2>
          
          <div className="flex gap-2">
            <select 
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value as any)}
              className="bg-[#0F172A] border border-white/10 text-white text-xs rounded-lg focus:ring-[#FBBF24] focus:border-[#FBBF24] block p-2 w-full font-medium"
            >
              <option value="all">Canal: Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="web_widget">Web Widget</option>
              <option value="chatwoot">Chatwoot</option>
            </select>
            
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-[#0F172A] border border-white/10 text-white text-xs rounded-lg focus:ring-[#FBBF24] focus:border-[#FBBF24] block p-2 w-full font-medium"
            >
              <option value="all">Estado: Todos</option>
              <option value="active">En curso (IA)</option>
              <option value="escalated">Modo Humano</option>
              <option value="closed">Cerradas</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 hide-scrollbar">
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FBBF24]"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm font-medium">
              No hay conversaciones activas.
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = selectedConv?.id === conv.id;
              const contactLabel = conv.wa_phone_number || (conv.metadata as any)?.visitor_name || (conv.metadata as any)?.contact_name || `Conversación ${conv.channel}`;
              
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isSelected 
                      ? 'bg-white/10 border-[#FBBF24]/30 shadow-lg shadow-black/10' 
                      : 'bg-[#0F172A] border-white/5 hover:border-white/10 hover:bg-[#0F172A]/70'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2.5">
                    <div className="flex items-center gap-2">
                      {getChannelIcon(conv.channel)}
                      <span className="text-white font-bold text-sm tracking-wide">
                        {contactLabel}
                      </span>
                    </div>
                    {getStatusBadge(conv.status)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {new Date(conv.started_at).toLocaleString('es-ES', { 
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                    })}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* PANEL DERECHO: Detalle del chat interactivo */}
      <div className="lg:col-span-2 bg-[#1E293B] rounded-2xl border border-white/5 flex flex-col h-full overflow-hidden shadow-2xl">
        {selectedConv ? (
          <>
            {/* Header del chat activo */}
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0F172A]/50">
              <div>
                <h3 className="text-white font-extrabold text-base flex items-center gap-2">
                  {getChannelIcon(selectedConv.channel)}
                  {selectedConv.wa_phone_number || (selectedConv.metadata as any)?.visitor_name || (selectedConv.metadata as any)?.contact_name || `Chat ${selectedConv.channel}`}
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-1">
                  Canal: <span className="uppercase text-slate-300 font-bold">{selectedConv.channel}</span> | ID: {selectedConv.id}
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                {selectedConv.status !== 'closed' && (
                  <>
                    {/* Toggle de Modo IA vs. Humano */}
                    <div className="flex items-center gap-2 bg-[#0F172A] border border-white/10 rounded-xl px-3 py-1.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Control:</span>
                      <button
                        onClick={() => toggleMode(selectedConv.id, selectedConv.status)}
                        className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                          selectedConv.status === 'escalated'
                            ? 'bg-amber-500 hover:bg-amber-600 text-[#2C3E50] shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                            : 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_12px_rgba(34,197,94,0.2)]'
                        }`}
                      >
                        {selectedConv.status === 'escalated' ? '👤 Álvaro' : '🤖 Chatbot IA'}
                      </button>
                    </div>

                    <button 
                      onClick={() => handleCloseConversation(selectedConv.id)}
                      className="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle size={14} /> Cerrar Chat
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Listado de mensajes en tiempo real */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0F172A]/10">
              {loadingMessages ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FBBF24]"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-500 p-8 font-medium">No hay mensajes en esta conversación.</div>
              ) : (
                messages.map(msg => {
                  const isUser = msg.role === 'user';
                  const isSystem = msg.role === 'system';
                  
                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-xs text-slate-400">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl p-4 shadow-lg ${
                        isUser 
                          ? 'bg-[#FBBF24] text-[#2C3E50] rounded-tr-sm font-semibold' 
                          : 'bg-[#0F172A] text-slate-200 border border-white/5 rounded-tl-sm font-medium'
                      }`}>
                        
                        {/* Cabecera del globito de mensaje para identificar autor */}
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider mb-1 opacity-70">
                          {isUser ? (
                            <>
                              <User size={10} />
                              <span>Cliente</span>
                            </>
                          ) : msg.intent_detected === 'agent_reply' ? (
                            <>
                              <User size={10} className="text-amber-400" />
                              <span className="text-amber-400">Álvaro (Tú)</span>
                            </>
                          ) : (
                            <>
                              <Bot size={10} className="text-green-400" />
                              <span className="text-green-400">Asistente IA</span>
                            </>
                          )}
                        </div>

                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        
                        <div className={`text-[9px] mt-2.5 flex justify-between items-center ${isUser ? 'text-[#2C3E50]/70' : 'text-slate-500'}`}>
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!isUser && msg.intent_detected && msg.intent_detected !== 'agent_reply' && (
                            <span className="bg-white/5 px-2 py-0.5 rounded ml-2 border border-white/10 flex items-center gap-1">
                              <Sparkles size={8} /> {msg.intent_detected} {(msg.confidence ? `(${(msg.confidence * 100).toFixed(0)}%)` : '')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Caja de entrada para mensajería instantánea del agente */}
            {selectedConv.status !== 'closed' ? (
              <form onSubmit={handleSendMessage} className="p-4 bg-[#0F172A]/40 border-t border-white/5 flex gap-3 items-center">
                <input 
                  type="text"
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={
                    selectedConv.status === 'escalated'
                      ? "Escribe un mensaje manual vía WhatsApp..."
                      : "Escribe para responder (activará el Modo Humano e IA se pausará)..."
                  }
                  className="flex-grow bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all placeholder-slate-400"
                  disabled={sendingMessage}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !newMessageText.trim()}
                  className={`bg-[#FBBF24] text-[#2C3E50] p-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-[#FBBF24]/10 disabled:opacity-50 disabled:pointer-events-none`}
                >
                  {sendingMessage ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#2C3E50]"></div>
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>
            ) : (
              <div className="p-4 bg-[#0F172A]/20 border-t border-white/5 text-center text-slate-500 text-xs font-semibold flex items-center justify-center gap-1.5">
                <Lock size={12} /> Esta conversación está cerrada. Reabre cambiándole el estado en la base de datos si es necesario.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageCircle size={64} className="mb-4 opacity-15 text-slate-400" />
            <p className="font-semibold text-slate-400 text-sm">Selecciona una conversación para ver e interactuar en tiempo real</p>
          </div>
        )}
      </div>

    </div>
  );
}
