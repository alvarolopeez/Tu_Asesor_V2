import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ChatbotConversation, ChatbotMessage, ChatChannel, ConversationStatus } from "@/types";
import { MessageCircle, AlertTriangle, CheckCircle, Smartphone, Globe, Headphones, X, Send, Lock } from "lucide-react";

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

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chatbot_conversations')
        .select('*')
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      if (data) setConversations(data as ChatbotConversation[]);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  };

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
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectConversation = (conv: ChatbotConversation) => {
    setSelectedConv(conv);
    fetchMessages(conv.id);
  };

  const handleCloseConversation = async (convId: string) => {
    try {
      const { error } = await supabase
        .from('chatbot_conversations')
        .update({ status: 'closed', ended_at: new Date().toISOString() })
        .eq('id', convId);
      
      if (error) throw error;
      
      // Update local state
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: 'closed', ended_at: new Date().toISOString() } : c));
      if (selectedConv?.id === convId) {
        setSelectedConv({ ...selectedConv, status: 'closed', ended_at: new Date().toISOString() });
      }
    } catch (error) {
      console.error("Error closing conversation:", error);
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
        return <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span> Activa</span>;
      case 'escalated': 
        return <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded-full border border-red-500/20 flex items-center gap-1"><AlertTriangle size={12} /> Escalada</span>;
      case 'closed': 
        return <span className="px-2 py-1 bg-slate-500/10 text-slate-400 text-xs rounded-full border border-slate-500/20 flex items-center gap-1"><Lock size={12} /> Cerrada</span>;
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-180px)]">
      
      {/* PANEL IZQUIERDO: Lista de conversaciones */}
      <div className="bg-[#1E293B] rounded-2xl border border-white/5 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageCircle size={20} className="text-[#FBBF24]" />
            Conversaciones IA
          </h2>
          
          <div className="flex gap-2">
            <select 
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value as any)}
              className="bg-[#0F172A] border border-white/10 text-white text-xs rounded-lg focus:ring-[#FBBF24] focus:border-[#FBBF24] block p-2 w-full"
            >
              <option value="all">Canal: Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="web_widget">Web Widget</option>
              <option value="chatwoot">Chatwoot</option>
            </select>
            
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-[#0F172A] border border-white/10 text-white text-xs rounded-lg focus:ring-[#FBBF24] focus:border-[#FBBF24] block p-2 w-full"
            >
              <option value="all">Estado: Todos</option>
              <option value="active">Activas</option>
              <option value="escalated">Escaladas</option>
              <option value="closed">Cerradas</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2 hide-scrollbar">
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FBBF24]"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No hay conversaciones que coincidan.
            </div>
          ) : (
            filteredConversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedConv?.id === conv.id 
                    ? 'bg-white/10 border-[#FBBF24]/30' 
                    : 'bg-[#0F172A] border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    {getChannelIcon(conv.channel)}
                    <span className="text-white font-medium text-sm">
                      {conv.wa_phone_number || conv.channel}
                    </span>
                  </div>
                  {getStatusBadge(conv.status)}
                </div>
                <div className="text-xs text-slate-400">
                  {new Date(conv.started_at).toLocaleString('es-ES', { 
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                  })}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* PANEL DERECHO: Detalle del chat */}
      <div className="lg:col-span-2 bg-[#1E293B] rounded-2xl border border-white/5 flex flex-col h-full overflow-hidden">
        {selectedConv ? (
          <>
            {/* Header del chat */}
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0F172A]/50">
              <div>
                <h3 className="text-white font-bold flex items-center gap-2">
                  {getChannelIcon(selectedConv.channel)}
                  {selectedConv.wa_phone_number || `Chat ${selectedConv.channel}`}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  ID: {selectedConv.id}
                </p>
              </div>
              <div className="flex gap-2">
                {selectedConv.status !== 'closed' && (
                  <button 
                    onClick={() => handleCloseConversation(selectedConv.id)}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <CheckCircle size={16} /> Cerrar Caso
                  </button>
                )}
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingMessages ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FBBF24]"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-slate-500 p-8">No hay mensajes registrados.</div>
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
                      <div className={`max-w-[80%] rounded-2xl p-4 ${
                        isUser 
                          ? 'bg-[#FBBF24] text-[#2C3E50] rounded-tr-sm' 
                          : 'bg-[#0F172A] text-slate-200 border border-white/5 rounded-tl-sm'
                      }`}>
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        <div className={`text-[10px] mt-2 flex justify-between items-center ${isUser ? 'text-[#2C3E50]/70' : 'text-slate-500'}`}>
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!isUser && msg.intent_detected && (
                            <span className="bg-white/5 px-2 py-0.5 rounded ml-2 border border-white/10">
                              {msg.intent_detected} {(msg.confidence ? `(${(msg.confidence * 100).toFixed(0)}%)` : '')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageCircle size={64} className="mb-4 opacity-20" />
            <p>Selecciona una conversación para ver el historial</p>
          </div>
        )}
      </div>

    </div>
  );
}
