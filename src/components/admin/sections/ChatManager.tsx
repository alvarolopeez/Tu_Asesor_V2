import { MessageCircle } from "lucide-react";

export default function ChatManager() {
  return (
    <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
      <MessageCircle size={64} className="text-purple-400 mb-4 opacity-50" />
      <h2 className="text-2xl font-bold text-white mb-2">Intervención de IA / Live Chat</h2>
      <p className="text-slate-400 max-w-md text-center">Aquí conectaremos el sistema de N8N. Podrás ver en tiempo real las conversaciones del Bot de WhatsApp con clientes y tomar el control manual si es necesario.</p>
    </div>
  );
}
